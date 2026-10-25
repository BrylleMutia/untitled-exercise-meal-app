import type { AppSnapshot, Food, Meal, MealSlot, PlannedMeal } from "@/types/domain";
import type { DailyPreferenceWarning, RecipePreferenceWarning } from "@/types/planningPreferences";
import { individualPreferenceReview, recipePreferenceWarnings } from "./planningPreferences";

export type MealEntryReview = {
  warnings: Array<Pick<RecipePreferenceWarning, "code" | "message">>;
  dailyWarnings: DailyPreferenceWarning[];
};

/** Assess the displayed addition alongside retained plans and actual intake; never mutate either. */
export function mealEntryReview(snapshot: AppSnapshot, date: string, slot: MealSlot, servings: number, choice: { food?: Food; meal?: Meal }): MealEntryReview {
  const foods = choice.food && !snapshot.foods.some(food => food.id === choice.food!.id) ? [...snapshot.foods, choice.food] : snapshot.foods;
  const meals = choice.meal && !snapshot.savedMeals.some(meal => meal.id === choice.meal!.id) ? [...snapshot.savedMeals, choice.meal] : snapshot.savedMeals;
  const assignment: PlannedMeal = { id: "manual-add-preview", label: choice.meal?.name ?? choice.food?.name ?? "Selected meal", date, slot, servings, ...(choice.meal ? { mealId: choice.meal.id } : { foodId: choice.food?.id }) };
  const review = individualPreferenceReview({ ...snapshot, foods, savedMeals: meals }, [], [assignment], [date]);
  const warnings = choice.meal ? recipePreferenceWarnings([choice.meal], foods, snapshot.profile) : choice.food
    ? recipePreferenceWarnings([{ id: choice.food.id, name: choice.food.name, servings: 1, ingredients: [{ foodId: choice.food.id, servings: 1 }] }], foods, snapshot.profile)
      .filter(warning => warning.code !== "cooking-time" && warning.code !== "cooking-time-unknown")
      .map(warning => ({ ...warning, message: warning.message.replaceAll("recipe", "food") })) : [];
  return { warnings, dailyWarnings: review.dailyWarnings };
}
