import { describe, expect, it } from "vitest";
import { FOODS } from "@/constants/foods";
import { defaultRecipeComplexity, isRecipeComplexity, recipeBadge, recipeCardCalories } from "./recipeCard";

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
});
