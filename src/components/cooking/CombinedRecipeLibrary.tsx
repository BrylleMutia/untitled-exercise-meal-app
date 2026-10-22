"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/Button";
import { RecipeCard } from "@/components/nutrition/RecipeCard";
import { RecipeOverview } from "@/components/nutrition/RecipeOverview";
import { combinedRecipeLibrary, editedDefaultRecipeIds, recipeDisplayName } from "@/utility/recipeLibrary";
import { activeRecipeFilterCount, filterRecipeLibrary, type RecipeFilters } from "@/utility/recipeFilters";
import { useCookingSurface } from "./CookingGroupSurface";
import type { Meal } from "@/types/domain";
import type { GroupRecipe, GroupRecipeDetails } from "@/types/cookingGroup";

export function CombinedRecipeLibrary({ owned, renderOwned, filters, favoriteIds, favoritesAvailable, onClearFilters }: {
  owned: Meal[]; renderOwned: (meal: Meal, displayName: string) => ReactNode;
  filters: RecipeFilters; favoriteIds: ReadonlySet<string>; favoritesAvailable: boolean; onClearFilters: () => void;
}) {
  const { snapshot, actions, pendingMutation } = useApp();
  const cooking = useCookingSurface();
  const recipes = cooking?.week?.group ? cooking.week.recipes : [];
  const editedIds = editedDefaultRecipeIds(owned, recipes);
  const library = combinedRecipeLibrary(owned, recipes, cooking?.week?.recipeOrigins);
  const active = activeRecipeFilterCount(filters);
  const favoritesBlocked = filters.favoritesOnly && !favoritesAvailable;
  const filtered = filterRecipeLibrary(library, filters, { shared: new Map(recipes.map(recipe => [recipe.id, recipe])), userId: snapshot.userId, editedIds, favoriteIds });
  const [details, setDetails] = useState<{ recipe: GroupRecipe; data: GroupRecipeDetails; groupId: string } | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const focus = useRef<HTMLElement | null>(null);
  const request = useRef(0);
  const copyKey = useRef({ id: "", key: "" });
  const currentGroup = useRef(cooking?.week?.group?.id);
  useEffect(() => { currentGroup.current = cooking?.week?.group?.id; }, [cooking?.week?.group?.id]);
  async function open(recipe: GroupRecipe, trigger: HTMLElement) {
    focus.current = trigger; setError(""); setReading(recipe.id);
    const groupId = currentGroup.current, id = ++request.current;
    try {
      const data = await actions.loadCookingRecipe(recipe.id);
      if (id === request.current && groupId && groupId === currentGroup.current) { setDetails({ recipe, data, groupId }); copyKey.current = { id: recipe.id, key: crypto.randomUUID() }; }
    } catch (reason) { if (id === request.current) setError(reason instanceof Error ? reason.message : "Recipe unavailable. Open it again to retry."); }
    finally { if (id === request.current) setReading(null); }
  }
  return <>
    {active ? <div className="mt-3 flex flex-wrap items-center gap-2">
      <p className="text-sm text-ink-soft" role="status">{favoritesBlocked ? "Favorites filtering is unavailable. Wait for card metadata or use Refresh cards to retry." : `${filtered.length} ${filtered.length === 1 ? "recipe matches" : "recipes match"} your filters.`}</p>
      <Button variant="ghost" className="!min-h-11 !px-2 text-xs underline" onClick={onClearFilters}>Clear filters</Button>
    </div> : null}
    <ul className="mt-3 grid min-w-0 gap-3 md:grid-cols-2" aria-label="Recipe collection">
    {cooking?.loading ? <li className="md:col-span-2" role="status">Loading shared recipes…</li> : null}
    {cooking?.error ? <li className="md:col-span-2 text-danger-900" role="alert"><p>Shared recipes could not be refreshed. Your recipes remain available.</p><Button variant="soft" onClick={cooking.refresh}>Retry shared recipes</Button></li> : null}
    {reading ? <li className="md:col-span-2" role="status">Loading shared recipe…</li> : null}
    {error ? <li className="md:col-span-2 text-danger-900" role="alert">{error}</li> : null}
    {!favoritesBlocked && !filtered.length && (library.length > 0 || !cooking?.loading && !cooking?.error) ? <li className="md:col-span-2 text-sm text-ink-soft">{library.length ? "No recipes match these filters." : "No recipes yet. Create a recipe to start your collection."}</li> : null}
    {(favoritesBlocked ? [] : filtered).map(meal => {
      const shared = recipes.find(recipe => recipe.id === meal.id);
      if (!shared || meal.isSystem || shared.isSystem || shared.ownerId === snapshot.userId) return renderOwned(meal, recipeDisplayName(meal, editedIds));
      return <li key={meal.id} className="min-w-0"><RecipeCard mobileCompactResources name={recipeDisplayName(shared, editedIds)} image={shared.image} calories={shared.caloriesPerServing} recipeServings={shared.servings} totalTimeMinutes={shared.totalTimeMinutes} complexity={shared.complexity}
        context={`Shared by: ${shared.ownerName}`} onOpen={event => void open(shared, event.currentTarget)} /></li>;
    })}
    </ul>
    {details && details.groupId === cooking?.week?.group?.id ? <RecipeOverview meal={details.data.meal} foods={details.data.foods} sharedBy={details.recipe.ownerName} error={error} pending={Boolean(pendingMutation)} returnFocus={focus} editLabel="Save personal copy"
      onClose={() => setDetails(null)} onEdit={async () => {
        try { await actions.cookingGroupCommand({ action: "copy-recipe", recipeId: details.recipe.id, idempotencyKey: copyKey.current.key }); setDetails(null); actions.notify("Recipe copy saved. Find it in Recipes to edit or add to your plan."); }
        catch (reason) { setError(reason instanceof Error ? reason.message : "Copy failed. Your recipe remains open for retry."); }
      }} /> : null}
  </>;
}
