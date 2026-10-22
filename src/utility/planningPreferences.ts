import type { AppSnapshot, Food, Meal, UserProfile } from "@/types/domain";
import { PLANNING_REVIEW_POLICY, type PreferenceReview, type RecipePreferenceWarning } from "@/types/planningPreferences";
import { foodMatchesAllergy } from "./mealPlan";
import { totalCarbLimit } from "./health";
import { mealNutrition } from "./nutrition";
import { plannedMealNutrition } from "./plannedMealNutrition";


export function usableRecipeNutrition(recipe: Meal, foods: Food[]): boolean {
  if (!Number.isFinite(recipe.servings) || recipe.servings <= 0) return false;
  if (!recipe.providedNutrition && (!recipe.ingredients.length || recipe.ingredients.some(i => !Number.isFinite(i.servings) || i.servings <= 0 || !foods.some(f => f.id === i.foodId && [f.calories, f.proteinG, f.carbsG, f.fatG].every(n => Number.isFinite(n) && n >= 0))))) return false;
  const n = mealNutrition(recipe, foods).perServing;
  return [n.calories, n.proteinG, n.carbsG, n.fatG].every(value => Number.isFinite(value) && value >= 0) && n.calories > 0;
}

export function recipePreferenceWarnings(recipes: Meal[], foods: Food[], profile: UserProfile | null): RecipePreferenceWarning[] {
  return recipes.flatMap(recipe => {
    const warnings: RecipePreferenceWarning[] = [];
    const add = (code: RecipePreferenceWarning["code"], message: string) => warnings.push({ code, recipeId: recipe.id, recipeRevision: recipe.revision ?? 1, recipeName: recipe.name, message });
    if (recipe.totalTimeMinutes === undefined) add("cooking-time-unknown", "Cooking time is not set.");
    else if (profile?.cookingTimeMinutes !== undefined && recipe.totalTimeMinutes > profile.cookingTimeMinutes) add("cooking-time", `${recipe.totalTimeMinutes} mins exceeds your ${profile.cookingTimeMinutes}-minute cooking preference.`);
    if (recipe.providedNutrition) add("source-nutrition", "Recipe nutrition is source-provided and has not been independently verified from ingredients.");
    if (recipe.unmeasuredIngredients?.length || recipe.ingredients.some(i => foods.find(f => f.id === i.foodId)?.valueSource !== "trusted_catalog")) add("ingredient-nutrition", "Some ingredient quantities or nutrition are estimated, unmeasured, or unverified. Planning totals are estimates.");
    if (profile) {
      const ingredients = [
        ...recipe.ingredients.flatMap(i => { const food = foods.find(f => f.id === i.foodId); return food ? [food] : []; }),
        ...(recipe.unmeasuredIngredients ?? []).map(i => ({ name: i.name, category: "Other" as const })),
      ];
      const pattern = profile.dietaryPattern.toLowerCase();
      const animal = /\b(beef|chicken|pork|salmon|fish|shrimp|tuna|turkey|bacon|ham|meat|gelatin)\b/i;
      const nonVegan = /\b(egg|eggs|milk|yogurt|cheese|cheddar|butter|honey|cream)\b/i;
      const conflicts = ingredients.filter(i => (pattern.includes("vegan") || pattern.includes("vegetarian")) && (animal.test(i.name) || (pattern.includes("vegan") && (i.category === "Dairy" || nonVegan.test(i.name)))));
      if (conflicts.length) add("diet", `Ingredients may not match your ${profile.dietaryPattern} preference: ${[...new Set(conflicts.map(i => i.name))].join(", ")}. Review the recipe before choosing.`);
      for (const term of profile.allergies.filter(t => t.trim())) {
        const matches = ingredients.filter(i => foodMatchesAllergy(i, term.trim().toLowerCase()));
        if (matches.length) add("avoided-food", `Your foods to avoid (${term}) may match: ${[...new Set(matches.map(i => i.name))].join(", ")}. This recipe is not confirmed safe for you.`);
      }
    }
    return warnings;
  });
}

export function individualPreferenceReview(snapshot: AppSnapshot, recipes: Meal[], assignments: NonNullable<AppSnapshot["mealPlan"]>["meals"], selectedDates: string[]): PreferenceReview {
  const limit = totalCarbLimit(snapshot.profile?.dietaryPattern ?? "");
  return { policyVersion: PLANNING_REVIEW_POLICY, recipeWarnings: recipePreferenceWarnings(recipes, snapshot.foods, snapshot.profile), dailyWarnings: limit === null ? [] : [...selectedDates].sort().flatMap(date => {
    const rows = [...(snapshot.mealPlan?.meals ?? []), ...assignments].filter(r => r.date === date && !r.skipped && !snapshot.nutritionLogs.some(log => log.plannedMealId === r.id));
    const values = rows.map(r => plannedMealNutrition(r, snapshot.savedMeals, snapshot.foods));
    const logs = snapshot.nutritionLogs.filter(log => log.date === date);
    const complete = !rows.some(row => { const recipe = snapshot.savedMeals.find(r => r.id === row.mealId); return recipe && !recipe.providedNutrition && Boolean(recipe.unmeasuredIngredients?.length); }) && values.every(v => v !== null && Number.isFinite(v.carbsG)) && logs.every(l => Number.isFinite(l.carbsG));
    const totalCarbs = complete ? Math.round((values.reduce((n, v) => n + (v?.carbsG ?? 0), 0) + logs.reduce((n, l) => n + l.carbsG, 0)) * 100) / 100 : null;
    return totalCarbs !== null && totalCarbs <= limit ? [] : [{ code: "daily-carbohydrate" as const, date, totalCarbs, limit, recipeIds: [...new Set(rows.flatMap(r => r.mealId ? [r.mealId] : []))], recipeNames: Object.fromEntries(snapshot.savedMeals.map(r => [r.id, r.name])), message: totalCarbs === null ? "Nutrition is incomplete; your carbohydrate preference cannot be assessed reliably." : `Estimated daily total: ${totalCarbs} g total carbs; your preference is ${limit} g. Includes retained meals and recorded intake.` }];
  }) };
}
