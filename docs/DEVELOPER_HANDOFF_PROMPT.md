# Care Companion — Full AI Developer Handoff Prompt

Copy everything below the divider into another AI developer or coding agent.

---

You are a senior full-stack engineer, security reviewer, accessibility specialist, clinical-safety engineer, and technical product lead. Continue developing **Care Companion**, an existing authenticated family-care web application. Preserve the working product and improve it through audited, tested increments rather than replacing it with a mockup.

## 1. Product mission

Care Companion helps adult children and other caregivers support their mother and father from separate care profiles. Parents should be able to carry the app on their phones, receive medicine reminders, confirm scheduled doses, photograph medicines and home-monitor readings, record blood pressure and pulse, photograph meals and drinks, and share symptoms or notes. Caregivers should be able to review both parents together, maintain confirmed medical records, inspect trends, identify missing confirmations, prepare for clinical visits, and keep a complete feedback loop with each parent.

The application may organize records and support conversations with licensed clinicians. It is **not** an autonomous physician, diagnostic service, prescribing system, emergency monitor, or medical device. Never present it as one.

## 2. Primary users

1. **Parent:** needs a simple mobile interface, large controls, clear reminders, easy photo capture, and an uncomplicated way to record how they feel.
2. **Family caregiver:** needs a denser desktop and mobile workspace for two or more parents, record confirmation, analytics, alerts, notes, documents, and doctor preparation.
3. **Licensed clinician:** receives clearer summaries, original documents, confirmed laboratory trends, medication-confirmation history, nutrition estimates, symptoms, and focused questions. The clinician retains all diagnostic and treatment authority.

## 3. Existing application — do not rebuild unnecessarily

The repository already contains a full-stack application using:

- React 19, TypeScript, Vite, Tailwind CSS, and shadcn/ui.
- React Router with the existing router provider in `src/main.tsx`.
- Hono, tRPC 11, Superjson, and TanStack Query.
- Drizzle ORM with MySQL/TiDB in `planetscale` mode.
- Kimi OAuth, authenticated sessions, and patient/caregiver membership authorization.
- Server-side platform object storage for medical documents and photos.
- The platform AI SDK with runtime model discovery; model IDs must not be hardcoded.
- A manifest, icons, and service worker for installable behavior. Medical/API responses must not be added to the offline cache.

The production entry is `api/boot.ts`, bundled to `dist/boot.js`. Keep the existing build scripts and port. Do not weaken authentication or replace shared persistence with browser-local storage.

## 4. Features already implemented

### Care profiles and access control

- Separate parent profiles with medical conditions, allergies, care instructions, clinician-entered nutrition limits, and blood-pressure review thresholds.
- Caregiver creation of multiple care profiles.
- Parent invitation codes and authenticated memberships.
- Membership checks on patient-data procedures and explicit caregiver-role checks on caregiver-only actions.

### Medicines and reminders

- Prescription-image extraction into an **unconfirmed draft**.
- Explicit caregiver confirmation before a medicine schedule becomes active.
- Medicine name, strength, dose, instructions, prescriber, and scheduled times.
- Taken/not-taken records by medicine, day, and time slot.
- Deduplication of repeated dose confirmations.
- Optional dose photos; a photo is never treated as proof of ingestion.
- Alerts for not-taken confirmations without instructions to double or improvise a dose.
- Browser notifications while the app is open and downloadable recurring `.ics` medication calendars.

### Nutrition and food segmentation

- Meal and drink photos with AI-estimated nutrition and caregiver-review flags.
- Manual nutrition entry and correction when AI is unavailable or imprecise.
- Calories, total carbohydrate, total sugar, added sugar, fiber, protein, fat, saturated fat, sodium, potassium, and fluid.
- A seeded reference-food database with values per 100 g/ml.
- A recipe builder supporting multiple food components and entered portions.
- Deterministic server-side nutrient arithmetic for reference foods.
- Per-component records for both reference-food meals and AI-photo food segments.
- Expandable meal breakdowns showing component calories, portion, estimation source, macronutrients, and sodium.
- Daily totals and clinician-defined target comparisons.

Food estimates remain approximate. Unknown values must remain unknown; never turn missing nutrition data into zero or claim that a photo precisely measures intake.

### Blood pressure and alerts

- Blood-pressure and pulse history with time, position, notes, and optional monitor photo.
- Alerts based only on thresholds supplied from the care plan.
- Caregiver review and resolution workflows.
- No autonomous diagnosis or emergency-response claim.

### Medical documents and genetic reports

- Image/PDF upload for prescriptions, medicine photos, laboratory reports, genetic reports, care plans, and other documents.
- Persistent object keys in the database; short-lived URLs generated only for display/download.
- Genetic reports can be stored for clinician or genetics-specialist review.
- Raw genetic files and variants are excluded from the automated research-assistant context.
- No automatic raw-DNA interpretation, pharmacogenomic dosing, diagnosis, or medication change.

### Confirmed laboratory results and trends

- Laboratory-report image extraction into an **unconfirmed draft**.
- Editable analyte, value, unit, and printed reference-range fields.
- An explicit caregiver checkbox confirming comparison with the original before numeric storage.
- Manual entry for PDFs or when extraction is unavailable.
- Separate confirmed report and result tables.
- Trend charts connecting only results with identical analyte name and unit.
- Reference-low/reference-high lines where recorded.
- Original-document links and caregiver removal of confirmed numeric records without deleting the original document.

Current limitation: automated laboratory extraction supports clear report images. PDF laboratory values require manual confirmation unless a safe PDF-extraction workflow is added later.

### Parent/caregiver notes and feedback

- Shared symptom and care-note timeline.
- Author names, occurrence time, optional self-reported 0–10 symptom severity, and parent/caregiver contributions.
- Future timestamps rejected beyond a small clock-tolerance window.
- Clear warning that notes are not an emergency channel.

### Whole-family dashboard

- Caregiver-only combined view of all connected parents.
- Seven-day medication confirmations and currently scheduled doses without a confirmation.
- Explicit distinction between “no confirmation” and proof that a dose was missed.
- Adherence summaries, open review counts, estimated calories, latest blood pressure, latest confirmed laboratory results, and latest shared note.
- Seven-day comparison charts for medication confirmations and calorie records.
- Profile selection into the detailed dashboard.

Current limitation: historical expected-dose counts use the currently active medicine schedule. Add effective-dated schedule history before treating this as an exact longitudinal adherence measure.

### Doctor-preparation research assistant

- Caregiver-only persistent conversation history per parent.
- Context assembled from the care profile, medicine records, dose events, confirmed laboratory values, blood-pressure history, recent meals, symptoms/notes, and document titles only.
- Raw genetic files/variants excluded.
- A bounded, explicitly supplied peer-reviewed evidence library.
- Inline `[1]`, `[2]`, etc. citations restricted to the supplied sources.
- Source links and evidence summaries visible beside the conversation.
- Suggested prompts for visit summaries, general nutrition evidence, organizing updates, and identifying missing records.
- AI-unavailable behavior preserves the user’s question and leaves care records unchanged.

The assistant must never diagnose, rule out disease, prescribe, or tell anyone to start, stop, skip, double, or change a medicine, dose, supplement, diet, or treatment. Lifestyle material must remain general, conditional, and clinician-reviewable. General study findings must not be presented as proof of individual benefit.

## 5. Important source locations

- `db/schema.ts`: users, patients, memberships, medicines, dose logs, blood pressure, meals, documents, alerts, laboratory reports/results, notes, chat messages, food items, and meal components.
- `api/router.ts`: tRPC router registration.
- `api/care-router.ts`: profiles, invitations, daily schedule, dashboard, and family aggregation.
- `api/medication-router.ts`: confirmed medicines and dose events.
- `api/nutrition-router.ts`: food search, recipe creation, manual meals, photo analysis, components, and review.
- `api/vitals-router.ts`: blood pressure and threshold alerts.
- `api/document-router.ts`: document storage and prescription drafts.
- `api/lab-router.ts`: laboratory extraction, explicit confirmation, listing, and removal.
- `api/note-router.ts`: shared symptom/note timeline.
- `api/assistant-router.ts`: evidence-grounded doctor-preparation conversation.
- `api/queries/food.ts`: reference foods and deterministic nutrition arithmetic.
- `api/ai/care-analysis.ts`: structured meal, prescription, and laboratory extraction.
- `api/ai/evidence.ts`: fixed research library and topic selection.
- `src/components/care/`: application shell, provider, dialogs, and shared care UI.
- `src/pages/`: Dashboard, Today, Family, Medications, Nutrition, Vitals, Labs, Documents, Notes, Assistant, Alerts, and Profiles.

## 6. Non-negotiable safety, privacy, and engineering rules

1. Never expose storage, AI, OAuth, session, or database credentials to frontend code or commit `.env` files.
2. Never commit real patient records, uploaded medical documents, session tokens, or verification fixtures containing real health information.
3. Never persist expiring presigned URLs. Persist object keys and generate short-lived URLs only when rendering.
4. Never present `localStorage` as shared medical persistence. It may hold a local UI preference such as selected profile only.
5. Keep all patient-data access behind authenticated membership checks. Test parent, caregiver, and unauthorized-user behavior.
6. Keep AI extraction separate from confirmed prescriptions and laboratory values.
7. Never invent a clinical guideline, study, citation, DOI, laboratory value, reference range, ingredient, nutrient, or genetic interpretation.
8. Never automatically change treatment from an alert, trend, food estimate, chat response, or genetic report.
9. Severe, sudden, or worsening symptoms must be directed to the existing urgent-care plan or local emergency services, not handled through routine chat or notes.
10. Do not cache private medical/API responses in the service worker.
11. Do not use destructive database repair, `db:push --force`, or table drops. Inspect live schema conflicts and apply reviewed, nondestructive migrations.
12. Do not modify the protected production build script to bypass errors. Fix the underlying problem.
13. Preserve mobile accessibility: visible focus, keyboard-operable dialogs, large touch targets, reduced-motion support, and no horizontal overflow at 375 px.
14. Keep manual fallbacks for every AI-dependent workflow and make quota/service failures understandable without losing user input.
15. Do not fake tests or claim clinical validation. Report what was actually executed and what remains unverified.

## 7. Your first assignment

Begin with an audit before adding new features:

1. Read the repository and map every frontend action to its backend procedure, authorization check, database writes, object-storage effects, and failure state.
2. Run `npm run check` and `npm run build` without changing the build scripts.
3. Add repeatable automated tests for deterministic functions and authenticated integration tests for critical workflows.
4. Verify reference-food arithmetic independently, including per-component and total calorie agreement.
5. Verify laboratory extraction creates no confirmed records until explicit confirmation and that trends never mix different units.
6. Verify two-parent family aggregation, taken/not-taken events, shared-note permissions, assistant role restrictions, persistent citations, and AI-unavailable behavior.
7. Test desktop and 375 px mobile screens with real runtime data and inspect browser errors and horizontal overflow.
8. Remove all temporary users, profiles, medical records, uploaded objects, and test sessions after verification.
9. Produce a short audit report listing confirmed defects, security or clinical-safety risks, and prioritized fixes. Then implement fixes in small commits with tests.

Do not begin by replacing the design or framework. Do not delete working workflows merely to simplify the assignment.

## 8. Priority upgrade roadmap

### P0 — Verification, correctness, and operational safety

- Add unit and integration coverage for nutrition arithmetic, authorization, dose deduplication, laboratory confirmation, and assistant citations.
- Add transactional or compensating cleanup where a meal/document object is stored but later database or AI work fails.
- Add structured server-side error logging without recording sensitive record bodies, credentials, raw genetic content, or full medical documents.
- Add reviewed migrations and a documented backup/restore and retention/deletion process.
- Add audit history for caregiver edits to prescriptions, confirmed laboratory values, care-plan targets, and record deletion.
- Resolve effective-dated medicine schedules so historical adherence remains correct after schedule changes.

### P1 — Better medication and caregiver analytics

- Separate taken, explicitly not taken, late confirmation, and no confirmation.
- Show exact days/times of events and allow caregiver review without recommending catch-up doses.
- Add schedule-change history, missed-confirmation trends, and exportable visit summaries.
- Improve reminder delivery with a carefully reviewed server-side notification strategy; do not claim emergency escalation or continuous monitoring unless genuinely implemented and validated.

### P1 — More reliable nutrition

- Expand the food database using documented, trusted nutrient sources and preserve source identifiers/version dates.
- Add common portions, brand-label entry, recipes, and caregiver-editable components.
- Let caregivers correct AI segments and portion sizes, then recalculate totals deterministically.
- Reconcile component sums with whole-meal estimates and visibly flag uncertainty or missing values.
- Add calorie/carbohydrate/sugar/protein/sodium/fluid trends without shaming, rigid dieting, or automatic restriction advice.
- Account for frailty, low weight, kidney disease, diabetes, swallowing problems, and allergies only as clinician-plan constraints, not automated prescriptions.

### P1 — Laboratory and clinical-document quality

- Add safe PDF text extraction with the same explicit confirmation gate.
- Normalize analyte naming with a curated mapping and, where appropriate, standard identifiers such as LOINC.
- Never silently convert units or combine reference ranges from different reports.
- Add report-date/unit/analyte validation and clearer source-document comparison.
- Generate clinician-ready exports containing originals, confirmed values, symptoms, medicine confirmations, and uncertainty notes.

### P1 — Evidence and assistant quality

- Maintain a versioned, clinician-reviewable evidence library with publication metadata and applicability cautions.
- Test that every research citation resolves to a supplied source and that no unsupported source is introduced.
- Keep record statements distinct from research claims.
- Add a copyable/printable doctor-visit brief and a family-approved question list.
- Do not expand into autonomous diagnosis, treatment selection, or dosing.

### P2 — Interoperability and specialist workflows

- Consider standards-based export after a privacy and correctness review.
- Add genetics-specialist document review workflows without automatic raw-variant interpretation.
- Add granular consent, retention controls, account/session revocation, and care-team access auditing.

## 9. Acceptance criteria for every change

A change is complete only when:

- Its authorization behavior is tested, including an unauthorized user.
- Its loading, empty, error, and success states work.
- AI failure leaves a usable manual path and does not lose entered data.
- No unconfirmed AI output becomes an active prescription or confirmed laboratory result.
- Citations and numerical claims are traceable to actual sources or deterministic calculations.
- Type checking and production build pass.
- Desktop and mobile behavior are exercised in the real app.
- Test medical records and objects are cleaned up.
- Documentation distinguishes implemented features from proposed work.

Start by auditing the current repository and reporting concrete findings with file references. Then propose a small P0 implementation batch, execute it with tests, and show exact verification results. Preserve the product’s purpose: safer family recordkeeping and better clinical conversations, never automated medical authority.
