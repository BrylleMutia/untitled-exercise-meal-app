"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DayStrip } from "@/components/DayStrip";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { FOODS } from "@/constants/foods";
import { parseMealText, servingPlanForCandidate, type CandidateServingPlan, type ParsedCandidate } from "@/utility/textMeal";
import { dayStatus, entriesForDate, totalsForDate, foodMacros, mealNutrition } from "@/utility/nutrition";
import { todayKey } from "@/utility/dates";
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
  const { snapshot, actions } = useApp();
  const [selected, setSelected] = useState(todayKey());
  const [openSlot, setOpenSlot] = useState<MealSlot | null>(null);
  const [mode, setMode] = useState<Mode>("search");
  const [editingPlannedMealId, setEditingPlannedMealId] = useState<string | null>(null);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editingNutritionId, setEditingNutritionId] = useState<string | null>(null);
  const [editingLoggedMealId, setEditingLoggedMealId] = useState<string | null>(null);
  const [expandedLoggedMealId, setExpandedLoggedMealId] = useState<string | null>(null);
  const [showNewRecipe, setShowNewRecipe] = useState(false);

  const isToday = selected === todayKey();
  const totals = totalsForDate(snapshot.nutritionLogs, selected);
  const entries = entriesForDate(snapshot.nutritionLogs, selected);
  const status = dayStatus(snapshot.nutritionLogs, selected);
  const target = snapshot.target;
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

  return (
    <div className="grid min-w-0 gap-4 pb-4">
      <Card tone="blush">
        <DayStrip selected={selected} onSelect={setSelected} />
        <div className="mt-4 flex items-center justify-between">
          <div>
            <h2 className="font-extrabold">
              {isToday ? "Today" : selected}
            </h2>
            <p className="text-xs font-bold text-ink-soft">
              {status === "complete"
                ? "Fully logged"
                : status === "partial"
                  ? "Partially logged — missing slots are not zero"
                  : "Unlogged day — no entries, that is fine"}
            </p>
          </div>
          <span className="text-sm font-extrabold tabular-nums">
            {totals.estimateRange ? "≈ " : ""}{Math.round(totals.calories)} / {target?.calories ?? 0} kcal
          </span>
        </div>
        <div className="mt-3 grid gap-2.5">
          <ProgressBar label="Protein" value={totals.proteinG} target={target?.proteinG ?? 0} unit=" g" barClassName="bg-lav-300" />
          <ProgressBar label="Carbs" value={totals.carbsG} target={target?.carbsG ?? 0} unit=" g" barClassName="bg-peach-200" />
          <ProgressBar label="Fat" value={totals.fatG} target={target?.fatG ?? 0} unit=" g" barClassName="bg-mint-200" />
        </div>
        {totals.estimateRange ? <p className="mt-2 text-[11px] font-bold text-muted">Estimated range today: {Math.round(totals.estimateRange.calories.low)}–{Math.round(totals.estimateRange.calories.high)} kcal. AI ranges are low-confidence and user-confirmed.</p> : null}
      </Card>

      {/* Planned meals for the day */}
      {snapshot.mealPlan ? (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-extrabold">Planned for this day</h2>
            <Button
              variant="soft"
              className="!min-h-11 !px-3 text-xs"
              onClick={() => setEditingPlannedMealId("new")}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add meal
            </Button>
          </div>
          {todaysPlan.length > 0 ? (
            <ul className="mt-2 grid gap-1.5">
              {todaysPlan.map((pm) => (
              <li
                key={pm.id}
                className={`grid gap-2 rounded-xl bg-cream px-3 py-2 text-sm font-semibold sm:grid-cols-[auto_1fr_auto] sm:items-center ${
                  pm.skipped ? "opacity-50" : ""
                }`}
              >
                <span className="min-w-20 font-bold text-ink-soft">{slotLabels[pm.slot]}</span>
                <span className={pm.skipped ? "line-through" : ""}>{pm.label} ×{pm.servings}</span>
                <div className="flex flex-wrap justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingPlannedMealId(pm.id)}
                    className="min-h-11 rounded-full px-3 text-xs font-extrabold text-ink underline underline-offset-2"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => actions.skipPlannedMeal(pm.id)}
                    className="min-h-11 rounded-full px-3 text-xs font-extrabold text-muted underline underline-offset-2"
                  >
                    {pm.skipped ? "plan again" : "skip"}
                  </button>
                </div>
              </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-xl bg-cream px-3 py-3 text-sm font-semibold text-muted">
              No meal is planned for this day yet. Add one to the future plan.
            </p>
          )}
          {editingPlannedMealId ? (
            <PlannedMealEditor
              key={editingPlannedMealId}
              plannedMeal={editingPlannedMealId === "new" ? undefined : todaysPlan.find((meal) => meal.id === editingPlannedMealId)}
              date={selected}
              savedMeals={snapshot.savedMeals}
              foods={foods}
              onSave={savePlannedMeal}
              onCancel={() => setEditingPlannedMealId(null)}
            />
          ) : null}
          <p className="mt-2 text-[11px] font-semibold text-muted">
            Skipping only changes the future plan snapshot — logged history is
            untouched.
          </p>
        </Card>
      ) : null}

      {/* Log entries by slot */}
      <div className="grid gap-3">
        {SLOTS.map((slot) => {
          const list = entries[slot];
          const grouped = snapshot.loggedMeals.filter((meal) => meal.date === selected && meal.slot === slot);
          const standalone = list.filter((entry) => !entry.loggedMealId);
          const open = openSlot === slot;
          return (
            <Card key={slot} className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold">{slotLabels[slot]}</h3>
                <Button
                  variant="soft"
                  className="!min-h-11 !px-3 text-xs"
                  onClick={() => {
                    setOpenSlot(open ? null : slot);
                    setMode("search");
                  }}
                  aria-expanded={open}
                >
                  <Plus className="h-4 w-4" aria-hidden /> Add
                </Button>
              </div>

              {list.length > 0 || grouped.length > 0 ? (
                <ul className="mt-2 grid gap-1.5">
                  {grouped.map((meal) => {
                    const childEntries = list.filter((entry) => entry.loggedMealId === meal.id).sort((a, b) => (a.ingredientOrder ?? 0) - (b.ingredientOrder ?? 0));
                    const mealTotals = childEntries.reduce((sum, entry) => ({ calories: sum.calories + entry.calories, proteinG: sum.proteinG + entry.proteinG, carbsG: sum.carbsG + entry.carbsG, fatG: sum.fatG + entry.fatG }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
                    const hasRange = childEntries.some((entry) => entry.valueSource === "ai_estimate" && entry.estimateRange);
                    const low = childEntries.reduce((sum, entry) => sum + (entry.estimateRange?.calories.low ?? entry.calories), 0);
                    const high = childEntries.reduce((sum, entry) => sum + (entry.estimateRange?.calories.high ?? entry.calories), 0);
                    const expanded = expandedLoggedMealId === meal.id;
                    return <li key={meal.id} className="grid gap-2 rounded-xl bg-lav-50 px-3 py-2"><div className="flex items-start justify-between gap-2"><button type="button" className="min-w-0 flex-1 text-left" aria-expanded={expanded} onClick={() => setExpandedLoggedMealId(expanded ? null : meal.id)}><p className="text-sm font-extrabold">{meal.name} <span className="text-xs font-semibold text-muted">{expanded ? "▴" : "▾"}</span></p><p className="text-[11px] font-semibold text-muted">{hasRange ? "≈ " : ""}{Math.round(mealTotals.calories)} kcal · P {Math.round(mealTotals.proteinG)} · C {Math.round(mealTotals.carbsG)} · F {Math.round(mealTotals.fatG)} · {hasRange ? `${Math.round(low)}–${Math.round(high)} kcal range · includes AI estimate` : "mixed sources"}</p></button><div className="flex shrink-0 gap-1"><button type="button" className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink" aria-label={`Edit ${meal.name}`} onClick={() => setEditingLoggedMealId(meal.id)}><Pencil className="h-4 w-4" aria-hidden /></button><button type="button" className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink" aria-label={`Delete ${meal.name}`} onClick={() => void actions.deleteLoggedMeal(meal.id)}><Trash2 className="h-4 w-4" aria-hidden /></button></div></div>{expanded ? <div className="grid gap-1 border-t border-white pt-2">{childEntries.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-2 text-[11px]"><span>{entry.foodId ? foods.find((food) => food.id === entry.foodId)?.name ?? entry.foodId : entry.customName} ×{entry.servings} · {entry.preparationBasis ?? "basis unknown"}</span><span className="font-bold">{Math.round(entry.calories)} kcal · {entry.valueSource === "ai_estimate" ? "AI estimate" : entry.valueSource === "trusted_catalog" ? "USDA/catalog" : "user value"}</span></div>)}<p className="text-[11px] font-semibold text-muted">Historical corrections affect this logged meal only. The reusable recipe remains unchanged.</p></div> : null}{editingLoggedMealId === meal.id ? <LoggedMealEditor meal={meal} entries={childEntries} foods={foods} onSave={async (nextMeal, nextIngredients) => { const saved = await actions.updateLoggedMeal(nextMeal, nextIngredients); if (saved) setEditingLoggedMealId(null); return saved; }} onCancel={() => setEditingLoggedMealId(null)} /> : null}</li>;
                  })}
                  {standalone.map((entry) => (
                    <li
                      key={entry.id}
                      className="grid gap-2 rounded-xl bg-cream px-3 py-2 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {entry.foodId ? foods.find((food) => food.id === entry.foodId)?.name ?? entry.foodId : entry.customName}
                          <span className="ml-1 font-semibold text-muted">
                            ×{entry.servings}
                          </span>
                        </p>
                        <p className="text-[11px] font-semibold text-muted">
                          {Math.round(entry.calories)} kcal · P {Math.round(entry.proteinG)} · C{" "}
                          {Math.round(entry.carbsG)} · F {Math.round(entry.fatG)} ·{" "}
                          <span className={`rounded-full px-1.5 py-0.5 ${confidenceClasses[entry.confidence]}`}>
                            {entry.estimated ? `estimate (${entry.confidence})` : "your entry"}
                          </span>
                        </p>
                        <p className="text-[10px] font-semibold text-muted">
                          {entry.source} · {entry.preparationBasis ?? "preparation unknown"}
                        </p>
                      </div>
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => setEditingNutritionId(entry.id)} aria-label={`Edit ${entry.foodId ? foods.find((food) => food.id === entry.foodId)?.name ?? entry.foodId : entry.customName}`} className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink">
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button type="button" onClick={() => actions.deleteNutrition(entry.id)} aria-label={`Delete ${entry.foodId ? foods.find((food) => food.id === entry.foodId)?.name ?? entry.foodId : entry.customName}`} className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink">
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                      {editingNutritionId === entry.id ? (
                        <NutritionEditForm
                          entry={entry}
                          foods={foods}
                          onSave={async (next) => {
                            const saved = await actions.updateNutrition(next);
                            if (saved) setEditingNutritionId(null);
                            return saved;
                          }}
                          onCancel={() => setEditingNutritionId(null)}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {open ? (
                   <EntryEditor
                   slot={slot}
                   mode={mode}
                   onMode={setMode}
                   onDone={() => setOpenSlot(null)}
                 />
              ) : null}
            </Card>
          );
        })}
      </div>

      {/* Saved meals */}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-extrabold">Saved meals</h2>
            <p className="text-xs font-semibold text-muted">
              Create, reuse, or adjust recipes without changing logged history.
            </p>
          </div>
          <Button
            variant="soft"
            className="!min-h-11 !px-3 text-xs"
            onClick={() => { setShowNewRecipe(true); setEditingRecipeId(null); }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Create
          </Button>
        </div>
        {showNewRecipe || editingRecipeId ? (
          <RecipeEditor
            key={editingRecipeId ?? "new"}
            meal={editingRecipeId ? snapshot.savedMeals.find((meal) => meal.id === editingRecipeId) : undefined}
            onSave={async (meal) => {
              const saved = await actions.saveMeal(meal);
              if (saved) { setShowNewRecipe(false); setEditingRecipeId(null); }
              return saved;
            }}
            foods={foods}
            onCancel={() => { setShowNewRecipe(false); setEditingRecipeId(null); }}
          />
        ) : null}
        <ul className="mt-3 grid gap-1.5">
          {snapshot.savedMeals.map((meal) => (
            <li key={meal.id} className="grid gap-2 rounded-xl bg-cream px-3 py-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-sm font-bold">{meal.name}</p>
                <p className="text-[11px] font-semibold text-muted">
                  {meal.ingredients.length} ingredients · {meal.servings}{" "}
                  {meal.servings === 1 ? "serving" : "servings"}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {!meal.isSystem ? (
                  <Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={() => setEditingRecipeId(meal.id)}>
                    Edit
                  </Button>
                ) : null}
                <Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={() => void actions.duplicateMeal(meal.id)}>
                  Duplicate
                </Button>
                <Button
                  variant="soft"
                  className="!min-h-11 !px-3 text-xs"
                  onClick={() => void logMeal(actions, meal.ingredients, selected, "snack", meal, foods)}
                >
                  Log it
                </Button>
                {!meal.isSystem ? (
                  <Button
                    variant="ghost"
                    className="!min-h-11 !px-3 text-xs text-coral-300"
                    onClick={() => void actions.archiveMeal(meal.id)}
                  >
                    Archive
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );

  function EntryEditor({
    slot,
    mode,
    onMode,
    onDone,
  }: {
    slot: MealSlot;
    mode: Mode;
    onMode: (m: Mode) => void;
    onDone: () => void;
  }) {
    return (
      <div className="mt-3 rounded-2xl bg-cream p-3">
        <div className="flex gap-1.5" role="tablist" aria-label="Entry type">
          {(["search", "custom"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => onMode(m)}
              className={`min-h-11 rounded-full px-3 text-xs font-extrabold ${
                mode === m ? "bg-ink text-white" : "bg-white text-ink"
              }`}
            >
              {m === "search" ? "Search or describe" : "Enter manually"}
            </button>
          ))}
        </div>

        {mode === "search" ? (
          <GuidedSearchPicker
            slot={slot}
            onMode={onMode}
            onDone={onDone}
            foods={foods}
          />
        ) : null}
        {mode === "custom" ? <CustomForm slot={slot} onDone={onDone} /> : null}
      </div>
    );
  }

  function GuidedSearchPicker({
    slot,
    onMode,
    onDone,
    foods,
  }: {
    slot: MealSlot;
    onMode: (m: Mode) => void;
    onDone: () => void;
    foods: Food[];
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
    const [analysisError, setAnalysisError] = useState("");
    const [draftRestored, setDraftRestored] = useState(false);
    const [draftReady, setDraftReady] = useState(false);
    const [query, setQuery] = useState("");
    const draftType = `nutrition-guided:${selected}:${slot}`;
    const userId = snapshot.userId;
    const profileRevision = snapshot.profile?.revision;
    const localResults = foods.filter((food) => food.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
    const appearsComposite = /,|\bwith\b|\band\b|\bplus\b/i.test(query.trim());
    const shouldSuggestAnalysis = query.trim().length >= 2 && (appearsComposite || localResults.length === 0);
    const authenticationExpired = (providerError || analysisError).startsWith("Your session has expired.");

    useEffect(() => {
      if (!userId) return;
      let active = true;
      void readDraft<{ query: string; mealName: string; ingredients: GuidedIngredient[] }>(userId, draftType).then((saved) => {
        if (!active) return;
        if (saved) {
          setQuery(saved.payload.query);
          setMealName(saved.payload.mealName);
          setIngredients(saved.payload.ingredients.map((ingredient) => ({
            ...ingredient,
            food: ingredient.food?.id ? foods.find((food) => food.id === ingredient.food?.id) ?? ingredient.food : null,
          })));
          setDraftRestored(true);
        }
        setDraftReady(true);
      });
      return () => { active = false; };
    }, [draftType, foods, userId]);

    useEffect(() => {
      if (!draftReady || !userId || (!query.trim() && ingredients.length === 0)) return;
      void writeDraft(createDraftEnvelope({
        userId,
        draftType,
        payload: { query, mealName, ingredients },
        baseVersions: { profileRevision, mealPlanVersion: snapshot.mealPlan?.version, groceryRevision: snapshot.grocery?.revision },
        ttlMs: draftTtlMs(draftType),
      })).then((saved) => {
        if (!saved) setAnalysisError("Review recovery could not be written on this device. Keep this screen open until you confirm or discard it.");
      });
    }, [draftReady, draftType, ingredients, mealName, profileRevision, query, userId]);

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

    async function confirmQuantity() {
      if (!quantityFood) return;
      const amount = Number(quantity);
      const serving = servingPlanForCandidate(quantityFood, amount, quantityUnit);
      if (!serving) return;
      if (quantityFood.fdcId && !snapshot.foods.some((food) => food.id === quantityFood.id)) {
        if (!await actions.saveFood(quantityFood)) return;
      }
      if (await addFood(actions, slot, selected, quantityFood, serving)) {
        setQuantityFood(null);
        onDone();
      }
    }

    async function confirmMeal() {
      const included = ingredients.filter((ingredient) => ingredient.included);
      if (included.length === 0 || included.some((ingredient) => !ingredient.food && !ingredient.estimate)) return;
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
        if (userId) void clearDraft(userId, draftType);
        onDone();
      }
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
    const quantityServing = quantityFood ? servingPlanForCandidate(quantityFood, Number(quantity), quantityUnit) : null;
    const quantityMacros = quantityFood && quantityServing ? foodMacros(quantityFood, quantityServing.servings) : null;

    return (
      <div className="mt-3 grid gap-2">
        {draftRestored ? <div className="flex items-center justify-between gap-2 rounded-xl bg-mint-100 px-3 py-2 text-xs font-bold" role="status"><span>Meal review draft restored.</span><button type="button" className="underline" onClick={() => { if (userId) void clearDraft(userId, draftType); setDraftRestored(false); setDraftReady(false); setQuery(""); setMealName("Meal"); setIngredients([]); setQuantityFood(null); setProviderResults({ candidates: [] }); setAnalysisError(""); onDone(); }}>Discard draft</button></div> : null}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for a food or describe a meal" className="input" aria-label="Search for a food or describe a meal" />
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" className="!min-h-11 !px-3 text-xs" disabled={providerLoading || query.trim().length < 2} onClick={() => void runProviderSearch()}>{providerLoading ? "Searching USDA…" : "Search trusted USDA"}</Button>
          <Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={() => onMode("custom")}>Enter nutrition manually</Button>
        </div>
        {shouldSuggestAnalysis ? <div className="rounded-xl bg-lav-50 px-3 py-2 text-xs font-semibold"><p>Looks like a meal description. DeepSeek can suggest ingredients and questions for you to review.</p><p className="mt-1 text-muted">Your description will be sent to DeepSeek only when you choose Analyze this meal.</p><Button className="mt-2 !min-h-11 !px-3 text-xs" disabled={analysisLoading} onClick={() => void analyzeMeal()}><Sparkles className="h-4 w-4" aria-hidden /> {analysisLoading ? "Analyzing…" : "Analyze this meal"}</Button></div> : null}
        {providerError || analysisError ? <div className="grid gap-1 text-[11px] font-bold text-coral-300" role="alert"><p>{providerError || analysisError}</p>{authenticationExpired ? <a className="w-fit underline underline-offset-2" href="/auth/sign-in?next=%2Fnutrition">Sign in again</a> : null}</div> : null}
        {localResults.length > 0 ? <ul className="grid gap-1">{localResults.map((food) => <li key={food.id}><button type="button" className="flex min-h-11 w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold" onClick={() => { setQuantityFood(food); setQuantity("1"); setQuantityUnit(food.unit === "piece" ? "piece" : "serving"); }}><span>{food.name}<span className="block text-[11px] font-semibold text-muted">{food.servingLabel} · {food.calories} kcal · {food.valueSource === "trusted_catalog" ? "trusted catalog" : "development catalog"}</span></span><Plus className="h-4 w-4 text-muted" aria-hidden /></button></li>)}</ul> : null}
        {quantityFood ? <div className="grid gap-2 rounded-xl bg-white p-3" role="group" aria-label="Review food quantity"><p className="text-sm font-extrabold">Review {quantityFood.name}</p><div className="grid grid-cols-[1fr_1fr] gap-2"><input className="input" type="number" min="0.01" step="0.25" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label="Quantity" /><select className="input" value={quantityUnit} onChange={(event) => setQuantityUnit(event.target.value)} aria-label="Serving unit"><option value="serving">serving</option><option value="g">grams</option><option value="piece">piece</option>{quantityFood.servingOptions?.map((option) => <option key={`${option.label}-${option.grams}`} value={option.unit}>{option.label}</option>)}</select></div><p className="text-[11px] font-semibold text-muted">{quantityFood.preparationBasis ?? "Preparation basis not specified"} · {quantityFood.valueSource === "trusted_catalog" ? "Trusted catalog nutrition" : "Development catalog estimate"} · {quantityFood.confidence} confidence</p>{quantityMacros ? <div className="grid grid-cols-4 gap-1 rounded-xl bg-cream px-2 py-2 text-center text-[11px] font-bold" aria-label="Nutrition preview"><span>{quantityMacros.calories} kcal</span><span>{quantityMacros.proteinG} g protein</span><span>{quantityMacros.carbsG} g carbs</span><span>{quantityMacros.fatG} g fat</span></div> : null}<div className="flex gap-2"><Button className="!min-h-11 !px-3 text-xs" disabled={!quantityServing} onClick={() => void confirmQuantity()}>Confirm food</Button><Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={() => setQuantityFood(null)}>Cancel</Button></div></div> : null}
        {providerResults.candidates.length > 0 ? <div className="rounded-xl bg-mint-100 p-2"><p className="text-[11px] font-extrabold uppercase tracking-wide">USDA FoodData Central</p><ul className="mt-1 grid gap-1">{providerResults.candidates.map((candidate) => { const food = providerFood(candidate); return <li key={candidate.fdcId}><button type="button" className="flex min-h-11 w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold" onClick={() => { setQuantityFood(food); setQuantity("1"); setQuantityUnit("serving"); }}><span>{candidate.name}<span className="block text-[11px] font-semibold text-muted">{candidate.servingLabel} · {candidate.preparationBasis} · USDA {candidate.sourceVersion}</span></span><Check className="h-4 w-4" aria-hidden /></button></li>; })}</ul></div> : null}
        {ingredients.length > 0 ? (
          <div className="grid gap-2 rounded-2xl bg-lav-50 p-3" role="region" aria-label="Guided meal review">
            <div className="flex gap-2">
              <input className="input" value={mealName} onChange={(event) => setMealName(event.target.value)} aria-label="Meal name" placeholder="Meal name" />
              <span className="self-center text-xs font-bold text-muted">≈ {Math.round(totals.calories)} kcal</span>
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
                <div className="grid grid-cols-[1fr_1fr] gap-2">
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
                        <input key={key} className="input !min-h-11 text-xs" type="number" min="0" step="0.1" value={ingredient.custom?.[key] ?? ""} onChange={(event) => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, custom: { ...(item.custom ?? { calories: "", proteinG: "", carbsG: "", fatG: "", fiberG: "" }), [key]: event.target.value } } : item))} aria-label={`${ingredient.name} custom ${label}`} placeholder={label} />
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
                {ingredient.assumptions.length > 0 ? <p className="text-[11px] font-semibold text-muted">{ingredient.assumptions.join(" ")}</p> : null}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="soft" className="!min-h-11 !px-3 text-xs" disabled={estimateLoading || !ingredients.some((ingredient) => ingredient.included && !ingredient.food && !ingredient.estimate && !ingredient.custom)} onClick={() => void estimateSelected()}>{estimateLoading ? "Estimating…" : "Estimate selected unresolved"}</Button>
              <Button className="!min-h-11 !px-3 text-xs" disabled={!ready} onClick={() => void confirmMeal()}>Confirm meal & save</Button>
            </div>
            <p className="text-[11px] font-semibold text-muted">Catalog values are authoritative. User values are explicit. AI estimates are optional, approximate, low-confidence ranges, and require your confirmation.</p>
          </div>
        ) : null}
      </div>
    );
  }

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
    const results = foods.filter((f) =>
      f.name.toLowerCase().includes(query.toLowerCase()),
    ).slice(0, 6);
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
          {results.map((food) => (
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
                  <span className="block text-[11px] font-semibold text-muted">
                    {food.servingLabel} · {food.calories} kcal
                  </span>
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
                    <span>{candidate.name}<span className="block text-[11px] font-semibold text-muted">{candidate.servingLabel} · {candidate.calories} kcal · confirmed provider record</span></span>
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
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "kcal", value: calories, set: setCalories },
            { label: "P g", value: protein, set: setProtein },
            { label: "C g", value: carbs, set: setCarbs },
            { label: "F g", value: fat, set: setFat },
          ].map((field) => (
            <input
              key={field.label}
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              placeholder={field.label}
              aria-label={field.label}
              inputMode="decimal"
              className="input !min-h-11 text-sm"
            />
          ))}
        </div>
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
          Save entry
        </Button>
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
        <p className="text-[11px] font-semibold text-muted">
          Enter all four nutrition values. Custom entries are marked as your
          values — distinct from catalog estimates.
        </p>
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
                    <p className="text-[11px] font-semibold text-muted">
                      {candidate.matched && candidate.servingPlan
                        ? `${Math.round(candidate.matched.calories * candidate.servingPlan.servings)} kcal · ${candidate.matched.servingLabel}`
                        : candidate.matched
                          ? "serving basis needs correction"
                          : "no catalog match"}
                    </p>
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
        <p className="text-[11px] font-semibold text-muted">
          DeepSeek only extracts candidates. Catalog values are authoritative
          whenever matched; unresolved ingredients may use only an explicit,
          low-confidence, ranged AI estimate after review and confirmation.
        </p>
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
      <p className="text-[11px] font-semibold text-muted">Change ingredients or quantities for this logged meal. The reusable recipe is not changed.</p>
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
        <p className="text-xs font-extrabold">Edit saved entry{food ? ` · ${food.name}` : ""}</p>
        <input className="input !min-h-11" type="number" min="0.01" step="0.25" value={servings} onChange={(event) => setServings(event.target.value)} aria-label="Servings" />
      </div>
      {!food ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Calories", calories, setCalories],
            ["Protein", protein, setProtein],
            ["Carbs", carbs, setCarbs],
            ["Fat", fat, setFat],
            ["Fiber", fiber, setFiber],
          ].map(([label, value, setValue]) => (
            <input key={label as string} className="input !min-h-11 text-xs" type="number" min="0" step="0.1" value={value as string} onChange={(event) => (setValue as (value: string) => void)(event.target.value)} aria-label={label as string} />
          ))}
        </div>
      ) : null}
      <p className="text-[11px] font-semibold text-muted">Catalog-backed values are recalculated from the stored food record; custom values remain explicitly user-provided.</p>
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
              source: "saved-meal",
              sourceVersion: "user-editable",
              assumptions: "Estimated from the saved recipe and catalog serving sizes.",
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
      <p className="text-xs font-extrabold">Edit future meal</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <select className="input" value={reference} onChange={(event) => setReference(event.target.value)} aria-label="Planned meal choice">
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
      <p className="text-[11px] font-semibold text-muted">This creates a new future plan version. Logged nutrition history is unchanged.</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={onCancel}>Cancel</Button>
        <Button className="!min-h-11 !px-3 text-xs" disabled={saving || !Number.isFinite(amount) || amount <= 0 || (!selectedMeal && !selectedFood)} onClick={() => void submit()}>
          {saving ? "Saving…" : "Save meal"}
        </Button>
      </div>
    </div>
  );
}

type IngredientDraft = { foodId: string; servings: string };

function RecipeEditor({
  meal,
  foods,
  onSave,
  onCancel,
}: {
  meal?: Meal;
  foods: Food[];
  onSave: (meal: Meal) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { snapshot: draftSnapshot } = useApp();
  const [name, setName] = useState(meal?.name ?? "");
  const [servings, setServings] = useState(String(meal?.servings ?? 1));
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(
    () => meal?.ingredients.map((ingredient) => ({ foodId: ingredient.foodId, servings: String(ingredient.servings) }))
      ?? [{ foodId: foods[0]?.id ?? "", servings: "1" }],
  );
  const [saving, setSaving] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftWasRestored, setDraftWasRestored] = useState(false);
  const [draftWriteUnavailable, setDraftWriteUnavailable] = useState(false);
  const draftType = `recipe:${meal?.id ?? "new"}`;
  useEffect(() => {
    if (!draftSnapshot.userId) return;
    let active = true;
    void readDraft<{ name: string; servings: string; ingredients: IngredientDraft[] }>(draftSnapshot.userId, draftType).then((saved) => {
      if (!active) return;
      if (saved) {
        setName(saved.payload.name);
        setServings(saved.payload.servings);
        setIngredients(saved.payload.ingredients);
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
      payload: { name, servings, ingredients },
      baseVersions: { groceryRevision: draftSnapshot.grocery?.revision },
      ttlMs: draftTtlMs(draftType),
    })).then((saved) => setDraftWriteUnavailable(!saved));
  }, [draftReady, draftSnapshot.grocery?.revision, draftSnapshot.userId, draftType, ingredients, name, servings]);
  const recipeServings = Number(servings);
  const validIngredients = ingredients.length > 0 && ingredients.every((ingredient) => {
    const quantity = Number(ingredient.servings);
    return Boolean(foods.find((food) => food.id === ingredient.foodId)) && Number.isFinite(quantity) && quantity > 0;
  });

  async function submit() {
    if (!name.trim() || !Number.isFinite(recipeServings) || recipeServings <= 0 || !validIngredients) return;
    const next: Meal = {
      id: meal?.id ?? clientId("meal"),
      name: name.trim(),
      servings: recipeServings,
      ...(meal?.notes ? { notes: meal.notes } : {}),
      ...(meal?.revision === undefined ? {} : { revision: meal.revision }),
      ingredients: ingredients.map((ingredient): RecipeIngredient => ({ foodId: ingredient.foodId, servings: Number(ingredient.servings) })),
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
    <div className="mt-3 grid gap-2 rounded-2xl bg-lav-50 p-3" role="group" aria-label={meal ? "Edit saved meal" : "Create saved meal"}>
      {draftWasRestored ? <div className="flex items-center justify-between gap-2 rounded-xl bg-mint-100 px-3 py-2 text-[11px] font-bold" role="status"><span>Recipe draft restored.</span><button type="button" className="underline" onClick={() => { if (draftSnapshot.userId) void clearDraft(draftSnapshot.userId, draftType); setDraftWasRestored(false); }}>Discard draft</button></div> : null}
      {draftWriteUnavailable ? <p className="rounded-xl bg-peach-100 px-3 py-2 text-[11px] font-bold" role="status">Draft recovery is unavailable on this device.</p> : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Recipe name" aria-label="Recipe name" />
        <input className="input" type="number" min="0.25" step="0.25" value={servings} onChange={(event) => setServings(event.target.value)} aria-label="Recipe servings" />
      </div>
      <div className="grid gap-2">
        {ingredients.map((ingredient, index) => (
          <div key={`${index}-${ingredient.foodId}`} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <select className="input" value={ingredient.foodId} onChange={(event) => setIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, foodId: event.target.value } : item))} aria-label={`Ingredient ${index + 1}`}>
              {foods.map((food) => <option key={food.id} value={food.id}>{food.name} · {food.servingLabel}</option>)}
            </select>
            <input className="input" type="number" min="0.25" step="0.25" value={ingredient.servings} onChange={(event) => setIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, servings: event.target.value } : item))} aria-label={`Ingredient ${index + 1} quantity`} />
            <Button variant="ghost" className="!min-h-11 !px-3 text-xs" disabled={ingredients.length <= 1} onClick={() => setIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="soft" className="!min-h-11 !px-3 text-xs" onClick={() => setIngredients((current) => [...current, { foodId: foods[0]?.id ?? "", servings: "1" }])}><Plus className="h-4 w-4" aria-hidden /> Ingredient</Button>
        <div className="flex gap-2">
          <Button variant="ghost" className="!min-h-11 !px-3 text-xs" onClick={onCancel}>Cancel</Button>
          <Button className="!min-h-11 !px-3 text-xs" disabled={saving || !name.trim() || !Number.isFinite(recipeServings) || recipeServings <= 0 || !validIngredients} onClick={() => void submit()}>{saving ? "Saving…" : "Save recipe"}</Button>
        </div>
      </div>
      <p className="text-[11px] font-semibold text-muted">Nutrition is calculated from the trusted catalog. Editing a recipe does not rewrite existing logs.</p>
    </div>
  );
}

async function addFood(
  actions: ReturnType<typeof useApp>["actions"],
  slot: MealSlot,
  date: string,
  food: Food,
  serving: number | CandidateServingPlan,
) {
  const servings = typeof serving === "number" ? serving : serving.servings;
  const macros = foodMacros(food, servings);
  return actions.logNutrition({
    date,
    slot,
    foodId: food.id,
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
  });
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
) {
  const entries = [];
  for (const ing of ingredients) {
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
  await actions.logSavedMeal(date, slot, entries, meal);
}
