import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { memberships, patients } from "@db/schema";
import { getDb } from "./connection";

export async function requirePatientAccess(
  userId: number,
  patientId: number,
  requiredRole?: "caregiver" | "parent",
) {
  const [row] = await getDb()
    .select({ patient: patients, membership: memberships })
    .from(memberships)
    .innerJoin(patients, eq(patients.id, memberships.patientId))
    .where(and(eq(memberships.userId, userId), eq(memberships.patientId, patientId)))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Care profile not found." });
  }
  if (requiredRole && row.membership.role !== requiredRole) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action is available to caregivers only.",
    });
  }
  return row;
}

export function parseTimes(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function dayOffset(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
