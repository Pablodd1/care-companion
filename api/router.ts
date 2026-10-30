import { authRouter } from "./auth-router";
import { alertRouter } from "./alert-router";
import { careRouter } from "./care-router";
import { documentRouter } from "./document-router";
import { medicationRouter } from "./medication-router";
import { nutritionRouter } from "./nutrition-router";
import { vitalsRouter } from "./vitals-router";
import { labRouter } from "./lab-router";
import { noteRouter } from "./note-router";
import { assistantRouter } from "./assistant-router";
import { notificationRouter } from "./notification-router";
import { clinicianRouter } from "./clinician-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  care: careRouter,
  medications: medicationRouter,
  nutrition: nutritionRouter,
  vitals: vitalsRouter,
  documents: documentRouter,
  alerts: alertRouter,
  labs: labRouter,
  notes: noteRouter,
  assistant: assistantRouter,
  notifications: notificationRouter,
  clinician: clinicianRouter,
});

export type AppRouter = typeof appRouter;
