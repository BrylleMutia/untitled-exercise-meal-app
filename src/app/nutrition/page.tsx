"use client";

import { createUuid } from "@/utility/uuid";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, Sparkles, Trash2, TriangleAlert, WandSparkles, SlidersHorizontal } from "lucide-react";
import { useApp, type AppActions } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { DailyNutritionSummary } from "@/components/nutrition/DailyNutritionSummary";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { DayStrip } from "@/components/DayStrip";
import { NutritionPills, NutritionFieldLabel } from "@/components/ui/NutritionPills";
import { type NutritionMetric } from "@/components/ui/nutritionMetrics";
import { HelpHeading, HelpPopover } from "@/components/ui/HelpPopover";
import { RecipeEditor } from "@/components/nutrition/RecipeEditor";
import { ConnectedGenerateDialog as GenerateWeekDialog } from "@/components/cooking/ConnectedGenerateDialog";
import { CookingGroupSurface, CookingOverviewButton, GenerationAttribution } from "@/components/cooking/CookingGroupSurface";
import { CombinedRecipeLibrary } from "@/components/cooking/CombinedRecipeLibrary";
import { RecipeOverview } from "@/components/nutrition/RecipeOverview";
import { RecipeCard } from "@/components/nutrition/RecipeCard";
import { RecipeFilterDialog } from "@/components/nutrition/RecipeFilterDialog";
import { activeRecipeFilterCount, emptyRecipeFilters } from "@/utility/recipeFilters";
import { LoggedRecipeServingsEditor } from "@/components/nutrition/LoggedRecipeServingsEditor";
import { AddMealDialog } from "@/components/nutrition/AddMealDialog";
import { PlannedMealActions } from "@/components/nutrition/PlannedMealActions";
import { MealRow } from "@/components/nutrition/MealRow";
import { useRecipeCardMetadata } from "@/components/nutrition/useRecipeCardMetadata";
import { useNutritionWeek } from "@/components/nutrition/useNutritionWeek";
import { PlannedNutritionSummary } from "@/components/nutrition/PlannedNutritionSummary";
import { plannedDayNutrition } from "@/utility/plannedDayNutrition";
import { nutritionWeekSnapshot } from "@/utility/nutritionWeek";
import { recipeCardCalories } from "@/utility/recipeCard";
import { needsRecipeMeasurementRefresh } from "@/utility/cookingMeasurement";
import { searchFoods } from "@/utility/foodSearch";
import { FOODS } from "@/constants/foods";
import { parseMealText, servingPlanForCandidate, type ParsedCandidate } from "@/utility/textMeal";
import { dayStatus, entriesForDate, totalsForDate, foodMacros, mealNutrition } from "@/utility/nutrition";
import { addDays, formatFullDate, startOfWeek, todayKey } from "@/utility/dates";
import { eatenMealCount } from "@/utility/eatenMealCount";
import { totalCarbLimit } from "@/utility/health";
import { targetForDate } from "@/utility/targetHistory";
import type { Confidence, Food, LoggedMeal, Meal, MealSlot, NutritionLog, PlannedMeal } from "@/types/domain";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";
import { createClient } from "@/lib/supabase/client";
import { parseNutritionTextWithProvider, searchNutritionProvider } from "@/services/nutritionProvider";

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

import { addFood } from "@/utility/mealLogging";
export default function NutritionPage() {
  const { snapshot: appSnapshot, actions: appActions, pendingMutation } = useApp();
  const recipeMetadata = useRecipeCardMetadata();
  const [selected, setSelected] = useState(todayKey());
  const [summaryMode, setSummaryMode] = useState<"planned" | "eaten">("eaten");
  const [generationOpen, setGenerationOpen] = useState(false);
  const generationReturnFocus = useRef<HTMLButtonElement | null>(null);
  const weekOf = startOfWeek(selected, appSnapshot.profile?.weekStartsOn ?? 0);
  const week = useNutritionWeek(weekOf);
  const snapshot = useMemo(() => nutritionWeekSnapshot(appSnapshot, week.data ?? {
    weekOf, mealPlan: null, targets: [], nutritionLogs: [], loggedMeals: [], grocery: null, recipes: [], foods: [],
  }), [appSnapshot, week.data, weekOf]);
  const actions: AppActions = {
    ...appActions,
    logNutrition: (input, key) => appActions.logNutrition(input, key, week.data),
    saveReviewedMeal: (input, key) => appActions.saveReviewedMeal(input, key, week.data),
    skipPlannedMeal: id => appActions.skipPlannedMeal(id, week.data),
    editMealPlan: plan => appActions.editMealPlan(plan, week.data),
    addPlannedMeal: (planned, foods, meal, key, _week, review) => appActions.addPlannedMeal(planned, foods, meal, key, week.data, review),
    deleteNutrition: id => appActions.deleteNutrition(id, week.data?.nutritionLogs.find(entry => entry.id === id)?.revision),
    deleteLoggedMeal: id => appActions.deleteLoggedMeal(id, week.data?.loggedMeals.find(entry => entry.id === id)?.revision),
  };
  const [loggingOpen, setLoggingOpen] = useState(false);
  const entrySaving = false;

  const entryModalFocus = useRef<HTMLElement | null>(null);
  const entryReturnFocus = useRef<MealSlot | null>(null);
  useEffect(() => {
    if (!loggingOpen && !entrySaving && !pendingMutation && !week.loading && !week.error && entryReturnFocus.current) {
      document.getElementById(`add-meal-${entryReturnFocus.current}`)?.focus();
      entryReturnFocus.current = null;
    }
  }, [loggingOpen, entrySaving, pendingMutation, week.loading, week.error]);
  const [logSlot, setLogSlot] = useState<MealSlot | null>(null);

  const [recipeFilters, setRecipeFilters] = useState(emptyRecipeFilters);
  const [recipeFiltersOpen, setRecipeFiltersOpen] = useState(false);
  const recipeFilterTrigger = useRef<HTMLButtonElement>(null);
  const filterCount = activeRecipeFilterCount(recipeFilters);
  const [editingPlannedMealId, setEditingPlannedMealId] = useState<string | null>(null);
  const plannedEditReturnFocus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (editingPlannedMealId === null && !week.loading && !pendingMutation) {
      plannedEditReturnFocus.current?.focus();
      plannedEditReturnFocus.current = null;
    }
  }, [editingPlannedMealId, week.loading, pendingMutation]);
  const savingPlannedLog = false;
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editingNutritionId, setEditingNutritionId] = useState<string | null>(null);
  const [editingLoggedMealId, setEditingLoggedMealId] = useState<string | null>(null);
  const loggedEditFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (editingLoggedMealId !== null || week.loading || pendingMutation || !loggedEditFocusRef.current) return;
    document.getElementById(`edit-logged-${loggedEditFocusRef.current}`)?.focus();
    loggedEditFocusRef.current = null;
  }, [editingLoggedMealId, week.loading, pendingMutation, snapshot.loggedMeals]);
  function closeLoggedMealEditor(id: string) {
    loggedEditFocusRef.current = id;
    setEditingLoggedMealId(null);
  }
  const [expandedLoggedMealId, setExpandedLoggedMealId] = useState<string | null>(null);
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [viewingRecipeId, setViewingRecipeId] = useState<string | null>(null);
  const [returnToRecipeOverview, setReturnToRecipeOverview] = useState<string | null>(null);
  const recipeReturnFocus = useRef<HTMLElement | null>(null);
  const createRecipeButton = useRef<HTMLButtonElement>(null);
  const recipeReadRequest = useRef(0);
  useEffect(() => () => { recipeReadRequest.current += 1; }, []);
  const recipeReadAccount = useRef(appSnapshot.userId);
  useEffect(() => { recipeReadAccount.current = appSnapshot.userId; }, [appSnapshot.userId]);
  const [recipeRead, setRecipeRead] = useState<{ id: string; account?: string; status: "loading" | "error" | "ready" } | null>(null);
  async function openRecipe(meal: Meal, trigger: HTMLElement) {
    const request = ++recipeReadRequest.current;
    const account = appSnapshot.userId;
    recipeReturnFocus.current = trigger; setRecipeModalOpen(false); setViewingRecipeId(null);
    if (!needsRecipeMeasurementRefresh(meal)) { setRecipeRead(null); setViewingRecipeId(meal.id); return; }
    setRecipeRead({ id: meal.id, account, status: "loading" });
    const success = await appActions.refreshSnapshot({ silent: true });
    if (request !== recipeReadRequest.current || recipeReadAccount.current !== account) return;
    setRecipeRead({ id: meal.id, account, status: success ? "ready" : "error" });
    if (success) setViewingRecipeId(meal.id);
  }
  const viewingRecipe = viewingRecipeId ? snapshot.savedMeals.find(meal => meal.id === viewingRecipeId) : undefined;
  const recipeReadCurrent = recipeRead?.account === appSnapshot.userId ? recipeRead : null;
  const recipeReadFailed = recipeReadCurrent?.status === "error" || recipeReadCurrent?.status === "ready" && (!viewingRecipe || needsRecipeMeasurementRefresh(viewingRecipe));

  const isToday = selected === todayKey();
  const totals = totalsForDate(snapshot.nutritionLogs, selected);
  const entries = entriesForDate(snapshot.nutritionLogs, selected);
  const status = dayStatus(snapshot.nutritionLogs, selected);
  const eatenCount = eatenMealCount(snapshot.nutritionLogs, snapshot.loggedMeals, selected);
  const applicableTarget = targetForDate(snapshot.nutritionWeekTargets, selected);
  const target = snapshot.profile?.targetEligibility === "unsupported" || applicableTarget?.safetyOutcome === "unsupported_population" ? null : applicableTarget;
  const existingPlanForDay = snapshot.mealPlan?.weekOf === startOfWeek(selected, appSnapshot.profile?.weekStartsOn ?? 0) ? snapshot.mealPlan : null;
  const canAddPlan = Boolean(existingPlanForDay || (target && target.safetyOutcome !== "unsupported_population"));
  const carbLimit = existingPlanForDay?.totalCarbLimit !== undefined ? existingPlanForDay.totalCarbLimit : totalCarbLimit(snapshot.profile?.dietaryPattern ?? "");
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

  function selectDay(date: string) {
    if (date === selected || savingPlannedLog || entrySaving || pendingMutation) return;
    setSelected(date);
    setLoggingOpen(false);
    setLogSlot(null);
    setEditingPlannedMealId(null);
    setEditingLoggedMealId(null);
    setEditingNutritionId(null);
  }

  function closeLogEditor() {
    entryReturnFocus.current = logSlot;
    setLoggingOpen(false);
    setLogSlot(null);
  }

  async function saveEditableGroupRecipe(id: string) {
    try {
      await appActions.cookingGroupCommand({ action: "copy-recipe", recipeId: id, idempotencyKey: createUuid() });
      setRecipeRead(null); setViewingRecipeId(null); week.refresh();
      appActions.notify("Personal recipe copy saved. Open its Edit control to change it.");
    } catch (reason) { appActions.notify(reason instanceof Error ? reason.message : "Copy failed. Retry when connected.", "error"); }
  }

  function loggedRows(slot: MealSlot) {
    const list = entries[slot];
    const grouped = snapshot.loggedMeals.filter((meal) => meal.date === selected && meal.slot === slot);
    const groupedIds = new Set(grouped.map((meal) => meal.id));
    const standalone = list.filter((entry) => !entry.loggedMealId || !groupedIds.has(entry.loggedMealId));
    return <>
      {grouped.map((meal) => {
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
              <button id={`edit-logged-${meal.id}`} type="button" disabled={Boolean(pendingMutation)} data-planned-meal-id={meal.plannedMealId} className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink disabled:opacity-50" aria-label={`Edit ${meal.name}`} onClick={() => setEditingLoggedMealId(meal.id)}><Pencil className="h-4 w-4" aria-hidden /></button>
              <button type="button" disabled={Boolean(pendingMutation)} className="grid h-11 w-11 place-items-center rounded-full bg-danger-200 text-danger-900 hover:bg-danger-300 disabled:opacity-50" aria-label={`Delete ${meal.name}`} onClick={() => void actions.deleteLoggedMeal(meal.id)}><Trash2 className="h-4 w-4" aria-hidden /></button>
          </>}>
          {expanded ? <div className="grid gap-1 border-t border-white pt-2">{childEntries.map((entry) => <div key={entry.id} className="grid min-w-0 gap-1 rounded-lg bg-white px-2 py-2 text-xs"><span className="break-words">{entry.foodId ? foods.find((food) => food.id === entry.foodId)?.name ?? entry.foodId : entry.customName} ×{entry.servings} · {entry.preparationBasis ?? "basis unknown"}</span><NutritionPills values={entry} precision={0} /><span className="font-semibold text-ink-soft">{entry.valueSource === "ai_estimate" ? "AI estimate" : entry.valueSource === "trusted_catalog" ? "USDA/catalog" : "user value"}</span></div>)}<p className="text-[11px] font-semibold text-muted">Historical corrections affect this logged meal only. The reusable recipe remains unchanged.</p></div> : null}
          {editingLoggedMealId === meal.id ? meal.sourceMode === "saved_meal" ? (
            <LoggedRecipeServingsEditor
              meal={meal} entries={childEntries} recipe={snapshot.savedMeals.find(recipe => recipe.id === meal.mealId)} foods={foods}
              onSave={async (servings, previousServings, retryKey, expectedRevision) => {
                const saved = await actions.updateLoggedMeal({ ...meal, revision: expectedRevision }, [], { servings, previousServings, retryKey });
                if (saved) closeLoggedMealEditor(meal.id);
                return saved;
              }}
              onCancel={() => closeLoggedMealEditor(meal.id)}
            />
          ) : (
            <LoggedMealEditor meal={meal} entries={childEntries} foods={foods}
              onSave={async (nextMeal, nextIngredients) => {
                const saved = await actions.updateLoggedMeal(nextMeal, nextIngredients);
                if (saved) closeLoggedMealEditor(meal.id);
                return saved;
              }}
              onCancel={() => closeLoggedMealEditor(meal.id)}
            />
          ) : null}
        </MealRow>;
      })}
      {standalone.map((entry) => {
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
            <button type="button" data-planned-meal-id={entry.plannedMealId} onClick={() => setEditingNutritionId(entry.id)} aria-label={`Edit ${name}`} className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink"><Pencil className="h-4 w-4" aria-hidden /></button>
            <button type="button" onClick={() => actions.deleteNutrition(entry.id)} aria-label={`Delete ${name}`} className="grid h-11 w-11 place-items-center rounded-full bg-danger-200 text-danger-900 hover:bg-danger-300"><Trash2 className="h-4 w-4" aria-hidden /></button>
        </>}>
          {editingNutritionId === entry.id ? <NutritionEditForm entry={entry} foods={foods} onSave={async (next) => { const saved = await actions.updateNutrition(next); if (saved) setEditingNutritionId(null); return saved; }} onCancel={() => setEditingNutritionId(null)} /> : null}
        </MealRow>;
      })}
    </>;
  }

  return (
    <CookingGroupSurface weekOf={weekOf} onWeekChange={selectDay} kind="nutrition"><div className="grid min-w-0 gap-4 pb-4">
      {generationOpen && week.data ? <GenerateWeekDialog key={`${snapshot.userId}:${weekOf}`} snapshot={snapshot} weekOf={weekOf}
        returnFocus={generationReturnFocus} pending={Boolean(pendingMutation)} unavailable={week.loading || Boolean(week.error)}
        onClose={() => setGenerationOpen(false)} onRefresh={() => { void appActions.refreshSnapshot({ silent: true }); week.refresh(); }}
        onSave={async input => { const saved = await appActions.generateNutritionWeek(input, week.data!); if (saved) week.refresh(); return saved; }} /> : null}
      <Card tone="blush">
        <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2" role="group" aria-label="Choose a nutrition week" aria-describedby="nutrition-week-range">
          <span id="nutrition-week-range" className="sr-only">Week of {formatFullDate(weekOf)} through {formatFullDate(addDays(weekOf, 6))}.</span>
          <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-1">
            <IconButton size="compact" label="Previous week" tooltip="Previous week" disabled={entrySaving || savingPlannedLog || Boolean(pendingMutation)} onClick={() => selectDay(addDays(selected, -7))}><ChevronLeft className="h-4 w-4" aria-hidden /></IconButton>
            <Button variant="soft" className="!min-h-11 !h-11 !min-w-11 !px-2.5 text-xs" disabled={entrySaving || savingPlannedLog || Boolean(pendingMutation)} onClick={() => selectDay(todayKey())}>Today</Button>
            <IconButton size="compact" label="Next week" tooltip="Next week" disabled={entrySaving || savingPlannedLog || Boolean(pendingMutation)} onClick={() => selectDay(addDays(selected, 7))}><ChevronRight className="h-4 w-4" aria-hidden /></IconButton>
          </div>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            <div className="flex w-fit max-w-full flex-wrap rounded-2xl bg-white/70" role="group" aria-label="Nutrition summary view">
              {(["planned", "eaten"] as const).map(view => <Button key={view} variant={summaryMode === view ? "primary" : "ghost"} className="!min-h-11 !h-11 min-w-max flex-1 !px-3 text-xs" aria-pressed={summaryMode === view} onClick={() => setSummaryMode(view)}>{view === "planned" ? "Planned" : "Eaten"}</Button>)}
            </div>
          </div>
        </div>
        <DayStrip weekStartsOn={appSnapshot.profile?.weekStartsOn ?? 0} selected={selected} onSelect={selectDay} disabled={entrySaving || savingPlannedLog || Boolean(pendingMutation)} />
        {week.loading ? <p className="mt-3 text-xs font-bold text-ink-soft" role="status">Loading this week’s nutrition…</p> : null}
        {week.error ? <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-danger-900" role="alert"><span>{week.error}</span><Button variant="soft" className="!min-h-11 !px-3 text-xs" onClick={week.refresh}>Retry week</Button></div> : null}
        {week.data ? <>
        {summaryMode === "planned" ? <>
          <PlannedNutritionSummary heading={isToday ? "Today" : selected} summary={plannedDayNutrition(todaysPlan, selected)} target={target}
            help={<HelpPopover title="Planned daily nutrition"><p>The full active plan includes meals already logged and excludes skipped meals. Totals use saved planned portions and are separate from food you ate.</p><p>The ring shows the estimated target remaining after the full planned total. Missing calorie values leave the ring unavailable; partial macro totals are labeled separately.</p></HelpPopover>} />
        </> : <>
        <DailyNutritionSummary heading={isToday ? "Today" : selected} target={target}
          help={<HelpPopover title="Daily nutrition"><p>Targets are estimates from your profile. Missing meal slots stay unknown, not zero intake. Estimated entries retain their ranges and confidence.</p></HelpPopover>}
          context={eatenCount === 0 ? "No meals eaten" : `${eatenCount} ${eatenCount === 1 ? "meal" : "meals"} eaten`}
          ring={{ target: target?.calories ?? null, logged: totals.calories, status, estimated: snapshot.nutritionLogs.some((entry) => entry.date === selected && entry.estimated) }}
          calories={status !== "unlogged" ? <>Logged: {totals.estimateRange ? "≈ " : ""}{Math.round(totals.calories)} kcal · Target: {target?.calories ?? "not set"} kcal</> : null}
          metrics={{ proteinG: { value: status === "unlogged" ? null : totals.proteinG }, carbsG: { value: status === "unlogged" ? null : totals.carbsG }, fatG: { value: status === "unlogged" ? null : totals.fatG } }}>
        {totals.estimateRange ? <p className="mt-2 text-[11px] font-bold text-muted">Estimated range today: {Math.round(totals.estimateRange.calories.low)}–{Math.round(totals.estimateRange.calories.high)} kcal. AI ranges are low-confidence and user-confirmed.</p> : null}
        </DailyNutritionSummary>
        </>}
        </> : null}
      </Card>

      <Card role="region" aria-labelledby="planned-meals-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><div className="flex items-center gap-1">
            <h2 id="planned-meals-heading" className="font-extrabold">Planned</h2>
            <HelpPopover title="Planned meals"><p>Planned and eaten meals appear together by slot. Editing or skipping a plan does not change food already logged.</p><p>Planned nutrition describes the shown planned portion. Eaten nutrition is the amount saved in your food log. Recipe cards in Recipes show nutrition per serving.</p></HelpPopover>
          </div><GenerationAttribution /></div>
          <div className="flex min-w-0 flex-wrap items-center gap-2"><CookingOverviewButton disabled={entrySaving || savingPlannedLog || Boolean(pendingMutation)} />
          <IconButton variant="primary" size="compact" label="Generate" tooltip="Generate"
            disabled={!week.data || week.loading || Boolean(week.error) || entrySaving || savingPlannedLog || Boolean(pendingMutation)}
            onClick={event => { generationReturnFocus.current = event.currentTarget; setGenerationOpen(true); }}><WandSparkles className="h-5 w-5" aria-hidden /></IconButton></div>
        </div>
        {week.data && !canAddPlan ? <p className="mt-2 text-xs font-semibold text-muted">Set an eligible daily goal to add to the plan. You can still log food you ate.</p> : null}
        <fieldset className="min-w-0" disabled={!week.data || week.loading || Boolean(week.error) || entrySaving || savingPlannedLog || Boolean(pendingMutation)}>
        <div className="mt-5 grid gap-4">
          {SLOTS.map((slot) => {
            const planned = todaysPlan.filter((meal) => meal.slot === slot && !loggedPlannedIds.has(meal.id)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            const eaten = entries[slot].length > 0 || snapshot.loggedMeals.some((meal) => meal.date === selected && meal.slot === slot);
            return <section key={slot} className="min-w-0 border-t border-ink/10 pt-4" aria-label={slotLabels[slot]}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-extrabold">{slotLabels[slot]}</h3>
                <IconButton id={`add-meal-${slot}`} variant="ghost" size="compact" label="Add meal" tooltip={`Add meal to ${slotLabels[slot]}`} disabled={entrySaving || Boolean(pendingMutation)} aria-expanded={loggingOpen && logSlot === slot} aria-controls={loggingOpen && logSlot === slot ? "nutrition-log-editor" : undefined} aria-haspopup="dialog" onClick={event => {
                  entryModalFocus.current = event.currentTarget;
                  if (loggingOpen && logSlot === slot) closeLogEditor();
                  else { setLoggingOpen(true); setLogSlot(slot); }
                }}><Plus className="h-5 w-5" aria-hidden /></IconButton>
              </div>
              {planned.length > 0 ? <ul className="mt-2 grid min-w-0 gap-1.5">
                {planned.map((pm) => {
                  const recipe = pm.mealId ? snapshot.savedMeals.find(meal => meal.id === pm.mealId) : undefined;
                  const savedNutrition = plannedDayNutrition([pm], selected);
                  const nutrition = Object.values(savedNutrition.metrics).some(metric => metric.value !== null)
                    ? Object.fromEntries(Object.entries(savedNutrition.metrics).map(([metric, value]) => [metric, value.value])) : null;
                  const summary = <>
                      <span className="block text-[11px] font-bold text-ink-soft">Planned{pm.skipped ? " · skipped" : ""}</span>
                      <span className="block break-words text-sm font-extrabold">{pm.label}</span>
                      <span className="block text-[11px] font-semibold text-ink-soft">{slotLabels[slot]} · {pm.servings} {pm.servings === 1 ? "serving" : "servings"}</span>
                      {nutrition ? <><NutritionPills className="mt-1" values={nutrition} nullLabel="unavailable" approximate precision={1} label="Planned portion nutrition" />{savedNutrition.affectedMeals ? <span className="mt-1 block text-xs font-semibold text-ink-soft">Partial total</span> : null}</>
                        : <span className="mt-1 block text-xs font-semibold text-ink-soft">Nutrition unavailable</span>}
                      {pm.source ? <span className="mt-1 block break-words text-[11px] font-semibold text-ink-soft">{pm.source}</span> : null}
                    </>;
                  return <MealRow key={pm.id} summary={recipe
                    ? <button type="button" className="min-h-11 w-full min-w-0 rounded-lg text-left" aria-label={`View recipe: ${pm.label}`} onClick={event => openRecipe(recipe, event.currentTarget)}>{summary}</button>
                    : <div className="min-w-0">{summary}</div>} actions={<>
                        <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink" aria-label="Edit" title={`Edit planned ${pm.label}`} aria-expanded={editingPlannedMealId === pm.id} onClick={event => { if (pm.sharedGrocery) { window.dispatchEvent(new CustomEvent("cali:open-cooking-group", { detail: { assignmentId: pm.id } })); } else { plannedEditReturnFocus.current = event.currentTarget; setEditingPlannedMealId(pm.id); } }}><Pencil className="h-4 w-4" aria-hidden /></button>
                        <PlannedMealActions meal={pm} snapshot={snapshot} week={week.data!} disabled={entrySaving || Boolean(pendingMutation)} onChanged={week.refresh} focusAfterChange={() => { entryReturnFocus.current = slot; }} />
                      </>}>
                      {editingPlannedMealId === pm.id ? <PlannedMealEditor key={pm.id} plannedMeal={pm} date={selected} savedMeals={snapshot.savedMeals} foods={foods} onSave={savePlannedMeal} onCancel={() => setEditingPlannedMealId(null)} /> : null}
                    </MealRow>;
                })}
              </ul> : null}
              {eaten ? <ul className="mt-2 grid min-w-0 gap-1.5">{loggedRows(slot)}</ul> : null}
            </section>;
          })}
        </div>
        </fieldset>
        {loggingOpen && logSlot && week.data ? <AddMealDialog key={`${selected}:${logSlot}`} date={selected} slot={logSlot} week={week.data} returnFocus={entryModalFocus} onClose={closeLogEditor} /> : null}
        {carbLimit !== null ? <p className="mt-3 text-xs font-semibold text-ink-soft">{existingPlanForDay?.dietaryPattern ?? snapshot.profile?.dietaryPattern}: at most {carbLimit} g total carbs per planned day.</p> : null}
      </Card>
      {/* Saved meals */}
      <Card role="region" aria-labelledby="saved-meals-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-1"><h2 id="saved-meals-heading" className="font-extrabold">Recipes</h2><HelpPopover title="Recipes"><p>Create, reuse, or adjust recipes without changing logged history.</p><p>Card calories are per serving. The pie pill shows how many servings the whole recipe yields. Open a recipe from its image or title. Use Add meal to review a recipe portion for planning or logging, or Generate to build a plan. Log food you ate from a meal-entry review or a planned meal.</p></HelpPopover></div>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <span className="relative inline-flex">
              <IconButton size="compact" buttonRef={recipeFilterTrigger} label="Filter recipes" tooltip="Filter recipes" aria-description={`${filterCount} active filter categories`} aria-expanded={recipeFiltersOpen} onClick={() => setRecipeFiltersOpen(true)}><SlidersHorizontal className="h-5 w-5" aria-hidden /></IconButton>
              {filterCount ? <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-xs font-bold text-white">{filterCount}</span> : null}
              <span className="sr-only">{filterCount} active filter categories</span>
            </span>
            <IconButton buttonRef={createRecipeButton} variant="primary" size="compact" label="Create" tooltip="Create"
              disabled={Boolean(pendingMutation)}
              onClick={(event) => { recipeReadRequest.current += 1; setRecipeRead(null); recipeReturnFocus.current = event.currentTarget; setReturnToRecipeOverview(null); setViewingRecipeId(null); setShowNewRecipe(true); setEditingRecipeId(null); setRecipeModalOpen(true); }}
            ><Plus className="h-5 w-5" aria-hidden /></IconButton>
          </div>
        </div>
        {showNewRecipe || editingRecipeId ? (
          <RecipeEditor
            key={`recipe-editor:${editingRecipeId ?? "new"}`}
            open={recipeModalOpen}
            returnFocus={recipeReturnFocus}
            meal={editingRecipeId ? snapshot.savedMeals.find((meal) => meal.id === editingRecipeId) : undefined}
            onArchive={editingRecipeId && !editingRecipeId.startsWith("group-copy-") ? (id, retry) => retry ? actions.retryLast() : actions.archiveMeal(id) : undefined}
            onArchived={() => {
              recipeReturnFocus.current = createRecipeButton.current;
              setReturnToRecipeOverview(null); setViewingRecipeId(null); setRecipeRead(null);
              setRecipeModalOpen(false); setEditingRecipeId(null); setShowNewRecipe(false);
            }}
            onSave={(input) => actions.saveRecipe(input)}
            onSaved={(mealId) => { setRecipeModalOpen(false); setShowNewRecipe(false); setEditingRecipeId(null); if (returnToRecipeOverview) setViewingRecipeId(mealId); }}
            foods={foods}
            onCancel={() => { setRecipeModalOpen(false); if (returnToRecipeOverview) setViewingRecipeId(returnToRecipeOverview); }}
          />
        ) : null}
        {recipeReadCurrent && (recipeReadCurrent.status === "loading" || recipeReadFailed) ? <div className={`mt-3 grid min-w-0 gap-2 ${recipeReadFailed ? "text-danger-900" : ""}`} role={recipeReadFailed ? "alert" : "status"}>
          <p className={`text-sm ${recipeReadFailed ? "text-danger-900" : "text-ink-soft"}`}>{recipeReadFailed ? "Original recipe measurements could not be loaded. Your drafts are retained. Retry to view the latest recipe." : "Loading original recipe measurements…"}</p>
          <div className="flex flex-wrap gap-2">{recipeReadFailed ? <Button variant="soft" className="!px-3 text-xs" onClick={() => { const meal = snapshot.savedMeals.find(meal => meal.id === recipeReadCurrent.id); if (meal && recipeReturnFocus.current) void openRecipe(meal, recipeReturnFocus.current); }}>Retry recipe</Button> : null}
            <Button variant="ghost" className="!px-3 text-xs" onClick={() => { recipeReadRequest.current += 1; setRecipeRead(null); setViewingRecipeId(null); recipeReturnFocus.current?.focus(); }}>Cancel</Button></div>
        </div> : null}
        {viewingRecipe && !recipeReadFailed ? <RecipeOverview
          sharedBy={viewingRecipe.id.startsWith("group-copy-") ? undefined : snapshot.profile?.name} key={`recipe-overview:${viewingRecipeId}`} meal={viewingRecipe} foods={foods} returnFocus={recipeReturnFocus}
          onClose={() => { setRecipeRead(null); setViewingRecipeId(null); }}
          editLabel={viewingRecipe.id.startsWith("group-copy-") ? "Save personal copy" : "Edit"}
          onEdit={() => { if (viewingRecipe.id.startsWith("group-copy-")) { void saveEditableGroupRecipe(viewingRecipe.id); return; } setRecipeRead(null); setReturnToRecipeOverview(viewingRecipeId); setEditingRecipeId(snapshot.savedMeals.find(meal => meal.id === viewingRecipeId)?.catalogReplacementId ?? viewingRecipeId); setShowNewRecipe(false); setViewingRecipeId(null); setRecipeModalOpen(true); }}
        /> : null}
        {recipeMetadata.loading ? <p className="mt-3 text-xs text-ink-soft" role="status">Loading favorites and Popular…</p> : null}
        {recipeMetadata.error ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-danger-100 p-3 text-xs text-danger-900" role="status"><span>{recipeMetadata.error}</span><Button variant="ghost" className="!px-2 text-xs underline" disabled={recipeMetadata.loading || recipeMetadata.pendingMeal !== null} onClick={recipeMetadata.refresh}>Refresh cards</Button></div> : null}
        {recipeFiltersOpen ? <RecipeFilterDialog applied={recipeFilters} favoritesAvailable={recipeMetadata.available} returnFocus={recipeFilterTrigger}
          onApply={filters => { setRecipeFilters(filters); setRecipeFiltersOpen(false); }} onClose={() => setRecipeFiltersOpen(false)} /> : null}
          <CombinedRecipeLibrary owned={snapshot.savedMeals} filters={recipeFilters} favoritesAvailable={recipeMetadata.available}
            favoriteIds={new Set([...recipeMetadata.recipes.values()].filter(recipe => recipe.favorite).map(recipe => recipe.mealId))}
            onClearFilters={() => setRecipeFilters(emptyRecipeFilters())} renderOwned={(meal, displayName) => (
            <li key={meal.id} className="min-w-0">
              <RecipeCard mobileCompactResources name={displayName} image={meal.image} calories={recipeCardCalories(meal, foods)}
                recipeServings={meal.servings} totalTimeMinutes={meal.totalTimeMinutes} complexity={meal.complexity}
                onOpen={event => openRecipe(meal, event.currentTarget)} metadata={recipeMetadata.recipes.get(meal.id)}
                favoriteAvailable={recipeMetadata.available} favoritePending={recipeMetadata.pendingMeal !== null}
                onFavorite={() => void recipeMetadata.favorite(meal.id)}
                imageActions={<>
                    <IconButton variant="image" size="compact" label={`${meal.id.startsWith("group-copy-") ? "Save personal copy of" : "Edit"} ${displayName}`} tooltip={meal.id.startsWith("group-copy-") ? "Save personal copy" : "Edit"} disabled={Boolean(pendingMutation)} onClick={event => { if (meal.id.startsWith("group-copy-")) { void saveEditableGroupRecipe(meal.id); return; } recipeReadRequest.current += 1; setRecipeRead(null); recipeReturnFocus.current = event.currentTarget; setReturnToRecipeOverview(null); setViewingRecipeId(null); setEditingRecipeId(meal.catalogReplacementId ?? meal.id); setShowNewRecipe(false); setRecipeModalOpen(true); }}><Pencil className="h-4 w-4" aria-hidden /></IconButton>
                </>}>
              </RecipeCard>
            </li>
          )} />
      </Card>
    </div></CookingGroupSurface>
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
        {providerError ? <p className="mt-2 text-[11px] font-bold text-danger-900" role="alert">{providerError}</p> : null}
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
        {providerError ? <p className="text-[11px] font-bold text-danger-900" role="status">{providerError}</p> : null}
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
                  <p className="mt-1 text-[11px] font-bold text-danger-900">
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
    ? createUuid()
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
    if (!name.trim() || drafts.length === 0 || drafts.length !== items.length || drafts.some(item => !foods.some(food => food.id === item.foodId))) return;
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
      <HelpHeading title="Edit logged meal" as="h3" className="text-sm font-extrabold"><p>Change ingredients or quantities for this logged meal. These are food-record servings, so an ingredient&apos;s quantity can differ from the number of recipe servings eaten. The reusable recipe and plan stay unchanged.</p></HelpHeading>
      <fieldset className="grid min-w-0 gap-2" disabled={saving}>
      {items.map((item, index) => (
        <div key={item.id} className="grid gap-2 rounded-xl bg-cream p-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <select className="input !min-h-11 text-xs" value={item.foodId} onChange={(event) => setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, foodId: event.target.value } : candidate))} aria-label={`Historical ingredient ${index + 1}`}>
            <option value="">Choose a catalog record</option>
            {foods.map((food) => <option key={food.id} value={food.id}>{food.name} · {food.valueSource === "trusted_catalog" ? "trusted" : food.valueSource === "ai_estimate" ? "AI estimate" : food.valueSource}</option>)}
          </select>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold text-ink-soft sm:max-w-40">
            <span>Food servings{foods.find(food => food.id === item.foodId)?.servingLabel ? ` · ${foods.find(food => food.id === item.foodId)!.servingLabel}` : ""}</span>
            <input className="input !min-h-11 text-xs" type="number" min="0" step="any" value={item.servings} onChange={(event) => setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, servings: event.target.value } : candidate))} aria-label={`Historical ingredient ${index + 1} quantity`} />
          </label>
          <button type="button" className="min-h-11 px-2 text-xs font-bold underline" onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}>Remove</button>
        </div>
      ))}
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" className="!min-h-11 !px-3 text-xs" disabled={saving} onClick={onCancel}>Discard changes</Button>
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
        <input className="input !min-h-11" type="number" min="0" step="any" disabled={saving} value={servings} onChange={(event) => setServings(event.target.value)} aria-label="Servings" />
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
      <HelpHeading title="Edit planned meal" as="h3" className="text-sm font-extrabold"><p>This creates a new version for this week. Logged nutrition history stays unchanged.</p></HelpHeading>
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
