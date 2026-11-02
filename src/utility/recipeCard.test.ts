import { describe, expect, it } from "vitest";
import { FOODS } from "@/constants/foods";
import { defaultRecipeComplexity, isRecipeComplexity, recipeBadge, recipeCardCalories } from "./recipeCard";
import { normalizedRecipeNutrition } from "./recipeCooking";
import type { Meal, ProvidedRecipeNutrition } from "@/types/domain";

describe("recipe card metadata", () => {
  it("defaults missing complexity without silently accepting unsupported restored values", () => {
    for (const value of [undefined, null, "", "  "]) expect(defaultRecipeComplexity(value)).toBe("medium");
    for (const value of ["easy", "medium", "hard", "expert"]) expect(defaultRecipeComplexity(value)).toBe(value);
    expect(isRecipeComplexity(defaultRecipeComplexity("expert"))).toBe(false);
  });
  it("accepts only manually supported complexity values", () => {
    for (const value of ["easy", "medium", "hard"]) expect(isRecipeComplexity(value)).toBe(true);
    for (const value of [undefined, null, "Easy", "automatic", 1]) expect(isRecipeComplexity(value)).toBe(false);
  });
  it("calculates calories per recipe serving and rejects incomplete nutrition", () => {
    const food = FOODS[0];
    const meal = { id: "meal", name: "Recipe", servings: 2, ingredients: [{ foodId: food.id, servings: 3 }] };
    expect(recipeCardCalories(meal, FOODS)).toBeCloseTo(food.calories * 1.5, 1);
    expect(recipeCardCalories({ ...meal, servings: 0 }, FOODS)).toBeUndefined();
    expect(recipeCardCalories({ ...meal, ingredients: [...meal.ingredients, { foodId: "missing", servings: 1 }] }, FOODS)).toBeUndefined();
    expect(recipeCardCalories({ ...meal, ingredients: [] }, FOODS)).toBeUndefined();
  });
  it("uses Popular before Favorite and shows no invented badge", () => {
    expect(recipeBadge({ favorite: true, popularRank: 1 })).toBe("Popular");
    expect(recipeBadge({ favorite: true })).toBe("Favorite");
    expect(recipeBadge({ favorite: false })).toBeNull(); expect(recipeBadge()).toBeNull();
  });
  it.each(["whole-recipe", "per-serving"] as const)("uses normalized %s macros without requiring linked ingredient nutrition or dividing twice", basis => {
    const values = { calories: 1200, proteinG: 24, carbsG: 240, fatG: 12 };
    const providedNutrition = normalizedRecipeNutrition({ method: "provided", basis, values }, 4)!;
    const recipe: Meal = { id: "cooking-only", name: "Recipe", servings: 4, ingredients: [], providedNutrition,
      cookingIngredients: [{ id: "rice", cookingMeasurement: { kind: "amount", name: "Rice", quantity: 2, unit: "cup" } }] };
    expect(recipeCardCalories(recipe, [])).toBe(basis === "whole-recipe" ? 300 : 1200);
    expect(recipeCardCalories({ ...recipe, ingredients: [{ foodId: "unloaded-food", servings: 1 }] }, [])).toBe(providedNutrition.calories);
  });
  it("prefers declared calories to ingredient calculations and retains explicit zero", () => {
    const recipe = { id: "provided", name: "Recipe", servings: 4, ingredients: [{ foodId: FOODS[0].id, servings: 8 }],
      providedNutrition: { calories: 123.45, proteinG: 4, carbsG: 20, fatG: 3 } };
    expect(recipeCardCalories(recipe, FOODS)).toBe(123.45);
    expect(recipeCardCalories({ ...recipe, ingredients: [], providedNutrition: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 } }, [])).toBe(0);
    for (const servings of [0, -1, NaN, Infinity]) expect(recipeCardCalories({ ...recipe, servings }, FOODS)).toBeUndefined();
  });
  it("keeps invalid provided macros unavailable instead of substituting ingredient calories", () => {
    const recipe = { id: "provided", name: "Recipe", servings: 4, ingredients: [{ foodId: FOODS[0].id, servings: 8 }] };
    const macros = { calories: 300, proteinG: 4, carbsG: 20, fatG: 3 };
    for (const providedNutrition of [{ ...macros, calories: NaN }, { ...macros, proteinG: -1 }, { ...macros, carbsG: Infinity }, { ...macros, fatG: 10001 }, { calories: 300 } as ProvidedRecipeNutrition]) {
      expect(recipeCardCalories({ ...recipe, providedNutrition }, FOODS)).toBeUndefined();
    }
  });
});
