import type { MealPlan, PlannedMeal, UserProfile } from "@/types/domain";
import { SAVED_MEALS } from "@/constants/meals";
import { FOODS } from "@/constants/foods";
import { weekDates } from "./dates";

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
    meals.push(
      {
        id: `pm-${date}-breakfast`,
        date,
        slot: "breakfast",
        mealId: breakfastId,
        label: SAVED_MEALS.find((m) => m.id === breakfastId)?.name ?? "Choose a meal that fits",
        servings: 1,
      },
      {
        id: `pm-${date}-lunch`,
        date,
        slot: "lunch",
        mealId: lunchId,
        label: SAVED_MEALS.find((m) => m.id === lunchId)?.name ?? "Choose a meal that fits",
        servings: 1,
      },
      {
        id: `pm-${date}-dinner`,
        date,
        slot: "dinner",
        mealId: dinnerId,
        label: SAVED_MEALS.find((m) => m.id === dinnerId)?.name ?? "Choose a meal that fits",
        servings: 1,
      },
      {
        id: `pm-${date}-snack`,
        date,
        slot: "snack",
        foodId: snackId || undefined,
        label: snackId ? "Snack" : "Choose a safe snack",
        servings: 1,
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
