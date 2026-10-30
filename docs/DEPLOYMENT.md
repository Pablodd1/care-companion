# Deployment & family handover guide

Care Companion runs on the Kimi platform runtime (Kimi OAuth, AgentGW object
storage, AgentGW AI). The Dockerfile is not self-hostable — auth, storage, and
AI credentials are injected by the platform.

## 1. Ship the code

1. Copy this source into the Kimi project (replace the app folder, keep
   `.backend-features.json`), then publish once so object storage provisions.
2. Apply the schema before first use. The checkpoint adds six tables
   (`medication_schedules`, `care_audit_events`, `care_review_items`,
   `push_subscriptions`, `reminder_deliveries` — plus `patients.timezone`).
   Run `npx drizzle-kit push`. If it aborts on an existing-table primary-key
   mismatch, inspect the live schema and apply only the missing nondestructive
   changes (never `--force` against production data, never drop tables).
3. Add the Web Push environment variables (Settings → environment):
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — one `npx web-push
     generate-vapid-keys` run, both keys from the SAME output
   - `VAPID_SUBJECT` — `mailto:` contact
   Rotating these later invalidates existing device subscriptions (the app now
   self-heals, but parents must tap Enable again). Pick once, keep them.
4. Verify: open the site, sign in, `care.bootstrap` responds, and Settings →
   reminders shows "Reminder service is configured".

## 2. Set up the care profile (caregiver, ~15 min)

1. Create the profile: name, birth year, conditions, allergies.
2. Enter blood-pressure and nutrition targets **from the current care plan**.
3. Photograph each prescription under Documents → run extraction → compare
   every field and time against the original → confirm. Nothing is scheduled
   before your explicit confirmation.
4. Set the profile timezone (defaults from the caregiver device).
5. Copy the invitation code from Care profiles (valid 30 days — New code
   rotates it instantly).

## 3. Set up the parent's iPhone (do this together, ~10 min)

Requires iOS 16.4+.

1. Safari → app URL → sign in with the Kimi account (create it together).
2. "I have an invitation" → enter the code.
3. Safari → Share → **Add to Home Screen** → open the app from that icon.
4. Today → **Enable on this device** → Allow. If it says blocked: iOS
   Settings → Notifications → Care Companion (or Safari) → Allow, and check
   Focus / Do Not Disturb.
5. Tap **Send real test** → confirm the notification appeared with the phone
   LOCKED. Web Push acceptance is not proof of display.
6. Medicines page → download the `.ics` calendar and import it to the iPhone
   calendar as the backup alarm. Re-import after every schedule change.

Android: Chrome works without installing, but Add to Home Screen is still
recommended; the flow is the same.

## 4. Operating notes

- The reminder server fires during a 20-minute window after each scheduled
  time and records every attempt (Settings → recent deliveries). A
  `no_subscriptions` or `failed` row means that dose was NOT reminded.
- Sessions last 90 days; the parent signs in again after that.
- AI photo analysis and document storage bill to the platform owner's quota.
- This app is a recordkeeping and reminder tool — not an emergency service.
  Keep the prescriber's contact and emergency plan outside the app.
