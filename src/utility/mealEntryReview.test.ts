import { describe, expect, it } from "vitest";
import { mealEntryReview } from "./mealEntryReview";
import type { AppSnapshot, Food, Meal, UserProfile } from "@/types/domain";
const food = { id: "chicken", name: "Chicken in soy sauce", category: "Protein", valueSource: "user_provided", calories: 300, proteinG: 20, carbsG: 60, fatG: 5 } as Food;
const recipe: Meal = { id: "recipe", name: "Chicken", servings: 2, totalTimeMinutes: 45, ingredients: [{ foodId: food.id, servings: 2 }], providedNutrition: { calories: 300, proteinG: 20, carbsG: 60, fatG: 5 } };
const snapshot = { profile: { dietaryPattern: "Vegan low-carb", allergies: ["soy"], cookingTimeMinutes: 30 } as UserProfile, foods: [food], savedMeals: [recipe], nutritionLogs: [], loggedMeals: [], mealPlan: null } as unknown as AppSnapshot;
describe("selected meal assessment", () => {
  it("assesses fractional recipes, sources and personal conflicts without changing preferences", () => {
    const before = structuredClone(snapshot);
    const review = mealEntryReview(snapshot, "2026-10-25", "dinner", 2.5, { meal: recipe });
    expect(review.warnings.map(w => w.code)).toEqual(["cooking-time", "source-nutrition", "ingredient-nutrition", "diet", "avoided-food"]);
    expect(review.dailyWarnings[0]).toMatchObject({ totalCarbs: 150, limit: 130 }); expect(snapshot).toEqual(before);
  });
  it("gives foods ingredient/source warnings without recipe cooking-time warnings", () => {
    const review = mealEntryReview({ ...snapshot, foods: [] }, "2026-10-25", "lunch", 3, { food });
    expect(review.warnings.map(w => w.code)).toEqual(["ingredient-nutrition", "diet", "avoided-food"]);
    expect(review.dailyWarnings[0].totalCarbs).toBe(180);
  });
  it("includes retained plans and logs once, excluding linked pending portions", () => {
    const data = { ...snapshot, mealPlan: { meals: [{ id: "linked", date: "2026-10-25", slot: "breakfast", mealId: recipe.id, servings: 10 }, { id: "retained", date: "2026-10-25", slot: "lunch", mealId: recipe.id, servings: 1 }] }, nutritionLogs: [{ date: "2026-10-25", plannedMealId: "linked", carbsG: 30 }] } as AppSnapshot;
    expect(mealEntryReview(data, "2026-10-25", "dinner", 1, { meal: recipe }).dailyWarnings[0].totalCarbs).toBe(150);
  });
  it("retains incomplete totals rather than substituting zero", () => {
    const data = { ...snapshot, mealPlan: { meals: [{ id: "missing", date: "2026-10-25", servings: 1 }] } } as AppSnapshot;
    expect(mealEntryReview(data, "2026-10-25", "dinner", 1, { meal: recipe }).dailyWarnings[0].totalCarbs).toBeNull();
  });
});
