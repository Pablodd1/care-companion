import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import {
  alerts,
  bloodPressureReadings,
  doseLogs,
  healthNotes,
  labReports,
  labResults,
  memberships,
  patients,
} from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { dayOffset, minutesFromTime, parseTimes, requirePatientAccess } from "./queries/care";
import { getDayNutritionTotals } from "./queries/nutrition";
import { getPatientSchedulesForDay, isValidTimezone } from "./queries/medication-schedules";

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalNumber = (max: number) => z.number().min(0).max(max).nullable().optional();

async function getDashboardData(patientId: number, day: string) {
  const days = [];
  for (let offset = -6; offset <= 0; offset++) {
    const currentDay = dayOffset(day, offset);
    const [schedules, logs, nutrition] = await Promise.all([
      getPatientSchedulesForDay(patientId, currentDay),
      getDb().select().from(doseLogs).where(and(
        eq(doseLogs.patientId, patientId),
        eq(doseLogs.day, currentDay),
        eq(doseLogs.status, "taken"),
      )),
      getDayNutritionTotals(patientId, currentDay),
    ]);
    const expected = schedules.reduce((sum, row) => sum + parseTimes(row.schedule.scheduleTimes).length, 0);
    days.push({ day: currentDay, expected, taken: logs.length, nutrition });
  }
  const [latestBp] = await getDb().select().from(bloodPressureReadings)
    .where(eq(bloodPressureReadings.patientId, patientId))
    .orderBy(desc(bloodPressureReadings.measuredAt)).limit(1);
  const openAlerts = await getDb().select().from(alerts).where(and(
    eq(alerts.patientId, patientId),
    eq(alerts.status, "open"),
  ));
  const scheduled = days.reduce((sum, item) => sum + item.expected, 0);
  const taken = days.reduce((sum, item) => sum + Math.min(item.taken, item.expected), 0);
  return {
    days,
    latestBp: latestBp ?? null,
    openAlertCount: openAlerts.length,
    adherence: scheduled ? Math.round((taken / scheduled) * 100) : null,
    today: days.at(-1)!,
  };
}

export const careRouter = createRouter({
  bootstrap: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select({ patient: patients, role: memberships.role })
      .from(memberships)
      .innerJoin(patients, eq(patients.id, memberships.patientId))
      .where(eq(memberships.userId, ctx.user.id))
      .orderBy(patients.name);
    return rows;
  }),

  createPatient: authedQuery
    .input(z.object({
      name: z.string().trim().min(1).max(120),
      birthYear: z.number().int().min(1900).max(2026).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb().insert(patients).values({
        name: input.name,
        birthYear: input.birthYear ?? null,
        conditions: "",
        allergies: "",
        dietInstructions: "",
        careNotes: "",
        inviteCode: nanoid(12),
      }).$returningId();
      await getDb().insert(memberships).values({
        patientId: id,
        userId: ctx.user.id,
        role: "caregiver",
      });
      return { id };
    }),

  joinPatient: authedQuery
    .input(z.object({ inviteCode: z.string().trim().min(6).max(24) }))
    .mutation(async ({ ctx, input }) => {
      const [patient] = await getDb().select().from(patients)
        .where(eq(patients.inviteCode, input.inviteCode)).limit(1);
      if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Invite code not found." });
      const [existing] = await getDb().select().from(memberships).where(and(
        eq(memberships.patientId, patient.id),
        eq(memberships.userId, ctx.user.id),
      )).limit(1);
      if (!existing) {
        await getDb().insert(memberships).values({
          patientId: patient.id,
          userId: ctx.user.id,
          role: "parent",
        });
      }
      return { id: patient.id, role: existing?.role ?? "parent" };
    }),

  updatePatient: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      name: z.string().trim().min(1).max(120),
      birthYear: z.number().int().min(1900).max(2026).nullable().optional(),
      conditions: z.string().max(5000),
      allergies: z.string().max(3000),
      dietInstructions: z.string().max(5000),
      careNotes: z.string().max(5000),
      calorieTarget: optionalNumber(20000),
      carbLimit: optionalNumber(2000),
      sugarLimit: optionalNumber(1000),
      proteinTarget: optionalNumber(1000),
      sodiumLimit: optionalNumber(50000),
      fluidTarget: optionalNumber(20000),
      bpSystolicHigh: optionalNumber(300),
      bpDiastolicHigh: optionalNumber(200),
      bpSystolicLow: optionalNumber(300),
      bpDiastolicLow: optionalNumber(200),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const { patientId, ...values } = input;
      await getDb().update(patients).set(values).where(eq(patients.id, patientId));
      return { ok: true };
    }),

  setTimezone: authedQuery
    .input(z.object({ patientId: z.number().int().positive(), timezone: z.string().trim().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      if (!isValidTimezone(input.timezone)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The device timezone is not recognized." });
      }
      await getDb().update(patients).set({ timezone: input.timezone }).where(eq(patients.id, input.patientId));
      return { ok: true };
    }),

  today: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      day: daySchema,
      minutes: z.number().int().min(0).max(1439),
    }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      const schedules = await getPatientSchedulesForDay(input.patientId, input.day);
      const logs = await getDb().select().from(doseLogs).where(and(
        eq(doseLogs.patientId, input.patientId),
        eq(doseLogs.day, input.day),
      ));
      return schedules.flatMap(({ medication, schedule }) => parseTimes(schedule.scheduleTimes).map((slot) => {
        const log = logs.find((item) => item.medicationId === medication.id && item.slot === slot);
        return {
          medicationId: medication.id,
          scheduleId: schedule.id,
          name: medication.name,
          strength: medication.strength,
          dose: schedule.dose,
          instructions: schedule.instructions,
          slot,
          status: log?.status ?? "pending",
          loggedAt: log?.loggedAt ?? null,
          overdue: !log && input.minutes > minutesFromTime(slot) + 30,
        };
      })).sort((a, b) => a.slot.localeCompare(b.slot));
    }),

  dashboard: authedQuery
    .input(z.object({ patientId: z.number().int().positive(), day: daySchema }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      return getDashboardData(input.patientId, input.day);
    }),

  family: authedQuery
    .input(z.object({ day: daySchema }))
    .query(async ({ ctx, input }) => {
      const rows = await getDb().select({ patient: patients })
        .from(memberships)
        .innerJoin(patients, eq(patients.id, memberships.patientId))
        .where(and(eq(memberships.userId, ctx.user.id), eq(memberships.role, "caregiver")))
        .orderBy(patients.name);
      return Promise.all(rows.map(async ({ patient }) => {
        const [dashboard, latestLabs, latestNotes] = await Promise.all([
          getDashboardData(patient.id, input.day),
          getDb().select({ result: labResults, reportDate: labReports.reportDate, reportTitle: labReports.title })
            .from(labResults)
            .innerJoin(labReports, eq(labReports.id, labResults.reportId))
            .where(eq(labResults.patientId, patient.id))
            .orderBy(desc(labReports.reportDate)).limit(4),
          getDb().select().from(healthNotes)
            .where(eq(healthNotes.patientId, patient.id))
            .orderBy(desc(healthNotes.occurredAt)).limit(1),
        ]);
        return {
          patient,
          ...dashboard,
          latestLabs,
          latestNote: latestNotes[0] ?? null,
        };
      }));
    }),
});
