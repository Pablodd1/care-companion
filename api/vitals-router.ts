import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { alerts, bloodPressureReadings } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { requirePatientAccess } from "./queries/care";
import { base64FileSchema, uploadCareFile } from "./file-utils";
import { storage } from "./lib/storage";

export const vitalsRouter = createRouter({
  list: authedQuery
    .input(z.object({ patientId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      const rows = await getDb().select().from(bloodPressureReadings)
        .where(eq(bloodPressureReadings.patientId, input.patientId))
        .orderBy(desc(bloodPressureReadings.measuredAt)).limit(60);
      return Promise.all(rows.map(async (row) => ({
        ...row,
        photoUrl: row.photoKey
          ? (await storage.getPresignedUrl({ key: row.photoKey })).url
          : null,
      })));
    }),

  addBloodPressure: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      systolic: z.number().int().min(50).max(260),
      diastolic: z.number().int().min(30).max(180),
      pulse: z.number().int().min(30).max(220).nullable().optional(),
      measuredAt: z.date(),
      position: z.enum(["seated", "standing", "lying"]),
      notes: z.string().max(2000),
      photo: base64FileSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { patient } = await requirePatientAccess(ctx.user.id, input.patientId);
      if (input.measuredAt.getTime() > Date.now() + 5 * 60 * 1000) {
        throw new Error("Reading time cannot be in the future.");
      }
      let photoKey: string | null = null;
      if (input.photo) {
        if (!input.photo.contentType.startsWith("image/")) throw new Error("Monitor attachments must be images.");
        photoKey = (await uploadCareFile(input.patientId, "blood-pressure", input.photo)).key;
      }
      const [{ id }] = await getDb().insert(bloodPressureReadings).values({
        patientId: input.patientId,
        systolic: input.systolic,
        diastolic: input.diastolic,
        pulse: input.pulse ?? null,
        measuredAt: input.measuredAt,
        position: input.position,
        notes: input.notes,
        photoKey,
        createdBy: ctx.user.id,
      }).$returningId();

      const high = (patient.bpSystolicHigh != null && input.systolic > patient.bpSystolicHigh)
        || (patient.bpDiastolicHigh != null && input.diastolic > patient.bpDiastolicHigh);
      const low = (patient.bpSystolicLow != null && input.systolic < patient.bpSystolicLow)
        || (patient.bpDiastolicLow != null && input.diastolic < patient.bpDiastolicLow);
      if (high || low) {
        await getDb().insert(alerts).values({
          patientId: input.patientId,
          kind: "blood_pressure",
          title: `Blood pressure ${high ? "above" : "below"} care-team range`,
          body: `${input.systolic}/${input.diastolic} mmHg was recorded. This is outside the custom range in the care profile. Review the reading and follow the care team's plan; the app does not diagnose or adjust treatment.`,
        });
      }
      return { id, flagged: high || low };
    }),
});
