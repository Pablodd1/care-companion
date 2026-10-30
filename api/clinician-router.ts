import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import {
  bloodPressureReadings,
  careAuditEvents,
  careReviewItems,
  doseLogs,
  healthNotes,
  labReports,
  labResults,
  meals,
  medications,
  users,
} from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { dayOffset, parseTimes, requirePatientAccess } from "./queries/care";
import { dayInTimezone, getPatientSchedulesForDay } from "./queries/medication-schedules";
import { recordCareAudit } from "./queries/review";
import { sumNutrients } from "./queries/food";

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const clinicianRouter = createRouter({
  reviewQueue: authedQuery
    .input(z.object({ patientId: z.number().int().positive(), includeResolved: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const creator = alias(users, "review_creator");
      const reviewer = alias(users, "review_reviewer");
      const rows = await getDb().select({
        item: careReviewItems,
        creatorName: creator.name,
        reviewerName: reviewer.name,
      }).from(careReviewItems)
        .leftJoin(creator, eq(creator.id, careReviewItems.createdBy))
        .leftJoin(reviewer, eq(reviewer.id, careReviewItems.reviewedBy))
        .where(eq(careReviewItems.patientId, input.patientId))
        .orderBy(desc(careReviewItems.createdAt)).limit(100);
      const items = rows.map((row) => ({ ...row.item, creatorName: row.creatorName, reviewerName: row.reviewerName }));
      return input.includeResolved ? items : items.filter((row) => row.status === "open");
    }),

  resolveReview: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      reviewId: z.number().int().positive(),
      resolution: z.string().trim().min(3).max(3000),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const [review] = await getDb().select().from(careReviewItems).where(and(
        eq(careReviewItems.id, input.reviewId),
        eq(careReviewItems.patientId, input.patientId),
      )).limit(1);
      if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "Review item not found." });
      if (review.status === "resolved") return { ok: true };
      await getDb().update(careReviewItems).set({
        status: "resolved",
        resolution: input.resolution,
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
      }).where(eq(careReviewItems.id, input.reviewId));
      await recordCareAudit({ patientId: input.patientId, actorUserId: ctx.user.id, entityType: "review", entityId: input.reviewId, action: "review_resolved", reason: input.resolution, before: review, after: { status: "resolved", resolution: input.resolution } });
      return { ok: true };
    }),

  audit: authedQuery
    .input(z.object({ patientId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const rows = await getDb().select({ event: careAuditEvents, actorName: users.name })
        .from(careAuditEvents)
        .leftJoin(users, eq(users.id, careAuditEvents.actorUserId))
        .where(eq(careAuditEvents.patientId, input.patientId))
        .orderBy(desc(careAuditEvents.createdAt)).limit(100);
      return rows.map((row) => ({
        ...row.event,
        actorName: row.actorName,
        before: row.event.beforeJson ? JSON.parse(row.event.beforeJson) : null,
        after: row.event.afterJson ? JSON.parse(row.event.afterJson) : null,
      }));
    }),

  visitSummary: authedQuery
    .input(z.object({ patientId: z.number().int().positive(), fromDay: daySchema, toDay: daySchema }))
    .query(async ({ ctx, input }) => {
      const { patient } = await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      if (input.fromDay > input.toDay) throw new TRPCError({ code: "BAD_REQUEST", message: "The summary start date must be before its end date." });
      if (input.fromDay < dayOffset(input.toDay, -92)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a summary range of 93 days or less." });
      }
      const [doseRows, mealRows, reportRows, bpRows, noteRows, openReviews, currentSchedules] = await Promise.all([
        getDb().select({ dose: doseLogs, medicationName: medications.name }).from(doseLogs)
          .innerJoin(medications, eq(medications.id, doseLogs.medicationId))
          .where(and(eq(doseLogs.patientId, input.patientId), gte(doseLogs.day, input.fromDay), lte(doseLogs.day, input.toDay))).orderBy(desc(doseLogs.day)),
        getDb().select().from(meals).where(and(eq(meals.patientId, input.patientId), gte(meals.eatenDay, input.fromDay), lte(meals.eatenDay, input.toDay))).orderBy(desc(meals.eatenAt)),
        getDb().select().from(labReports).where(and(eq(labReports.patientId, input.patientId), gte(labReports.reportDate, input.fromDay), lte(labReports.reportDate, input.toDay))).orderBy(desc(labReports.reportDate)),
        getDb().select().from(bloodPressureReadings).where(eq(bloodPressureReadings.patientId, input.patientId)).orderBy(desc(bloodPressureReadings.measuredAt)).limit(300),
        getDb().select().from(healthNotes).where(eq(healthNotes.patientId, input.patientId)).orderBy(desc(healthNotes.occurredAt)).limit(300),
        getDb().select().from(careReviewItems).where(and(eq(careReviewItems.patientId, input.patientId), eq(careReviewItems.status, "open"))),
        getPatientSchedulesForDay(input.patientId, input.toDay),
      ]);
      const resultRows = reportRows.length
        ? await getDb().select().from(labResults).where(eq(labResults.patientId, input.patientId)).orderBy(desc(labResults.createdAt)).limit(1000)
        : [];
      const reportIds = new Set(reportRows.map((report) => report.id));
      const labs = reportRows.map((report) => ({ ...report, results: resultRows.filter((result) => reportIds.has(result.reportId) && result.reportId === report.id) }));
      const inRange = (date: Date) => {
        const day = dayInTimezone(date, patient.timezone);
        return day >= input.fromDay && day <= input.toDay;
      };
      let expected = 0;
      for (let day = input.fromDay; day <= input.toDay; day = dayOffset(day, 1)) {
        const schedules = await getPatientSchedulesForDay(input.patientId, day);
        expected += schedules.reduce((sum, row) => sum + parseTimes(row.schedule.scheduleTimes).length, 0);
      }
      const taken = doseRows.filter((row) => row.dose.status === "taken").length;
      const missed = doseRows.filter((row) => row.dose.status === "missed").length;
      const skipped = doseRows.filter((row) => row.dose.status === "skipped").length;
      return {
        generatedAt: new Date(),
        patient,
        range: { fromDay: input.fromDay, toDay: input.toDay },
        medications: currentSchedules.map(({ medication, schedule }) => ({
          id: medication.id,
          name: medication.name,
          strength: medication.strength,
          prescribingClinician: medication.prescribingClinician,
          dose: schedule.dose,
          instructions: schedule.instructions,
          times: parseTimes(schedule.scheduleTimes),
          effectiveFrom: schedule.effectiveFrom,
        })),
        adherence: { expected, taken, missed, skipped, unconfirmed: Math.max(expected - taken - missed - skipped, 0) },
        doseLogs: doseRows.map((row) => ({ ...row.dose, medicationName: row.medicationName })),
        nutrition: { totals: sumNutrients(mealRows), entries: mealRows },
        labs,
        bloodPressure: bpRows.filter((row) => inRange(row.measuredAt)),
        notes: noteRows.filter((row) => inRange(row.occurredAt)),
        openReviews,
      };
    }),
});
