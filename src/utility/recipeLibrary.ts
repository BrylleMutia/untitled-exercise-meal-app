import type { Meal } from "@/types/domain";
import type { GroupRecipe, RecipeOrigin } from "@/types/cookingGroup";

export function editedDefaultRecipeIds(owned: Meal[], shared: GroupRecipe[] = []): Set<string> {
  return new Set([
    ...owned.flatMap(recipe => recipe.isSystem && recipe.catalogReplacementId ? [recipe.catalogReplacementId] : []),
    ...shared.filter(recipe => recipe.isEditedDefault === true).map(recipe => recipe.id),
  ]);
}

export function recipeDisplayName(recipe: Pick<Meal, "id" | "name">, editedIds: ReadonlySet<string>): string {
  return editedIds.has(recipe.id) && !/\(edited\)\s*$/i.test(recipe.name) ? `${recipe.name} (edited)` : recipe.name;
}

export function uniqueGroupRecipes(recipes: GroupRecipe[]): GroupRecipe[] {
  return [...new Map(recipes.map(recipe => [recipe.canonicalDefaultId ?? recipe.id, recipe])).values()];
}

/** Identity-based presentation only: never rewrites a stored recipe or planned reference. */
export function combinedRecipeLibrary(owned: Meal[], shared: GroupRecipe[], origins: RecipeOrigin[] = []): Meal[] {
  const archived = new Set(owned.filter(recipe => recipe.archivedAt).map(recipe => recipe.id));
  const recipes = new Map(owned.filter(recipe => !recipe.archivedAt).map(recipe => [recipe.id, recipe]));
  for (const recipe of uniqueGroupRecipes(shared)) if (!archived.has(recipe.id) && !recipes.has(recipe.id)) recipes.set(recipe.id, recipe);
  for (const origin of origins) {
    if (origin.canonicalDefaultId && archived.has(origin.canonicalDefaultId) || recipes.has(origin.recipeId) && origin.snapshotId !== origin.recipeId) recipes.delete(origin.snapshotId);
  }
  return [...recipes.values()];
}
