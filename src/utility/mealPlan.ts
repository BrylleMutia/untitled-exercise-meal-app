import type { Food, Meal, MealPlan, PlannedMeal, UserProfile } from "@/types/domain";
import { SAVED_MEALS } from "@/constants/meals";
import { FOODS } from "@/constants/foods";
import { weekDates } from "./dates";
import { mealNutrition } from "./nutrition";
import { totalCarbLimit } from "./health";
import { MVP3_MEAL_COST, MVP3_MEAL_PREP } from "@/constants/mvp3Catalog";

type MealPlanCatalog = { savedMeals?: Meal[]; foods?: Food[]; dailyCalories?: number };

function plannedMealMetadata(mealId: string | undefined, foodId: string | undefined, servings: number, savedMeals: Meal[], foods: Food[]) {
  if (mealId) {
    const meal = savedMeals.find((candidate) => candidate.id === mealId);
    if (meal) {
      const nutrition = mealNutrition(meal, foods);
      return {
        expectedCalories: Math.round(nutrition.perServing.calories * servings),
        expectedProteinG: Math.round(nutrition.perServing.proteinG * servings * 10) / 10,
        expectedCarbsG: Math.ceil(nutrition.perServing.carbsG * servings * 100) / 100,
        expectedFatG: Math.round(nutrition.perServing.fatG * servings * 10) / 10,
        source: meal.ingredients.every((ingredient) => foods.find((food) => food.id === ingredient.foodId)?.valueSource === "trusted_catalog") ? "trusted-catalog" : "starter-catalog",
        sourceVersion: meal.id.startsWith("meal-mvp3-") ? "USDA-SR-Legacy:2019-04-01" : "starter-v1",
        assumptions: "Calculated from listed ingredients and labeled serving sizes. Portions and cooking can vary; all listed oil is included.",
        confidence: "medium" as const,
        preparationBasis: "as_labeled" as const,
      };
    }
  }
  if (foodId) {
    const food = foods.find((candidate) => candidate.id === foodId);
    if (food) {
      return {
        expectedCalories: Math.round(food.calories * servings),
        expectedProteinG: Math.round(food.proteinG * servings * 10) / 10,
        expectedCarbsG: Math.ceil(food.carbsG * servings * 100) / 100,
        expectedFatG: Math.round(food.fatG * servings * 10) / 10,
        expectedFiberG: food.fiberG === undefined ? undefined : Math.round(food.fiberG * servings * 10) / 10,
        source: food.source,
        sourceVersion: food.sourceVersion,
        assumptions: "Estimated from the catalog serving size.",
        confidence: food.confidence,
        preparationBasis: "as_labeled" as const,
      };
    }
  }
  return {
    expectedCalories: 0,
    expectedProteinG: 0,
    expectedCarbsG: 0,
    expectedFatG: 0,
    source: "user-choice",
    sourceVersion: "unknown",
    assumptions: "No trusted catalog match; choose and confirm a meal before logging.",
    confidence: "low" as const,
    preparationBasis: "unknown" as const,
  };
}

const BREAKFAST_ROTATION = ["meal-yogurt-bowl", "meal-pb-toast"];
const LUNCH_ROTATION = ["meal-chicken-rice", "meal-salmon-potato"];
const DINNER_ROTATION = ["meal-salmon-potato", "meal-chicken-rice"];
const SNACK_ROTATION = ["food-apple", "food-almonds", "food-banana"];

/** Deterministic weekly meal plan built from saved meals and the food catalog. */
export function generateMealPlan(
  targetId: string,
  weekOf: string,
  constraints?: Pick<UserProfile, "dietaryPattern" | "allergies" | "foodPreferences" | "cookingTimeMinutes" | "mealBudget">,
  catalog: MealPlanCatalog = {},
): MealPlan {
  const savedMeals = catalog.savedMeals ?? SAVED_MEALS;
  const foods = catalog.foods ?? FOODS;
  const carbLimit = totalCarbLimit(constraints?.dietaryPattern ?? "");
  const portion = (mealId: string | undefined, foodId: string | undefined, calorieShare: number) => {
    if (carbLimit === null || catalog.dailyCalories === undefined) return 1;
    const base = plannedMealMetadata(mealId, foodId, 1, savedMeals, foods).expectedCalories;
    if (base <= 0) return null;
    const servings = Math.floor(catalog.dailyCalories * calorieShare / base * 100) / 100;
    return servings >= 0.25 && servings <= 4 ? servings : null;
  };
  const allowedMealIds = new Set(
    savedMeals.filter((meal) => mealAllowed(meal.id, constraints, savedMeals, foods)).map((meal) => meal.id),
  );
  const customMealIds = savedMeals
    .filter((meal) => !meal.isSystem && allowedMealIds.has(meal.id) && mealFitsTimeAndBudget(meal.id, constraints))
    .map((meal) => meal.id);
  const chooseMeal = (rotation: string[], index: number, remainingCarbs: number, calorieShare: number) => {
    const rotated = rotation.map((_, offset) => rotation[(index + offset) % rotation.length]);
    const candidates = [...rotated, ...customMealIds]
      .filter((id) => allowedMealIds.has(id))
      .filter((id) => mealFitsTimeAndBudget(id, constraints))
      .filter((id) => {
        const servings = portion(id, undefined, calorieShare);
        return servings !== null && (carbLimit === null || plannedMealMetadata(id, undefined, servings, savedMeals, foods).expectedCarbsG <= remainingCarbs);
      });
    return [...candidates].sort((a, b) => preferenceScore(b, constraints, savedMeals, foods) - preferenceScore(a, constraints, savedMeals, foods))[0];
  };
  const meals: PlannedMeal[] = [];
  weekDates(weekOf).forEach((date, i) => {
    let remainingCarbs = carbLimit ?? Number.POSITIVE_INFINITY;
    const breakfastId = chooseMeal(carbLimit === null ? BREAKFAST_ROTATION : ["meal-mvp3-eggs", "meal-mvp3-tofu-almonds", "meal-mvp3-tofu"], i, remainingCarbs, 0.25);
    const breakfastServings = portion(breakfastId, undefined, 0.25) ?? 1;
    const breakfast = plannedMealMetadata(breakfastId, undefined, breakfastServings, savedMeals, foods);
    if (breakfastId) remainingCarbs -= breakfast.expectedCarbsG;
    const lunchId = chooseMeal(carbLimit === null ? LUNCH_ROTATION : ["meal-mvp3-chicken", "meal-mvp3-tofu", "meal-mvp3-tofu-almonds"], i, remainingCarbs, 0.3);
    const lunchServings = portion(lunchId, undefined, 0.3) ?? 1;
    const lunch = plannedMealMetadata(lunchId, undefined, lunchServings, savedMeals, foods);
    if (lunchId) remainingCarbs -= lunch.expectedCarbsG;
    const dinnerId = chooseMeal(carbLimit === null ? DINNER_ROTATION : ["meal-mvp3-tofu", "meal-mvp3-chicken", "meal-mvp3-tofu-almonds"], i, remainingCarbs, 0.3);
    const dinnerServings = portion(dinnerId, undefined, 0.3) ?? 1;
    const dinner = plannedMealMetadata(dinnerId, undefined, dinnerServings, savedMeals, foods);
    if (dinnerId) remainingCarbs -= dinner.expectedCarbsG;
    const snackRotation = carbLimit === null ? SNACK_ROTATION : ["food-mvp3-170567", "food-mvp3-173424"];
    const snackCandidates = snackRotation.filter((id) => {
      const servings = portion(undefined, id, 0.15);
      return servings !== null && plannedMealMetadata(undefined, id, servings, savedMeals, foods).expectedCarbsG <= remainingCarbs;
    });
    const snackId = chooseFood(snackCandidates, i, constraints, foods, Number.POSITIVE_INFINITY);
    const snackServings = portion(undefined, snackId || undefined, 0.15) ?? 1;
    const snack = plannedMealMetadata(undefined, snackId || undefined, snackServings, savedMeals, foods);
    meals.push(
      {
        id: `pm-${date}-breakfast`,
        date,
        slot: "breakfast",
        mealId: breakfastId,
        label: savedMeals.find((m) => m.id === breakfastId)?.name ?? "Choose a meal that fits",
        servings: breakfastServings,
        ...breakfast,
      },
      {
        id: `pm-${date}-lunch`,
        date,
        slot: "lunch",
        mealId: lunchId,
        label: savedMeals.find((m) => m.id === lunchId)?.name ?? "Choose a meal that fits",
        servings: lunchServings,
        ...lunch,
      },
      {
        id: `pm-${date}-dinner`,
        date,
        slot: "dinner",
        mealId: dinnerId,
        label: savedMeals.find((m) => m.id === dinnerId)?.name ?? "Choose a meal that fits",
        servings: dinnerServings,
        ...dinner,
      },
      {
        id: `pm-${date}-snack`,
        date,
        slot: "snack",
        foodId: snackId || undefined,
        label: snackId ? "Snack" : "Choose a safe snack",
        servings: snackServings,
        ...snack,
      },
    );
  });
  return { id: `mp-${weekOf}`, version: 1, weekOf, targetId, meals };
}

function mealAllowed(
  mealId: string | undefined,
  constraints?: Pick<UserProfile, "dietaryPattern" | "allergies" | "foodPreferences" | "cookingTimeMinutes" | "mealBudget">,
  savedMeals: Meal[] = SAVED_MEALS,
  catalogFoods: Food[] = FOODS,
): boolean {
  const meal = savedMeals.find((candidate) => candidate.id === mealId);
  if (!meal) return false;
  if (!Number.isFinite(meal.servings) || meal.servings <= 0 || meal.ingredients.some((ingredient) => !Number.isFinite(ingredient.servings) || ingredient.servings <= 0)) return false;
  const foods = meal.ingredients
    .map((ingredient) => catalogFoods.find((food) => food.id === ingredient.foodId))
    .filter((food): food is Food => Boolean(food));
  if (foods.length !== meal.ingredients.length || foods.length === 0) return false;
  const pattern = constraints?.dietaryPattern.toLowerCase() ?? "";
  if (totalCarbLimit(pattern) !== null && foods.some((food) => food.valueSource !== "trusted_catalog" || !Number.isFinite(food.carbsG) || food.carbsG < 0)) return false;
  const veganForbidden = new Set([
    "food-egg",
    "food-chicken",
    "food-salmon",
    "food-greek-yogurt",
    "food-milk",
    "food-cheddar",
    "food-butter",
    "food-honey",
    "food-mvp3-173424",
    "food-mvp3-171477",
  ]);
  const vegetarianForbidden = new Set(["food-chicken", "food-salmon", "food-mvp3-171477"]);
  const forbidden = pattern.includes("vegan")
    ? veganForbidden
    : pattern.includes("vegetarian")
      ? vegetarianForbidden
      : new Set<string>();
  if (foods.some((food) => forbidden.has(food.id))) return false;
  const allergies = constraints?.allergies.map((a) => a.trim().toLowerCase()).filter(Boolean) ?? [];
  return !foods.some((food) => allergies.some((allergy) => foodMatchesAllergy(food, allergy)));
}

function chooseFood(
  rotation: string[],
  index: number,
  constraints?: Pick<UserProfile, "dietaryPattern" | "allergies" | "foodPreferences" | "cookingTimeMinutes" | "mealBudget">,
  foods: Food[] = FOODS,
  remainingCarbs = Number.POSITIVE_INFINITY,
): string {
  const allergies = constraints?.allergies.map((a) => a.trim().toLowerCase()).filter(Boolean) ?? [];
  const pattern = constraints?.dietaryPattern.toLowerCase() ?? "";
  const veganForbidden = new Set(["food-egg", "food-milk", "food-greek-yogurt", "food-mvp3-173424"]);
  return (
    rotation
      .map((_, offset) => rotation[(index + offset) % rotation.length])
      .filter((id) => {
        const food = foods.find((candidate) => candidate.id === id);
        if (!food) return false;
        if (totalCarbLimit(pattern) !== null && (food.valueSource !== "trusted_catalog" || !Number.isFinite(food.carbsG) || food.carbsG < 0 || food.carbsG > remainingCarbs)) return false;
        if (pattern.includes("vegan") && veganForbidden.has(id)) return false;
        return !allergies.some((allergy) => foodMatchesAllergy(food, allergy));
      })
      .sort((a, b) => foodPreferenceScore(b, constraints, foods) - foodPreferenceScore(a, constraints, foods))[0] ?? ""
  );
}

/** The starter catalog has no currency metadata, so budget is a transparent
 * relative score rather than a currency claim. A low budget keeps the plan
 * on lower-cost catalog staples; users can still edit every slot. */
const MEAL_COST_UNITS: Record<string, number> = {
  ...MVP3_MEAL_COST,
  "meal-yogurt-bowl": 6,
  "meal-pb-toast": 4,
  "meal-chicken-rice": 7,
  "meal-salmon-potato": 12,
};

const MEAL_PREP_MINUTES: Record<string, number> = {
  ...MVP3_MEAL_PREP,
  "meal-yogurt-bowl": 5,
  "meal-pb-toast": 8,
  "meal-chicken-rice": 25,
  "meal-salmon-potato": 35,
};

function normalizedPreferences(constraints?: Pick<UserProfile, "foodPreferences">) {
  return (constraints?.foodPreferences ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function preferenceScore(mealId: string, constraints: Pick<UserProfile, "foodPreferences"> | undefined, savedMeals: Meal[], foods: Food[]) {
  const meal = savedMeals.find((candidate) => candidate.id === mealId);
  if (!meal) return 0;
  const preferences = normalizedPreferences(constraints);
  if (preferences.length === 0) return 0;
  const foodNames = meal.ingredients
    .map((ingredient) => foods.find((food) => food.id === ingredient.foodId)?.name.toLowerCase() ?? "")
    .join(" ");
  const searchable = `${meal.name.toLowerCase()} ${foodNames}`;
  return preferences.reduce((score, preference) => score + (searchable.includes(preference) ? 1 : 0), 0);
}

function foodPreferenceScore(foodId: string, constraints: Pick<UserProfile, "foodPreferences"> | undefined, foods: Food[]) {
  const food = foods.find((candidate) => candidate.id === foodId);
  const preferences = normalizedPreferences(constraints);
  if (!food || preferences.length === 0) return 0;
  const searchable = `${food.name} ${food.category}`.toLowerCase();
  return preferences.reduce((score, preference) => score + (searchable.includes(preference) ? 1 : 0), 0);
}

function mealFitsTimeAndBudget(
  mealId: string,
  constraints?: Pick<UserProfile, "cookingTimeMinutes" | "mealBudget">,
) {
  const time = constraints?.cookingTimeMinutes;
  const budget = constraints?.mealBudget;
  if (time !== undefined && time >= 0 && (MEAL_PREP_MINUTES[mealId] ?? 0) > time) return false;
  if (budget !== undefined && budget >= 0 && (MEAL_COST_UNITS[mealId] ?? 0) > budget) return false;
  return true;
}

function foodMatchesAllergy(food: (typeof FOODS)[number], allergy: string): boolean {
  const name = food.name.toLowerCase();
  if (allergy.includes("dairy") || allergy.includes("milk")) return food.category === "Dairy";
  if (allergy.includes("nut")) return /peanut|almond|nut/.test(name);
  if (allergy.includes("soy")) return /soy|tofu/.test(name);
  if (allergy.includes("gluten") || allergy.includes("wheat")) return /wheat|bread|pasta/.test(name);
  if (allergy.includes("egg")) return name.includes("egg");
  if (allergy.includes("fish") || allergy.includes("seafood")) return /salmon|fish/.test(name);
  return name.includes(allergy);
}
