import { generateObject } from "ai";
import { z } from "zod";
import { classifyAiError } from "../lib/ai-client";
import { getDefaultVisionModel } from "./provider";

const estimatedNutrients = {
  calories: z.number().min(0).max(10000).nullable(),
  carbs: z.number().min(0).max(1500).nullable(),
  sugar: z.number().min(0).max(1000).nullable(),
  addedSugar: z.number().min(0).max(1000).nullable(),
  fiber: z.number().min(0).max(300).nullable(),
  protein: z.number().min(0).max(1000).nullable(),
  fat: z.number().min(0).max(1000).nullable(),
  saturatedFat: z.number().min(0).max(500).nullable(),
  sodium: z.number().min(0).max(50000).nullable(),
  potassium: z.number().min(0).max(30000).nullable(),
  fluid: z.number().min(0).max(10000).nullable(),
};

const nutritionSchema = z.object({
  isFoodOrDrink: z.boolean(),
  items: z.array(z.object({ name: z.string(), portion: z.string() })).max(12),
  components: z.array(z.object({
    name: z.string().max(180),
    grams: z.number().min(0).max(5000).nullable(),
    ...estimatedNutrients,
  })).max(12),
  ...estimatedNutrients,
  confidence: z.enum(["low", "medium", "high", "unknown"]),
  patientMessage: z.string().max(300),
  caregiverFlags: z.array(z.string()).max(8).optional().default([]),
});

const prescriptionSchema = z.object({
  medicines: z.array(
    z.object({
      name: z.string(),
      strength: z.string(),
      dose: z.string(),
      instructions: z.string(),
      times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(8),
      confidence: z.enum(["low", "medium", "high", "unknown"]),
      warnings: z.array(z.string()).max(6),
    }),
  ).max(10),
  documentWarnings: z.array(z.string()).max(8),
});

const labReportSchema = z.object({
  title: z.string().max(180),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  results: z.array(z.object({
    name: z.string().max(140),
    value: z.number(),
    unit: z.string().max(40),
    referenceLow: z.number().nullable(),
    referenceHigh: z.number().nullable(),
  })).max(60),
  warnings: z.array(z.string().max(300)).max(8),
});

const SAFETY = `Safety rules: You are creating a draft for a family caregiver, not providing medical care. Never diagnose, recommend treatment, or tell anyone to start, stop, or change a medicine, supplement, dose, or diet. Do not invent text or values that are not visible. Use null for unknown nutrition values. Flag uncertainty for caregiver review. Never treat a photo as proof that medicine was swallowed.`;

export async function analyzeMealImage(input: {
  bytes: Uint8Array;
  contentType: string;
  profile: unknown;
  totals: unknown;
  note: string;
}) {
  try {
    const { object } = await generateObject({
      model: await getDefaultVisionModel(),
      schema: nutritionSchema,
      system: `${SAFETY}
You estimate nutrition from one meal or drink photo for an older adult's caregiver-supervised log. Estimate visible portions conservatively and honestly. Include calories, total carbohydrate, total sugar, added sugar when estimable, fiber, protein, fat, saturated fat, sodium, potassium, and fluid. In components, separately estimate each visible food or drink segment, its approximate grams or millilitres, and its own nutrients so calories can be audited item by item. The top-level totals should include the whole meal, including visible items that cannot be separated reliably. Do not confuse total sugar with added sugar. Patient message: at most two short, warm, neutral sentences; never shame or praise restriction. Any concern about a condition, supplement, electrolyte, allergy, or care-team limit belongs only in caregiverFlags. If this is not food or drink, set isFoodOrDrink false and all nutrition values null.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: `data:${input.contentType};base64,${Buffer.from(input.bytes).toString("base64")}`,
            },
            {
              type: "text",
              text: `Care profile and care-team targets: ${JSON.stringify(input.profile)}\nEstimated totals already logged today: ${JSON.stringify(input.totals)}\nUser note: ${input.note || "none"}`,
            },
          ],
        },
      ],
      providerOptions: { "kimi-gw": { max_completion_tokens: 3500 } },
    });
    return object;
  } catch (error) {
    throw classifyAiError(error);
  }
}

export async function analyzePrescriptionImage(input: {
  bytes: Uint8Array;
  contentType: string;
}) {
  try {
    const { object } = await generateObject({
      model: await getDefaultVisionModel(),
      schema: prescriptionSchema,
      system: `${SAFETY}
Read a prescription, pharmacy label, or medicine photo into an unconfirmed draft. Copy only visible medicine names, strengths, doses, directions, and explicit administration times. Convert clearly stated frequencies into suggested clock times only when the document states them; otherwise leave times empty. Never identify loose pills from appearance alone. Every extracted medicine requires caregiver comparison with the original prescription before it can be used as a schedule.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: `data:${input.contentType};base64,${Buffer.from(input.bytes).toString("base64")}`,
            },
            { type: "text", text: "Extract the visible medication details as an unconfirmed draft." },
          ],
        },
      ],
      providerOptions: { "kimi-gw": { max_completion_tokens: 2200 } },
    });
    return object;
  } catch (error) {
    throw classifyAiError(error);
  }
}


export async function analyzeLabReportImage(input: {
  bytes: Uint8Array;
  contentType: string;
}) {
  try {
    const { object } = await generateObject({
      model: await getDefaultVisionModel(),
      schema: labReportSchema,
      system: `${SAFETY}
Extract numeric laboratory results from a report image into an unconfirmed draft. Copy only visible analyte names, numeric values, units, report date, and printed reference limits. Do not calculate derived results, interpret the values, diagnose, or infer missing reference ranges. Preserve the report's units exactly. Every result requires caregiver comparison with the original report before it is stored as confirmed.`,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: `data:${input.contentType};base64,${Buffer.from(input.bytes).toString("base64")}` },
            { type: "text", text: "Extract the visible numeric laboratory results as an unconfirmed draft." },
          ],
        },
      ],
      providerOptions: { "kimi-gw": { max_completion_tokens: 3000 } },
    });
    return object;
  } catch (error) {
    throw classifyAiError(error);
  }
}
