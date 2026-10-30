import { and, asc, desc, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { medicationSchedules, medications } from "@db/schema";
import { getDb } from "./connection";

export function dayInTimezone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function dayAndMinutesInTimezone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: `${value.year}-${value.month}-${value.day}`,
    minutes: Number(value.hour) * 60 + Number(value.minute),
  };
}

export function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export async function ensureMedicationScheduleVersions(patientId: number) {
  const meds = await getDb().select().from(medications).where(eq(medications.patientId, patientId));
  for (const medication of meds) {
    const [existing] = await getDb().select({ id: medicationSchedules.id })
      .from(medicationSchedules)
      .where(eq(medicationSchedules.medicationId, medication.id))
      .limit(1);
    if (existing) continue;
    await getDb().insert(medicationSchedules).values({
      patientId,
      medicationId: medication.id,
      dose: medication.dose,
      instructions: medication.instructions,
      scheduleTimes: medication.scheduleTimes,
      effectiveFrom: medication.createdAt.toISOString().slice(0, 10),
      effectiveTo: medication.active ? null : dayInTimezone(medication.updatedAt, "UTC"),
      reason: "Baseline created from the previously confirmed medication record.",
      confirmedBy: medication.confirmedBy,
      confirmedAt: medication.confirmedAt,
    });
  }
}

export async function getMedicationScheduleForDay(medicationId: number, day: string) {
  const [schedule] = await getDb().select().from(medicationSchedules)
    .where(and(
      eq(medicationSchedules.medicationId, medicationId),
      lte(medicationSchedules.effectiveFrom, day),
      or(isNull(medicationSchedules.effectiveTo), gte(medicationSchedules.effectiveTo, day)),
    ))
    .orderBy(desc(medicationSchedules.effectiveFrom), desc(medicationSchedules.id))
    .limit(1);
  return schedule ?? null;
}

export async function getPatientSchedulesForDay(patientId: number, day: string) {
  await ensureMedicationScheduleVersions(patientId);
  return getDb().select({ medication: medications, schedule: medicationSchedules })
    .from(medicationSchedules)
    .innerJoin(medications, eq(medications.id, medicationSchedules.medicationId))
    .where(and(
      eq(medicationSchedules.patientId, patientId),
      or(eq(medications.active, true), isNotNull(medicationSchedules.effectiveTo)),
      lte(medicationSchedules.effectiveFrom, day),
      or(isNull(medicationSchedules.effectiveTo), gte(medicationSchedules.effectiveTo, day)),
    ))
    .orderBy(asc(medications.name), desc(medicationSchedules.effectiveFrom));
}
