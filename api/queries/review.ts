import { careAuditEvents, careReviewItems } from "@db/schema";
import { getDb } from "./connection";

type AuditInput = {
  patientId: number;
  actorUserId: number;
  entityType: "medication" | "dose" | "meal" | "lab" | "note" | "reminder" | "review" | "member";
  entityId: number | string;
  action: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
};

export async function recordCareAudit(input: AuditInput) {
  await getDb().insert(careAuditEvents).values({
    patientId: input.patientId,
    actorUserId: input.actorUserId,
    entityType: input.entityType,
    entityId: String(input.entityId),
    action: input.action,
    reason: input.reason ?? "",
    beforeJson: input.before === undefined ? null : JSON.stringify(input.before),
    afterJson: input.after === undefined ? null : JSON.stringify(input.after),
  });
}

export async function queueCareReview(input: {
  patientId: number;
  sourceKey: string;
  kind: "medication" | "dose" | "nutrition" | "lab" | "note" | "system";
  title: string;
  body: string;
  createdBy: number;
}) {
  await getDb().insert(careReviewItems).values({
    ...input,
    resolution: "",
  }).onDuplicateKeyUpdate({
    set: { title: input.title, body: input.body },
  });
}
