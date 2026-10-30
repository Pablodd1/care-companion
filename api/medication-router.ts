import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { alerts, careAuditEvents, doseLogs, medicationSchedules, medications } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { dayOffset, parseTimes, requirePatientAccess } from "./queries/care";
import {
  dayInTimezone,
  ensureMedicationScheduleVersions,
  getMedicationScheduleForDay,
} from "./queries/medication-schedules";
import { queueCareReview, recordCareAudit } from "./queries/review";
import { base64FileSchema, uploadCareFile } from "./file-utils";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const scheduleInput = {
  dose: z.string().trim().min(1).max(180),
  instructions: z.string().trim().max(3000),
  times: z.array(timeSchema).min(1).max(12),
};

async function getMedication(patientId: number, medicationId: number) {
  const [medication] = await getDb().select().from(medications).where(and(
    eq(medications.id, medicationId),
    eq(medications.patientId, patientId),
  )).limit(1);
  if (!medication) throw new TRPCError({ code: "NOT_FOUND", message: "Medicine not found." });
  return medication;
}

export const medicationRouter = createRouter({
  list: authedQuery
    .input(z.object({ patientId: z.number().int().positive(), day: daySchema.optional() }))
    .query(async ({ ctx, input }) => {
      const { patient } = await requirePatientAccess(ctx.user.id, input.patientId);
      await ensureMedicationScheduleVersions(input.patientId);
      const day = input.day ?? dayInTimezone(new Date(), patient.timezone);
      const meds = await getDb().select().from(medications).where(and(
        eq(medications.patientId, input.patientId),
        eq(medications.active, true),
      ));
      return Promise.all(meds.map(async (medication) => {
        let schedule = await getMedicationScheduleForDay(medication.id, day);
        if (!schedule) {
          const [upcoming] = await getDb().select().from(medicationSchedules)
            .where(and(eq(medicationSchedules.medicationId, medication.id), isNull(medicationSchedules.effectiveTo)))
            .orderBy(desc(medicationSchedules.effectiveFrom)).limit(1);
          schedule = upcoming ?? null;
        }
        return {
          ...medication,
          dose: schedule?.dose ?? medication.dose,
          instructions: schedule?.instructions ?? medication.instructions,
          times: parseTimes(schedule?.scheduleTimes ?? medication.scheduleTimes),
          effectiveFrom: schedule?.effectiveFrom ?? null,
          effectiveTo: schedule?.effectiveTo ?? null,
          scheduleId: schedule?.id ?? null,
          upcoming: Boolean(schedule && schedule.effectiveFrom > day),
        };
      }));
    }),

  history: authedQuery
    .input(z.object({ patientId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      await ensureMedicationScheduleVersions(input.patientId);
      const versions = await getDb().select().from(medicationSchedules)
        .where(eq(medicationSchedules.patientId, input.patientId))
        .orderBy(desc(medicationSchedules.effectiveFrom), desc(medicationSchedules.id)).limit(100);
      const audits = await getDb().select().from(careAuditEvents)
        .where(eq(careAuditEvents.patientId, input.patientId))
        .orderBy(desc(careAuditEvents.createdAt)).limit(100);
      return { versions, audits };
    }),

  create: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      name: z.string().trim().min(1).max(180),
      strength: z.string().trim().max(120),
      prescribingClinician: z.string().trim().max(180),
      effectiveFrom: daySchema.optional(),
      confirmedAgainstOriginal: z.boolean().refine((v) => v, { message: "Confirm the prescription first." }),
      ...scheduleInput,
    }))
    .mutation(async ({ ctx, input }) => {
      const { patient } = await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const { patientId, times, effectiveFrom, confirmedAgainstOriginal, ...values } = input;
      const start = effectiveFrom ?? dayInTimezone(new Date(), patient.timezone);
      const scheduleTimes = JSON.stringify([...new Set(times)].sort());
      const id = await getDb().transaction(async (tx) => {
        const [{ id: medicationId }] = await tx.insert(medications).values({
          ...values,
          patientId,
          scheduleTimes,
          confirmedBy: ctx.user.id,
        }).$returningId();
        await tx.insert(medicationSchedules).values({
          patientId,
          medicationId,
          dose: input.dose,
          instructions: input.instructions,
          scheduleTimes,
          effectiveFrom: start,
          reason: "Initial schedule confirmed against the original prescription.",
          confirmedBy: ctx.user.id,
        });
        return medicationId;
      });
      await recordCareAudit({
        patientId,
        actorUserId: ctx.user.id,
        entityType: "medication",
        entityId: id,
        action: "schedule_created",
        reason: "Initial confirmed schedule",
        after: { ...values, times, effectiveFrom: start, attested: confirmedAgainstOriginal },
      });
      return { id };
    }),

  changeSchedule: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      medicationId: z.number().int().positive(),
      effectiveFrom: daySchema,
      reason: z.string().trim().min(3).max(2000),
      confirmedAgainstOriginal: z.literal(true),
      ...scheduleInput,
    }))
    .mutation(async ({ ctx, input }) => {
      const { patient } = await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const medication = await getMedication(input.patientId, input.medicationId);
      if (!medication.active) throw new TRPCError({ code: "BAD_REQUEST", message: "This medicine is no longer active." });
      const today = dayInTimezone(new Date(), patient.timezone);
      if (input.effectiveFrom < today) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Start a new schedule today or in the future. Past history remains unchanged; record corrections separately with a reason." });
      }
      await ensureMedicationScheduleVersions(input.patientId);
      const [latest] = await getDb().select().from(medicationSchedules)
        .where(eq(medicationSchedules.medicationId, input.medicationId))
        .orderBy(desc(medicationSchedules.effectiveFrom), desc(medicationSchedules.id)).limit(1);
      if (!latest) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule history not found." });
      if (input.effectiveFrom <= latest.effectiveFrom) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Choose a start date after ${latest.effectiveFrom} so schedule versions do not overlap.` });
      }
      const scheduleTimes = JSON.stringify([...new Set(input.times)].sort());
      const scheduleId = await getDb().transaction(async (tx) => {
        await tx.update(medicationSchedules).set({ effectiveTo: dayOffset(input.effectiveFrom, -1) })
          .where(eq(medicationSchedules.id, latest.id));
        const [{ id }] = await tx.insert(medicationSchedules).values({
          patientId: input.patientId,
          medicationId: input.medicationId,
          dose: input.dose,
          instructions: input.instructions,
          scheduleTimes,
          effectiveFrom: input.effectiveFrom,
          reason: input.reason,
          confirmedBy: ctx.user.id,
        }).$returningId();
        if (input.effectiveFrom === today) {
          await tx.update(medications).set({
            dose: input.dose,
            instructions: input.instructions,
            scheduleTimes,
            confirmedBy: ctx.user.id,
            confirmedAt: new Date(),
          }).where(eq(medications.id, input.medicationId));
        }
        return id;
      });
      const after = { dose: input.dose, instructions: input.instructions, times: input.times, effectiveFrom: input.effectiveFrom };
      await recordCareAudit({ patientId: input.patientId, actorUserId: ctx.user.id, entityType: "medication", entityId: input.medicationId, action: "schedule_version_added", reason: input.reason, before: latest, after });
      await queueCareReview({ patientId: input.patientId, sourceKey: `medication-schedule:${scheduleId}`, kind: "medication", title: `${medication.name} schedule changed`, body: `${input.reason}. Effective ${input.effectiveFrom}. Confirm that this matches the current prescription or care-team instruction.`, createdBy: ctx.user.id });
      return { id: scheduleId };
    }),

  deactivate: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      medicationId: z.number().int().positive(),
      reason: z.string().trim().min(3).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const { patient } = await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const medication = await getMedication(input.patientId, input.medicationId);
      await ensureMedicationScheduleVersions(input.patientId);
      const today = dayInTimezone(new Date(), patient.timezone);
      const current = await getMedicationScheduleForDay(input.medicationId, today);
      await getDb().transaction(async (tx) => {
        await tx.update(medications).set({ active: false }).where(eq(medications.id, input.medicationId));
        if (current && !current.effectiveTo) {
          await tx.update(medicationSchedules).set({ effectiveTo: dayOffset(today, -1) })
            .where(eq(medicationSchedules.id, current.id));
        }
      });
      await recordCareAudit({ patientId: input.patientId, actorUserId: ctx.user.id, entityType: "medication", entityId: input.medicationId, action: "schedule_deactivated", reason: input.reason, before: medication, after: { active: false, effectiveThrough: dayOffset(today, -1) } });
      await queueCareReview({ patientId: input.patientId, sourceKey: `medication-deactivated:${input.medicationId}:${today}`, kind: "medication", title: `${medication.name} removed from future schedules`, body: input.reason, createdBy: ctx.user.id });
      return { ok: true };
    }),

  logDose: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      medicationId: z.number().int().positive(),
      day: daySchema,
      slot: timeSchema,
      status: z.enum(["taken", "missed", "skipped"]),
      note: z.string().max(1000).optional(),
      reason: z.string().trim().max(2000).optional(),
      photo: base64FileSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      const medication = await getMedication(input.patientId, input.medicationId);
      await ensureMedicationScheduleVersions(input.patientId);
      const schedule = await getMedicationScheduleForDay(input.medicationId, input.day);
      if (!schedule || !parseTimes(schedule.scheduleTimes).includes(input.slot)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No matching dose exists in the schedule effective on this date." });
      }
      const [existing] = await getDb().select().from(doseLogs).where(and(
        eq(doseLogs.medicationId, input.medicationId),
        eq(doseLogs.day, input.day),
        eq(doseLogs.slot, input.slot),
      )).limit(1);
      if (existing && existing.status !== input.status && (!input.reason || input.reason.length < 3)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Changing an existing dose status requires a short correction reason." });
      }
      let photoKey: string | null = existing?.photoKey ?? null;
      if (input.photo) {
        if (!input.photo.contentType.startsWith("image/")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Dose attachments must be images." });
        }
        photoKey = (await uploadCareFile(input.patientId, "doses", input.photo)).key;
      }
      await getDb().insert(doseLogs).values({
        patientId: input.patientId,
        medicationId: input.medicationId,
        day: input.day,
        slot: input.slot,
        status: input.status,
        note: input.note ?? "",
        photoKey,
        loggedBy: ctx.user.id,
      }).onDuplicateKeyUpdate({
        set: {
          status: input.status,
          note: input.note ?? "",
          photoKey,
          loggedBy: ctx.user.id,
          loggedAt: new Date(),
        },
      });
      const after = { day: input.day, slot: input.slot, status: input.status, note: input.note ?? "", photoKey };
      await recordCareAudit({ patientId: input.patientId, actorUserId: ctx.user.id, entityType: "dose", entityId: `${input.medicationId}:${input.day}:${input.slot}`, action: existing ? "dose_corrected" : "dose_recorded", reason: input.reason ?? "", before: existing ?? null, after });
      if (input.status !== "taken") {
        const title = input.status === "missed" ? "Dose marked not taken" : "Dose intentionally skipped";
        const body = `${medication.name} at ${input.slot} on ${input.day}: ${input.status}. ${input.note || input.reason || "No additional note."} Follow the confirmed care plan; do not double a dose based on this alert.`;
        await getDb().insert(alerts).values({ patientId: input.patientId, kind: "medication", title, body });
        await queueCareReview({ patientId: input.patientId, sourceKey: `dose:${input.medicationId}:${input.day}:${input.slot}:${input.status}`, kind: "dose", title: `${medication.name}: ${input.status}`, body, createdBy: ctx.user.id });
      }
      return { ok: true };
    }),
});
