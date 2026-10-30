import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { documents, labReports, labResults } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { requirePatientAccess } from "./queries/care";
import { storage } from "./lib/storage";
import { analyzeLabReportImage } from "./ai/care-analysis";
import { queueCareReview, recordCareAudit } from "./queries/review";

const resultSchema = z.object({
  name: z.string().trim().min(1).max(140),
  value: z.number().finite().min(-1_000_000).max(1_000_000),
  unit: z.string().trim().min(1).max(40),
  referenceLow: z.number().finite().min(-1_000_000).max(1_000_000).nullable().optional(),
  referenceHigh: z.number().finite().min(-1_000_000).max(1_000_000).nullable().optional(),
});

export const labRouter = createRouter({
  list: authedQuery
    .input(z.object({ patientId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      const reports = await getDb().select().from(labReports)
        .where(eq(labReports.patientId, input.patientId))
        .orderBy(desc(labReports.reportDate)).limit(80);
      const results = reports.length
        ? await getDb().select().from(labResults).where(inArray(labResults.reportId, reports.map((report) => report.id)))
        : [];
      return reports.map((report) => ({
        ...report,
        results: results.filter((result) => result.reportId === report.id),
      }));
    }),

  extract: authedQuery
    .input(z.object({ patientId: z.number().int().positive(), documentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const [document] = await getDb().select().from(documents).where(and(
        eq(documents.id, input.documentId),
        eq(documents.patientId, input.patientId),
        eq(documents.kind, "lab_report"),
      )).limit(1);
      if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Laboratory report not found." });
      if (!document.contentType.startsWith("image/")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Structured extraction currently supports clear report images. PDFs remain available in Documents; enter their values manually." });
      }
      try {
        return await analyzeLabReportImage({
          bytes: await storage.readFile({ fileKey: document.fileKey }),
          contentType: document.contentType,
        });
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The report could not be extracted right now. Keep the original and enter the results manually." });
      }
    }),

  confirm: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      documentId: z.number().int().positive().nullable().optional(),
      title: z.string().trim().min(1).max(180),
      reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      results: z.array(resultSchema).min(1).max(60),
      confirmedAgainstOriginal: z.literal(true),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      if (input.documentId) {
        const [document] = await getDb().select({ id: documents.id }).from(documents).where(and(
          eq(documents.id, input.documentId),
          eq(documents.patientId, input.patientId),
          eq(documents.kind, "lab_report"),
        )).limit(1);
        if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Linked laboratory document not found." });
      }
      const id = await getDb().transaction(async (tx) => {
        const [{ id: reportId }] = await tx.insert(labReports).values({
          patientId: input.patientId,
          documentId: input.documentId ?? null,
          title: input.title,
          reportDate: input.reportDate,
          confirmedBy: ctx.user.id,
        }).$returningId();
        await tx.insert(labResults).values(input.results.map((result) => ({
          ...result,
          referenceLow: result.referenceLow ?? null,
          referenceHigh: result.referenceHigh ?? null,
          patientId: input.patientId,
          reportId,
        })));
        return reportId;
      });
      await recordCareAudit({ patientId: input.patientId, actorUserId: ctx.user.id, entityType: "lab", entityId: id, action: "report_confirmed", reason: "Confirmed against the original report", after: { title: input.title, reportDate: input.reportDate, results: input.results } });
      await queueCareReview({ patientId: input.patientId, sourceKey: `lab-report:${id}`, kind: "lab", title: `Confirmed lab report: ${input.title}`, body: `Report dated ${input.reportDate} with ${input.results.length} confirmed numeric result${input.results.length === 1 ? "" : "s"}. Include it in clinician review as appropriate.`, createdBy: ctx.user.id });
      return { id };
    }),

  correctResult: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      resultId: z.number().int().positive(),
      result: resultSchema,
      reason: z.string().trim().min(3).max(2000),
      confirmedAgainstOriginal: z.literal(true),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const [before] = await getDb().select().from(labResults).where(and(
        eq(labResults.id, input.resultId),
        eq(labResults.patientId, input.patientId),
      )).limit(1);
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Laboratory result not found." });
      await getDb().update(labResults).set({
        ...input.result,
        referenceLow: input.result.referenceLow ?? null,
        referenceHigh: input.result.referenceHigh ?? null,
      }).where(eq(labResults.id, input.resultId));
      await recordCareAudit({ patientId: input.patientId, actorUserId: ctx.user.id, entityType: "lab", entityId: input.resultId, action: "result_corrected", reason: input.reason, before, after: input.result });
      return { ok: true };
    }),

  remove: authedQuery
    .input(z.object({ patientId: z.number().int().positive(), reportId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const [report] = await getDb().select().from(labReports).where(and(
        eq(labReports.id, input.reportId),
        eq(labReports.patientId, input.patientId),
      )).limit(1);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Laboratory report not found." });
      await getDb().transaction(async (tx) => {
        await tx.delete(labResults).where(eq(labResults.reportId, input.reportId));
        await tx.delete(labReports).where(eq(labReports.id, input.reportId));
      });
      await recordCareAudit({ patientId: input.patientId, actorUserId: ctx.user.id, entityType: "lab", entityId: input.reportId, action: "report_removed", reason: "Caregiver removed confirmed results", before: report });
      return { ok: true };
    }),
});
