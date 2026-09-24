import type { Food, Meal, MealPlan, PlannedMeal, UserProfile } from "@/types/domain";
import { SAVED_MEALS } from "@/constants/meals";
import { FOODS } from "@/constants/foods";
import { weekDates } from "./dates";
import { mealNutrition } from "./nutrition";

type MealPlanCatalog = { savedMeals?: Meal[]; foods?: Food[] };

function plannedMealMetadata(mealId: string | undefined, foodId: string | undefined, servings: number, savedMeals: Meal[], foods: Food[]) {
  if (mealId) {
    const meal = savedMeals.find((candidate) => candidate.id === mealId);
    if (meal) {
      const nutrition = mealNutrition(meal, foods);
      return {
        expectedCalories: Math.round(nutrition.perServing.calories * servings),
        expectedProteinG: Math.round(nutrition.perServing.proteinG * servings * 10) / 10,
        expectedCarbsG: Math.round(nutrition.perServing.carbsG * servings * 10) / 10,
        expectedFatG: Math.round(nutrition.perServing.fatG * servings * 10) / 10,
        source: "starter-catalog",
        sourceVersion: "starter-v1",
        assumptions: "Estimated from the saved recipe and catalog serving sizes.",
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
        expectedCarbsG: Math.round(food.carbsG * servings * 10) / 10,
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
  const allowedMealIds = new Set(
    savedMeals.filter((meal) => mealAllowed(meal.id, constraints, savedMeals, foods)).map((meal) => meal.id),
  );
  const customMealIds = savedMeals
    .filter((meal) => !meal.isSystem && allowedMealIds.has(meal.id) && mealFitsTimeAndBudget(meal.id, constraints))
    .map((meal) => meal.id);
  const chooseMeal = (rotation: string[], index: number) => {
    const rotated = rotation.map((_, offset) => rotation[(index + offset) % rotation.length]);
    const candidates = [...rotated, ...customMealIds]
      .filter((id) => allowedMealIds.has(id))
      .filter((id) => mealFitsTimeAndBudget(id, constraints));
    return [...candidates].sort((a, b) => preferenceScore(b, constraints, savedMeals, foods) - preferenceScore(a, constraints, savedMeals, foods))[0];
  };
  const meals: PlannedMeal[] = [];
  weekDates(weekOf).forEach((date, i) => {
    const breakfastId = chooseMeal(BREAKFAST_ROTATION, i);
    const lunchId = chooseMeal(LUNCH_ROTATION, i);
    const dinnerId = chooseMeal(DINNER_ROTATION, i);
    const snackId = chooseFood(SNACK_ROTATION, i, constraints, foods);
    const breakfast = plannedMealMetadata(breakfastId, undefined, 1, savedMeals, foods);
    const lunch = plannedMealMetadata(lunchId, undefined, 1, savedMeals, foods);
    const dinner = plannedMealMetadata(dinnerId, undefined, 1, savedMeals, foods);
    const snack = plannedMealMetadata(undefined, snackId || undefined, 1, savedMeals, foods);
    meals.push(
      {
        id: `pm-${date}-breakfast`,
        date,
        slot: "breakfast",
        mealId: breakfastId,
        label: savedMeals.find((m) => m.id === breakfastId)?.name ?? "Choose a meal that fits",
        servings: 1,
        ...breakfast,
      },
      {
        id: `pm-${date}-lunch`,
        date,
        slot: "lunch",
        mealId: lunchId,
        label: savedMeals.find((m) => m.id === lunchId)?.name ?? "Choose a meal that fits",
        servings: 1,
        ...lunch,
      },
      {
        id: `pm-${date}-dinner`,
        date,
        slot: "dinner",
        mealId: dinnerId,
        label: savedMeals.find((m) => m.id === dinnerId)?.name ?? "Choose a meal that fits",
        servings: 1,
        ...dinner,
      },
      {
        id: `pm-${date}-snack`,
        date,
        slot: "snack",
        foodId: snackId || undefined,
        label: snackId ? "Snack" : "Choose a safe snack",
        servings: 1,
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
  const foods = meal.ingredients
    .map((ingredient) => catalogFoods.find((food) => food.id === ingredient.foodId))
    .filter((food): food is Food => Boolean(food));
  const pattern = constraints?.dietaryPattern.toLowerCase() ?? "";
  const veganForbidden = new Set([
    "food-egg",
    "food-chicken",
    "food-salmon",
    "food-greek-yogurt",
    "food-milk",
    "food-cheddar",
    "food-butter",
    "food-honey",
  ]);
  const vegetarianForbidden = new Set(["food-chicken", "food-salmon"]);
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
): string {
  const allergies = constraints?.allergies.map((a) => a.trim().toLowerCase()).filter(Boolean) ?? [];
  const pattern = constraints?.dietaryPattern.toLowerCase() ?? "";
  const veganForbidden = new Set(["food-egg", "food-milk", "food-greek-yogurt"]);
  return (
    rotation
      .map((_, offset) => rotation[(index + offset) % rotation.length])
      .filter((id) => {
        const food = foods.find((candidate) => candidate.id === id);
        if (!food) return false;
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
  "meal-yogurt-bowl": 6,
  "meal-pb-toast": 4,
  "meal-chicken-rice": 7,
  "meal-salmon-potato": 12,
};

const MEAL_PREP_MINUTES: Record<string, number> = {
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
  if (allergy.includes("egg")) return name.includes("egg");
  if (allergy.includes("fish") || allergy.includes("seafood")) return /salmon|fish/.test(name);
  return name.includes(allergy);
}
