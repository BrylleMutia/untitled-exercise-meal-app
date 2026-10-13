"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Check, Pencil, Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { CalorieBudgetRing } from "@/components/ui/CalorieBudgetRing";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { DayStrip } from "@/components/DayStrip";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { NutritionPills, NutritionFieldLabel } from "@/components/ui/NutritionPills";
import { nutritionMetricStyles, type NutritionMetric } from "@/components/ui/nutritionMetrics";
import { HelpHeading, HelpPopover } from "@/components/ui/HelpPopover";
import { RecipeEditor } from "@/components/nutrition/RecipeEditor";
import { RecipeOverview } from "@/components/nutrition/RecipeOverview";
import { RecipeCard } from "@/components/nutrition/RecipeCard";
import { RecipePortionReview } from "@/components/nutrition/RecipePortionReview";
import { MealRow } from "@/components/nutrition/MealRow";
import { useRecipeCardMetadata } from "@/components/nutrition/useRecipeCardMetadata";
import { recipeCardCalories } from "@/utility/recipeCard";
import { plannedMealNutrition } from "@/utility/plannedMealNutrition";
import { searchFoods } from "@/utility/foodSearch";
import { searchRecipes } from "@/utility/recipeSearch";
import { recipePortion, recipeReviewToken } from "@/utility/recipePortion";
import { FOODS } from "@/constants/foods";
import { parseMealText, servingPlanForCandidate, type CandidateServingPlan, type ParsedCandidate } from "@/utility/textMeal";
import { providedRecipeLogEntry } from "@/utility/providedRecipeNutrition";
import { dayStatus, entriesForDate, totalsForDate, foodMacros, mealNutrition } from "@/utility/nutrition";
import { startOfWeek, todayKey } from "@/utility/dates";
import { totalCarbLimit } from "@/utility/health";
import { targetForDate } from "@/utility/targetHistory";
import type { Confidence, Food, LoggedMeal, Meal, MealSlot, NutritionLog, PlannedMeal, RecipeIngredient } from "@/types/domain";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";
import { createClient } from "@/lib/supabase/client";
import { estimateNutritionMacros, matchNutritionMeal, parseNutritionTextWithProvider, searchNutritionProvider, type NutritionProviderCandidate } from "@/services/nutritionProvider";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const slotLabels: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const confidenceClasses: Record<Confidence, string> = {
  high: "bg-mint-100 text-ink",
  medium: "bg-peach-100 text-ink",
  low: "bg-coral-100 text-ink",
};

type Mode = "search" | "custom";
type PlanChoice = { food?: Food; meal?: Meal; servings: number; newFoods?: Food[]; plannedMeal?: PlannedMeal; fixedKey?: string };
type RecipeSelection = { id: string; revision?: number; token: string; servings: string; logKey: string; planKey: string; plannedMeal?: PlannedMeal };
type GuidedDraft = { query: string; mealName: string; ingredients: GuidedIngredient[]; quantityFood?: Food | null; quantity?: string; quantityUnit?: string; recipeSelection?: RecipeSelection | null };

type GuidedIngredient = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  preparation: string;
  assumptions: string[];
  presence: "stated" | "possible_hidden";
  included: boolean;
  food: Food | null;
  estimate?: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG?: number;
    estimateRange: import("@/types/domain").MacroEstimateRange;
    assumptions: string[];
  };
  custom?: {
    calories: string;
    proteinG: string;
    carbsG: string;
    fatG: string;
    fiberG: string;
  };
};

function nutritionProviderMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  const code = message.split(":", 1)[0];
  if (code === "not_authenticated") return "Your session has expired. Sign in again to continue; this review remains saved on this device.";
  if (code === "rate_limited") return "This provider is temporarily rate-limited. Your review is preserved; wait and retry later.";
  if (code === "provider_invalid_response") return "The provider returned an unusable result. Your input is preserved; try again or use a manual value.";
  return fallback;
}

export default function NutritionPage() {
  const { snapshot, actions, pendingMutation } = useApp();
  const recipeMetadata = useRecipeCardMetadata();
  const [selected, setSelected] = useState(todayKey());
  const [loggingOpen, setLoggingOpen] = useState(false);
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryReviewing, setEntryReviewing] = useState(false);
  const entryReturnFocus = useRef<MealSlot | null>(null);
  useEffect(() => {
    if (!loggingOpen && !entrySaving && !pendingMutation && entryReturnFocus.current) {
      document.getElementById(`add-meal-${entryReturnFocus.current}`)?.focus();
      entryReturnFocus.current = null;
    }
  }, [loggingOpen, entrySaving, pendingMutation]);
  const [logSlot, setLogSlot] = useState<MealSlot | null>(null);
  const [mode, setMode] = useState<Mode>("search");
  const [savedMealToLog, setSavedMealToLog] = useState<string | null>(null);
  const [savedMealSlot, setSavedMealSlot] = useState<MealSlot | null>(null);
  const [savingSavedMeal, setSavingSavedMeal] = useState(false);
  const [editingPlannedMealId, setEditingPlannedMealId] = useState<string | null>(null);
  const plannedEditReturnFocus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (editingPlannedMealId === null) plannedEditReturnFocus.current?.focus();
  }, [editingPlannedMealId]);
  const [plannedMealToLog, setPlannedMealToLog] = useState<string | null>(null);
  const [actualServings, setActualServings] = useState("1");
  const [plannedLogKey, setPlannedLogKey] = useState("");
  const [savingPlannedLog, setSavingPlannedLog] = useState(false);
  const plannedLogFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (plannedMealToLog !== null || !plannedLogFocusRef.current) return;
    const linkedAction = [...document.querySelectorAll<HTMLButtonElement>("button[data-planned-meal-id]")]
      .find((button) => button.dataset.plannedMealId === plannedLogFocusRef.current);
    if (linkedAction) {
      linkedAction.focus();
      plannedLogFocusRef.current = null;
    }
  }, [snapshot.nutritionLogs, snapshot.loggedMeals, plannedMealToLog]);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editingNutritionId, setEditingNutritionId] = useState<string | null>(null);
  const [editingLoggedMealId, setEditingLoggedMealId] = useState<string | null>(null);
  const [expandedLoggedMealId, setExpandedLoggedMealId] = useState<string | null>(null);
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [viewingRecipeId, setViewingRecipeId] = useState<string | null>(null);
  const [returnToRecipeOverview, setReturnToRecipeOverview] = useState<string | null>(null);
  const recipeReturnFocus = useRef<HTMLElement | null>(null);
  function openRecipe(meal: Meal, trigger: HTMLElement) {
    recipeReturnFocus.current = trigger; setRecipeModalOpen(false); setViewingRecipeId(meal.id);
  }

  useEffect(() => {
    if (savedMealToLog) document.getElementById(`saved-meal-slot-${savedMealToLog}`)?.focus();
  }, [savedMealToLog]);

  useEffect(() => {
    if (plannedMealToLog) document.getElementById(`actual-servings-${plannedMealToLog}`)?.focus();
  }, [plannedMealToLog]);

  const isToday = selected === todayKey();
  const totals = totalsForDate(snapshot.nutritionLogs, selected);
  const entries = entriesForDate(snapshot.nutritionLogs, selected);
  const status = dayStatus(snapshot.nutritionLogs, selected);
  const target = targetForDate(snapshot.nutritionWeekTargets, selected)
    ?? (snapshot.target?.effectiveDate && snapshot.target.effectiveDate <= selected ? snapshot.target : null);
  const existingPlanForDay = snapshot.mealPlan?.weekOf === startOfWeek(selected) ? snapshot.mealPlan : null;
  const canAddPlan = Boolean(existingPlanForDay || (target && target.safetyOutcome !== "unsupported_population"));
  const carbLimit = totalCarbLimit(snapshot.profile?.dietaryPattern ?? "");
  const foods = useMemo(
    () => snapshot.foods.length > 0
      ? snapshot.foods.map(withAuthoredServingOptions)
      : FOODS,
    [snapshot.foods],
  );

  const todaysPlan = useMemo(
    () => snapshot.mealPlan?.meals.filter((m) => m.date === selected) ?? [],
    [snapshot.mealPlan, selected],
  );
  const loggedPlannedIds = useMemo(() => new Set([
    ...snapshot.nutritionLogs.filter((entry) => entry.date === selected && !entry.loggedMealId && entry.plannedMealId).map((entry) => entry.plannedMealId!),
    ...snapshot.loggedMeals.filter((entry) => entry.date === selected && entry.plannedMealId).map((entry) => entry.plannedMealId!),
  ]), [selected, snapshot.loggedMeals, snapshot.nutritionLogs]);

  // Kept as a compatibility fallback for drafts created by the pre-unified
  // editor; new entries always use GuidedSearchPicker above.
  void [SearchPicker, TextParser];

  async function savePlannedMeal(nextMeal: PlannedMeal) {
    if (!snapshot.mealPlan) return false;
    const meals = snapshot.mealPlan.meals.some((meal) => meal.id === nextMeal.id)
      ? snapshot.mealPlan.meals.map((meal) => meal.id === nextMeal.id ? nextMeal : meal)
      : [...snapshot.mealPlan.meals, nextMeal];
    const saved = await actions.editMealPlan({ ...snapshot.mealPlan, meals });
    if (saved) setEditingPlannedMealId(null);
    return saved;
  }

  async function addToPlan(slot: MealSlot, choice: PlanChoice) {
    if (!canAddPlan) return false;
    const { food, meal, servings } = choice;
    if ((!food && !meal) || (food && meal)) return false;
    const nextOrder = Math.max(0, ...todaysPlan.filter((entry) => entry.slot === slot).map((entry) => entry.sortOrder ?? 0)) + 1;
    return actions.addPlannedMeal(choice.plannedMeal ?? {
      id: clientId("planned-meal"),
      date: selected,
      slot,
      slotKey: `date:${selected}:slot:${slot}:order:${nextOrder}`,
      sortOrder: nextOrder,
      ...(food ? { foodId: food.id } : { mealId: meal!.id }),
      label: food?.name ?? meal!.name,
      servings,
    }, choice.newFoods, meal && !snapshot.savedMeals.some((entry) => entry.id === meal.id) ? meal : undefined, choice.fixedKey);
  }

  function selectDay(date: string) {
    if (date === selected) return;
    setSelected(date);
    setLoggingOpen(false);
    setEntryReviewing(false);
    setLogSlot(null);
    setMode("search");
    setEditingPlannedMealId(null);
    setPlannedMealToLog(null);
    setEditingLoggedMealId(null);
    setEditingNutritionId(null);
    setSavedMealToLog(null);
    setSavedMealSlot(null);
  }

  function closeLogEditor() {
    entryReturnFocus.current = logSlot;
    setLoggingOpen(false);
    setEntryReviewing(false);
    setLogSlot(null);
    setMode("search");
  }

  async function confirmPlannedLog(meal: PlannedMeal) {
    const amount = Number(actualServings);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const food = meal.foodId ? foods.find((candidate) => candidate.id === meal.foodId) : undefined;
    const recipe = meal.mealId ? snapshot.savedMeals.find((candidate) => candidate.id === meal.mealId) : undefined;
    if (!food && (!recipe || recipe.ingredients.length === 0 || recipe.ingredients.some((ingredient) => !foods.some((candidate) => candidate.id === ingredient.foodId)))) return;
    setSavingPlannedLog(true);
    try {
      const saved = food
        ? await addFood(actions, meal.slot, selected, food, amount, meal.id, plannedLogKey)
        : await logMeal(actions, recipe!.ingredients.map((ingredient) => ({
            ...ingredient,
            servings: ingredient.servings * amount / recipe!.servings,
          })), selected, meal.slot, recipe!, foods, meal.id, plannedLogKey);
      if (saved) {
        plannedLogFocusRef.current = meal.id;
        setPlannedMealToLog(null);
      }
    } finally {
      setSavingPlannedLog(false);
    }
  }

  function plannedLogConfirmation(meal: PlannedMeal, triggerKey: string, triggerId: string) {
    if (plannedMealToLog !== triggerKey) return null;
    const amount = Number(actualServings);
    const food = meal.foodId ? foods.find((candidate) => candidate.id === meal.foodId) : undefined;
    const recipe = meal.mealId ? snapshot.savedMeals.find((candidate) => candidate.id === meal.mealId) : undefined;
    const actual = food ? foodMacros(food, amount) : recipe ? mealNutrition(recipe, foods).perServing : null;
    const valid = Boolean(actual && Number.isFinite(amount) && amount > 0);
    return <div role="group" aria-label={"Log " + meal.label} className="grid gap-2 rounded-xl bg-white p-3">
      <label className="grid gap-1 text-xs font-bold text-ink-soft">Actual servings<input id={`actual-servings-${triggerKey}`} className="input" type="number" min="0.01" step="0.25" value={actualServings} onChange={(event) => { setActualServings(event.target.value); setPlannedLogKey(clientId("planned-log")); }} /></label>
      <p className="text-xs font-semibold text-ink-soft">Estimated for this portion:</p>
      {valid && actual ? <NutritionPills label="Actual portion nutrition" approximate precision={0} values={{ calories: actual.calories * (food ? 1 : amount), proteinG: actual.proteinG * (food ? 1 : amount), carbsG: actual.carbsG * (food ? 1 : amount), fatG: actual.fatG * (food ? 1 : amount) }} /> : <p className="text-xs font-semibold text-ink-soft">Choose valid servings.</p>}
      <p className="text-xs font-semibold text-ink-soft">Confirm what you actually ate; the plan stays unchanged.</p>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" className="!min-h-11 !px-3 text-xs" disabled={savingPlannedLog} onClick={() => { document.getElementById(triggerId)?.focus(); setPlannedMealToLog(null); }}>Cancel</Button><Button className="!min-h-11 !px-3 text-xs" disabled={savingPlannedLog || !Number.isFinite(amount) || amount <= 0} onClick={() => void confirmPlannedLog(meal)}>{savingPlannedLog ? "Saving…" : "Confirm log"}</Button></div>
    </div>;
  }

  function canLogPlanned(meal: PlannedMeal) {
    if (meal.foodId) return foods.some((candidate) => candidate.id === meal.foodId);
    const recipe = meal.mealId ? snapshot.savedMeals.find((candidate) => candidate.id === meal.mealId) : undefined;
    return Boolean(recipe && recipe.ingredients.length > 0 && recipe.ingredients.every((ingredient) => foods.some((candidate) => candidate.id === ingredient.foodId)));
  }

  function openPlannedLog(meal: PlannedMeal, triggerKey: string) {
    setPlannedMealToLog(triggerKey);
    setActualServings(String(meal.servings));
    setPlannedLogKey(clientId("planned-log"));
  }

  function loggedRows(slot: MealSlot) {
    const list = entries[slot];
    const grouped = snapshot.loggedMeals.filter((meal) => meal.date === selected && meal.slot === slot);
    const groupedIds = new Set(grouped.map((meal) => meal.id));
    const standalone = list.filter((entry) => !entry.loggedMealId || !groupedIds.has(entry.loggedMealId));
    return <>
      {grouped.map((meal) => {
        const linkedPlan = meal.plannedMealId ? todaysPlan.find((candidate) => candidate.id === meal.plannedMealId) : undefined;
        const childEntries = list.filter((entry) => entry.loggedMealId === meal.id).sort((a, b) => (a.ingredientOrder ?? 0) - (b.ingredientOrder ?? 0));
        const mealTotals = childEntries.reduce((sum, entry) => ({ calories: sum.calories + entry.calories, proteinG: sum.proteinG + entry.proteinG, carbsG: sum.carbsG + entry.carbsG, fatG: sum.fatG + entry.fatG }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
        const hasRange = childEntries.some((entry) => entry.valueSource === "ai_estimate" && entry.estimateRange);
        const low = childEntries.reduce((sum, entry) => sum + (entry.estimateRange?.calories.low ?? entry.calories), 0);
        const high = childEntries.reduce((sum, entry) => sum + (entry.estimateRange?.calories.high ?? entry.calories), 0);
        const expanded = expandedLoggedMealId === meal.id;
        return <MealRow key={meal.id} summary={
            <button type="button" className="min-h-11 w-full min-w-0 rounded-lg text-left" aria-expanded={expanded} onClick={() => setExpandedLoggedMealId(expanded ? null : meal.id)}>
              <span className="text-[11px] font-bold text-ink-soft">Eaten</span>
              <p className="break-words text-sm font-extrabold">{meal.name} <span className="text-xs font-semibold text-muted">{expanded ? "▴" : "▾"}</span></p>
              <NutritionPills className="mt-1" values={mealTotals} approximate={hasRange} precision={0} />
              <p className="mt-1 break-words text-[11px] font-semibold text-ink-soft">{hasRange ? `${Math.round(low)}–${Math.round(high)} kcal range · includes AI estimate` : "mixed sources"}</p>
            </button>
          } actions={<>
              {linkedPlan ? <button id={`log-again-${meal.id}`} data-planned-meal-id={linkedPlan.id} type="button" disabled={!canLogPlanned(linkedPlan)} onClick={() => openPlannedLog(linkedPlan, `again-${meal.id}`)} className="min-h-11 rounded-full bg-white px-2 text-xs font-extrabold disabled:opacity-50">Log again</button> : null}
              <button type="button" className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink" aria-label={`Edit ${meal.name}`} onClick={() => setEditingLoggedMealId(meal.id)}><Pencil className="h-4 w-4" aria-hidden /></button>
              <button type="button" className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink" aria-label={`Delete ${meal.name}`} onClick={() => void actions.deleteLoggedMeal(meal.id)}><Trash2 className="h-4 w-4" aria-hidden /></button>
          </>}>
          {expanded ? <div className="grid gap-1 border-t border-white pt-2">{childEntries.map((entry) => <div key={entry.id} className="grid min-w-0 gap-1 rounded-lg bg-white px-2 py-2 text-xs"><span className="break-words">{entry.foodId ? foods.find((food) => food.id === entry.foodId)?.name ?? entry.foodId : entry.customName} ×{entry.servings} · {entry.preparationBasis ?? "basis unknown"}</span><NutritionPills values={entry} precision={0} /><span className="font-semibold text-ink-soft">{entry.valueSource === "ai_estimate" ? "AI estimate" : entry.valueSource === "trusted_catalog" ? "USDA/catalog" : "user value"}</span></div>)}<p className="text-[11px] font-semibold text-muted">Historical corrections affect this logged meal only. The reusable recipe remains unchanged.</p></div> : null}
          {linkedPlan ? plannedLogConfirmation(linkedPlan, `again-${meal.id}`, `log-again-${meal.id}`) : null}
          {editingLoggedMealId === meal.id ? <LoggedMealEditor meal={meal} entries={childEntries} foods={foods} onSave={async (nextMeal, nextIngredients) => { const saved = await actions.updateLoggedMeal(nextMeal, nextIngredients); if (saved) setEditingLoggedMealId(null); return saved; }} onCancel={() => setEditingLoggedMealId(null)} /> : null}
        </MealRow>;
      })}
      {standalone.map((entry) => {
        const linkedPlan = entry.plannedMealId ? todaysPlan.find((candidate) => candidate.id === entry.plannedMealId) : undefined;
        const name = entry.foodId ? foods.find((food) => food.id === entry.foodId)?.name ?? entry.foodId : entry.customName;
        return <MealRow key={entry.id} summary={
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-ink-soft">Eaten</p>
            <p className="break-words text-sm font-bold">{name} <span className="font-semibold text-muted">×{entry.servings}</span></p>
            <NutritionPills className="my-1" values={entry} precision={0} />
            <span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${confidenceClasses[entry.confidence]}`}>{entry.estimated ? `estimate (${entry.confidence})` : "your entry"}</span>
            <p className="text-[10px] font-semibold text-muted">{entry.source} · {entry.preparationBasis ?? "preparation unknown"}</p>
          </div>
        } actions={<>
            {linkedPlan ? <button id={`log-again-${entry.id}`} data-planned-meal-id={linkedPlan.id} type="button" disabled={!canLogPlanned(linkedPlan)} onClick={() => openPlannedLog(linkedPlan, `again-${entry.id}`)} className="min-h-11 rounded-full bg-white px-2 text-xs font-extrabold disabled:opacity-50">Log again</button> : null}
            <button type="button" onClick={() => setEditingNutritionId(entry.id)} aria-label={`Edit ${name}`} className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink"><Pencil className="h-4 w-4" aria-hidden /></button>
            <button type="button" onClick={() => actions.deleteNutrition(entry.id)} aria-label={`Delete ${name}`} className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink"><Trash2 className="h-4 w-4" aria-hidden /></button>
        </>}>
          {editingNutritionId === entry.id ? <NutritionEditForm entry={entry} foods={foods} onSave={async (next) => { const saved = await actions.updateNutrition(next); if (saved) setEditingNutritionId(null); return saved; }} onCancel={() => setEditingNutritionId(null)} /> : null}
          {linkedPlan && plannedMealToLog === `again-${entry.id}` ? plannedLogConfirmation(linkedPlan, `again-${entry.id}`, `log-again-${entry.id}`) : null}
        </MealRow>;
      })}
    </>;
  }

  return (
    <div className="grid min-w-0 gap-4 pb-4">
      <Card tone="blush">
        <DayStrip selected={selected} onSelect={selectDay} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-extrabold">
              {isToday ? "Today" : selected}
            </h2><HelpPopover title="Daily nutrition"><p>Targets are estimates from your profile. Missing meal slots stay unknown, not zero intake. Estimated entries retain their ranges and confidence.</p></HelpPopover></div>
            <p className="text-xs font-bold text-ink-soft">
              {status === "complete"
                ? "Fully logged"
                : status === "partial"
                  ? "Partially logged — missing slots are not zero"
                  : "Unlogged day — no entries"}
            </p>
          </div>
          <CalorieBudgetRing target={target?.calories ?? null} logged={totals.calories} status={status} estimated={snapshot.nutritionLogs.some((entry) => entry.date === selected && entry.estimated)} size={96} />
        </div>
        {status !== "unlogged" ? <p className="mt-2 text-xs font-bold text-ink-soft">Logged: {totals.estimateRange ? "≈ " : ""}{Math.round(totals.calories)} kcal · Target: {target?.calories ?? "not set"} kcal</p> : null}
        <div className="mt-3 grid gap-2.5">
          <ProgressBar label="Protein" value={totals.proteinG} target={target?.proteinG ?? 0} unit=" g" barClassName={nutritionMetricStyles.proteinG.bar} />
          <ProgressBar label="Carbs" value={totals.carbsG} target={target?.carbsG ?? 0} unit=" g" barClassName={nutritionMetricStyles.carbsG.bar} />
          <ProgressBar label="Fat" value={totals.fatG} target={target?.fatG ?? 0} unit=" g" barClassName={nutritionMetricStyles.fatG.bar} />
        </div>
        {totals.estimateRange ? <p className="mt-2 text-[11px] font-bold text-muted">Estimated range today: {Math.round(totals.estimateRange.calories.low)}–{Math.round(totals.estimateRange.calories.high)} kcal. AI ranges are low-confidence and user-confirmed.</p> : null}
      </Card>

      <Card role="region" aria-labelledby="planned-meals-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <h2 id="planned-meals-heading" className="font-extrabold">Planned</h2>
            <HelpPopover title="Planned meals"><p>Planned and eaten meals appear together by slot. Editing or skipping a plan does not change food already logged.</p><p>Planned nutrition describes the shown planned portion. Eaten nutrition is the amount saved in your food log. Recipe cards in Saved meals show nutrition per serving.</p></HelpPopover>
          </div>
        </div>
        {!canAddPlan ? <p className="mt-2 text-xs font-semibold text-muted">Set an eligible daily goal to add to the plan. You can still log food you ate.</p> : null}
        <div className="mt-5 grid gap-4">
          {SLOTS.map((slot) => {
            const planned = todaysPlan.filter((meal) => meal.slot === slot && !loggedPlannedIds.has(meal.id)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            const eaten = entries[slot].length > 0 || snapshot.loggedMeals.some((meal) => meal.date === selected && meal.slot === slot);
            return <section key={slot} className="min-w-0 border-t border-ink/10 pt-4" aria-label={slotLabels[slot]}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-extrabold">{slotLabels[slot]}</h3>
                <Button id={`add-meal-${slot}`} variant="soft" className="!min-h-11 !px-3 text-xs" disabled={entrySaving || Boolean(pendingMutation)} aria-expanded={loggingOpen && logSlot === slot} aria-controls={loggingOpen && logSlot === slot ? "nutrition-log-editor" : undefined} onClick={() => {
                  if (loggingOpen && logSlot === slot) closeLogEditor();
                  else { setEntryReviewing(false); setLoggingOpen(true); setLogSlot(slot); setMode("search"); }
                }}><Plus className="h-4 w-4" aria-hidden /> Add meal</Button>
              </div>
              {loggingOpen && logSlot === slot ? <div id="nutrition-log-editor" className="mt-3 min-w-0 rounded-2xl bg-cream p-3 max-[400px]:p-2" role="group" aria-label="Add meal">
                {!entryReviewing ? <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Entry type">
                    {(["search", "custom"] as Mode[]).map(entryMode => <button key={entryMode} type="button" role="tab" aria-selected={mode === entryMode} disabled={entrySaving || Boolean(pendingMutation)} onClick={() => setMode(entryMode)} className={`min-h-11 rounded-full px-3 text-xs font-extrabold ${mode === entryMode ? "bg-ink text-white" : "bg-white text-ink"}`}>{entryMode === "search" ? "Search or describe" : "Enter manually"}</button>)}
                  </div>
                  <Button variant="ghost" className="!min-h-11 !px-3 text-xs" disabled={entrySaving || Boolean(pendingMutation)} onClick={closeLogEditor}>Close</Button>
                </div> : null}
                {mode === "search" ? <GuidedSearchPicker key={snapshot.userId + ":" + selected + ":" + slot} slot={slot} onMode={setMode} onDone={closeLogEditor} onSavingChange={setEntrySaving} onReviewingChange={setEntryReviewing} foods={foods} snapshot={snapshot} actions={actions} selected={selected} canAddPlan={canAddPlan} carbLimit={carbLimit} addToPlan={addToPlan} pendingMutation={pendingMutation} /> : <CustomForm slot={slot} onDone={closeLogEditor} />}
              </div> : null}
              {planned.length > 0 ? <ul className="mt-2 grid min-w-0 gap-1.5">
                {planned.map((pm) => {
                  const canLog = canLogPlanned(pm);
                  const recipe = pm.mealId ? snapshot.savedMeals.find(meal => meal.id === pm.mealId) : undefined;
                  const nutrition = plannedMealNutrition(pm, snapshot.savedMeals, foods);
                  const summary = <>
                      <span className="block text-[11px] font-bold text-ink-soft">Planned{pm.skipped ? " · skipped" : ""}</span>
                      <span className="block break-words text-sm font-extrabold">{canLog ? pm.label : "Unresolved meal"}</span>
                      <span className="block text-[11px] font-semibold text-ink-soft">{slotLabels[slot]} · {pm.servings} {pm.servings === 1 ? "serving" : "servings"}</span>
                      {nutrition ? <NutritionPills className="mt-1" values={nutrition} approximate precision={0} label="Planned portion nutrition" />
                        : <span className="mt-1 block text-xs font-semibold text-ink-soft">Nutrition unavailable</span>}
                      {pm.source ? <span className="mt-1 block break-words text-[11px] font-semibold text-ink-soft">{pm.source}</span> : null}
                    </>;
                  return <MealRow key={pm.id} summary={recipe
                    ? <button type="button" className="min-h-11 w-full min-w-0 rounded-lg text-left" aria-label={`View recipe: ${pm.label}`} onClick={event => openRecipe(recipe, event.currentTarget)}>{summary}</button>
                    : <div className="min-w-0">{summary}</div>} actions={<>
                        <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink" aria-label="Edit" title={`Edit planned ${pm.label}`} aria-expanded={editingPlannedMealId === pm.id} onClick={event => { plannedEditReturnFocus.current = event.currentTarget; setEditingPlannedMealId(pm.id); }}><Pencil className="h-4 w-4" aria-hidden /></button>
                        <Button variant="soft" className="!min-h-11 !rounded-full !px-3 text-xs" onClick={() => void actions.skipPlannedMeal(pm.id)}>{pm.skipped ? "Plan again" : "Skip"}</Button>
                        <Button id={`log-planned-${pm.id}`} className="!min-h-11 !rounded-full !px-3 text-xs" disabled={!canLog} title={canLog ? undefined : "Edit this unresolved meal before logging it"} onClick={() => openPlannedLog(pm, pm.id)}>Log</Button>
                      </>}>
                      {!canLog ? <p className="text-xs font-semibold text-ink-soft">Choose a meal that fits your restrictions. Edit this unresolved item before it can be logged.</p> : null}
                      {plannedLogConfirmation(pm, pm.id, `log-planned-${pm.id}`)}
                      {editingPlannedMealId === pm.id ? <PlannedMealEditor key={pm.id} plannedMeal={pm} date={selected} savedMeals={snapshot.savedMeals} foods={foods} onSave={savePlannedMeal} onCancel={() => setEditingPlannedMealId(null)} /> : null}
                    </MealRow>;
                })}
              </ul> : null}
              {eaten ? <ul className="mt-2 grid min-w-0 gap-1.5">{loggedRows(slot)}</ul> : null}
              {!planned.length && !eaten ? <p className="mt-2 rounded-xl bg-cream px-3 py-3 text-sm font-semibold text-muted">Nothing planned or logged.</p> : null}
            </section>;
          })}
        </div>
        {carbLimit !== null ? <p className="mt-3 text-xs font-semibold text-ink-soft">{snapshot.profile?.dietaryPattern}: at most {carbLimit} g total carbs per planned day.</p> : null}
      </Card>
      {/* Saved meals */}
      <Card role="region" aria-labelledby="saved-meals-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-1"><h2 id="saved-meals-heading" className="font-extrabold">Saved meals</h2><HelpPopover title="Saved meals"><p>Create, reuse, or adjust recipes without changing logged history.</p><p>Card calories are per serving. The pie pill shows how many servings the whole recipe yields. Log records food you ate after choosing a meal slot and confirming.</p></HelpPopover></div>
          </div>
          <Button
            variant="soft"
            className="!min-h-11 !px-3 text-xs"
            onClick={(event) => { recipeReturnFocus.current = event.currentTarget; setReturnToRecipeOverview(null); setViewingRecipeId(null); setShowNewRecipe(true); setEditingRecipeId(null); setRecipeModalOpen(true); }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Create
          </Button>
        </div>
        {showNewRecipe || editingRecipeId ? (
          <RecipeEditor
            key={`recipe-editor:${editingRecipeId ?? "new"}`}
            open={recipeModalOpen}
            returnFocus={recipeReturnFocus}
            meal={editingRecipeId ? snapshot.savedMeals.find((meal) => meal.id === editingRecipeId) : undefined}            onSave={(input) => actions.saveRecipe(input)}
            onSaved={(mealId) => { setRecipeModalOpen(false); setShowNewRecipe(false); setEditingRecipeId(null); if (returnToRecipeOverview) setViewingRecipeId(mealId); }}
            foods={foods}
            onCancel={() => { setRecipeModalOpen(false); if (returnToRecipeOverview) setViewingRecipeId(returnToRecipeOverview); }}
          />
        ) : null}
        {viewingRecipeId && snapshot.savedMeals.find(meal => meal.id === viewingRecipeId) ? <RecipeOverview
          key={`recipe-overview:${viewingRecipeId}`} meal={snapshot.savedMeals.find(meal => meal.id === viewingRecipeId)!} foods={foods} returnFocus={recipeReturnFocus}
          onClose={() => setViewingRecipeId(null)}
          onEdit={() => { setReturnToRecipeOverview(viewingRecipeId); setEditingRecipeId(snapshot.savedMeals.find(meal => meal.id === viewingRecipeId)?.catalogReplacementId ?? viewingRecipeId); setShowNewRecipe(false); setViewingRecipeId(null); setRecipeModalOpen(true); }}
        /> : null}
        {recipeMetadata.loading ? <p className="mt-3 text-xs text-ink-soft" role="status">Loading favorites and Popular…</p> : null}
        {recipeMetadata.error ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-peach-50 p-3 text-xs text-ink-soft" role="status"><span>{recipeMetadata.error}</span><Button variant="ghost" className="!px-2 text-xs underline" disabled={recipeMetadata.loading || recipeMetadata.pendingMeal !== null} onClick={recipeMetadata.refresh}>Refresh cards</Button></div> : null}
        <ul className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
          {snapshot.savedMeals.filter(meal => !meal.archivedAt).map((meal) => (
            <li key={meal.id} className="min-w-0">
              <RecipeCard name={meal.name} image={meal.image} calories={recipeCardCalories(meal, foods)}
                recipeServings={meal.servings} totalTimeMinutes={meal.totalTimeMinutes} complexity={meal.complexity}
                onOpen={event => openRecipe(meal, event.currentTarget)} metadata={recipeMetadata.recipes.get(meal.id)}
                favoriteAvailable={recipeMetadata.available} favoritePending={recipeMetadata.pendingMeal !== null}
                onFavorite={() => void recipeMetadata.favorite(meal.id)}
                actions={<div className="flex flex-wrap items-center gap-2">
                  <Button id={`log-it-${meal.id}`} className="min-w-[96px] flex-[1_1_96px] !px-3 text-xs"
                    aria-expanded={savedMealToLog === meal.id} aria-controls={savedMealToLog === meal.id ? `saved-meal-picker-${meal.id}` : undefined}
                    disabled={savingSavedMeal || Boolean(pendingMutation)} onClick={() => { setSavedMealToLog(savedMealToLog === meal.id ? null : meal.id); setSavedMealSlot(null); }}>Log<Plus className="h-4 w-4 shrink-0" aria-hidden /></Button>
                  <div className="flex shrink-0 gap-2">
                    <IconButton label={`Edit ${meal.name}`} tooltip="Edit" disabled={savingSavedMeal || Boolean(pendingMutation)} onClick={event => { recipeReturnFocus.current = event.currentTarget; setReturnToRecipeOverview(null); setViewingRecipeId(null); setEditingRecipeId(meal.catalogReplacementId ?? meal.id); setShowNewRecipe(false); setRecipeModalOpen(true); }}><Pencil className="h-4 w-4" aria-hidden /></IconButton>
                    <IconButton label={`Archive ${meal.name}`} tooltip="Archive" disabled={savingSavedMeal || Boolean(pendingMutation)} onClick={() => void actions.archiveMeal(meal.id)}><Archive className="h-4 w-4" aria-hidden /></IconButton>
                  </div>
                </div>}>
              {savedMealToLog === meal.id ? <div id={`saved-meal-picker-${meal.id}`} className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 sm:col-span-2" role="group" aria-label={`Log ${meal.name}`}>
                {meal.ingredients.length > 0 && meal.ingredients.every((ingredient) => foods.some((food) => food.id === ingredient.foodId)) ? <NutritionPills className="w-full" label="Saved meal nutrition" values={mealNutrition(meal, foods)} precision={0} approximate /> : null}
                <label className="grid min-w-40 flex-1 gap-1 text-xs font-bold text-ink-soft" htmlFor={`saved-meal-slot-${meal.id}`}>
                  Meal slot
                  <select id={`saved-meal-slot-${meal.id}`} className="input" value={savedMealSlot ?? ""} required onChange={(event) => setSavedMealSlot(event.target.value ? event.target.value as MealSlot : null)}>
                    <option value="">Choose a slot</option>
                    {SLOTS.map((slot) => <option key={slot} value={slot}>{slotLabels[slot]}</option>)}
                  </select>
                </label>
                <Button className="!min-h-11 !px-3 text-xs" disabled={!savedMealSlot || savingSavedMeal} onClick={async () => {
                  if (!savedMealSlot) return;
                  setSavingSavedMeal(true);
                  try {
                    const saved = await logMeal(actions, meal.ingredients, selected, savedMealSlot, meal, foods);
                    if (saved) { document.getElementById(`log-it-${meal.id}`)?.focus(); setSavedMealToLog(null); setSavedMealSlot(null); }
                  } finally {
                    setSavingSavedMeal(false);
                  }
                }}>{savingSavedMeal ? "Saving…" : "Confirm log"}</Button>
                <Button variant="ghost" className="!min-h-11 !px-3 text-xs" disabled={savingSavedMeal} onClick={() => { document.getElementById(`log-it-${meal.id}`)?.focus(); setSavedMealToLog(null); setSavedMealSlot(null); }}>Cancel</Button>
              </div> : null}
              </RecipeCard>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );

  function SearchPicker({
    slot,
    query,
    onQuery,
    onDone,
    foods,
  }: {
    slot: MealSlot;
    query: string;
    onQuery: (q: string) => void;
    onDone: () => void;
    foods: Food[];
  }) {
    const [providerLoading, setProviderLoading] = useState(false);
    const [providerError, setProviderError] = useState("");
    const [providerResults, setProviderResults] = useState<Awaited<ReturnType<typeof searchNutritionProvider>>>({ candidates: [] });
    const results = searchFoods(foods, query);
    const runProviderSearch = async (cursor?: string) => {
      setProviderLoading(true);
      setProviderError("");
      try {
        const provider = await searchNutritionProvider(createClient(), query, cursor);
        setProviderResults((current) => cursor
          ? { candidates: [...current.candidates, ...provider.candidates], nextCursor: provider.nextCursor }
          : provider);
      } catch (error) {
        setProviderError(error instanceof Error ? error.message : "Trusted food search is unavailable right now.");
      } finally {
        setProviderLoading(false);
      }
    };
    return (
      <div className="mt-3">
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search foods (egg, rice, tofu…)"
          className="input"
          aria-label="Search the food catalog"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="soft"
            className="!min-h-11 !px-3 text-xs"
            disabled={providerLoading || query.trim().length < 2}
            onClick={() => void runProviderSearch()}
          >
            {providerLoading ? "Searching USDA…" : "Search trusted USDA data"}
          </Button>
          <span className="text-[11px] font-semibold text-muted">Provider results are imported only after you review and confirm them.</span>
        </div>
        {providerError ? <p className="mt-2 text-[11px] font-bold text-coral-300" role="alert">{providerError}</p> : null}
        <ul className="mt-2 grid gap-1">
          {results.map(({ food, kind }) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={async () => {
                  if (await addFood(actions, slot, selected, food, 1)) onDone();
                }}
                className="flex min-h-11 w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold"
              >
                <span>
                  {food.name}
                  {kind === "close" ? <span className="ml-2 text-xs font-semibold text-ink-soft">Close match</span> : null}
                  <span className="block text-[11px] font-semibold text-muted">
                    {food.servingLabel}
                  </span><NutritionPills className="mt-1" values={{ calories: food.calories }} />
                </span>
                <Plus className="h-4 w-4 text-muted" aria-hidden />
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-muted">
              No match — add it under <strong>Custom</strong> or describe it in
              <strong> Text</strong>.
            </li>
          ) : null}
        </ul>
        {providerResults.candidates.length > 0 ? (
          <div className="mt-3 rounded-xl bg-mint-100 p-2">
            <p className="text-[11px] font-extrabold uppercase tracking-wide">USDA FoodData Central</p>
            <ul className="mt-1 grid gap-1">
              {providerResults.candidates.map((candidate) => (
                <li key={candidate.fdcId}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold"
                    onClick={async () => {
                      const imported: Food = {
                        ...candidate,
                        id: `food-fdc-${candidate.fdcId}`,
                        category: "Other",
                        valueSource: "trusted_catalog",
                      };
                      if (await actions.saveFood(imported)) {
                        if (await addFood(actions, slot, selected, imported, 1)) onDone();
                      }
                    }}
                  >
                    <span>{candidate.name}<span className="block text-[11px] font-semibold text-ink-soft">{candidate.servingLabel} · confirmed provider record</span><NutritionPills className="mt-1" values={{ calories: candidate.calories }} /></span>
                    <Check className="h-4 w-4 text-muted" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            {providerResults.nextCursor ? (
              <Button variant="ghost" className="mt-1 !min-h-11 !px-3 text-xs" disabled={providerLoading} onClick={() => void runProviderSearch(providerResults.nextCursor)}>
                {providerLoading ? "Loading…" : "Load more trusted results"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function CustomForm({ slot, onDone }: { slot: MealSlot; onDone: () => void }) {
    const [name, setName] = useState("");
    const [calories, setCalories] = useState("");
    const [protein, setProtein] = useState("");
    const [carbs, setCarbs] = useState("");
    const [fat, setFat] = useState("");
    const [servingGrams, setServingGrams] = useState("100");
    const [unit, setUnit] = useState<Food["unit"]>("g");
    const [assumption, setAssumption] = useState("");
    const [restored, setRestored] = useState(false);
    const [draftWasRestored, setDraftWasRestored] = useState(false);
    const [draftWriteUnavailable, setDraftWriteUnavailable] = useState(false);
    const initialDraftWriteSkipped = useRef(false);
    const draftType = `nutrition-custom:${selected}:${slot}`;
    const userId = snapshot.userId;
    const profileRevision = snapshot.profile?.revision;
    useEffect(() => {
      if (!userId) return;
      let active = true;
      void readDraft<{ name: string; calories: string; protein: string; carbs: string; fat: string; servingGrams: string; unit: Food["unit"]; assumption: string }>(userId, draftType).then((saved) => {
        if (!active) return;
        if (saved) {
          setName(saved.payload.name);
          setCalories(saved.payload.calories);
          setProtein(saved.payload.protein);
          setCarbs(saved.payload.carbs);
          setFat(saved.payload.fat);
          setServingGrams(saved.payload.servingGrams);
          setUnit(saved.payload.unit);
          setAssumption(saved.payload.assumption);
          setDraftWasRestored(true);
        }
        setRestored(true);
      });
      return () => { active = false; };
    }, [draftType, userId]);
    useEffect(() => {
      if (!restored || !userId) return;
      // Do not overwrite a restored payload with the form's initial values
      // during the hydration render. Subsequent user edits still autosave.
      if (!initialDraftWriteSkipped.current) {
        initialDraftWriteSkipped.current = true;
        return;
      }
      void writeDraft(createDraftEnvelope({
        userId,
        draftType,
        payload: { name, calories, protein, carbs, fat, servingGrams, unit, assumption },
        baseVersions: { profileRevision },
      ttlMs: draftTtlMs(draftType),
    })).then((saved) => setDraftWriteUnavailable(!saved));
    }, [assumption, calories, carbs, draftType, fat, name, profileRevision, protein, restored, servingGrams, unit, userId]);
    const numericFields = [calories, protein, carbs, fat];
    const validNumbers = numericFields.every(
      (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0),
    );
    const valid = Boolean(
      name.trim() &&
        numericFields.every((value) => value !== "") &&
        validNumbers,
    );
    return (
      <div className="mt-3 grid gap-2">
        {draftWasRestored ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-mint-100 px-3 py-2 text-xs font-bold" role="status">
            <span>Draft restored from this device.</span>
            <button
              type="button"
              className="shrink-0 underline underline-offset-2"
              onClick={() => {
                if (snapshot.userId) void clearDraft(snapshot.userId, draftType);
                setDraftWasRestored(false);
                onDone();
              }}
            >
              Discard draft
            </button>
          </div>
        ) : null}
        {draftWriteUnavailable ? (
          <p className="rounded-xl bg-peach-100 px-3 py-2 text-[11px] font-bold text-ink-soft" role="status">
            Draft recovery is unavailable on this device right now. Keep this form open until the entry is confirmed.
          </p>
        ) : null}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Food name"
          className="input"
          aria-label="Custom food name"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "kcal", metric: "calories", value: calories, set: setCalories },
            { label: "P g", metric: "proteinG", value: protein, set: setProtein },
            { label: "C g", metric: "carbsG", value: carbs, set: setCarbs },
            { label: "F g", metric: "fatG", value: fat, set: setFat },
          ].map((field) => (
            <NutritionFieldLabel key={field.metric} metric={field.metric as NutritionMetric}><input
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              placeholder={field.label}
              aria-label={field.label}
              inputMode="decimal"
              className="input !min-h-11 text-sm"
            /></NutritionFieldLabel>
          ))}
        </div>
        {numericFields.every((value) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) ? <NutritionPills label="Manual nutrition preview" values={{ calories: Number(calories), proteinG: Number(protein), carbsG: Number(carbs), fatG: Number(fat) }} /> : null}
        <div className="grid grid-cols-2 gap-2">
          <input value={servingGrams} onChange={(e) => setServingGrams(e.target.value)} placeholder="Serving grams" aria-label="Serving grams" inputMode="decimal" className="input !min-h-11 text-sm" />
          <select value={unit} onChange={(e) => setUnit(e.target.value as Food["unit"])} aria-label="Serving unit" className="input !min-h-11 text-sm"><option value="g">grams</option><option value="piece">piece</option></select>
        </div>
        <input
          value={assumption}
          onChange={(e) => setAssumption(e.target.value)}
          placeholder="Assumption (e.g. restaurant portion estimate)"
          className="input"
          aria-label="Assumption note"
        />
        <Button
          disabled={!valid}
          onClick={async () => {
            const saved = await actions.logNutrition({
              date: selected,
              slot,
              customName: name.trim(),
              servings: 1,
              servingQuantity: Number(servingGrams),
              servingUnit: unit,
              calories: Number(calories) || 0,
              proteinG: Number(protein) || 0,
              carbsG: Number(carbs) || 0,
              fatG: Number(fat) || 0,
              estimated: false,
              confidence: "high",
              source: "User-provided",
              valueSource: "user_provided",
             assumptions: assumption || undefined,
            });
            if (saved) {
              if (snapshot.userId) void clearDraft(snapshot.userId, draftType);
              onDone();
            }
          }}
        >
          Log meal
        </Button>
        <Button
          variant="soft"
          disabled={!valid || !canAddPlan || carbLimit !== null || !Number.isFinite(Number(servingGrams)) || Number(servingGrams) <= 0}
          onClick={async () => {
            const grams = Number(servingGrams);
            const food: Food = {
              id: clientId("food-custom"), name: name.trim(), servingLabel: `${grams} g serving`, servingGrams: grams,
              unit, calories: Number(calories), proteinG: Number(protein), carbsG: Number(carbs), fatG: Number(fat),
              source: "User-provided", sourceVersion: "user-v1", valueSource: "user_provided",
              estimated: false, confidence: "medium", category: "Other", preparationBasis: "as_labeled",
            };
            if (await addToPlan(slot, { food, servings: 1, newFoods: [food] })) {
              if (snapshot.userId) void clearDraft(snapshot.userId, draftType);
              onDone();
            }
          }}
        >Add to plan</Button>
        {carbLimit !== null ? <p className="text-xs font-semibold text-muted">This carb-limited plan requires trusted catalog nutrition. You can still log your own values.</p> : null}
        <Button
          variant="soft"
          disabled={!valid || !Number.isFinite(Number(servingGrams)) || Number(servingGrams) <= 0}
          onClick={async () => {
            const grams = Number(servingGrams);
            const id = clientId("food-custom");
            const scale = 100 / grams;
            const reusable: Omit<Food, "id"> & { id: string } = {
              id,
              name: name.trim(),
              servingLabel: `${grams} g serving`,
              servingGrams: grams,
              unit,
              calories: Number(calories),
              proteinG: Number(protein),
              carbsG: Number(carbs),
              fatG: Number(fat),
              source: "User-provided",
              sourceVersion: "user-v1",
              estimated: false,
              confidence: "medium",
              valueSource: "user_provided",
              category: "Other",
              preparationBasis: "as_labeled",
              nutrientsPer100g: {
                calories: Math.round(Number(calories) * scale * 100) / 100,
                proteinG: Math.round(Number(protein) * scale * 100) / 100,
                carbsG: Math.round(Number(carbs) * scale * 100) / 100,
                fatG: Math.round(Number(fat) * scale * 100) / 100,
              },
            };
            if (await actions.saveFood(reusable) && await actions.logNutrition({
              date: selected,
              slot,
              foodId: id,
              servings: 1,
              servingQuantity: unit === "piece" ? 1 : grams,
              servingUnit: unit,
              calories: Number(calories),
              proteinG: Number(protein),
              carbsG: Number(carbs),
              fatG: Number(fat),
              estimated: false,
              confidence: "medium",
              source: "User-provided",
              valueSource: "user_provided",
              sourceVersion: "user-v1",
              preparationBasis: "as_labeled",
              assumptions: assumption || undefined,
            })) {
              if (snapshot.userId) void clearDraft(snapshot.userId, draftType);
              onDone();
            }
          }}
        >
          Save to My Foods & log
        </Button>
        {!validNumbers ? (
          <p className="text-[11px] font-bold text-coral-300">
            Nutrition values must be finite, non-negative numbers.
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-ink-soft">Enter all four nutrition values.</p><HelpPopover title="Manual nutrition"><p>Custom entries are marked as your values, distinct from catalog estimates.</p></HelpPopover></div>
      </div>
    );
  }

  function TextParser({ slot, onDone, foods }: { slot: MealSlot; onDone: () => void; foods: Food[] }) {
    const [text, setText] = useState("");
    const [candidates, setCandidates] = useState<ParsedCandidate[]>([]);
    const [restored, setRestored] = useState(false);
    const [draftWasRestored, setDraftWasRestored] = useState(false);
    const [draftWriteUnavailable, setDraftWriteUnavailable] = useState(false);
    const [providerLoading, setProviderLoading] = useState(false);
    const [providerError, setProviderError] = useState("");
    const draftType = `nutrition-text:${selected}:${slot}`;
    const userId = snapshot.userId;
    const profileRevision = snapshot.profile?.revision;
    useEffect(() => {
      if (!userId) return;
      let active = true;
      void readDraft<{ text: string; candidates: Array<Partial<ParsedCandidate> & Pick<ParsedCandidate, "name" | "quantity">> }>(userId, draftType).then((saved) => {
        if (!active) return;
        if (saved) {
          setText(saved.payload.text);
          setCandidates(saved.payload.candidates.map((candidate, index) => restoreTextCandidate(candidate, foods, index)));
          setDraftWasRestored(true);
        }
        setRestored(true);
      });
      return () => { active = false; };
    }, [draftType, foods, userId]);
    useEffect(() => {
      if (!restored || !userId) return;
      void writeDraft(createDraftEnvelope({
        userId,
        draftType,
        payload: { text, candidates },
        baseVersions: { profileRevision },
      ttlMs: draftTtlMs(draftType),
    })).then((saved) => setDraftWriteUnavailable(!saved));
    }, [candidates, draftType, profileRevision, restored, text, userId]);

    const review = async () => {
      setProviderLoading(true);
      setProviderError("");
      try {
        const extracted = await parseNutritionTextWithProvider(createClient(), text);
        setCandidates(extracted.candidates.map((candidate, index) => {
          const normalized = candidate.name.toLowerCase();
          const matched = foods.find((food) => normalized.includes(food.name.toLowerCase()))
            ?? foods.find((food) => food.name.toLowerCase().split(" ").some((word) => word.length > 3 && normalized.includes(word)))
            ?? null;
          const servingPlan = matched ? servingPlanForCandidate(matched, candidate.quantity, candidate.unit) : null;
          const assumptions = [
            ...candidate.assumptions,
            ...(matched ? [] : ["No trusted catalog match — confirm or create a food before saving."]),
            ...(matched && !servingPlan
              ? [`The requested unit "${candidate.unit}" does not match the trusted serving basis (${matched.servingLabel}). Correct the quantity or add a custom food before saving.`]
              : []),
            ...(servingPlan?.note ? [servingPlan.note] : []),
          ];
          return {
            id: `provider-${index}`,
            raw: candidate.name,
            name: candidate.name,
            quantity: candidate.quantity,
            unit: candidate.unit,
            matched,
            servingPlan,
            confidence: matched && servingPlan ? candidate.confidence : "low",
            assumptions,
            ...(candidate.presence === "possible_hidden" ? { assumptions: [...assumptions, "Possible hidden ingredient — excluded until you confirm it."] } : {}),
          } satisfies ParsedCandidate;
        }));
      } catch (error) {
        setProviderError(error instanceof Error ? error.message : "AI review is unavailable; using the safe local parser.");
        setCandidates(parseMealText(text, foods));
      } finally {
        setProviderLoading(false);
      }
    };

    return (
      <div className="mt-3 grid gap-2">
        {draftWasRestored ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-mint-100 px-3 py-2 text-xs font-bold" role="status">
            <span>Text draft restored from this device.</span>
            <button
              type="button"
              className="shrink-0 underline underline-offset-2"
              onClick={() => {
                if (snapshot.userId) void clearDraft(snapshot.userId, draftType);
                setDraftWasRestored(false);
                onDone();
              }}
            >
              Discard draft
            </button>
          </div>
        ) : null}
        {draftWriteUnavailable ? (
          <p className="rounded-xl bg-peach-100 px-3 py-2 text-[11px] font-bold text-ink-soft" role="status">
            Draft recovery is unavailable on this device right now. Keep this form open until the entry is confirmed.
          </p>
        ) : null}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Two eggs, two slices of whole wheat toast with butter, and a banana"
          className="input"
          aria-label="Describe the meal in plain text"
        />
        <Button variant="soft" onClick={() => void review()} disabled={!text.trim() || providerLoading}>
          <Sparkles className="h-4 w-4" aria-hidden /> {providerLoading ? "Reviewing…" : "Review estimate"}
        </Button>
        {providerError ? <p className="text-[11px] font-bold text-coral-300" role="status">{providerError}</p> : null}
        {candidates.length > 0 ? (
          <ul className="grid gap-1.5">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="rounded-xl bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">
                      {candidate.matched?.name ?? candidate.name} ×{candidate.quantity} {candidate.unit}
                    </p>
                    {candidate.matched && candidate.servingPlan ? <NutritionPills values={{ calories: candidate.matched.calories * candidate.servingPlan.servings }} precision={0} /> : null}
                    <p className="text-[11px] font-semibold text-muted">{candidate.matched && candidate.servingPlan ? candidate.matched.servingLabel : candidate.matched ? "serving basis needs correction" : "no catalog match"}</p>
                    {candidate.assumptions.length > 0 ? (
                      <p className="mt-0.5 flex items-start gap-1 text-[11px] font-semibold text-muted">
                        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        {candidate.assumptions.join(" ")}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${confidenceClasses[candidate.confidence]}`}
                  >
                    {candidate.confidence}
                  </span>
                </div>
                {candidate.matched && candidate.servingPlan ? (
                  <Button
                    variant="ghost"
                    className="!min-h-11 !px-3 text-xs"
                    onClick={async () => {
                      if (await addFood(actions, slot, selected, candidate.matched!, candidate.servingPlan!)) {
                        if (snapshot.userId) void clearDraft(snapshot.userId, draftType);
                        onDone();
                      }
                    }}
                  >
                    <Check className="h-4 w-4" aria-hidden /> Confirm & save
                  </Button>
                ) : (
                  <p className="mt-1 text-[11px] font-bold text-coral-300">
                    {candidate.matched
                      ? "Correct the serving unit or add a custom entry — this gets no false precision."
                      : "Correct or add a custom entry — this gets no false precision."}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <HelpPopover title="Nutrition sources"><p>DeepSeek only extracts candidates. Matched catalog values are authoritative. Unresolved ingredients may use explicit, low-confidence AI ranges after review and confirmation.</p></HelpPopover>
      </div>
    );
  }
}

function clientId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function LoggedMealEditor({
  meal,
  entries,
  foods,
  onSave,
  onCancel,
}: {
  meal: LoggedMeal;
  entries: NutritionLog[];
  foods: Food[];
  onSave: (meal: LoggedMeal, ingredients: Array<Omit<NutritionLog, "id" | "createdAt">>) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(meal.name);
  const [items, setItems] = useState(() => entries.map((entry) => ({
    id: entry.id,
    foodId: entry.foodId ?? "",
    servings: String(entry.servings),
  })));
  const [saving, setSaving] = useState(false);

  async function submit() {
    const drafts = items
      .map((item) => ({ ...item, servings: Number(item.servings) }))
      .filter((item) => item.foodId && Number.isFinite(item.servings) && item.servings > 0);
    if (!name.trim() || drafts.length === 0 || drafts.length !== items.length) return;
    const ingredients = drafts.map((item) => {
      const food = foods.find((candidate) => candidate.id === item.foodId)!;
      const macros = foodMacros(food, item.servings);
      return {
        date: meal.date,
        slot: meal.slot,
        foodId: food.id,
        servings: item.servings,
        servingQuantity: food.unit === "piece" ? item.servings : food.servingGrams * item.servings,
        servingUnit: food.unit,
        calories: macros.calories,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
        ...(food.fiberG === undefined ? {} : { fiberG: Math.round(food.fiberG * item.servings * 10) / 10 }),
        estimated: food.estimated,
        confidence: food.confidence,
        source: food.source,
        sourceVersion: food.sourceVersion,
        preparationBasis: food.preparationBasis ?? "as_labeled",
        valueSource: food.valueSource,
        ...(food.estimateRange ? { estimateRange: food.estimateRange } : {}),
      };
    });
    setSaving(true);
    try {
      await onSave({ ...meal, name: name.trim() }, ingredients);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-xl bg-white p-3" role="group" aria-label="Edit logged meal history">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} aria-label="Historical meal name" />
        <span className="text-[11px] font-semibold text-muted">Historical snapshot only</span>
      </div>
      <HelpHeading title="Edit logged meal" as="h3" className="text-sm font-extrabold"><p>Change ingredients or quantities for this logged meal. The reusable recipe stays unchanged.</p></HelpHeading>
      {items.map((item, index) => (
        <div key={item.id} className="grid gap-2 rounded-xl bg-cream p-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <select className="input !min-h-11 text-xs" value={item.foodId} onChange={(event) => setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, foodId: event.target.value } : candidate))} aria-label={`Historical ingredient ${index + 1}`}>
            <option value="">Choose a catalog record</option>
            {foods.map((food) => <option key={food.id} value={food.id}>{food.name} · {food.valueSource === "trusted_catalog" ? "trusted" : food.valueSource === "ai_estimate" ? "AI estimate" : food.valueSource}</option>)}
          </select>
          <input className="input !min-h-11 text-xs sm:max-w-28" type="number" min="0.01" step="0.25" value={item.servings} onChange={(event) => setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, servings: event.target.value } : candidate))} aria-label={`Historical ingredient ${index + 1} quantity`} />
          <button type="button" className="min-h-11 px-2 text-xs font-bold underline" onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}>Remove</button>
        </div>
      ))}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={onCancel}>Discard changes</Button>
        <Button className="!min-h-11 !px-3 text-xs" disabled={saving || items.length === 0} onClick={() => void submit()}>{saving ? "Saving…" : "Save historical correction"}</Button>
      </div>
    </div>
  );
}

function NutritionEditForm({
  entry,
  foods,
  onSave,
  onCancel,
}: {
  entry: NutritionLog;
  foods: Food[];
  onSave: (entry: NutritionLog) => Promise<boolean>;
  onCancel: () => void;
}) {
  const food = entry.foodId ? foods.find((candidate) => candidate.id === entry.foodId) : undefined;
  const [servings, setServings] = useState(String(entry.servings));
  const [calories, setCalories] = useState(String(entry.calories));
  const [protein, setProtein] = useState(String(entry.proteinG));
  const [carbs, setCarbs] = useState(String(entry.carbsG));
  const [fat, setFat] = useState(String(entry.fatG));
  const [fiber, setFiber] = useState(entry.fiberG === undefined ? "" : String(entry.fiberG));
  const [saving, setSaving] = useState(false);

  function valuesFor(nextServings: number) {
    if (!food) return null;
    const macros = foodMacros(food, nextServings);
    return {
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
      ...(food.fiberG === undefined ? {} : { fiberG: Math.round(food.fiberG * nextServings * 10) / 10 }),
    };
  }

  const previewAmount = Number(servings);
  const previewValues = servings.trim() !== "" && Number.isFinite(previewAmount) && previewAmount > 0
    ? food ? valuesFor(previewAmount) : [calories, protein, carbs, fat].every((value) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0)
      ? { calories: Number(calories), proteinG: Number(protein), carbsG: Number(carbs), fatG: Number(fat) } : null
    : null;

  const submit = async () => {
    const nextServings = Number(servings);
    if (!Number.isFinite(nextServings) || nextServings <= 0) return;
    const catalogValues = valuesFor(nextServings);
    const next: NutritionLog = {
      ...entry,
      servings: nextServings,
      ...(catalogValues ?? {
        calories: Number(calories),
        proteinG: Number(protein),
        carbsG: Number(carbs),
        fatG: Number(fat),
        ...(fiber === "" ? {} : { fiberG: Number(fiber) }),
      }),
    };
    setSaving(true);
    try { await onSave(next); } finally { setSaving(false); }
  };

  return (
    <div className="grid gap-2 rounded-xl bg-lav-50 p-3 sm:col-span-2" role="group" aria-label="Edit nutrition entry">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="flex items-center justify-between gap-2"><p className="text-xs font-extrabold">Edit saved entry{food ? ` · ${food.name}` : ""}</p><HelpPopover title="Saved entry corrections"><p>Catalog values are recalculated from the stored food record. Custom values remain explicitly user-provided. Corrections apply to this saved entry only.</p></HelpPopover></div>
        <input className="input !min-h-11" type="number" min="0.01" step="0.25" value={servings} onChange={(event) => setServings(event.target.value)} aria-label="Servings" />
      </div>
      {!food ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { label: "Calories", metric: "calories", value: calories, set: setCalories },
            { label: "Protein", metric: "proteinG", value: protein, set: setProtein },
            { label: "Carbs", metric: "carbsG", value: carbs, set: setCarbs },
            { label: "Fat", metric: "fatG", value: fat, set: setFat },
            { label: "Fiber", metric: "fiberG", value: fiber, set: setFiber },
          ].map((field) => (
            <NutritionFieldLabel key={field.metric} metric={field.metric as NutritionMetric | "fiberG"}><input className="input !min-h-11 text-xs" type="number" min="0" step="0.1" value={field.value} onChange={(event) => field.set(event.target.value)} aria-label={field.label} /></NutritionFieldLabel>
          ))}
        </div>
      ) : null}
      {previewValues ? <NutritionPills label="Correction nutrition preview" values={previewValues} /> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={onCancel}>Cancel</Button>
        <Button className="!min-h-11 !px-3 text-xs" disabled={saving} onClick={() => void submit()}>{saving ? "Saving…" : "Save correction"}</Button>
      </div>
    </div>
  );
}

function PlannedMealEditor({
  plannedMeal,
  date,
  savedMeals,
  foods,
  onSave,
  onCancel,
}: {
  plannedMeal?: PlannedMeal;
  date: string;
  savedMeals: Meal[];
  foods: Food[];
  onSave: (meal: PlannedMeal) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { snapshot: draftSnapshot } = useApp();
  const availableMeals = savedMeals.filter((meal) => !meal.archivedAt);
  const initialReference = plannedMeal?.mealId
    ? `meal:${plannedMeal.mealId}`
    : plannedMeal?.foodId
      ? `food:${plannedMeal.foodId}`
      : availableMeals[0]
        ? `meal:${availableMeals[0].id}`
        : `food:${foods[0]?.id ?? ""}`;
  const [reference, setReference] = useState(initialReference);
  const [slot, setSlot] = useState<MealSlot>(plannedMeal?.slot ?? "snack");
  const [servings, setServings] = useState(String(plannedMeal?.servings ?? 1));
  const [saving, setSaving] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftWasRestored, setDraftWasRestored] = useState(false);
  const [draftWriteUnavailable, setDraftWriteUnavailable] = useState(false);
  const draftType = `planned-meal:${date}:${plannedMeal?.id ?? "new"}`;
  const choiceInput = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (draftReady) choiceInput.current?.focus();
  }, [draftReady]);
  useEffect(() => {
    if (!draftSnapshot.userId) return;
    let active = true;
    void readDraft<{ reference: string; slot: MealSlot; servings: string }>(draftSnapshot.userId, draftType).then((saved) => {
      if (!active) return;
      if (saved) {
        setReference(saved.payload.reference);
        setSlot(saved.payload.slot);
        setServings(saved.payload.servings);
        setDraftWasRestored(true);
      }
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [draftSnapshot.userId, draftType]);
  useEffect(() => {
    if (!draftReady || !draftSnapshot.userId) return;
    void writeDraft(createDraftEnvelope({
      userId: draftSnapshot.userId,
      draftType,
      payload: { reference, slot, servings },
      baseVersions: { mealPlanVersion: draftSnapshot.mealPlan?.version },
      ttlMs: draftTtlMs(draftType),
    })).then((saved) => setDraftWriteUnavailable(!saved));
  }, [draftReady, draftSnapshot.mealPlan?.version, draftSnapshot.userId, draftType, reference, servings, slot]);
  const selectedMeal = reference.startsWith("meal:")
    ? availableMeals.find((meal) => meal.id === reference.slice(5))
    : undefined;
  const selectedFood = reference.startsWith("food:")
    ? foods.find((food) => food.id === reference.slice(5))
    : undefined;
  const amount = Number(servings);

  async function submit() {
    if (!Number.isFinite(amount) || amount <= 0 || (!selectedMeal && !selectedFood)) return;
    const next: PlannedMeal = {
      id: plannedMeal?.id ?? clientId("pm"),
      date,
      slot,
      label: selectedMeal?.name ?? selectedFood?.name ?? "Choose a meal that fits",
      servings: amount,
      ...(plannedMeal?.skipped ? { skipped: true } : {}),
      ...(selectedMeal ? { mealId: selectedMeal.id } : { foodId: selectedFood!.id }),
      ...(selectedMeal
        ? (() => {
            const nutrition = mealNutrition(selectedMeal, foods).perServing;
            return {
              expectedCalories: Math.round(nutrition.calories * amount),
              expectedProteinG: Math.round(nutrition.proteinG * amount * 10) / 10,
              expectedCarbsG: Math.round(nutrition.carbsG * amount * 10) / 10,
              expectedFatG: Math.round(nutrition.fatG * amount * 10) / 10,
              source: selectedMeal.providedNutrition ? "source-provided" : "saved-meal",
              sourceVersion: selectedMeal.providedNutrition ? `recipe:${selectedMeal.id}:revision:${selectedMeal.revision ?? 1}` : "user-editable",
              assumptions: selectedMeal.providedNutrition ? "Source-provided nutrition per serving; not independently verified or recalculated from ingredients." : "Estimated from the saved recipe and catalog serving sizes.",
              confidence: "medium" as const,
              preparationBasis: "as_labeled" as const,
            };
          })()
        : {
            expectedCalories: Math.round(selectedFood!.calories * amount),
            expectedProteinG: Math.round(selectedFood!.proteinG * amount * 10) / 10,
            expectedCarbsG: Math.round(selectedFood!.carbsG * amount * 10) / 10,
            expectedFatG: Math.round(selectedFood!.fatG * amount * 10) / 10,
            ...(selectedFood!.fiberG === undefined ? {} : { expectedFiberG: Math.round(selectedFood!.fiberG * amount * 10) / 10 }),
            source: selectedFood!.source,
            sourceVersion: selectedFood!.sourceVersion,
            assumptions: "Estimated from the catalog serving size.",
            confidence: selectedFood!.confidence,
            preparationBasis: selectedFood!.preparationBasis ?? "as_labeled",
          }),
    };
    setSaving(true);
    try {
      const saved = await onSave(next);
      if (saved && draftSnapshot.userId) await clearDraft(draftSnapshot.userId, draftType);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 grid gap-2 rounded-2xl bg-lav-50 p-3" role="group" aria-label="Planned meal editor">
      {draftWasRestored ? <div className="flex items-center justify-between gap-2 rounded-xl bg-mint-100 px-3 py-2 text-[11px] font-bold" role="status"><span>Meal draft restored.</span><button type="button" className="underline" onClick={() => { if (draftSnapshot.userId) void clearDraft(draftSnapshot.userId, draftType); setDraftWasRestored(false); }}>Discard draft</button></div> : null}
      {draftWriteUnavailable ? <p className="rounded-xl bg-peach-100 px-3 py-2 text-[11px] font-bold" role="status">Draft recovery is unavailable on this device.</p> : null}
      <HelpHeading title="Edit future meal" as="h3" className="text-sm font-extrabold"><p>This creates a new future plan version. Logged nutrition history stays unchanged.</p></HelpHeading>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <select ref={choiceInput} className="input" value={reference} onChange={(event) => setReference(event.target.value)} aria-label="Planned meal choice">
          <optgroup label="Saved meals">
            {availableMeals.map((meal) => <option key={`meal:${meal.id}`} value={`meal:${meal.id}`}>{meal.name}</option>)}
          </optgroup>
          <optgroup label="Catalog foods">
            {foods.map((food) => <option key={`food:${food.id}`} value={`food:${food.id}`}>{food.name}</option>)}
          </optgroup>
        </select>
        <select className="input" value={slot} onChange={(event) => setSlot(event.target.value as MealSlot)} aria-label="Planned meal slot">
          {SLOTS.map((candidate) => <option key={candidate} value={candidate}>{slotLabels[candidate]}</option>)}
        </select>
        <input className="input" type="number" min="0.25" step="0.25" value={servings} onChange={(event) => setServings(event.target.value)} aria-label="Planned meal servings" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={onCancel}>Cancel</Button>
        <Button className="!min-h-11 !px-3 text-xs" disabled={saving || !Number.isFinite(amount) || amount <= 0 || (!selectedMeal && !selectedFood)} onClick={() => void submit()}>
          {saving ? "Saving…" : "Save meal"}
        </Button>
      </div>
    </div>
  );
}


async function addFood(
  actions: ReturnType<typeof useApp>["actions"],
  slot: MealSlot,
  date: string,
  food: Food,
  serving: number | CandidateServingPlan,
  plannedMealId?: string,
  fixedKey?: string,
) {
  const servings = typeof serving === "number" ? serving : serving.servings;
  const macros = foodMacros(food, servings);
  return actions.logNutrition({
    date,
    slot,
    foodId: food.id,
    ...(plannedMealId ? { plannedMealId } : {}),
    servings,
    servingQuantity: typeof serving === "number"
      ? food.unit === "piece" ? servings : food.servingGrams * servings
      : serving.servingQuantity,
    servingUnit: typeof serving === "number" ? food.unit : serving.servingUnit,
    calories: macros.calories,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
    ...(food.fiberG === undefined ? {} : { fiberG: Math.round(food.fiberG * servings * 10) / 10 }),
    estimated: food.estimated,
    confidence: food.confidence,
    source: `${food.source} ${food.sourceVersion}`,
    sourceVersion: food.sourceVersion,
    valueSource: food.valueSource,
    ...(food.estimateRange ? { estimateRange: food.estimateRange } : {}),
    preparationBasis: food.preparationBasis ?? "as_labeled",
  }, fixedKey);
}

function withAuthoredServingOptions(food: Food): Food {
  const authored = FOODS.find((candidate) => candidate.id === food.id);
  if (food.servingOptions?.length || !authored?.servingOptions?.length) return food;
  return { ...food, servingOptions: authored.servingOptions };
}

function restoreTextCandidate(
  candidate: Partial<ParsedCandidate> & Pick<ParsedCandidate, "name" | "quantity">,
  foods: Food[],
  index: number,
): ParsedCandidate {
  const unit = candidate.unit ?? "serving";
  const matched = candidate.matched?.id
    ? foods.find((food) => food.id === candidate.matched?.id) ?? candidate.matched
    : null;
  const servingPlan = candidate.servingPlan ?? (matched ? servingPlanForCandidate(matched, candidate.quantity, unit) : null);
  return {
    id: candidate.id ?? `restored-${index}`,
    raw: candidate.raw ?? candidate.name,
    name: candidate.name,
    quantity: candidate.quantity,
    unit,
    matched,
    servingPlan,
    confidence: matched && servingPlan ? candidate.confidence ?? "medium" : "low",
    assumptions: candidate.assumptions ?? [],
  };
}

async function logMeal(
  actions: ReturnType<typeof useApp>["actions"],
  ingredients: { foodId: string; servings: number }[],
  date: string,
  slot: MealSlot,
  meal: Meal,
  foods: Food[],
  plannedMealId?: string,
  fixedKey?: string,
) {
  if (!ingredients.length || ingredients.some(ingredient => !Number.isFinite(ingredient.servings) || ingredient.servings <= 0 || !foods.some(food => food.id === ingredient.foodId))) return false;
  const providedEntry = providedRecipeLogEntry(meal, ingredients[0] && meal.ingredients[0] ? ingredients[0].servings / meal.ingredients[0].servings * meal.servings : meal.servings, date, slot);
  const entries: Parameters<typeof actions.logSavedMeal>[2] = providedEntry ? [providedEntry] : [];
  for (const ing of providedEntry ? [] : ingredients) {
    const food = foods.find((f) => f.id === ing.foodId);
    if (!food) continue;
    const macros = foodMacros(food, ing.servings);
    entries.push({
      date,
      slot,
      foodId: food.id,
      servings: ing.servings,
      servingQuantity: food.unit === "piece" ? ing.servings : food.servingGrams * ing.servings,
      servingUnit: food.unit,
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
      ...(food.fiberG === undefined ? {} : { fiberG: Math.round(food.fiberG * ing.servings * 10) / 10 }),
      estimated: food.estimated,
      confidence: food.confidence,
      source: `${food.source} ${food.sourceVersion}`,
      sourceVersion: food.sourceVersion,
      preparationBasis: food.preparationBasis ?? "as_labeled",
      valueSource: food.valueSource,
    });
  }
  if (plannedMealId) {
    return actions.saveReviewedMeal({
      date,
      slot,
      name: meal.name,
      sourceMode: "saved_meal",
      meal,
      ingredients: entries,
      plannedMealId,
    }, fixedKey);
  }
  return actions.logSavedMeal(date, slot, entries, meal, fixedKey);
}

function GuidedSearchPicker({
  slot,
  onMode,
  onDone,
  foods, snapshot, actions, selected, canAddPlan, carbLimit, addToPlan, pendingMutation, onSavingChange, onReviewingChange,
}: {
  slot: MealSlot;
  onMode: (m: Mode) => void;
  onDone: () => void;
  foods: Food[];
  snapshot: ReturnType<typeof useApp>["snapshot"];
  actions: ReturnType<typeof useApp>["actions"];
  selected: string;
  canAddPlan: boolean;
  carbLimit: number | null;
  pendingMutation: ReturnType<typeof useApp>["pendingMutation"];
  addToPlan: (slot: MealSlot, choice: PlanChoice) => Promise<boolean>;
  onSavingChange: (saving: boolean) => void;
  onReviewingChange: (reviewing: boolean) => void;
}) {
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState("");
  const [providerResults, setProviderResults] = useState<Awaited<ReturnType<typeof searchNutritionProvider>>>({ candidates: [] });
  const [quantityFood, setQuantityFood] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [quantityUnit, setQuantityUnit] = useState("serving");
  const [mealName, setMealName] = useState("Meal");
  const [ingredients, setIngredients] = useState<GuidedIngredient[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [savingIntent, setSavingIntent] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [query, setQuery] = useState("");
  const [recipeSelection, setRecipeSelection] = useState<RecipeSelection | null>(null);
  const [recipeError, setRecipeError] = useState("");
  const draftWrites = useRef<Promise<boolean>>(Promise.resolve(true));
  const restoredFor = useRef("");
  const closingDraft = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const quantityInput = useRef<HTMLInputElement>(null);
  const reviewing = Boolean(recipeSelection || quantityFood);
  const busy = savingIntent || Boolean(pendingMutation);
  const currentRecipe = snapshot.savedMeals.find(recipe => recipe.id === recipeSelection?.id);
  const recipeChanged = Boolean(recipeSelection && currentRecipe && (currentRecipe.revision !== recipeSelection.revision || recipeReviewToken(currentRecipe, foods) !== recipeSelection.token));
  const portion = recipePortion(currentRecipe, foods, recipeSelection?.servings ?? "", carbLimit !== null);
  const recipeResults = searchRecipes(snapshot.savedMeals, query);
  const draftType = `nutrition-guided:${selected}:${slot}`;
  const userId = snapshot.userId;
  const profileRevision = snapshot.profile?.revision;
  const localResults = searchFoods(foods, query);
  const appearsComposite = /,|\bwith\b|\band\b|\bplus\b/i.test(query.trim());
  const shouldSuggestAnalysis = query.trim().length >= 2 && recipeResults.length === 0 && (appearsComposite || localResults.length === 0);
  const authenticationExpired = (providerError || analysisError).startsWith("Your session has expired.");

  useEffect(() => {
    if (!userId || restoredFor.current === draftType) return;
    let active = true;
    void readDraft<GuidedDraft>(userId, draftType).then((saved) => {
      if (!active) return;
      restoredFor.current = draftType;
      if (saved) {
        setRecipeSelection(saved.payload.recipeSelection ?? null);
        setQuery(saved.payload.query);
        setMealName(saved.payload.mealName);
        setIngredients(saved.payload.ingredients.map((ingredient) => ({
          ...ingredient,
          food: ingredient.food?.id ? foods.find((food) => food.id === ingredient.food?.id) ?? ingredient.food : null,
        })));
        setQuantityFood(saved.payload.quantityFood?.id ? foods.find((food) => food.id === saved.payload.quantityFood?.id) ?? saved.payload.quantityFood : null);
        setQuantity(saved.payload.quantity ?? "1");
        setQuantityUnit(saved.payload.quantityUnit ?? "serving");
        setDraftRestored(true);
      }
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [draftType, foods, userId]);

  useEffect(() => {
    if (closingDraft.current || !draftReady || !userId || (!query.trim() && ingredients.length === 0 && !quantityFood && !recipeSelection)) return;
    const envelope = createDraftEnvelope({
      userId, draftType,
      payload: { query, mealName, ingredients, quantityFood, quantity, quantityUnit, recipeSelection },
      baseVersions: { profileRevision }, ttlMs: draftTtlMs(draftType),
    });
    draftWrites.current = draftWrites.current.then(() => writeDraft(envelope));
    void draftWrites.current.then(saved => {
      if (!saved) setAnalysisError("Review recovery could not be written on this device. Keep this screen open until you confirm or discard it.");
    });
  }, [draftReady, draftType, ingredients, mealName, profileRevision, quantity, quantityFood, quantityUnit, query, recipeSelection, userId]);

  useEffect(() => { onReviewingChange(reviewing); }, [reviewing, onReviewingChange]);
  useEffect(() => {
    onSavingChange(savingIntent);
    return () => onSavingChange(false);
  }, [savingIntent, onSavingChange]);
  useEffect(() => {
    if (!draftReady) return;
    if (quantityFood) quantityInput.current?.focus();
    else if (!recipeSelection) {
      searchInput.current?.focus();
    }
  }, [draftReady, quantityFood, recipeSelection]);

  function cancelReview() {
    setQuantityFood(null); setRecipeSelection(null); setRecipeError("");
  }

  function selectRecipe(recipe: Meal) {
    setQuantityFood(null);
    setRecipeError("");
    setRecipeSelection({ id: recipe.id, revision: recipe.revision, token: recipeReviewToken(recipe, foods), servings: "1", logKey: clientId("recipe-log"), planKey: clientId("recipe-plan") });
  }

  function changeRecipeServings(servings: string) {
    setRecipeError("");
    setRecipeSelection(current => current ? { ...current, servings, logKey: clientId("recipe-log"), planKey: clientId("recipe-plan"), plannedMeal: undefined } : null);
  }

  async function confirmRecipe(intent: "log" | "plan") {
    if (busy || !recipeSelection || !currentRecipe || recipeChanged || !portion || (intent === "plan" && (!canAddPlan || !portion.canPlan))) return;
    setSavingIntent(true);
    onSavingChange(true);
    setRecipeError("");
    const nextOrder = Math.max(0, ...(snapshot.mealPlan?.meals.filter(entry => entry.date === selected && entry.slot === slot).map(entry => entry.sortOrder ?? 0) ?? [])) + 1;
    const reviewed = intent === "plan" && !recipeSelection.plannedMeal ? { ...recipeSelection, plannedMeal: {
      id: clientId("planned-meal"), date: selected, slot, slotKey: `date:${selected}:slot:${slot}:order:${nextOrder}`, sortOrder: nextOrder,
      mealId: currentRecipe.id, label: currentRecipe.name, servings: Number(recipeSelection.servings),
    } } : recipeSelection;
    setRecipeSelection(reviewed);
    try {
      // Persist the submitted identity before sending, so a lost response can be retried after reload.
      await draftWrites.current;
      const retained = userId && await writeDraft(createDraftEnvelope({ userId, draftType,
        payload: { query, mealName, ingredients, quantityFood: null, quantity, quantityUnit, recipeSelection: reviewed },
        baseVersions: { profileRevision }, ttlMs: draftTtlMs(draftType),
      }));
      if (!retained) { setRecipeError("The recipe review could not be retained on this device. Retry when draft storage is available."); return; }
      const saved = intent === "log"
        ? await logMeal(actions, portion.ingredients, selected, slot, currentRecipe, foods, undefined, reviewed.logKey)
        : await addToPlan(slot, { meal: currentRecipe, servings: Number(reviewed.servings), plannedMeal: reviewed.plannedMeal, fixedKey: reviewed.planKey });
      if (!saved) { setRecipeError("The save was not confirmed. Your recipe and portion are retained; review any error and retry."); return; }
      closingDraft.current = true;
      setDraftReady(false);
      await draftWrites.current;
      if (userId) await clearDraft(userId, draftType);
      onDone();
    } catch {
      setRecipeError("The save was not confirmed. Your recipe and portion are retained; reconnect and retry.");
    } finally { setSavingIntent(false); onSavingChange(false); }
  }

  function providerFood(candidate: NutritionProviderCandidate): Food {
    return { ...candidate, id: `food-fdc-${candidate.fdcId}`, category: "Other", valueSource: "trusted_catalog" };
  }

  async function runProviderSearch() {
    setProviderLoading(true);
    setProviderError("");
    try {
      setProviderResults(await searchNutritionProvider(createClient(), query));
    } catch (error) {
      setProviderError(nutritionProviderMessage(error, "Trusted food search is unavailable right now."));
    } finally {
      setProviderLoading(false);
    }
  }

  async function analyzeMeal() {
    setAnalysisLoading(true);
    setAnalysisError("");
    try {
      const extracted = await parseNutritionTextWithProvider(createClient(), query);
      const stated = extracted.candidates.filter((candidate) => candidate.presence === "stated");
      const matchesByCandidate = new Map<number, NutritionProviderCandidate>();
      if (stated.length > 0) {
        try {
          const matches = await matchNutritionMeal(createClient(), stated.map((candidate) => ({ name: candidate.name, preparation: candidate.preparation })));
          for (const match of matches) {
            const candidate = match.candidates[0];
            if (candidate) matchesByCandidate.set(match.ingredientIndex, candidate);
          }
        } catch (error) {
          // Extraction is still useful when USDA enrichment is unavailable.
          // Keep the review visible so the user can choose a local match,
          // enter values, retry later, or use the explicit AI estimate path.
          const errorCode = error instanceof Error
            ? error.message.split(":", 1)[0]
            : "";
          setAnalysisError(errorCode === "rate_limited"
            ? "USDA ingredient matching is temporarily rate-limited. Your extracted review is preserved; wait and retry later or match ingredients manually."
            : errorCode === "not_authenticated"
              ? "Your session has expired. Sign in again to continue; this review remains saved on this device."
              : "Ingredient matching is unavailable right now. Your extracted review is still available; you can match ingredients manually or retry later.");
        }
      }
      const next = extracted.candidates.map((candidate, index): GuidedIngredient => {
        const match = candidate.presence === "stated"
          ? matchesByCandidate.get(stated.findIndex((entry) => entry === candidate))
          : undefined;
        const local = foods.find((food) => candidate.name.toLowerCase().includes(food.name.toLowerCase()) || food.name.toLowerCase().includes(candidate.name.toLowerCase()));
        return {
          id: `review-${index}`,
          name: candidate.name,
          quantity: candidate.quantity,
          unit: candidate.unit,
          preparation: candidate.preparation,
          assumptions: [...candidate.assumptions, ...(candidate.presence === "possible_hidden" ? ["Possible hidden ingredient — excluded until you confirm it."] : [])],
          presence: candidate.presence,
          included: candidate.presence === "stated",
          food: local ?? (match ? providerFood(match) : null),
        };
      });
      setMealName(extracted.suggestedMealName);
      setIngredients(next);
    } catch (error) {
      setAnalysisError(nutritionProviderMessage(error, "Meal analysis is unavailable. Your description is still here; you can search or enter it manually."));
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function estimateSelected() {
    const selectedItems = ingredients.filter((ingredient) => ingredient.included && !ingredient.food && !ingredient.estimate && !ingredient.custom);
    if (selectedItems.length === 0) return;
    setEstimateLoading(true);
    setAnalysisError("");
    try {
      const estimates = await estimateNutritionMacros(createClient(), selectedItems.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit, preparation: item.preparation })));
      setIngredients((current) => current.map((ingredient) => {
        const selectedIndex = selectedItems.findIndex((item) => item.id === ingredient.id);
        const estimate = estimates.find((candidate) => candidate.ingredientIndex === selectedIndex);
        if (!estimate) return ingredient;
        return {
          ...ingredient,
          estimate: {
            calories: estimate.range.calories.base,
            proteinG: estimate.range.proteinG.base,
            carbsG: estimate.range.carbsG.base,
            fatG: estimate.range.fatG.base,
            ...(estimate.range.fiberG ? { fiberG: estimate.range.fiberG.base } : {}),
            estimateRange: estimate.range,
            assumptions: estimate.assumptions,
          },
        };
      }));
    } catch (error) {
      setAnalysisError(nutritionProviderMessage(error, "The estimate is unavailable. Keep reviewing or use a custom value."));
    } finally {
      setEstimateLoading(false);
    }
  }

  async function confirmQuantity(intent: "plan" | "log") {
    if (!quantityFood) return;
    const amount = Number(quantity);
    const serving = servingPlanForCandidate(quantityFood, amount, quantityUnit);
    if (!serving) return;
    setAnalysisError("");
    setSavingIntent(true);
    try {
      const newFood = !snapshot.foods.some((food) => food.id === quantityFood.id) && quantityFood.fdcId ? quantityFood : null;
      if (intent === "plan") {
        if (await addToPlan(slot, { food: quantityFood, servings: serving.servings, newFoods: newFood ? [newFood] : [] })) {
          setQuantityFood(null);
          closingDraft.current = true;
          await draftWrites.current;
          if (userId) await clearDraft(userId, draftType);
          onDone();
          return;
        }
      } else {
        if (newFood && !await actions.saveFood(newFood)) {
          setAnalysisError("The food could not be saved. Your portion is retained; retry when ready.");
          return;
        }
        if (await addFood(actions, slot, selected, quantityFood, serving)) {
          setQuantityFood(null);
          closingDraft.current = true;
          await draftWrites.current;
          if (userId) await clearDraft(userId, draftType);
          onDone();
          return;
        }
      }
      setAnalysisError("The save was not confirmed. Your food portion is retained; retry when ready.");
    } catch {
      setAnalysisError("The save was not confirmed. Your food portion is retained; retry when ready.");
    } finally {
      setSavingIntent(false);
    }
  }

  async function confirmMeal(intent: "plan" | "log") {
    const included = ingredients.filter((ingredient) => ingredient.included);
    if (included.length === 0 || included.some((ingredient) => !ingredient.food && !ingredient.estimate && !ingredient.custom)) return;
    if (intent === "plan") {
      if (!canPlan) return;
      const newFoods: Food[] = [];
      const recipeIngredients: RecipeIngredient[] = [];
      for (const ingredient of included) {
        let food = ingredient.food;
        if (ingredient.custom) {
          food = {
            id: clientId("food-review"), name: ingredient.name.trim(),
            servingLabel: `${ingredient.quantity} ${ingredient.unit} reviewed portion`,
            servingGrams: 100, unit: "g", category: "Other",
            calories: Number(ingredient.custom.calories), proteinG: Number(ingredient.custom.proteinG),
            carbsG: Number(ingredient.custom.carbsG), fatG: Number(ingredient.custom.fatG),
            ...(ingredient.custom.fiberG ? { fiberG: Number(ingredient.custom.fiberG) } : {}),
            source: "User-provided", sourceVersion: "user-v1", valueSource: "user_provided",
            estimated: false, confidence: "medium", preparationBasis: "prepared",
          };
          newFoods.push(food);
        } else if (food?.fdcId && !snapshot.foods.some((saved) => saved.id === food?.id)) {
          newFoods.push(food);
        }
        if (!food) return;
        recipeIngredients.push({ foodId: food.id, servings: ingredient.custom ? 1 : servingPlanForCandidate(food, ingredient.quantity, ingredient.unit)?.servings ?? ingredient.quantity });
      }
      const newMeal: Meal = { id: clientId("meal-review"), name: mealName.trim() || "Reviewed meal", servings: 1, ingredients: recipeIngredients };
      setSavingIntent(true);
      try {
        if (await addToPlan(slot, { meal: newMeal, servings: 1, newFoods })) {
          if (userId) await clearDraft(userId, draftType);
          onDone();
        }
      } finally { setSavingIntent(false); }
      return;
    }
    const entries = included.map((ingredient) => {
      if (ingredient.food) {
        const serving = servingPlanForCandidate(ingredient.food, ingredient.quantity, ingredient.unit) ?? {
          servings: ingredient.quantity,
          servingQuantity: ingredient.food.unit === "piece" ? ingredient.quantity : ingredient.food.servingGrams * ingredient.quantity,
          servingUnit: ingredient.food.unit,
        };
        const macros = foodMacros(ingredient.food, serving.servings);
        return {
          date: selected,
          slot,
          foodId: ingredient.food.id,
          servings: serving.servings,
          servingQuantity: serving.servingQuantity,
          servingUnit: serving.servingUnit,
          calories: macros.calories,
          proteinG: macros.proteinG,
          carbsG: macros.carbsG,
          fatG: macros.fatG,
          ...(ingredient.food.fiberG === undefined ? {} : { fiberG: ingredient.food.fiberG * serving.servings }),
          estimated: ingredient.food.estimated,
          confidence: ingredient.food.confidence,
          source: ingredient.food.source,
          sourceVersion: ingredient.food.sourceVersion,
          preparationBasis: ingredient.food.preparationBasis ?? "as_labeled",
          valueSource: ingredient.food.valueSource,
          ...(ingredient.food.estimateRange ? { estimateRange: ingredient.food.estimateRange } : {}),
          assumptions: ingredient.assumptions.join(" ") || undefined,
        };
      }
      if (ingredient.custom) {
        const quantity = Math.max(ingredient.quantity, 1);
        const customValue = (value: string) => Number(value) / quantity;
        return {
          date: selected,
          slot,
          customName: ingredient.name,
          servings: quantity,
          servingQuantity: quantity,
          servingUnit: "g" as const,
          calories: customValue(ingredient.custom.calories),
          proteinG: customValue(ingredient.custom.proteinG),
          carbsG: customValue(ingredient.custom.carbsG),
          fatG: customValue(ingredient.custom.fatG),
          ...(ingredient.custom.fiberG === "" ? {} : { fiberG: customValue(ingredient.custom.fiberG) }),
          estimated: false,
          confidence: "medium" as const,
          source: "User-provided",
          sourceVersion: "user-v1",
          preparationBasis: "prepared" as const,
          valueSource: "user_provided" as const,
          servingLabel: `${ingredient.quantity} ${ingredient.unit} reviewed portion`,
          servingGrams: 100,
          assumptions: [...ingredient.assumptions, `User-provided values for ${ingredient.quantity} ${ingredient.unit}.`].join(" ") || undefined,
        };
      }
      return {
        date: selected,
        slot,
        customName: ingredient.name,
        servings: ingredient.quantity,
        servingQuantity: ingredient.quantity,
        servingUnit: "g" as const,
        calories: ingredient.estimate!.calories,
        proteinG: ingredient.estimate!.proteinG,
        carbsG: ingredient.estimate!.carbsG,
        fatG: ingredient.estimate!.fatG,
        ...(ingredient.estimate!.fiberG === undefined ? {} : { fiberG: ingredient.estimate!.fiberG }),
        estimated: true,
        confidence: "low" as const,
        source: "DeepSeek estimate",
        sourceVersion: "deepseek-flash",
        preparationBasis: "prepared" as const,
        valueSource: "ai_estimate" as const,
        estimateRange: ingredient.estimate!.estimateRange,
        assumptions: [...ingredient.assumptions, ...ingredient.estimate!.assumptions].join(" ") || undefined,
      };
    });
    const remoteFoods = included.flatMap((ingredient) => ingredient.food?.fdcId && !snapshot.foods.some((food) => food.id === ingredient.food?.id) && ingredient.food ? [ingredient.food] : []);
    setSavingIntent(true);
    try {
    for (const food of remoteFoods) if (!await actions.saveFood(food)) return;
    const saved = await actions.saveReviewedMeal({
      date: selected,
      slot,
      name: mealName.trim() || "Reviewed meal",
      sourceMode: "ai_assisted",
      meal: { id: clientId("meal-review"), name: mealName.trim() || "Reviewed meal", servings: 1, ingredients: [] },
      ingredients: entries,
    });
    if (saved) {
      if (userId) await clearDraft(userId, draftType);
      onDone();
    }
    } finally { setSavingIntent(false); }
  }

  const included = ingredients.filter((ingredient) => ingredient.included);
  const totals = included.reduce((sum, ingredient) => {
    const macros = ingredient.estimate
      ?? (ingredient.custom ? {
        calories: Number(ingredient.custom.calories) || 0,
        proteinG: Number(ingredient.custom.proteinG) || 0,
        carbsG: Number(ingredient.custom.carbsG) || 0,
        fatG: Number(ingredient.custom.fatG) || 0,
      } : null)
      ?? (ingredient.food ? foodMacros(ingredient.food, servingPlanForCandidate(ingredient.food, ingredient.quantity, ingredient.unit)?.servings ?? ingredient.quantity) : null);
    if (!macros) return sum;
    return { calories: sum.calories + macros.calories, proteinG: sum.proteinG + macros.proteinG, carbsG: sum.carbsG + macros.carbsG, fatG: sum.fatG + macros.fatG };
  }, { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const ready = included.length > 0 && included.every((ingredient) => Number.isFinite(ingredient.quantity) && ingredient.quantity > 0 && (ingredient.food || ingredient.estimate || (ingredient.custom && [ingredient.custom.calories, ingredient.custom.proteinG, ingredient.custom.carbsG, ingredient.custom.fatG].every((value) => value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0))));
  const canPlan = ready && canAddPlan && included.every((ingredient) => {
    if (ingredient.custom) return carbLimit === null;
    return Boolean(ingredient.food && ingredient.food.valueSource !== "ai_estimate" && (carbLimit === null || ingredient.food.valueSource === "trusted_catalog"));
  });
  const quantityServing = quantityFood ? servingPlanForCandidate(quantityFood, Number(quantity), quantityUnit) : null;
  const quantityMacros = quantityFood && quantityServing ? foodMacros(quantityFood, quantityServing.servings) : null;

  return (
    <div className="mt-3 grid min-w-0 gap-2">
      {draftRestored ? <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-mint-100 px-3 py-2 text-xs font-bold [overflow-wrap:anywhere]" role="status"><span>Meal review draft restored.</span><button type="button" className="min-h-11 underline" disabled={busy} onClick={() => { closingDraft.current = true; if (userId) void draftWrites.current.then(() => clearDraft(userId, draftType)); setDraftRestored(false); setDraftReady(false); setQuery(""); setMealName("Meal"); setIngredients([]); setQuantityFood(null); setRecipeSelection(null); setProviderResults({ candidates: [] }); setAnalysisError(""); onDone(); }}>Discard draft</button></div> : null}
      {!reviewing ? <>
      <input value={query} onChange={(event) => setQuery(event.target.value)} ref={searchInput} disabled={busy} placeholder="Search foods or saved recipes, or describe a meal." className="input" aria-label="Search foods or saved recipes, or describe a meal." />
      <div className="flex flex-wrap gap-2">
        <Button variant="soft" className="!min-h-11 !px-3 text-xs" disabled={busy || providerLoading || query.trim().length < 2} onClick={() => void runProviderSearch()}>{providerLoading ? "Searching USDA…" : "Search trusted USDA"}</Button>
        <Button variant="ghost" className="!min-h-11 !px-3 text-xs" disabled={busy} onClick={() => onMode("custom")}>Enter nutrition manually</Button>
      </div>
      {shouldSuggestAnalysis ? <div className="rounded-xl bg-lav-50 px-3 py-2 text-xs font-semibold"><div className="flex items-center justify-between gap-2"><p>Analyze sends your description to DeepSeek.</p><HelpPopover title="Meal analysis"><p>DeepSeek suggests ingredients and questions for you to review. It does not save meals. Catalog values are authoritative; optional AI estimates remain low-confidence ranges and require confirmation.</p></HelpPopover></div><Button className="mt-2 !min-h-11 !px-3 text-xs" disabled={busy || analysisLoading} onClick={() => void analyzeMeal()}><Sparkles className="h-4 w-4" aria-hidden /> {analysisLoading ? "Analyzing…" : "Analyze this meal"}</Button></div> : null}
      {providerError || analysisError ? <div className="grid gap-1 text-[11px] font-bold text-coral-300" role="alert"><p>{providerError || analysisError}</p>{authenticationExpired ? <a className="w-fit underline underline-offset-2" href="/auth/sign-in?next=%2Fnutrition">Sign in again</a> : null}</div> : null}
      {recipeResults.length > 0 ? <section className="grid gap-1" aria-label="Saved recipes matches"><h3 className="text-xs font-extrabold">Saved recipes</h3><ul className="grid gap-1">{recipeResults.map(({ recipe, kind }) => {
      const calories = recipeCardCalories(recipe, foods);
      return <li key={recipe.id}><button type="button" disabled={busy} className="flex min-h-11 w-full min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold" onClick={() => selectRecipe(recipe)}><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{recipe.name}{kind === "close" ? <span className="ml-2 text-xs text-ink-soft">Close match</span> : null}</span>{calories !== undefined ? <NutritionPills label={`${recipe.name} nutrition per serving`} values={{ calories }} approximate precision={0} /> : <span className="text-xs text-muted">Calories unavailable</span>}</button></li>;
    })}</ul></section> : null}
      </> : null}
    {recipeSelection ? <RecipePortionReview key={recipeSelection.id} name={currentRecipe?.name ?? "Saved recipe unavailable"} date={selected} slot={slotLabels[slot]} servings={recipeSelection.servings} portion={portion} changed={recipeChanged} unavailable={!currentRecipe || Boolean(currentRecipe.archivedAt)} pending={busy} canPlan={canAddPlan} error={recipeError}
      onServings={changeRecipeServings} onLog={() => void confirmRecipe("log")} onPlan={() => void confirmRecipe("plan")}
      onCancel={cancelReview}
      onReview={() => { if (currentRecipe && !currentRecipe.archivedAt) setRecipeSelection(current => current ? { ...current, revision: currentRecipe.revision, token: recipeReviewToken(currentRecipe, foods), logKey: clientId("recipe-log"), planKey: clientId("recipe-plan"), plannedMeal: undefined } : null); setRecipeError(""); }}
      onRefresh={() => void actions.refreshSnapshot()} /> : null}
    {!reviewing && localResults.length > 0 ? <section aria-label="Food matches"><h3 className="mb-1 text-xs font-extrabold">Foods</h3><ul className="grid gap-1">{localResults.map(({ food, kind }) => <li key={food.id}><button type="button" disabled={busy} className="flex min-h-11 w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold" onClick={() => { setRecipeSelection(null); setQuantityFood(food); setQuantity("1"); setQuantityUnit(food.unit === "piece" ? "piece" : "serving"); }}><span>{food.name}{kind === "close" ? <span className="ml-2 text-xs font-semibold text-ink-soft">Close match</span> : null}<span className="mt-1 block text-[11px] font-semibold text-ink-soft">{food.servingLabel} · {food.valueSource === "trusted_catalog" ? "trusted catalog" : "development catalog"}</span><NutritionPills className="mt-1" values={{ calories: food.calories }} /></span><Plus className="h-4 w-4 text-muted" aria-hidden /></button></li>)}</ul></section> : null}
      {quantityFood ? <div className="grid min-w-0 gap-2 rounded-xl bg-white p-3 [overflow-wrap:anywhere]" role="group" aria-label="Review food quantity" aria-busy={busy}><p className="text-sm font-extrabold">Review {quantityFood.name}</p><p className="text-xs font-semibold text-ink-soft">{selected} · {slotLabels[slot]}</p><div className="grid min-w-0 gap-2 sm:grid-cols-2"><input ref={quantityInput} disabled={busy} className="input min-w-0" type="number" min="0.01" step="0.25" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label="Quantity" /><select disabled={busy} className="input min-w-0 max-w-full" value={quantityUnit} onChange={(event) => setQuantityUnit(event.target.value)} aria-label="Serving unit"><option value="serving">serving</option><option value="g">grams</option><option value="piece">piece</option>{quantityFood.servingOptions?.map((option) => <option key={`${option.label}-${option.grams}`} value={option.unit}>{option.label}</option>)}</select></div><p className="text-[11px] font-semibold text-muted">{quantityFood.preparationBasis ?? "Preparation basis not specified"} · {quantityFood.valueSource === "trusted_catalog" ? "Trusted catalog nutrition" : "Development catalog estimate"} · {quantityFood.confidence} confidence</p>{quantityMacros ? <NutritionPills label="Nutrition preview" values={quantityMacros} /> : null}{analysisError ? <p role="alert" className="text-xs font-semibold text-coral-300">{analysisError}</p> : null}<div className="flex flex-wrap gap-2"><Button variant="soft" className="!min-h-11 !px-3 text-xs" disabled={!quantityServing || !canAddPlan || (carbLimit !== null && quantityFood.valueSource !== "trusted_catalog") || quantityFood.valueSource === "ai_estimate" || busy} onClick={() => void confirmQuantity("plan")}>Add to plan</Button><Button className="!min-h-11 !px-3 text-xs" disabled={!quantityServing || busy} onClick={() => void confirmQuantity("log")}>Log meal</Button><Button variant="ghost" className="!min-h-11 !px-3 text-xs" disabled={busy} onClick={cancelReview}>Cancel</Button></div></div> : null}
      {!reviewing && providerResults.candidates.length > 0 ? <div className="rounded-xl bg-mint-100 p-2"><p className="text-[11px] font-extrabold uppercase tracking-wide">USDA FoodData Central</p><ul className="mt-1 grid gap-1">{providerResults.candidates.map((candidate) => { const food = providerFood(candidate); return <li key={candidate.fdcId}><button type="button" disabled={busy} className="flex min-h-11 w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold" onClick={() => { setRecipeSelection(null); setQuantityFood(food); setQuantity("1"); setQuantityUnit("serving"); }}><span>{candidate.name}<span className="block text-[11px] font-semibold text-muted">{candidate.servingLabel} · {candidate.preparationBasis} · USDA {candidate.sourceVersion}</span></span><Check className="h-4 w-4" aria-hidden /></button></li>; })}</ul></div> : null}
      {ingredients.length > 0 && !reviewing ? (
        <div className="grid gap-2 rounded-2xl bg-lav-50 p-3" role="region" aria-label="Guided meal review">
          <HelpHeading title="Meal review" as="h3" className="text-sm font-extrabold"><p>Catalog values are authoritative. User values are explicit. Optional AI estimates are approximate, low-confidence ranges and require confirmation.</p><p>Check preparation, quantities, and assumptions before saving.</p></HelpHeading>
          <div className="grid gap-2">
            <input className="input" value={mealName} onChange={(event) => setMealName(event.target.value)} aria-label="Meal name" placeholder="Meal name" />
            {ready ? <NutritionPills label="Reviewed meal nutrition" values={totals} precision={0} approximate /> : <p className="text-xs font-semibold text-ink-soft">Review each included ingredient to see the meal nutrition.</p>}
          </div>
          {ingredients.map((ingredient, index) => (
            <div key={ingredient.id} className={`grid gap-2 rounded-xl p-2 ${ingredient.included ? "bg-white" : "bg-cream"}`}>
              <div className="flex items-start gap-2">
                <input type="checkbox" checked={ingredient.included} onChange={(event) => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, included: event.target.checked } : item))} aria-label={`Include ${ingredient.name}`} className="mt-1 h-5 w-5" />
                <div className="min-w-0 flex-1">
                  <input className="input" value={ingredient.name} onChange={(event) => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, name: event.target.value } : item))} aria-label={`Ingredient ${index + 1} name`} />
                  <p className="mt-1 text-[11px] font-semibold text-muted">{ingredient.presence === "possible_hidden" ? "Possible hidden ingredient — excluded by default" : "Stated ingredient"}</p>
                </div>
                <button type="button" className="min-h-11 px-2 text-xs font-bold underline" onClick={() => setIngredients((current) => current.filter((item) => item.id !== ingredient.id))}>Remove</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="input" type="number" min="0.01" step="0.25" value={ingredient.quantity} onChange={(event) => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, quantity: Number(event.target.value) } : item))} aria-label={`${ingredient.name} quantity`} />
                <input className="input" value={ingredient.unit} onChange={(event) => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, unit: event.target.value } : item))} aria-label={`${ingredient.name} unit`} />
              </div>
              <input className="input" value={ingredient.preparation} onChange={(event) => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, preparation: event.target.value } : item))} aria-label={`${ingredient.name} preparation`} placeholder="Preparation (raw, cooked, fried…)" />
              <select className="input" value={ingredient.food?.id ?? ""} onChange={(event) => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, food: foods.find((food) => food.id === event.target.value) ?? null, estimate: undefined, custom: undefined } : item))}>
                <option value="">No catalog match</option>
                {foods.map((food) => <option key={food.id} value={food.id}>{food.name} · {food.preparationBasis ?? "basis unknown"}</option>)}
              </select>
              {ingredient.food ? (
                <p className="text-[11px] font-semibold text-muted">{ingredient.food.valueSource === "trusted_catalog" ? "Trusted catalog" : ingredient.food.valueSource === "ai_estimate" ? "AI estimate record" : "Development catalog"} · {ingredient.food.preparationBasis ?? "basis unknown"}</p>
              ) : ingredient.estimate ? (
                <p className="text-[11px] font-semibold text-muted">AI estimate · low confidence · range {Math.round(ingredient.estimate.estimateRange.calories.low)}–{Math.round(ingredient.estimate.estimateRange.calories.high)} kcal</p>
              ) : ingredient.custom ? (
                <div className="grid gap-2 rounded-xl bg-cream p-2">
                  <p className="text-[11px] font-bold">User-provided values for this reviewed quantity</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {([['Calories', 'calories'], ['Protein', 'proteinG'], ['Carbs', 'carbsG'], ['Fat', 'fatG'], ['Fiber', 'fiberG']] as const).map(([label, key]) => (
                      <NutritionFieldLabel key={key} metric={key}><input className="input !min-h-11 text-xs" type="number" min="0" step="0.1" value={ingredient.custom?.[key] ?? ""} onChange={(event) => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, custom: { ...(item.custom ?? { calories: "", proteinG: "", carbsG: "", fatG: "", fiberG: "" }), [key]: event.target.value } } : item))} aria-label={`${ingredient.name} custom ${label}`} placeholder={label} /></NutritionFieldLabel>
                    ))}
                  </div>
                  <button type="button" className="justify-self-start text-[11px] font-bold underline" onClick={() => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, custom: undefined } : item))}>Clear custom values</button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-bold text-coral-300">Needs a catalog value, custom value, or explicit AI estimate.</p>
                  <button type="button" className="min-h-11 rounded-full bg-cream px-3 text-[11px] font-bold underline" onClick={() => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, custom: { calories: "", proteinG: "", carbsG: "", fatG: "", fiberG: "" } } : item))}>Enter custom values</button>
                </div>
              )}
              {ingredient.assumptions.length > 0 ? <div className="flex items-center justify-end"><HelpPopover title={`${ingredient.name} assumptions`}><p>{ingredient.assumptions.join(" ")}</p></HelpPopover></div> : null}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" className="!min-h-11 !px-3 text-xs" disabled={estimateLoading || !ingredients.some((ingredient) => ingredient.included && !ingredient.food && !ingredient.estimate && !ingredient.custom)} onClick={() => void estimateSelected()}>{estimateLoading ? "Estimating…" : "Estimate selected unresolved"}</Button>
            <Button variant="soft" className="!min-h-11 !px-3 text-xs" disabled={!canPlan || savingIntent} onClick={() => void confirmMeal("plan")}>Add to plan</Button>
            <Button className="!min-h-11 !px-3 text-xs" disabled={!ready || savingIntent} onClick={() => void confirmMeal("log")}>Log meal</Button>
          </div>
          {!canPlan ? <p className="text-xs font-semibold text-muted">Planning requires an eligible goal and catalog matches or user-corrected values. Carb-limited plans require trusted catalog data. You can still log an AI estimate with its uncertainty.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
