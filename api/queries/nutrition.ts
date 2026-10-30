import { and, eq } from "drizzle-orm";
import { meals } from "@db/schema";
import { getDb } from "./connection";
import { nutrientKeys, type NutrientKey } from "./food";

export type MealNutritionRow = Partial<Record<NutrientKey, number | null>>;

export type DayNutritionTotals = Record<NutrientKey, number | null> & { meals: number };

// A day where nobody recorded potassium is a day with UNKNOWN potassium —
// never a day with 0 potassium. Unknown stays unknown; only known values sum.
export function sumMealNutrition(rows: MealNutritionRow[]): DayNutritionTotals {
  const totals = Object.fromEntries(nutrientKeys.map((key) => {
    const known = rows
      .map((row) => row[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const sum = known.reduce((acc, value) => acc + value, 0);
    return [key, known.length ? Math.round(sum * 100) / 100 : null];
  })) as DayNutritionTotals;
  totals.meals = rows.length;
  return totals;
}

export async function getDayNutritionTotals(patientId: number, day: string) {
  const rows = await getDb()
    .select()
    .from(meals)
    .where(and(eq(meals.patientId, patientId), eq(meals.eatenDay, day)));
  return sumMealNutrition(rows);
}
