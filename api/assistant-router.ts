import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { generateText } from "ai";
import { TRPCError } from "@trpc/server";
import { bloodPressureReadings, chatMessages, documents, doseLogs, healthNotes, labResults, meals, medications } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { dayOffset, requirePatientAccess } from "./queries/care";
import { getDefaultVisionModel } from "./ai/provider";
import { classifyAiError } from "./lib/ai-client";
import { evidenceLibrary, selectEvidence } from "./ai/evidence";

function parseSources(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const assistantRouter = createRouter({
  evidence: authedQuery.query(() => evidenceLibrary),

  history: authedQuery
    .input(z.object({ patientId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const rows = await getDb().select().from(chatMessages)
        .where(eq(chatMessages.patientId, input.patientId))
        .orderBy(asc(chatMessages.createdAt)).limit(100);
      return rows.map((row) => ({ ...row, sources: parseSources(row.sources) }));
    }),

  ask: authedQuery
    .input(z.object({
      patientId: z.number().int().positive(),
      question: z.string().trim().min(2).max(4000),
    }))
    .mutation(async ({ ctx, input }) => {
      const { patient } = await requirePatientAccess(ctx.user.id, input.patientId, "caregiver");
      const since = dayOffset(new Date().toISOString().slice(0, 10), -29);
      const [meds, doses, labs, bp, food, notes, geneticDocs, previous] = await Promise.all([
        getDb().select().from(medications).where(eq(medications.patientId, input.patientId)),
        getDb().select().from(doseLogs).where(eq(doseLogs.patientId, input.patientId)).orderBy(desc(doseLogs.loggedAt)).limit(80),
        getDb().select().from(labResults).where(eq(labResults.patientId, input.patientId)).orderBy(desc(labResults.createdAt)).limit(80),
        getDb().select().from(bloodPressureReadings).where(eq(bloodPressureReadings.patientId, input.patientId)).orderBy(desc(bloodPressureReadings.measuredAt)).limit(12),
        getDb().select().from(meals).where(eq(meals.patientId, input.patientId)).orderBy(desc(meals.eatenAt)).limit(15),
        getDb().select().from(healthNotes).where(eq(healthNotes.patientId, input.patientId)).orderBy(desc(healthNotes.occurredAt)).limit(15),
        getDb().select({ title: documents.title, fileName: documents.fileName, createdAt: documents.createdAt })
          .from(documents).where(eq(documents.patientId, input.patientId)).orderBy(desc(documents.createdAt)).limit(20),
        getDb().select().from(chatMessages).where(eq(chatMessages.patientId, input.patientId)).orderBy(desc(chatMessages.createdAt)).limit(8),
      ]);
      const sources = selectEvidence(input.question);
      const record = {
        asOf: new Date().toISOString(),
        profile: patient,
        medicines: meds.map((med) => ({ name: med.name, strength: med.strength, dose: med.dose, instructions: med.instructions, active: med.active, scheduleTimes: med.scheduleTimes })),
        doseEventsSince: since,
        doseEvents: doses,
        confirmedLabResults: labs,
        bloodPressure: bp,
        recentMeals: food,
        symptomsAndNotes: notes,
        documentTitlesOnly: geneticDocs,
        privacyNote: "No raw genetic file or raw DNA variants are included in this AI context.",
      };
      const evidenceText = sources.map((source) => `[${source.id}] ${source.title} (${source.year}). ${source.summary} URL: ${source.url}`).join("\n");
      try {
        const { text } = await generateText({
          model: await getDefaultVisionModel(),
          system: `You are Care Companion's doctor-support research assistant. You are not a physician and do not replace one. Help a family prepare for a licensed clinician's decisions.

Hard safety rules:
- Never diagnose, rule out disease, prescribe, or tell anyone to start, stop, skip, double, or change a medicine, dose, supplement, diet, or treatment.
- Do not interpret raw DNA or claim a consumer genetic result determines drug response. Genetic and pharmacogenomic findings require validated interpretation and clinician review.
- Describe recorded trends and printed laboratory reference ranges cautiously. Missing data is missing, not normal.
- Lifestyle discussion must be general and conditional on the treating clinician's plan, especially for older adults, kidney disease, diabetes, swallowing problems, low weight, or frailty.
- Use only the supplied peer-reviewed sources for research claims. Cite them inline as [1], [2], etc. Never invent another citation, DOI, study, or clinical guideline.
- Do not present association as causation or a trial population as proof of benefit for this person.
- If urgent or severe symptoms are described, advise following the existing emergency plan or contacting local emergency services now rather than waiting for the app or a routine appointment.

Response pattern when useful: brief record summary; general evidence/lifestyle topics to discuss; 3–5 specific questions for the treating clinician; what additional data would help. Keep it under 550 words. Be warm, neutral, and explicit about uncertainty.`,
          messages: [
            ...previous.reverse().map((message) => ({ role: message.role, content: message.body })),
            {
              role: "user" as const,
              content: `Family question: ${input.question}\n\nCurrent care record (use as records, not as research citations):\n${JSON.stringify(record)}\n\nApproved research sources:\n${evidenceText}`,
            },
          ],
          providerOptions: { "kimi-gw": { max_completion_tokens: 1800 } },
        });
        await getDb().insert(chatMessages).values([
          { patientId: input.patientId, role: "user", body: input.question, sources: JSON.stringify([]), createdBy: ctx.user.id },
          { patientId: input.patientId, role: "assistant", body: text, sources: JSON.stringify(sources), createdBy: ctx.user.id },
        ]);
        return { answer: text, sources };
      } catch (error) {
        classifyAiError(error);
        throw new TRPCError({ code: "BAD_REQUEST", message: "The research assistant is unavailable right now. Your care records are unchanged; please retry deliberately or prepare the question list manually." });
      }
    }),
});
