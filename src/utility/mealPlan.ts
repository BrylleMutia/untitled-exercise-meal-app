import type { MealPlan, PlannedMeal, UserProfile } from "@/types/domain";
import { SAVED_MEALS } from "@/constants/meals";
import { FOODS } from "@/constants/foods";
import { weekDates } from "./dates";
import { mealNutrition } from "./nutrition";

function plannedMealMetadata(mealId: string | undefined, foodId: string | undefined, servings: number) {
  if (mealId) {
    const meal = SAVED_MEALS.find((candidate) => candidate.id === mealId);
    if (meal) {
      const nutrition = mealNutrition(meal, FOODS);
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
    const food = FOODS.find((candidate) => candidate.id === foodId);
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
  constraints?: Pick<UserProfile, "dietaryPattern" | "allergies">,
): MealPlan {
  const allowedMealIds = new Set(
    SAVED_MEALS.filter((meal) => mealAllowed(meal.id, constraints)).map((meal) => meal.id),
  );
  const chooseMeal = (rotation: string[], index: number) =>
    rotation
      .map((_, offset) => rotation[(index + offset) % rotation.length])
      .find((id) => allowedMealIds.has(id));
  const meals: PlannedMeal[] = [];
  weekDates(weekOf).forEach((date, i) => {
    const breakfastId = chooseMeal(BREAKFAST_ROTATION, i);
    const lunchId = chooseMeal(LUNCH_ROTATION, i);
    const dinnerId = chooseMeal(DINNER_ROTATION, i);
    const snackId = chooseFood(SNACK_ROTATION, i, constraints);
    const breakfast = plannedMealMetadata(breakfastId, undefined, 1);
    const lunch = plannedMealMetadata(lunchId, undefined, 1);
    const dinner = plannedMealMetadata(dinnerId, undefined, 1);
    const snack = plannedMealMetadata(undefined, snackId || undefined, 1);
    meals.push(
      {
        id: `pm-${date}-breakfast`,
        date,
        slot: "breakfast",
        mealId: breakfastId,
        label: SAVED_MEALS.find((m) => m.id === breakfastId)?.name ?? "Choose a meal that fits",
        servings: 1,
        ...breakfast,
      },
      {
        id: `pm-${date}-lunch`,
        date,
        slot: "lunch",
        mealId: lunchId,
        label: SAVED_MEALS.find((m) => m.id === lunchId)?.name ?? "Choose a meal that fits",
        servings: 1,
        ...lunch,
      },
      {
        id: `pm-${date}-dinner`,
        date,
        slot: "dinner",
        mealId: dinnerId,
        label: SAVED_MEALS.find((m) => m.id === dinnerId)?.name ?? "Choose a meal that fits",
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
  constraints?: Pick<UserProfile, "dietaryPattern" | "allergies">,
): boolean {
  const meal = SAVED_MEALS.find((candidate) => candidate.id === mealId);
  if (!meal) return false;
  const foods = meal.ingredients
    .map((ingredient) => FOODS.find((food) => food.id === ingredient.foodId))
    .filter((food): food is (typeof FOODS)[number] => Boolean(food));
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
  constraints?: Pick<UserProfile, "dietaryPattern" | "allergies">,
): string {
  const allergies = constraints?.allergies.map((a) => a.trim().toLowerCase()).filter(Boolean) ?? [];
  const pattern = constraints?.dietaryPattern.toLowerCase() ?? "";
  const veganForbidden = new Set(["food-egg", "food-milk", "food-greek-yogurt"]);
  return (
    rotation
      .map((_, offset) => rotation[(index + offset) % rotation.length])
      .find((id) => {
        const food = FOODS.find((candidate) => candidate.id === id);
        if (!food) return false;
        if (pattern.includes("vegan") && veganForbidden.has(id)) return false;
        return !allergies.some((allergy) => foodMatchesAllergy(food, allergy));
      }) ?? ""
  );
}

function foodMatchesAllergy(food: (typeof FOODS)[number], allergy: string): boolean {
  const name = food.name.toLowerCase();
  if (allergy.includes("dairy") || allergy.includes("milk")) return food.category === "Dairy";
  if (allergy.includes("nut")) return /peanut|almond|nut/.test(name);
  if (allergy.includes("egg")) return name.includes("egg");
  if (allergy.includes("fish") || allergy.includes("seafood")) return /salmon|fish/.test(name);
  return name.includes(allergy);
}
