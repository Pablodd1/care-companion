import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { alerts, mealComponents, meals } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { parseStringArray, requirePatientAccess } from "./queries/care";
import { getDayNutritionTotals } from "./queries/nutrition";
import { base64FileSchema, decodeBase64File, uploadCareFile } from "./file-utils";
import { storage } from "./lib/storage";
import { analyzeMealImage } from "./ai/care-analysis";
import { calculateReferenceComponents, ensureFoodDatabase, sumNutrients } from "./queries/food";
import { foodItems } from "@db/schema";
import { queueCareReview, recordCareAudit } from "./queries/review";

function parseItems(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const entry = item as { name?: unknown; portion?: unknown };
      return [{ name: String(entry.name ?? ""), portion: String(entry.portion ?? "") }];
    });
  } catch {
    return [];
  }
}

const nutritionValues = {
  calories: z.number().int().min(0).max(10000).nullable().optional(),
  carbs: z.number().min(0).max(1500).nullable().optional(),
  sugar: z.number().min(0).max(1000).nullable().optional(),
  addedSugar: z.number().min(0).max(1000).nullable().optional(),
  fiber: z.number().min(0).max(300).nullable().optional(),
  protein: z.number().min(0).max(1000).nullable().optional(),
  fat: z.number().min(0).max(1000).nullable().optional(),
  saturatedFat: z.number().min(0).max(500).nullable().optional(),
  sodium: z.number().int().min(0).max(50000).nullable().optional(),
  potassium: z.number().int().min(0).max(30000).nullable().optional(),
  fluid: z.number().int().min(0).max(10000).nullable().optional(),
};

export const nutritionRouter = createRouter({
  foods: authedQuery
    .input(z.object({ search: z.string().max(100).optional() }))
    .query(async ({ input }) => {
      await ensureFoodDatabase();
      const rows = await getDb().select().from(foodItems);
      const search = input.search?.trim().toLowerCase();
      return rows
        .filter((row) => !search || `${row.name} ${row.category}`.toLowerCase().includes(search))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 40);
    }),

  list: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      const rows = await getDb().select().from(meals)
        .where(eq(meals.patientId, input.patientId))
        .orderBy(desc(meals.eatenAt)).limit(50);
      const totals = await getDayNutritionTotals(input.patientId, input.day);
      const components = rows.length
        ? await getDb().select().from(mealComponents).where(inArray(mealComponents.mealId, rows.map((row) => row.id)))
        : [];
      const entries = await Promise.all(rows.map(async (row) => ({
        ...row,
        items: parseItems(row.items),
        components: components.filter((component) => component.mealId === row.id),
        caregiverFlags: parseStringArray(row.caregiverFlags),
        photoUrl: row.photoKey ? (await storage.getPresignedUrl({ key: row.photoKey })).url : null,
      })));
      return { entries, totals };
    }),

  addRecipe: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      eatenDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      eatenAt: z.date(),
      mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "drink"]),
      note: z.string().max(2000),
      selections: z.array(z.object({
        foodItemId: z.number().int().positive(),
        grams: z.number().min(1).max(3000),
      })).min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      const components = await calculateReferenceComponents(input.selections);
      const totals = sumNutrients(components);
      const [{ id }] = await getDb().insert(meals).values({
        patientId: input.patientId,
        eatenDay: input.eatenDay,
        eatenAt: input.eatenAt,
        mealType: input.mealType,
        note: input.note,
        analysisStatus: "manual",
        items: JSON.stringify(components.map((component) => ({ name: component.name, portion: `${component.grams} g or ml` }))),
        ...totals,
        calories: totals.calories == null ? null : Math.round(totals.calories),
        sodium: totals.sodium == null ? null : Math.round(totals.sodium),
        potassium: totals.potassium == null ? null : Math.round(totals.potassium),
        fluid: totals.fluid == null ? null : Math.round(totals.fluid),
        confidence: "unknown",
        caregiverFlags: JSON.stringify([]),
        patientMessage: "Calculated from reference food values and the portions entered.",
        createdBy: ctx.user.id,
      }).$returningId();
      await getDb().insert(mealComponents).values(components.map((component) => ({
        ...component,
        mealId: id,
        patientId: input.patientId,
      })));
      return { id, totals };
    }),

  addManual: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      eatenDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      eatenAt: z.date(),
      mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "drink"]),
      note: z.string().max(2000),
      ...nutritionValues,
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      const { patientId, ...values } = input;
      const [{ id }] = await getDb().insert(meals).values({
        ...values,
        patientId,
        analysisStatus: "manual",
        items: JSON.stringify([]),
        caregiverFlags: JSON.stringify([]),
        confidence: "unknown",
        patientMessage: "Nutrition entered manually.",
        createdBy: ctx.user.id,
      }).$returningId();
      return { id };
    }),

  updateManual: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      mealId: z.number().int().positive(),
      note: z.string().max(2000),
      reason: z.string().trim().max(2000).optional(),
      ...nutritionValues,
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId);
      const { patientId, mealId, reason, ...values } = input;
      const [before] = await getDb().select().from(meals).where(and(eq(meals.id, mealId), eq(meals.patientId, patientId))).limit(1);
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Meal entry not found." });
      if (before.analysisStatus === "complete" && (!reason || reason.length < 3)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Correcting an analyzed meal requires a short reason." });
      }
      const result = await getDb().update(meals).set({
        ...values,
        analysisStatus: "manual",
        confidence: "unknown",
        patientMessage: "Nutrition entered manually.",
      }).where(and(eq(meals.id, mealId), eq(meals.patientId, patientId)));
      if (!result[0].affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Meal entry not found." });
      await recordCareAudit({ patientId, actorUserId: ctx.user.id, entityType: "meal", entityId: mealId, action: "nutrition_corrected", reason: reason ?? "", before, after: values });
      return { ok: true };
    }),

  analyzePhoto: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      eatenDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      eatenAt: z.date(),
      mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "drink"]),
      note: z.string().max(2000),
      photo: base64FileSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const { patient } = await requirePatientAccess(ctx.user.id, input.patientId);
      if (!input.photo.contentType.startsWith("image/")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a meal or drink image." });
      }
      const saved = await uploadCareFile(input.patientId, "meals", input.photo);
      const totals = await getDayNutritionTotals(input.patientId, input.eatenDay);
      try {
        const analysis = await analyzeMealImage({
          bytes: decodeBase64File(input.photo),
          contentType: input.photo.contentType,
          profile: patient,
          totals,
          note: input.note,
        });
        const [{ id }] = await getDb().insert(meals).values({
          patientId: input.patientId,
          eatenDay: input.eatenDay,
          eatenAt: input.eatenAt,
          mealType: input.mealType,
          note: input.note,
          photoKey: saved.key,
          analysisStatus: "complete",
          items: JSON.stringify(analysis.items),
          calories: analysis.calories,
          carbs: analysis.carbs,
          sugar: analysis.sugar,
          addedSugar: analysis.addedSugar,
          fiber: analysis.fiber,
          protein: analysis.protein,
          fat: analysis.fat,
          saturatedFat: analysis.saturatedFat,
          sodium: analysis.sodium,
          potassium: analysis.potassium,
          fluid: analysis.fluid,
          confidence: analysis.confidence,
          caregiverFlags: JSON.stringify(analysis.caregiverFlags),
          patientMessage: analysis.patientMessage,
          createdBy: ctx.user.id,
        }).$returningId();
        if (analysis.components.length) {
          await getDb().insert(mealComponents).values(analysis.components.map((component) => ({
            ...component,
            mealId: id,
            patientId: input.patientId,
            estimationSource: "photo" as const,
          })));
        }
        for (const [index, flag] of analysis.caregiverFlags.entries()) {
          await getDb().insert(alerts).values({
            patientId: input.patientId,
            kind: "nutrition",
            title: "Meal estimate needs review",
            body: flag,
          });
          await queueCareReview({ patientId: input.patientId, sourceKey: `meal:${id}:flag:${index}`, kind: "nutrition", title: "Meal estimate needs review", body: flag, createdBy: ctx.user.id });
        }
        return { id, status: "complete" as const, message: analysis.patientMessage };
      } catch {
        const [{ id }] = await getDb().insert(meals).values({
          patientId: input.patientId,
          eatenDay: input.eatenDay,
          eatenAt: input.eatenAt,
          mealType: input.mealType,
          note: input.note,
          photoKey: saved.key,
          analysisStatus: "failed",
          items: JSON.stringify([]),
          caregiverFlags: JSON.stringify([]),
          createdBy: ctx.user.id,
          patientMessage: "Photo saved. Nutrition still needs manual entry.",
        }).$returningId();
        await queueCareReview({ patientId: input.patientId, sourceKey: `meal:${id}:nutrition-missing`, kind: "nutrition", title: "Meal photo needs nutrition", body: "Photo analysis was unavailable. Enter or confirm nutrition manually when practical.", createdBy: ctx.user.id });
        return {
          id,
          status: "failed" as const,
          message: "Photo saved, but analysis is unavailable. Add the nutrition manually when you can.",
        };
      }
    }),

  review: authedQuery
    .input(z.object({ patientId: z.number().int().positive(), mealId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const result = await getDb().update(meals).set({ reviewedBy: ctx.user.id, reviewedAt: new Date() })
        .where(and(eq(meals.id, input.mealId), eq(meals.patientId, input.patientId)));
      if (!result[0].affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Meal entry not found." });
      await recordCareAudit({ patientId: input.patientId, actorUserId: ctx.user.id, entityType: "meal", entityId: input.mealId, action: "meal_reviewed" });
      return { ok: true };
    }),
});
