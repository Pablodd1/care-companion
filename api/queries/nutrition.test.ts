import { describe, expect, it } from "vitest";
import { sumMealNutrition } from "./nutrition";

describe("sumMealNutrition", () => {
  it("keeps every nutrient unknown when no row recorded it", () => {
    const totals = sumMealNutrition([{ calories: 200, sodium: 300 }]);
    expect(totals.calories).toBe(200);
    expect(totals.sodium).toBe(300);
    expect(totals.potassium).toBeNull();
    expect(totals.fluid).toBeNull();
    expect(totals.meals).toBe(1);
  });

  it("sums only the rows that recorded a value", () => {
    const totals = sumMealNutrition([
      { calories: 100, potassium: 150 },
      { calories: 220 },
      { calories: null, potassium: 100 },
    ]);
    expect(totals.calories).toBe(320);
    expect(totals.potassium).toBe(250);
    expect(totals.meals).toBe(3);
  });

  it("returns null (not zero) for a day with no known values", () => {
    const totals = sumMealNutrition([{ calories: null }, {}]);
    expect(totals.calories).toBeNull();
    expect(totals.meals).toBe(2);
  });

  it("counts a recorded zero as known, not unknown", () => {
    const totals = sumMealNutrition([{ sodium: 0 }, { sodium: 0 }]);
    expect(totals.sodium).toBe(0);
  });

  it("ignores non-finite junk instead of poisoning the day", () => {
    const totals = sumMealNutrition([
      { calories: Number.NaN },
      { calories: Number.POSITIVE_INFINITY },
      { calories: 90 },
    ]);
    expect(totals.calories).toBe(90);
  });

  it("rounds fractional sums to two decimals", () => {
    const totals = sumMealNutrition([{ carbs: 10.111 }, { carbs: 20.22222 }]);
    expect(totals.carbs).toBeCloseTo(30.33, 2);
  });
});
