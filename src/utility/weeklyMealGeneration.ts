import type { AppSnapshot, Meal, MealSlot, PlannedMeal } from "@/types/domain";
import { todayKey, weekDates } from "./dates";
import { mealAllowed, mealFitsTimeAndBudget, plannedMealMetadata } from "./mealPlan";
import { plannedMealNutrition } from "./plannedMealNutrition";
import { parseMealSlots, recipeMealSlots, validRecipeYield } from "./recipeMealSlots";
import { targetForDate } from "./targetHistory";
import { totalCarbLimit } from "./health";

export type WeeklyRecipeExclusion = "invalid-yield" | "unassigned" | "dietary" | "time-budget" | "exhausted";
export type WeeklyRecipeOption = { recipe: Meal; used: number; remaining: number; capacity: number; reasonCode?: WeeklyRecipeExclusion; reason?: string };
const exclusionReasons: Record<WeeklyRecipeExclusion, string> = {
  "invalid-yield": "Edit this recipe to choose a whole serving count.",
  unassigned: "Edit this recipe to assign its meals.",
  dietary: "Does not meet the current dietary or ingredient requirements.",
  "time-budget": "Does not meet the cooking-time or budget settings.",
  exhausted: "No whole servings remain in this week’s allowance.",
};
export type GenerationPreview = { assignments: PlannedMeal[]; unused: Array<{ mealId: string; name: string; servings: number; reason: string }> };

export function weeklyRecipeOptions(snapshot: AppSnapshot, weekOf: string): WeeklyRecipeOption[] {
  const planned = snapshot.mealPlan?.weekOf === weekOf ? snapshot.mealPlan.meals : [];
  return snapshot.savedMeals.filter(recipe => !recipe.archivedAt).map(recipe => {
    const used = planned.filter(row => row.mealId === recipe.id && !row.skipped).reduce((sum, row) => sum + row.servings, 0);
    const remaining = Math.max(0, recipe.servings - used);
    const reasonCode: WeeklyRecipeExclusion | undefined = !validRecipeYield(recipe.servings) ? "invalid-yield"
      : !parseMealSlots(recipe.mealSlots).length ? "unassigned"
      : !snapshot.profile || snapshot.profile.targetEligibility === "unsupported" || !mealAllowed(recipe.id, snapshot.profile, snapshot.savedMeals, snapshot.foods)
        || recipe.ingredients.some(item => snapshot.foods.find(food => food.id === item.foodId)?.valueSource === "ai_estimate") ? "dietary"
      : !mealFitsTimeAndBudget(recipe.id, snapshot.profile ?? undefined) || snapshot.profile?.cookingTimeMinutes !== undefined && (recipe.totalTimeMinutes ?? 0) > snapshot.profile.cookingTimeMinutes ? "time-budget"
      : remaining < 1 ? "exhausted" : undefined;
    return { recipe, used, remaining, capacity: Math.max(0, Math.floor(remaining + 1e-9)), reasonCode, reason: reasonCode ? exclusionReasons[reasonCode] : undefined };
  });
}

export function generationBasis(snapshot: AppSnapshot, weekOf: string): string {
  return JSON.stringify({ weekOf, profile: snapshot.profile, targets: snapshot.nutritionWeekTargets, target: snapshot.target,
    plan: snapshot.mealPlan, grocery: snapshot.grocery, recipes: snapshot.savedMeals, foods: snapshot.foods,
    logs: snapshot.nutritionLogs, groups: snapshot.loggedMeals });
}

function randomOrder<T>(values: T[], seed: string): T[] {
  let state = 2166136261;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

type Slot = { date: string; slot: MealSlot; day: number };

/** Maximum bipartite matching; augmenting paths move flexible recipes out of constrained slots. */
function matchSlots(edges: number[][], capacity: number[]): number[] {
  const owner = Array<number>(edges.length).fill(-1);
  const held = capacity.map(() => new Set<number>());
  function visit(slot: number, seenSlots: Set<number>, seenRecipes: Set<number>): boolean {
    if (seenSlots.has(slot)) return false;
    seenSlots.add(slot);
    for (const recipe of edges[slot]) {
      if (seenRecipes.has(recipe)) continue;
      seenRecipes.add(recipe);
      if (held[recipe].size < capacity[recipe]) { owner[slot] = recipe; held[recipe].add(slot); return true; }
      for (const previous of held[recipe]) {
        if (visit(previous, seenSlots, seenRecipes)) { held[recipe].delete(previous); held[recipe].add(slot); owner[slot] = recipe; return true; }
      }
    }
    return false;
  }
  edges.forEach((_, slot) => visit(slot, new Set(), new Set()));
  return owner;
}

/** At most 28 slots. Branch-and-bound adds daily carb capacity to maximum matching. */
function constrainedMatch(edges: number[][], capacity: number[], costs: number[], slots: Slot[], budgets: number[]): number[] {
  let best = Array<number>(edges.length).fill(-1), bestCount = 0;
  const visited = new Set<string>();
  function search(remaining: number[], counts: number[], available: number[], chosen: number[], count: number) {
    if (count > bestCount) { best = [...chosen]; bestCount = count; }
    const feasible = remaining.map(slot => edges[slot].filter(recipe => counts[recipe] > 0 && costs[recipe] <= available[slots[slot].day]));
    const matchingUpper = matchSlots(feasible, counts).filter(value => value >= 0).length;
    // An optimistic per-day bound prevents exploring permutations that cannot
    // fit even the cheapest available meal in the remaining carbohydrate budget.
    const carbUpper = available.reduce((sum, budget, day) => {
      const cheapest = remaining.flatMap((slot, index) => slots[slot].day === day && feasible[index].length
        ? [Math.min(...feasible[index].map(recipe => costs[recipe]))] : []).sort((a, b) => a - b);
      let used = 0, possible = 0;
      for (const cost of cheapest) { if (used + cost > budget) break; used += cost; possible++; }
      return sum + possible;
    }, 0);
    const upper = Math.min(matchingUpper, carbUpper);
    if (count + upper <= bestCount) return;
    const key = `${remaining.join(",")}|${counts.join(",")}|${available.join(",")}`;
    if (visited.has(key)) return;
    visited.add(key);
    let position = 0;
    for (let i = 1; i < remaining.length; i++) if (feasible[i].length < feasible[position].length) position = i;
    const slot = remaining[position], day = slots[slot].day;
    const rest = remaining.filter(value => value !== slot);
    for (const recipe of feasible[position]) {
      counts[recipe]--; available[day] -= costs[recipe]; chosen[slot] = recipe;
      search(rest, counts, available, chosen, count + 1);
      counts[recipe]++; available[day] += costs[recipe]; chosen[slot] = -1;
      if (bestCount === count + upper) return;
    }
    search(rest, counts, available, chosen, count);
  }
  search(edges.map((_, i) => i), [...capacity], [...budgets], [...best], 0);
  return best;
}

export function defaultPlanningDates(weekOf: string, today = todayKey()): string[] {
  return weekDates(weekOf).filter(date => date >= today);
}

export function generateWeeklyMeals(snapshot: AppSnapshot, weekOf: string, selectedIds: string[], seed: string, selectedDates: string[] = weekDates(weekOf)): GenerationPreview {
  const validDates = new Set(selectedDates.filter(date => weekDates(weekOf).includes(date)));
  const options = weeklyRecipeOptions(snapshot, weekOf).filter(option => selectedIds.includes(option.recipe.id));
  const recipes = randomOrder(options.filter(option => !option.reason), seed);
  const dates = weekDates(weekOf);
  const planned = snapshot.mealPlan?.weekOf === weekOf ? snapshot.mealPlan.meals : [];
  const occupied = new Set([...planned.map(row => `${row.date}:${row.slot}`), ...snapshot.nutritionLogs.map(row => `${row.date}:${row.slot}`), ...snapshot.loggedMeals.map(row => `${row.date}:${row.slot}`)]);
  const targets = snapshot.nutritionWeekTargets ?? (snapshot.target ? [snapshot.target] : []);
  const slots = randomOrder(dates.flatMap((date, day) => {
    const target = targetForDate(targets, date);
    return validDates.has(date) && target && target.safetyOutcome !== "unsupported_population" ? recipeMealSlots.filter(slot => !occupied.has(`${date}:${slot}`)).map(slot => ({ date, slot, day })) : [];
  }), `${seed}:slots`);
  const metadata = recipes.map(option => plannedMealMetadata(option.recipe.id, undefined, 1, snapshot.savedMeals, snapshot.foods));
  const edges = slots.map(slot => recipes.flatMap((option, i) => parseMealSlots(option.recipe.mealSlots).includes(slot.slot) ? [i] : []));
  const capacity = recipes.map(option => Math.min(28, option.capacity));
  const limit = totalCarbLimit(snapshot.profile?.dietaryPattern ?? "");
  // Hundredths of a gram match authoritative planned nutrition and keep search keys exact.
  const budgets = dates.map(date => {
    const rows = planned.filter(row => row.date === date && !row.skipped);
    const values = rows.map(row => plannedMealNutrition(row, snapshot.savedMeals, snapshot.foods));
    if (values.some(value => value === null)) return 0;
    return Math.max(0, Math.floor(((limit ?? 0) - values.reduce((sum, value) => sum + (value?.carbsG ?? 0), 0)) * 100 + 1e-7));
  });
  const owner = limit === null ? matchSlots(edges, capacity) : constrainedMatch(edges, capacity, metadata.map(value => Math.round(value.expectedCarbsG * 100)), slots, budgets);
  const assignments = owner.flatMap((recipe, i): PlannedMeal[] => recipe < 0 ? [] : [{
    id: `generated-${seed}-${i}`, date: slots[i].date, slot: slots[i].slot, mealId: recipes[recipe].recipe.id,
    label: recipes[recipe].recipe.name, servings: 1, ...metadata[recipe],
  }]).sort((a, b) => a.date.localeCompare(b.date) || recipeMealSlots.indexOf(a.slot) - recipeMealSlots.indexOf(b.slot));
  return { assignments, unused: options.flatMap(option => {
    const remaining = Math.max(0, option.remaining - assignments.filter(row => row.mealId === option.recipe.id).length);
    return remaining > 1e-9 ? [{ mealId: option.recipe.id, name: option.recipe.name, servings: remaining,
      reason: option.reason ?? (remaining < 1 ? "Only a fractional serving remains; generation uses whole servings." : "Not enough eligible empty slots within the current targets and dietary limits.") }] : [];
  }) };
}
