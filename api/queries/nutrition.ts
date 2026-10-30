import { and, eq } from "drizzle-orm";
import { meals } from "@db/schema";
import { getDb } from "./connection";

export async function getDayNutritionTotals(patientId: number, day: string) {
  const rows = await getDb()
    .select()
    .from(meals)
    .where(and(eq(meals.patientId, patientId), eq(meals.eatenDay, day)));

  const totals = {
    calories: 0,
    carbs: 0,
    sugar: 0,
    addedSugar: 0,
    fiber: 0,
    protein: 0,
    fat: 0,
    saturatedFat: 0,
    sodium: 0,
    potassium: 0,
    fluid: 0,
    meals: rows.length,
  };

  for (const row of rows) {
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      if (key === "meals") continue;
      totals[key] += Number(row[key]) || 0;
    }
  }
  return totals;
}
