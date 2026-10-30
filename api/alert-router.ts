import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { alerts } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { requirePatientAccess } from "./queries/care";

export const alertRouter = createRouter({
  list: authedQuery
    .input(z.object({ patientId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      return getDb().select().from(alerts)
        .where(eq(alerts.patientId, input.patientId))
        .orderBy(desc(alerts.createdAt)).limit(80);
    }),

  resolve: authedQuery
    .input(z.object({ patientId: z.number().int().positive(), alertId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      await getDb().update(alerts).set({
        status: "resolved",
        resolvedBy: ctx.user.id,
        resolvedAt: new Date(),
      }).where(and(eq(alerts.id, input.alertId), eq(alerts.patientId, input.patientId)));
      return { ok: true };
    }),
});
