# Care Companion

A mobile-friendly, authenticated family care workspace for separate parent profiles, confirmed medicine schedules, dose records, segmented meal and drink estimates, blood-pressure history, medical and genetic documents, confirmed laboratory trends, shared symptoms and notes, a combined family dashboard, and a cited doctor-preparation research assistant.

## Core workflows

- **Separate care profiles:** a caregiver can create profiles for multiple parents. A parent joins their own profile with its invitation code after signing in.
- **Medicines:** active schedules require an explicit confirmation against the original prescription. Taken/not-taken records are stored per medicine, day, and scheduled time. Removing a medicine stops future scheduling without deleting history.
- **Photos and documents:** meal, monitor, medicine, prescription, and other care files are stored through server-side platform object storage. The database stores object keys; short-lived display URLs are generated only when needed.
- **Food and drink:** image analysis returns provisional nutrition estimates and separately stored food segments. A reference-food recipe builder calculates per-component and total calories, carbohydrate, total and added sugar, fiber, protein, fat, saturated fat, sodium, potassium, and fluid using entered portions. Unknown values remain blank. Manual entry and correction are always available.
- **Laboratory trends:** clear report images can create an unconfirmed extraction draft. Numeric results are graphed only after explicit caregiver comparison with the original; trends connect only identical analyte names and units.
- **Family analytics:** a caregiver-only dashboard compares medication confirmations, doses without confirmation, estimated intake, blood pressure, confirmed laboratory results, alerts, symptoms, and notes across connected parents.
- **Shared feedback:** parents and caregivers can add timestamped symptoms and care notes with author names and optional self-reported severity.
- **Doctor preparation:** a caregiver-only research conversation uses confirmed records and a bounded peer-reviewed source library with inline citations. It prepares questions and general topics for licensed clinicians rather than making treatment decisions.
- **Genetic documents:** clinician-issued genetic reports can be stored for specialist review. Raw DNA files and variants are not sent into the assistant context or used for automatic interpretation.
- **Blood pressure:** readings can include pulse, position, time, notes, and a monitor photo. Review alerts use only thresholds entered from the care plan.
- **Caregiver review:** skipped doses, threshold-crossing readings, and applicable nutrition flags can create review items. Caregiver flags are not presented as parent-facing medical instructions.
- **Reminders:** parents can enable browser notifications while the app is open. Caregivers can download a recurring `.ics` calendar for device reminders and should re-import it after schedule changes.
- **Installable app:** the manifest and service worker support installation. API responses and medical records are not placed in the offline cache.

## Safety boundaries

Care Companion is a recordkeeping and reminder tool, not a medical device, diagnostic service, or emergency response service.

- Prescription extraction creates an unconfirmed draft only. A caregiver must compare every field and schedule with the original prescription before activation.
- AI never decides whether to start, stop, skip, double, or change a medicine or dose.
- A medicine photo does not prove ingestion.
- Food analysis is approximate and can miss ingredients or portion sizes. Verify important nutrition decisions with the care team.
- The app does not provide emergency monitoring. For urgent symptoms or readings, follow the clinician’s emergency plan or contact local emergency services.
- Parents and caregivers must sign in; all care-data procedures check profile membership. Caregiver-only changes also check the membership role.
- Laboratory extraction is only a draft until every value is confirmed against the original. Trends support review and are not diagnoses.
- The research assistant cites only its supplied evidence library. It cannot diagnose, prescribe, or recommend medication, dose, supplement, diet, or treatment changes.
- Raw genetic data is not interpreted automatically. Validated findings require clinician or genetics-specialist review.

## Data and integrations

- React, TypeScript, Vite, Tailwind CSS, and shadcn/ui
- Hono and tRPC with Superjson
- Drizzle ORM with MySQL/TiDB
- Kimi OAuth and authenticated user sessions
- Platform object storage for care files
- Platform AI SDK with runtime model discovery and structured output

Storage and AI credentials remain server-side and are supplied through the project environment. Never copy them into frontend code. Object-storage keys, not expiring URLs, are persisted.

Published runtime, storage, and AI calls can consume the site owner’s quota. AI calls are billed to the owner; storage also counts against the owner’s storage quota. Actual entries are available under **Settings → Credits and invoices → Usage details**.

## Developer handoff

See [the full AI developer handoff prompt](docs/DEVELOPER_HANDOFF_PROMPT.md) for the product contract, implemented workflows, source map, safety rules, verification requirements, and prioritized upgrade roadmap.

## Development

```bash
npm install
npm run check
npm run dev
```

The development server runs at `http://localhost:3000`.

Production verification:

```bash
npm run check
npm run build
npm start
```

Database commands:

```bash
npm run db:push       # development schema synchronization
npm run db:generate   # generate a reviewed production migration
npm run db:migrate    # apply pending migrations
```

Never use `db:push --force` or drop tables to repair a migration. If schema tooling conflicts with an existing TiDB key definition, inspect the live schema and apply only the missing nondestructive change.

## Operational checklist

Before relying on the app for family care:

1. Confirm each parent can access only their own profile.
2. Verify every prescription, dose, and schedule against its original document.
3. Enter nutrition and blood-pressure targets directly from the current care plan.
4. Test the parent’s phone notifications and imported calendar reminders.
5. Keep the original prescriptions and clinician contact details available outside the app.
6. Agree on who reviews alerts and how urgent situations are handled outside the app.
