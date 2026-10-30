import webpush from "web-push";
import { and, desc, eq } from "drizzle-orm";
import { doseLogs, patients, pushSubscriptions, reminderDeliveries } from "@db/schema";
import { getDb } from "./queries/connection";
import { minutesFromTime, parseTimes } from "./queries/care";
import { dayAndMinutesInTimezone, getPatientSchedulesForDay } from "./queries/medication-schedules";
import { log } from "./lib/logger";

function configurePush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey };
}

export function getPushPublicKey() {
  return configurePush()?.publicKey ?? null;
}

const PUSH_SEND_TIMEOUT_MS = 15_000;

// web-push sets no request timeout: one hung push-service connection would hold
// the scheduler's `running` guard forever and silently stop every reminder.
// Race every send against a timeout so a hang degrades to a failed attempt.
function sendWithTimeout(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
) {
  return Promise.race([
    webpush.sendNotification(subscription, payload, { TTL: 60 * 30, urgency: "high" }),
    new Promise<never>((_, reject) => setTimeout(() => {
      const error = new Error("Push service did not answer within 15s.");
      (error as Error & { statusCode?: number }).statusCode = 0;
      reject(error);
    }, PUSH_SEND_TIMEOUT_MS)),
  ]);
}

export function isWithinDeliveryWindow(currentMinutes: number, scheduledMinutes: number) {
  return currentMinutes >= scheduledMinutes && currentMinutes <= scheduledMinutes + 20;
}

export async function sendPatientPush(patientId: number, title: string, body: string, url = "/today") {
  if (!configurePush()) return { sent: 0, failed: 0, unavailable: true };
  const subscriptions = await getDb().select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.patientId, patientId));
  let sent = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    try {
      await sendWithTimeout(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({ title, body, url }),
      );
      sent += 1;
      await getDb().update(pushSubscriptions).set({ lastUsedAt: new Date() })
        .where(eq(pushSubscriptions.id, subscription.id));
    } catch (error) {
      failed += 1;
      const statusCode = typeof error === "object" && error && "statusCode" in error
        ? Number(error.statusCode)
        : 0;
      // 404/410: endpoint gone. 403: the stored subscription was created with a
      // different VAPID key (key rotation) and fails forever — drop it so a
      // rotated key cannot poison every future reminder for this profile.
      if (statusCode === 404 || statusCode === 410 || statusCode === 403) {
        await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      }
    }
  }
  return { sent, failed, unavailable: false };
}

let running = false;
let runningSince = 0;

async function deliverDueMedicationReminders() {
  // Watchdog: if a previous pass wedged (pause, debugger, unexpected state),
  // self-heal after 5 minutes instead of staying silent until restart.
  if (running) {
    if (Date.now() - runningSince < 5 * 60_000) return;
    log.error("medication reminder scheduler pass exceeded 5m; starting a new pass");
  }
  running = true;
  runningSince = Date.now();
  try {
    const careProfiles = await getDb().select().from(patients);
    const now = new Date();
    for (const patient of careProfiles) {
      // Isolate profiles: one bad patient (invalid timezone, transient DB error)
      // must not stop reminders for everyone processed after them.
      try {
        const { day, minutes } = dayAndMinutesInTimezone(now, patient.timezone);
        const schedules = await getPatientSchedulesForDay(patient.id, day);
        for (const { medication, schedule } of schedules) {
          for (const slot of parseTimes(schedule.scheduleTimes)) {
            if (!isWithinDeliveryWindow(minutes, minutesFromTime(slot))) continue;
            const [existingLog] = await getDb().select({ id: doseLogs.id }).from(doseLogs).where(and(
              eq(doseLogs.medicationId, medication.id),
              eq(doseLogs.day, day),
              eq(doseLogs.slot, slot),
            )).limit(1);
            if (existingLog) continue;
            const [existingDelivery] = await getDb().select({ id: reminderDeliveries.id })
              .from(reminderDeliveries).where(and(
                eq(reminderDeliveries.medicationId, medication.id),
                eq(reminderDeliveries.day, day),
                eq(reminderDeliveries.slot, slot),
              )).limit(1);
            if (existingDelivery) continue;
            const result = await sendPatientPush(
              patient.id,
              "Medication reminder",
              "Open Care Companion to review and confirm the scheduled dose.",
            );
            const status = result.sent ? "sent" as const
              : result.unavailable || result.failed ? "failed" as const
              : "no_subscriptions" as const;
            await getDb().insert(reminderDeliveries).values({
              patientId: patient.id,
              medicationId: medication.id,
              day,
              slot,
              status,
              recipientCount: result.sent,
              detail: result.unavailable
                ? "Push service is not configured."
                : result.sent
                  ? `Accepted by the push service for ${result.sent} device${result.sent === 1 ? "" : "s"}.`
                  : result.failed
                    ? "The push service did not accept the reminder. Check the device subscription."
                    : "No active device subscriptions for this care profile.",
            }).onDuplicateKeyUpdate({ set: { detail: "Reminder attempt already recorded." } });
          }
        }
      } catch (error) {
        log.error("medication reminder pass failed for patient", {
          patientId: patient.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    log.error("medication reminder scheduler failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
  }
}

export function startMedicationReminderScheduler() {
  void deliverDueMedicationReminders();
  const timer = setInterval(() => void deliverDueMedicationReminders(), 30_000);
  timer.unref();
}

export async function latestReminderDeliveries(patientId: number) {
  return getDb().select().from(reminderDeliveries)
    .where(eq(reminderDeliveries.patientId, patientId))
    .orderBy(desc(reminderDeliveries.attemptedAt)).limit(20);
}
