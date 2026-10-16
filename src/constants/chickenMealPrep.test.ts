import { describe, expect, it } from "vitest";
import { CHICKEN_MEAL_PREP_FOODS, CHICKEN_MEAL_PREP_RECIPES, STICKY_TERIYAKI_CHICKEN, CHICKEN_BURRITO_PROTEIN_BOXES } from "./chickenMealPrep";
import { FOODS } from "./foods";
import { SAVED_MEALS } from "./meals";
import { mealNutrition } from "@/utility/nutrition";
import { mealAllowed, mealFitsTimeAndBudget } from "@/utility/mealPlan";
import { cookingGramsPerUnit, needsRecipeMeasurementRefresh } from "@/utility/cookingMeasurement";
import { generateWeeklyMeals } from "@/utility/weeklyMealGeneration";
import { generateGroceryList } from "@/utility/grocery";
import { parseRecipeImage } from "@/utility/recipeImage";
import type { AppSnapshot, MealPlan } from "@/types/domain";

describe("reviewed chicken meal-prep catalog", () => {
  it("adds four-serving recipes with original measurements, method, metadata and registered covers", () => {
    expect(CHICKEN_MEAL_PREP_FOODS).toHaveLength(9);
    expect(new Set(FOODS.map(food => food.id)).size).toBe(FOODS.length);
    expect(CHICKEN_MEAL_PREP_FOODS.every(food => food.valueSource === "trusted_catalog" && food.fdcId && food.sourceVersion)).toBe(true);
    for (const recipe of CHICKEN_MEAL_PREP_RECIPES) {
      expect(SAVED_MEALS).toContain(recipe); expect(recipe).toMatchObject({ servings: 4, complexity: "easy", isSystem: true });
      expect(parseRecipeImage(recipe.image)).toEqual(recipe.image);
      expect(needsRecipeMeasurementRefresh(recipe)).toBe(false);
      expect(needsRecipeMeasurementRefresh({ ...recipe, ingredients: recipe.ingredients.map(item => ({ ...item, cookingMeasurement: undefined })) })).toBe(true);
      expect(recipe.providedNutrition).toBeUndefined();
      expect(recipe.notes).toContain("74°C (165°F)");
    }
    expect(STICKY_TERIYAKI_CHICKEN).toMatchObject({ totalTimeMinutes: 30, mealSlots: ["lunch", "dinner"] });
    expect(STICKY_TERIYAKI_CHICKEN.ingredients[2]).toMatchObject({ servings: 0.96, cookingMeasurement: { quantity: 80, unit: "ml", gramsPerUnit: 1.2 } });
    expect(CHICKEN_BURRITO_PROTEIN_BOXES).toMatchObject({ totalTimeMinutes: 20, mealSlots: ["breakfast", "lunch"] });
    expect(CHICKEN_BURRITO_PROTEIN_BOXES.ingredients[1].cookingMeasurement?.text).toBe("1 tin (240 g drained)");
    expect(CHICKEN_BURRITO_PROTEIN_BOXES.ingredients[2].cookingMeasurement?.text).toBe("1 tin (285 g drained)");
    expect(CHICKEN_BURRITO_PROTEIN_BOXES.unmeasuredIngredients?.[0].name).toBe("Fresh coriander");
  });
  it("calculates from raw chicken and the complete ingredient basis, preserving quoted macros as notes", () => {
    expect(mealNutrition(STICKY_TERIYAKI_CHICKEN, FOODS).perServing).toEqual({ calories: 449, proteinG: 40, carbsG: 58, fatG: 4 });
    expect(mealNutrition(CHICKEN_BURRITO_PROTEIN_BOXES, FOODS).perServing).toEqual({ calories: 327, proteinG: 41, carbsG: 29, fatG: 6 });
    expect(STICKY_TERIYAKI_CHICKEN.nutritionNotes).toContain("520 kcal, 48 g protein, 60 g carbs, 9 g fat");
    expect(CHICKEN_BURRITO_PROTEIN_BOXES.nutritionNotes).toContain("480 kcal, 50 g protein, 35 g carbs, 9 g fat");
    const sauce = FOODS.find(food => food.id === "food-chicken-prep-171167")!;
    expect(cookingGramsPerUnit("ml", sauce)).toBeCloseTo(1.2);
    expect(cookingGramsPerUnit("tsp", sauce)).toBeCloseTo(6);
    expect(STICKY_TERIYAKI_CHICKEN.nutritionNotes).toContain("unspecified frying oil are excluded");
  });
  it("respects chicken, sauce and unmeasured sesame restrictions plus time and relative budget", () => {
    for (const recipe of CHICKEN_MEAL_PREP_RECIPES) {
      expect(mealAllowed(recipe.id, { dietaryPattern: "Vegetarian", allergies: [] })).toBe(false);
      expect(mealAllowed(recipe.id, { dietaryPattern: "Vegan", allergies: [] })).toBe(false);
      expect(mealFitsTimeAndBudget(recipe.id, { cookingTimeMinutes: recipe.totalTimeMinutes! - 1 })).toBe(false);
      expect(mealFitsTimeAndBudget(recipe.id, { mealBudget: 6 })).toBe(false);
    }
    for (const allergy of ["soy", "wheat", "sesame"]) expect(mealAllowed(STICKY_TERIYAKI_CHICKEN.id, { dietaryPattern: "No restrictions", allergies: [allergy] })).toBe(false);
    expect(mealAllowed(CHICKEN_BURRITO_PROTEIN_BOXES.id, { dietaryPattern: "No restrictions", allergies: [] })).toBe(true);
  });
  it("generates four occurrences per recipe in eligible slots and excludes unmeasured groceries", () => {
    const week = "2026-10-19";
    const snapshot = { userId: "owner", profile: { dietaryPattern: "No restrictions", allergies: [] }, foods: FOODS, savedMeals: CHICKEN_MEAL_PREP_RECIPES,
      nutritionLogs: [], loggedMeals: [], nutritionWeekTargets: [{ id: "target", version: 1, effectiveDate: "2026-01-01", safetyOutcome: "supported" }], mealPlan: null, grocery: null } as unknown as AppSnapshot;
    const preview = generateWeeklyMeals(snapshot, week, CHICKEN_MEAL_PREP_RECIPES.map(recipe => recipe.id), "chicken");
    expect(preview.assignments).toHaveLength(8);
    for (const recipe of CHICKEN_MEAL_PREP_RECIPES) {
      const rows = preview.assignments.filter(row => row.mealId === recipe.id);
      expect(rows).toHaveLength(4); expect(rows.every(row => recipe.mealSlots!.includes(row.slot))).toBe(true);
    }
    const groceries = generateGroceryList({ meals: preview.assignments } as MealPlan, CHICKEN_MEAL_PREP_RECIPES, FOODS, week);
    expect(groceries.items.find(item => item.name === "Chicken breast, skinless, boneless")?.quantity).toBe(1200);
    expect(groceries.items.some(item => /sesame|spring onion|coriander/i.test(item.name))).toBe(false);
  });
});
