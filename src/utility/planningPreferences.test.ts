import { describe, expect, it } from "vitest";
import type { AppSnapshot, Food, Meal, UserProfile } from "@/types/domain";
import { plannedMealMetadata } from "./mealPlan";
import { recipeCostScore } from "./recipeCost";
import { individualPreferenceReview, recipePreferenceWarnings, usableRecipeNutrition } from "./planningPreferences";
const food = { id: "food-chicken", name: "Chicken in soy sauce", category: "Protein", calories: 300, proteinG: 20, carbsG: 60, fatG: 5, valueSource: "user_provided" } as Food;
const meal: Meal = { id: "recipe", name: "Warned recipe", servings: 2, revision: 3, totalTimeMinutes: 45, mealSlots: ["lunch"], ingredients: [{ foodId: food.id, servings: 2 }], unmeasuredIngredients: [{ name: "Sesame seeds", measurement: "A sprinkle" }] };
const profile = { dietaryPattern: "Vegan low-carb", cookingTimeMinutes: 30, allergies: ["soy", "sesame"], mealBudget: 4 } as UserProfile;
describe("advisory planning preferences", () => {
  it("retains AI uncertainty in planned recipe metadata without changing numeric totals", () => {
    const metadata = plannedMealMetadata(meal.id, undefined, 1, [meal], [{ ...food, valueSource: "ai_estimate" }]);
    expect(metadata.source).toBe("AI-estimated recipe");
    expect(metadata.confidence).toBe("low");
    expect(metadata.expectedCarbsG).toBe(60);
  });
  it("uses zero cost for every identity while classification is paused", () => {
    for (const id of ["meal-creamy-lemon-chicken", "meal-mvp3-eggs", "custom", "shared", "group-copy-any"]) expect(recipeCostScore(id)).toBe(0);
  });
  it("warns about time, dietary conflicts, sources and measured/unmeasured avoided foods", () => {
    const warnings = recipePreferenceWarnings([meal], [food], profile);
    expect(warnings.map(w => w.code)).toEqual(["cooking-time", "ingredient-nutrition", "diet", "avoided-food", "avoided-food"]);
    expect(warnings.every(w => w.recipeId === meal.id && w.recipeRevision === 3)).toBe(true);
    expect(warnings.find(w => w.message.includes("sesame"))?.code).toBe("avoided-food");
    expect(usableRecipeNutrition(meal, [food])).toBe(true);
  });
  it("keeps zero time distinct from unknown and accepts finite provided nutrition", () => {
    const recipe = { ...meal, providedNutrition: { calories: 300, proteinG: 20, carbsG: 60, fatG: 5 }, totalTimeMinutes: 0 };
    expect(recipePreferenceWarnings([recipe], [food], null).map(w => w.code)).toEqual(["source-nutrition", "ingredient-nutrition"]);
    expect(recipePreferenceWarnings([{ ...recipe, totalTimeMinutes: undefined }], [food], null)[0].code).toBe("cooking-time-unknown");
    expect(usableRecipeNutrition(recipe, [])).toBe(true);
    expect(usableRecipeNutrition({ ...recipe, providedNutrition: { ...recipe.providedNutrition, calories: NaN } }, [])).toBe(false);
    expect(usableRecipeNutrition(meal, [])).toBe(false);
  });
  it("reports combined daily carb preferences without changing assignments or profile", () => {
    const data = { profile, savedMeals: [{ ...meal, unmeasuredIngredients: [] }], foods: [food], mealPlan: null, nutritionLogs: [], loggedMeals: [] } as unknown as AppSnapshot;
    const assignments = [{ id: "a", mealId: meal.id, label: meal.name, servings: 3, date: "2026-10-22", slot: "lunch" as const }];
    const before = structuredClone(data);
    const review = individualPreferenceReview(data, [meal], assignments, ["2026-10-22"]);
    expect(review.dailyWarnings[0]).toMatchObject({ totalCarbs: 180, limit: 130, recipeIds: [meal.id] });
    expect(data).toEqual(before);
    expect(assignments[0].servings).toBe(3);
  });
  it("does not manufacture zero when a retained meal has unknown nutrition", () => {
    const data = { profile, savedMeals: [meal], foods: [food], mealPlan: { meals: [{ id: "unknown", date: "2026-10-22", slot: "lunch", servings: 1 }] }, nutritionLogs: [], loggedMeals: [] } as unknown as AppSnapshot;
    expect(individualPreferenceReview(data, [meal], [], ["2026-10-22"]).dailyWarnings[0].totalCarbs).toBeNull();
  });
});
