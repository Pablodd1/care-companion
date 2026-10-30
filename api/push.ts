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

export async function sendPatientPush(patientId: number, title: string, body: string, url = "/today") {
  if (!configurePush()) return { sent: 0, failed: 0, unavailable: true };
  const subscriptions = await getDb().select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.patientId, patientId));
  let sent = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({ title, body, url }),
        { TTL: 60 * 30, urgency: "high" },
      );
      sent += 1;
      await getDb().update(pushSubscriptions).set({ lastUsedAt: new Date() })
        .where(eq(pushSubscriptions.id, subscription.id));
    } catch (error) {
      failed += 1;
      const statusCode = typeof error === "object" && error && "statusCode" in error
        ? Number(error.statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      }
    }
  }
  return { sent, failed, unavailable: false };
}

let running = false;

async function deliverDueMedicationReminders() {
  if (running || !configurePush()) return;
  running = true;
  try {
    const careProfiles = await getDb().select().from(patients);
    const now = new Date();
    for (const patient of careProfiles) {
      const { day, minutes } = dayAndMinutesInTimezone(now, patient.timezone);
      const schedules = await getPatientSchedulesForDay(patient.id, day);
      for (const { medication, schedule } of schedules) {
        for (const slot of parseTimes(schedule.scheduleTimes)) {
          const scheduledMinutes = minutesFromTime(slot);
          if (minutes < scheduledMinutes || minutes > scheduledMinutes + 20) continue;
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
