import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { pushSubscriptions } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { requirePatientAccess } from "./queries/care";
import { getPushPublicKey, latestReminderDeliveries, sendPatientPush } from "./push";
import { recordCareAudit } from "./queries/review";

const subscriptionSchema = z.object({
  patientId: z.number().int().positive(),
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(10).max(1000),
  auth: z.string().min(5).max(500),
  userAgent: z.string().max(500),
});

export const notificationRouter = createRouter({
  status: authedQuery
    .input(z.object({ patientId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { patient } = await requirePatientAccess(ctx.user.id, input.patientId);
      const subscriptions = await getDb().select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId })
        .from(pushSubscriptions).where(eq(pushSubscriptions.patientId, input.patientId));
      return {
        configured: Boolean(getPushPublicKey()),
        publicKey: getPushPublicKey(),
        timezone: patient.timezone,
        subscriptionCount: subscriptions.length,
        subscribedHere: subscriptions.some((item) => item.userId === ctx.user.id),
      };
    }),

  deliveries: authedQuery
    .input(z.object({ patientId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      return latestReminderDeliveries(input.patientId);
    }),

  subscribe: authedQuery
    .input(subscriptionSchema)
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      if (!getPushPublicKey()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Web Push is not configured on this server." });
      const endpointHash = createHash("sha256").update(input.endpoint).digest("hex");
      await getDb().insert(pushSubscriptions).values({
        patientId: input.patientId,
        userId: ctx.user.id,
        endpointHash,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
      }).onDuplicateKeyUpdate({
        set: {
          patientId: input.patientId,
          userId: ctx.user.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent,
          lastUsedAt: null,
        },
      });
      await recordCareAudit({ patientId: input.patientId, actorUserId: ctx.user.id, entityType: "reminder", entityId: endpointHash.slice(0, 16), action: "device_subscribed", after: { subscribed: true } });
      return { ok: true };
    }),

  unsubscribe: authedQuery
    .input(z.object({ patientId: z.number().int().positive(), endpoint: z.string().url().max(2048) }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      const endpointHash = createHash("sha256").update(input.endpoint).digest("hex");
      await getDb().delete(pushSubscriptions).where(and(
        eq(pushSubscriptions.endpointHash, endpointHash),
        eq(pushSubscriptions.userId, ctx.user.id),
      ));
      await recordCareAudit({ patientId: input.patientId, actorUserId: ctx.user.id, entityType: "reminder", entityId: endpointHash.slice(0, 16), action: "device_unsubscribed" });
      return { ok: true };
    }),

  sendTest: authedQuery
    .input(z.object({ patientId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      const result = await sendPatientPush(
        input.patientId,
        "Care Companion test",
        "Reminders are connected on this device. This is only a delivery test.",
      );
      if (result.unavailable) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Web Push is not configured on this server." });
      if (!result.sent) throw new TRPCError({ code: "BAD_REQUEST", message: "No device accepted the test. Enable the reminder on the iPhone first, then try again." });
      await recordCareAudit({ patientId: input.patientId, actorUserId: ctx.user.id, entityType: "reminder", entityId: `test:${Date.now()}`, action: "test_sent", after: result });
      return result;
    }),
});
