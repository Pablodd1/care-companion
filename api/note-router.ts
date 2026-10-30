import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { healthNotes, users } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { requirePatientAccess } from "./queries/care";
import { queueCareReview, recordCareAudit } from "./queries/review";

export const noteRouter = createRouter({
  list: authedQuery
    .input(z.object({ patientId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      return getDb().select({ note: healthNotes, authorName: users.name })
        .from(healthNotes)
        .innerJoin(users, eq(users.id, healthNotes.createdBy))
        .where(eq(healthNotes.patientId, input.patientId))
        .orderBy(desc(healthNotes.occurredAt)).limit(100);
    }),

  add: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      kind: z.enum(["symptom", "note"]),
      body: z.string().trim().min(1).max(4000),
      severity: z.number().int().min(0).max(10).nullable().optional(),
      occurredAt: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      if (input.occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
        throw new Error("The note time cannot be in the future.");
      }
      const [{ id }] = await getDb().insert(healthNotes).values({
        patientId: input.patientId,
        kind: input.kind,
        body: input.body,
        severity: input.kind === "symptom" ? input.severity ?? null : null,
        occurredAt: input.occurredAt,
        createdBy: ctx.user.id,
      }).$returningId();
      await recordCareAudit({ patientId: input.patientId, actorUserId: ctx.user.id, entityType: "note", entityId: id, action: "note_added", after: { kind: input.kind, severity: input.severity ?? null, occurredAt: input.occurredAt } });
      await queueCareReview({ patientId: input.patientId, sourceKey: `health-note:${id}`, kind: "note", title: input.kind === "symptom" ? "New symptom note" : "New care note", body: input.body, createdBy: ctx.user.id });
      return { id };
    }),
});
