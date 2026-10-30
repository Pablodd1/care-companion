import { inArray, sql } from "drizzle-orm";
import { foodItems } from "@db/schema";
import { getDb } from "./connection";
import { usdaReferenceFoods } from "./usda-foods";

export const nutrientKeys = [
  "calories",
  "carbs",
  "sugar",
  "addedSugar",
  "fiber",
  "protein",
  "fat",
  "saturatedFat",
  "sodium",
  "potassium",
  "fluid",
] as const;

export type NutrientKey = (typeof nutrientKeys)[number];
export type NutrientValues = Record<NutrientKey, number | null>;

// Reference values per 100 g or 100 ml. They support transparent arithmetic,
// not brand-specific labels or clinical nutrition prescriptions.
const referenceFoods = [
  { name: "Rolled oats, dry", category: "Grains", portionUnit: "g", calories: 389, carbs: 66.3, sugar: 0.9, addedSugar: 0, fiber: 10.6, protein: 16.9, fat: 6.9, saturatedFat: 1.2, sodium: 2, potassium: 429, fluid: 0 },
  { name: "White rice, cooked", category: "Grains", portionUnit: "g", calories: 130, carbs: 28.2, sugar: 0.1, addedSugar: 0, fiber: 0.4, protein: 2.7, fat: 0.3, saturatedFat: 0.1, sodium: 1, potassium: 35, fluid: 0 },
  { name: "Wholegrain bread", category: "Grains", portionUnit: "g", calories: 247, carbs: 41, sugar: 5, addedSugar: 3, fiber: 7, protein: 13, fat: 3.4, saturatedFat: 0.7, sodium: 450, potassium: 250, fluid: 0 },
  { name: "Chicken breast, roasted", category: "Protein", portionUnit: "g", calories: 165, carbs: 0, sugar: 0, addedSugar: 0, fiber: 0, protein: 31, fat: 3.6, saturatedFat: 1, sodium: 74, potassium: 256, fluid: 0 },
  { name: "Salmon, baked", category: "Protein", portionUnit: "g", calories: 206, carbs: 0, sugar: 0, addedSugar: 0, fiber: 0, protein: 22, fat: 12, saturatedFat: 2.5, sodium: 59, potassium: 384, fluid: 0 },
  { name: "Egg, cooked", category: "Protein", portionUnit: "g", calories: 155, carbs: 1.1, sugar: 1.1, addedSugar: 0, fiber: 0, protein: 13, fat: 11, saturatedFat: 3.3, sodium: 124, potassium: 126, fluid: 0 },
  { name: "Lentil soup", category: "Meals", portionUnit: "g", calories: 60, carbs: 8.5, sugar: 1.5, addedSugar: 0, fiber: 2.5, protein: 3.5, fat: 1.2, saturatedFat: 0.2, sodium: 240, potassium: 180, fluid: 75 },
  { name: "Broccoli", category: "Vegetables", portionUnit: "g", calories: 34, carbs: 6.6, sugar: 1.7, addedSugar: 0, fiber: 2.6, protein: 2.8, fat: 0.4, saturatedFat: 0.1, sodium: 33, potassium: 316, fluid: 0 },
  { name: "Potato, baked", category: "Vegetables", portionUnit: "g", calories: 93, carbs: 21, sugar: 1.2, addedSugar: 0, fiber: 2.2, protein: 2.5, fat: 0.1, saturatedFat: 0, sodium: 7, potassium: 535, fluid: 0 },
  { name: "Apple", category: "Fruit", portionUnit: "g", calories: 52, carbs: 14, sugar: 10, addedSugar: 0, fiber: 2.4, protein: 0.3, fat: 0.2, saturatedFat: 0, sodium: 1, potassium: 107, fluid: 0 },
  { name: "Banana", category: "Fruit", portionUnit: "g", calories: 89, carbs: 23, sugar: 12, addedSugar: 0, fiber: 2.6, protein: 1.1, fat: 0.3, saturatedFat: 0.1, sodium: 1, potassium: 358, fluid: 0 },
  { name: "Greek yogurt, plain", category: "Dairy", portionUnit: "g", calories: 59, carbs: 3.6, sugar: 3.2, addedSugar: 0, fiber: 0, protein: 10, fat: 0.4, saturatedFat: 0.1, sodium: 36, potassium: 141, fluid: 0 },
  { name: "Milk, 2%", category: "Drinks", portionUnit: "ml", calories: 50, carbs: 4.8, sugar: 4.8, addedSugar: 0, fiber: 0, protein: 3.3, fat: 2, saturatedFat: 1.3, sodium: 44, potassium: 150, fluid: 100 },
  { name: "Almonds", category: "Nuts & seeds", portionUnit: "g", calories: 579, carbs: 22, sugar: 4.4, addedSugar: 0, fiber: 12.5, protein: 21, fat: 50, saturatedFat: 3.8, sodium: 1, potassium: 733, fluid: 0 },
  { name: "Olive oil", category: "Fats & oils", portionUnit: "g", calories: 884, carbs: 0, sugar: 0, addedSugar: 0, fiber: 0, protein: 0, fat: 100, saturatedFat: 14, sodium: 2, potassium: 1, fluid: 0 },
  { name: "Water", category: "Drinks", portionUnit: "ml", calories: 0, carbs: 0, sugar: 0, addedSugar: 0, fiber: 0, protein: 0, fat: 0, saturatedFat: 0, sodium: 0, potassium: 0, fluid: 100 },
] as const;

export async function ensureFoodDatabase() {
  const existing = await getDb().select({ name: foodItems.name }).from(foodItems);
  const known = new Set(existing.map((food) => food.name));
  const missing = [...referenceFoods, ...usdaReferenceFoods]
    .filter((food) => !known.has(food.name))
    .map((food) => ({ ...food }));
  if (missing.length) {
    await getDb().insert(foodItems).values(missing).onDuplicateKeyUpdate({
      set: { name: sql`${foodItems.name}` },
    });
  }
}

export async function calculateReferenceComponents(selections: { foodItemId: number; grams: number }[]) {
  await ensureFoodDatabase();
  const ids = [...new Set(selections.map((selection) => selection.foodItemId))];
  const rows = await getDb().select().from(foodItems).where(inArray(foodItems.id, ids));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return selections.map((selection) => {
    const food = byId.get(selection.foodItemId);
    if (!food) throw new Error("A selected reference food no longer exists.");
    const factor = selection.grams / 100;
    const nutrients = Object.fromEntries(
      nutrientKeys.map((key) => [key, Math.round(food[key] * factor * 100) / 100]),
    ) as Record<NutrientKey, number>;
    return {
      foodItemId: food.id,
      name: food.name,
      grams: selection.grams,
      estimationSource: "reference" as const,
      ...nutrients,
    };
  });
}

export function sumNutrients<T extends Partial<Record<NutrientKey, number | null>>>(components: T[]): NutrientValues {
  return Object.fromEntries(nutrientKeys.map((key) => {
    const values = components.map((component) => component[key]);
    const known = values.filter((value): value is number => typeof value === "number");
    return [key, known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) * 100) / 100 : null];
  })) as NutrientValues;
}
