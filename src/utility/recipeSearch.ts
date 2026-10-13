import type { Meal } from "@/types/domain";
import { searchNamedItems, type FoodSearchMatchKind } from "./foodSearch";

export function searchRecipes(recipes: readonly Meal[], query: string, limit = 6): Array<{ recipe: Meal; kind: FoodSearchMatchKind }> {
  return searchNamedItems(recipes.filter(recipe => !recipe.archivedAt), query, limit)
    .map(({ item: recipe, kind }) => ({ recipe, kind }));
}
