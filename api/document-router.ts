import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { documents } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { requirePatientAccess } from "./queries/care";
import { base64FileSchema, uploadCareFile } from "./file-utils";
import { storage } from "./lib/storage";
import { analyzePrescriptionImage } from "./ai/care-analysis";

export const documentRouter = createRouter({
  list: authedQuery
    .input(z.object({ patientId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      const rows = await getDb().select().from(documents)
        .where(eq(documents.patientId, input.patientId))
        .orderBy(desc(documents.createdAt)).limit(60);
      return Promise.all(rows.map(async (row) => ({
        ...row,
        url: (await storage.getPresignedUrl({ key: row.fileKey })).url,
      })));
    }),

  upload: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      kind: z.enum(["prescription", "medicine_photo", "lab_report", "genetic", "care_plan", "other"]),
      title: z.string().trim().min(1).max(180),
      notes: z.string().max(3000),
      file: base64FileSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      const allowed = input.file.contentType.startsWith("image/") || input.file.contentType === "application/pdf";
      if (!allowed) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload an image or PDF." });
      const saved = await uploadCareFile(input.patientId, "documents", input.file);
      const [{ id }] = await getDb().insert(documents).values({
        patientId: input.patientId,
        kind: input.kind,
        title: input.title,
        fileKey: saved.key,
        fileName: input.file.name.slice(0, 255),
        contentType: input.file.contentType,
        notes: input.notes,
        uploadedBy: ctx.user.id,
      }).$returningId();
      return { id };
    }),

  analyzePrescription: authedQuery
    .input(z.object({ patientId: z.number().int().positive(), documentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const [document] = await getDb().select().from(documents).where(and(
        eq(documents.id, input.documentId),
        eq(documents.patientId, input.patientId),
      )).limit(1);
      if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      if (!document.contentType.startsWith("image/")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Prescription draft extraction currently supports image documents." });
      }
      try {
        return await analyzePrescriptionImage({
          bytes: await storage.readFile({ fileKey: document.fileKey }),
          contentType: document.contentType,
        });
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The document could not be read right now. Keep the original and add the confirmed schedule manually.",
        });
      }
    }),

  remove: authedQuery
    .input(z.object({ patientId: z.number().int().positive(), documentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const [document] = await getDb().select().from(documents).where(and(
        eq(documents.id, input.documentId),
        eq(documents.patientId, input.patientId),
      )).limit(1);
      if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      await storage.deleteFile({ fileKey: document.fileKey });
      await getDb().delete(documents).where(eq(documents.id, input.documentId));
      return { ok: true };
    }),
});
