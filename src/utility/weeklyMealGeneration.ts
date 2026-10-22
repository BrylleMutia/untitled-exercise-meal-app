import type { AppSnapshot, Meal, PlannedMeal } from "@/types/domain";
import { todayKey, weekDates } from "./dates";
import { plannedMealMetadata } from "./mealPlan";
import { individualPreferenceReview, usableRecipeNutrition } from "./planningPreferences";
import { PLANNING_REVIEW_POLICY, type PreferenceReview } from "@/types/planningPreferences";
import { parseMealSlots, recipeMealSlots, validRecipeYield } from "./recipeMealSlots";
import { targetForDate } from "./targetHistory";

export type WeeklyRecipeExclusion = "invalid-yield" | "unassigned" | "invalid-nutrition" | "dietary" | "time-budget" | "exhausted";
export type WeeklyRecipeOption = { recipe: Meal; used: number; remaining: number; capacity: number; reasonCode?: WeeklyRecipeExclusion; reason?: string };
const exclusionReasons: Record<WeeklyRecipeExclusion, string> = {
  "invalid-yield": "Edit this recipe to choose a whole serving count.",
  unassigned: "Edit this recipe to assign its meals.",
  "invalid-nutrition": "Edit this recipe to provide usable nutrition and ingredient quantities.",
  dietary: "Does not meet the current dietary or ingredient requirements.",
  "time-budget": "Does not meet the cooking-time or budget settings.",
  exhausted: "No whole servings remain in this week’s allowance.",
};
export type GenerationPreview = { preferenceReview?: PreferenceReview; assignments: PlannedMeal[]; unused: Array<{ mealId: string; name: string; servings: number; reason: string }> };

export function weeklyRecipeOptions(snapshot: AppSnapshot, weekOf: string): WeeklyRecipeOption[] {
  const planned = snapshot.mealPlan?.weekOf === weekOf ? snapshot.mealPlan.meals : [];
  return snapshot.savedMeals.filter(recipe => !recipe.archivedAt && !recipe.id.startsWith("group-copy-")).map(recipe => {
    const used = planned.filter(row => row.mealId === recipe.id && !row.skipped).reduce((sum, row) => sum + row.servings, 0);
    const remaining = Math.max(0, recipe.servings - used);
    const reasonCode: WeeklyRecipeExclusion | undefined = !validRecipeYield(recipe.servings) ? "invalid-yield"
      : !parseMealSlots(recipe.mealSlots).length ? "unassigned"
      : !usableRecipeNutrition(recipe, snapshot.foods) ? "invalid-nutrition"
      : remaining < 1 ? "exhausted" : undefined;
    return { recipe, used, remaining, capacity: Math.max(0, Math.floor(remaining + 1e-9)), reasonCode, reason: reasonCode ? exclusionReasons[reasonCode] : undefined };
  });
}

export function generationBasis(snapshot: AppSnapshot, weekOf: string): string {
  return JSON.stringify({ policyVersion: PLANNING_REVIEW_POLICY, weekOf, profile: snapshot.profile, targets: snapshot.nutritionWeekTargets, target: snapshot.target,
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

export function defaultPlanningDates(weekOf: string, today = todayKey()): string[] { return weekDates(weekOf).filter(date => date >= today); }

/** Match selected recipes to available slots without enforcing personal preferences. */
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
    return validDates.has(date) && snapshot.profile && snapshot.profile.targetEligibility !== "unsupported" && target && target.safetyOutcome !== "unsupported_population" ? recipeMealSlots.filter(slot => !occupied.has(`${date}:${slot}`)).map(slot => ({ date, slot, day })) : [];
  }), `${seed}:slots`);
  const metadata = recipes.map(option => plannedMealMetadata(option.recipe.id, undefined, 1, snapshot.savedMeals, snapshot.foods));
  const edges = slots.map(slot => recipes.flatMap((option, i) => parseMealSlots(option.recipe.mealSlots).includes(slot.slot) ? [i] : []));
  const capacity = recipes.map(option => Math.min(28, option.capacity));
  const owner = matchSlots(edges, capacity);
  const assignments = owner.flatMap((recipe, i): PlannedMeal[] => recipe < 0 ? [] : [{
    id: `generated-${seed}-${i}`, date: slots[i].date, slot: slots[i].slot, mealId: recipes[recipe].recipe.id,
    label: recipes[recipe].recipe.name, servings: 1, ...metadata[recipe],
  }]).sort((a, b) => a.date.localeCompare(b.date) || recipeMealSlots.indexOf(a.slot) - recipeMealSlots.indexOf(b.slot));
  return { assignments, preferenceReview: individualPreferenceReview(snapshot, options.map(o => o.recipe), assignments, [...validDates]), unused: options.flatMap(option => {
    const remaining = Math.max(0, option.remaining - assignments.filter(row => row.mealId === option.recipe.id).length);
    return remaining > 1e-9 ? [{ mealId: option.recipe.id, name: option.recipe.name, servings: remaining,
      reason: option.reason ?? (remaining < 1 ? "Only a fractional serving remains; generation uses whole servings." : "Not enough eligible empty slots within the selected dates and available recipe servings.") }] : [];
  }) };
}
