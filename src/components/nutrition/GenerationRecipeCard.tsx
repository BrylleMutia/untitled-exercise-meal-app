"use client";

import { RecipeSwipeCard } from "./RecipeSwipeCard";
import { RecipeResourcePills } from "./RecipeResourcePills";
import { mealSlotLabels, parseMealSlots } from "@/utility/recipeMealSlots";
import { mealNutrition } from "@/utility/nutrition";
import { usableRecipeNutrition } from "@/utility/planningPreferences";
import type { WeeklyRecipeOption } from "@/utility/weeklyMealGeneration";
import type { Food } from "@/types/domain";

function servingsLabel(value: number): string {
  const displayed = Number(value.toFixed(3));
  return `${displayed.toLocaleString("en-US")} ${displayed === 1 ? "serving" : "servings"}`;
}

export function GenerationRecipeCard({ option, displayName, foods }: { displayName?: string; option: WeeklyRecipeOption; foods: Food[] }) {
  const { recipe, used, remaining } = option;
  return <RecipeSwipeCard name={displayName ?? recipe.name} image={recipe.image}>
    <RecipeResourcePills compact calories={usableRecipeNutrition(recipe, foods) ? mealNutrition(recipe, foods).perServing.calories : undefined} recipeServings={recipe.servings} totalTimeMinutes={recipe.totalTimeMinutes} complexity={recipe.complexity} />
    <p className="text-xs text-ink-soft">{parseMealSlots(recipe.mealSlots).map(slot => mealSlotLabels[slot]).join(", ") || "No meals assigned"}</p>
    <dl className="flex min-w-0 flex-wrap gap-x-5 gap-y-2 border-t border-ink/10 pt-3 text-xs text-ink-soft">{[["Yield", recipe.servings], ["Planned", used], ["Remaining", remaining]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="mt-0.5 font-bold tabular-nums text-ink">{servingsLabel(Number(value))}</dd></div>)}</dl>
    <p className="text-xs text-ink-soft">Planned meals use one serving per entry.</p>
  </RecipeSwipeCard>;
}
