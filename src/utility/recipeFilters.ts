import type { Meal, MealSlot, RecipeComplexity } from "@/types/domain";
import type { GroupRecipe } from "@/types/cookingGroup";
import { recipeDisplayName } from "./recipeLibrary";

export type RecipeSource = "default" | "mine" | "shared";
export type RecipeFilters = {
  query: string;
  favoritesOnly: boolean;
  sources: RecipeSource[];
  mealSlots: MealSlot[];
  maxMinutes: "" | "15" | "30" | "60";
  difficulties: RecipeComplexity[];
};

export function emptyRecipeFilters(): RecipeFilters {
  return { query: "", favoritesOnly: false, sources: [], mealSlots: [], maxMinutes: "", difficulties: [] };
}

export function activeRecipeFilterCount(filters: RecipeFilters): number {
  return [filters.query.trim(), filters.favoritesOnly, filters.sources.length, filters.mealSlots.length,
    filters.maxMinutes, filters.difficulties.length].filter(Boolean).length;
}

export function recipeSource(recipe: Meal, shared: ReadonlyMap<string, GroupRecipe>, userId: string): RecipeSource {
  if (recipe.isSystem) return "default";
  const source = shared.get(recipe.id);
  return source?.ownerId && source.ownerId !== userId ? "shared" : "mine";
}

/** Filter an already reconciled library without changing its identities or ordering. */
export function filterRecipeLibrary(recipes: Meal[], filters: RecipeFilters, context: {
  shared: ReadonlyMap<string, GroupRecipe>;
  userId: string;
  editedIds: ReadonlySet<string>;
  favoriteIds: ReadonlySet<string>;
}): Meal[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return recipes.filter(recipe => {
    if (recipe.archivedAt) return false;
    if (query && ![recipe.name, recipeDisplayName(recipe, context.editedIds)].some(name => name.toLocaleLowerCase().includes(query))) return false;
    if (filters.favoritesOnly && !context.favoriteIds.has(recipe.id)) return false;
    if (filters.sources.length && !filters.sources.includes(recipeSource(recipe, context.shared, context.userId))) return false;
    if (filters.mealSlots.length && !recipe.mealSlots?.some(slot => filters.mealSlots.includes(slot))) return false;
    if (filters.maxMinutes && (recipe.totalTimeMinutes === undefined || !Number.isFinite(recipe.totalTimeMinutes) || recipe.totalTimeMinutes < 0 || recipe.totalTimeMinutes > Number(filters.maxMinutes))) return false;
    return !filters.difficulties.length || filters.difficulties.includes(recipe.complexity ?? "medium");
  });
}
