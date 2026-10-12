import { describe, it, expect } from "vitest";
import { providedRecipeLogEntry, parseProvidedRecipeNutrition } from "./providedRecipeNutrition";
import { KOREAN_BEEF_BOWL } from "@/constants/koreanBeefBowl";
import { mealNutrition } from "./nutrition";

describe("provided recipe nutrition", () => {
  it("accepts zero and decimal macros, rejecting missing, nonnumeric or unsupported values", () => {
    expect(parseProvidedRecipeNutrition({ calories: 0, proteinG: 1.5, carbsG: 0, fatG: 0 })).toEqual({ calories: 0, proteinG: 1.5, carbsG: 0, fatG: 0 });
    for (const value of [null, [], { calories: 560 }, { calories: "560", proteinG: 45, carbsG: 58, fatG: 16 }, { calories: Infinity, proteinG: 45, carbsG: 58, fatG: 16 }]) expect(parseProvidedRecipeNutrition(value)).toBeNull();
  });
  it("keeps supplied per-serving values independent of ingredient estimates and recipe yield", () => {
    expect(mealNutrition({ ...KOREAN_BEEF_BOWL, servings: 6 }, []).perServing).toEqual(KOREAN_BEEF_BOWL.providedNutrition);
    expect(mealNutrition({ ...KOREAN_BEEF_BOWL, servings: 6 }, []).calories).toBe(3360);
    const entry = providedRecipeLogEntry(KOREAN_BEEF_BOWL, 1.5, "2026-10-12", "lunch");
    expect(entry).toMatchObject({ servings: 1.5, calories: 560, proteinG: 45, carbsG: 58, fatG: 16, valueSource: "user_provided", servingUnit: "serving" });
    expect(entry).not.toHaveProperty("foodId");
    expect(providedRecipeLogEntry({ ...KOREAN_BEEF_BOWL, providedNutrition: null }, 1, "2026-10-12", "lunch")).toBeNull();
  });
});
