import { describe, expect, it } from "vitest";
import { KOREAN_BEEF_BOWL, KOREAN_BEEF_BOWL_FOODS } from "./koreanBeefBowl";
import { SAVED_MEALS } from "./meals";
import { FOODS } from "./foods";
import { mealNutrition } from "@/utility/nutrition";
import { generateMealPlan } from "@/utility/mealPlan";
import { parseRecipeImage } from "@/utility/recipeImage";

describe("Korean Beef Bowl", () => {
  it("adds a four-serving recipe with its cover and source without inventing cooking time", () => {
    expect(SAVED_MEALS.map(meal => meal.id)).toContain(KOREAN_BEEF_BOWL.id);
    expect(KOREAN_BEEF_BOWL).toMatchObject({ servings: 4, complexity: "easy", isSystem: true });
    expect(KOREAN_BEEF_BOWL.totalTimeMinutes).toBeUndefined();
    expect(parseRecipeImage(KOREAN_BEEF_BOWL.image)).toEqual(KOREAN_BEEF_BOWL.image);
    expect(KOREAN_BEEF_BOWL.reference).toContain("image_index=3");
  });
  it("uses the supplied macros per serving and scales the whole recipe without estimating", () => {
    expect(KOREAN_BEEF_BOWL_FOODS).toHaveLength(10);
    expect(KOREAN_BEEF_BOWL.ingredients).toHaveLength(11);
    expect(KOREAN_BEEF_BOWL_FOODS.every(food => food.valueSource === "trusted_catalog" && food.fdcId)).toBe(true);
    const nutrition = mealNutrition(KOREAN_BEEF_BOWL, FOODS);
    expect(nutrition.perServing).toEqual({ calories: 560, proteinG: 45, carbsG: 58, fatG: 16 });
    expect(nutrition.calories).toBe(2240);
    expect(KOREAN_BEEF_BOWL.nutritionNotes).toContain("560 kcal, 45 g protein, 58 g carbs, 16 g fat");
    expect(KOREAN_BEEF_BOWL.nutritionNotes).toContain("without recalculating");
  });
  it("excludes beef and soy, wheat or sesame conflicts from new plans", () => {
    for (const constraint of [{ dietaryPattern: "Vegan", allergies: [] }, { dietaryPattern: "Vegetarian", allergies: [] },
      ...["soy", "wheat", "sesame"].map(allergy => ({ dietaryPattern: "No restrictions", allergies: [allergy] }))]) {
      const plan = generateMealPlan("target", "2026-10-12", constraint, { savedMeals: [KOREAN_BEEF_BOWL], foods: FOODS });
      expect(plan.meals.some(meal => meal.mealId === KOREAN_BEEF_BOWL.id)).toBe(false);
    }
  });
});
