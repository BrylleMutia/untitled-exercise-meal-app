"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Plus, Sparkles } from "lucide-react";
import type { AppActions } from "@/contexts/AppContext";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/Button";
import { HelpHeading, HelpPopover } from "@/components/ui/HelpPopover";
import { NutritionPills, NutritionFieldLabel } from "@/components/ui/NutritionPills";
import type { NutritionMetric } from "@/components/ui/nutritionMetrics";
import { SelectedMealActions } from "./SelectedMealActions";
import { MealEntryWarnings } from "./MealEntryWarnings";
import { mealEntryReview } from "@/utility/mealEntryReview";
import type { ManualPlanningReview } from "@/types/backend";
import { RecipeCover } from "./RecipeCover";
import { createClient } from "@/lib/supabase/client";
import { recipeCardCalories } from "@/utility/recipeCard";
import { searchFoods } from "@/utility/foodSearch";
import { searchRecipes } from "@/utility/recipeSearch";
import { recipePortion, recipeReviewToken, foodReviewToken } from "@/utility/recipePortion";
import { servingPlanForCandidate } from "@/utility/textMeal";
import { foodMacros } from "@/utility/nutrition";
import { addFood, logMeal, clientId } from "@/utility/mealLogging";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";
import { estimateNutritionMacros, matchNutritionMeal, parseNutritionTextWithProvider, searchNutritionProvider, type NutritionProviderCandidate } from "@/services/nutritionProvider";
import type { AppSnapshot, Food, Meal, MealSlot, PlannedMeal, RecipeIngredient } from "@/types/domain";

export type Mode = "search" | "custom";
export type PlanChoice = { food?: Food; meal?: Meal; servings: number; newFoods?: Food[]; plannedMeal?: PlannedMeal; fixedKey?: string; review?: ManualPlanningReview };
export type EntryContext = { selected: string; snapshot: AppSnapshot; actions: AppActions; canAddPlan: boolean; carbLimit: number | null; addToPlan: (slot: MealSlot, choice: PlanChoice) => Promise<boolean> };
type RecipeSelection = { id: string; revision?: number; token: string; servings: string; logKey: string; planKey: string; plannedMeal?: PlannedMeal; profileRevision?: number; planBasis?: string };
type FoodSubmission = { logKey: string; planKey: string; plannedMeal?: PlannedMeal; profileRevision?: number; planBasis?: string };
type GuidedDraft = { query: string; mealName: string; ingredients: GuidedIngredient[]; quantityFood?: Food | null; quantity?: string; quantityUnit?: string; recipeSelection?: RecipeSelection | null; foodSubmission?: FoodSubmission | null };

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

export function ManualMealEntry({ slot, onDone, selected, snapshot, actions, canAddPlan, carbLimit, addToPlan }: EntryContext & { slot: MealSlot; onDone: () => void }) {
  const [name, setName] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const completed = useRef(false);
  const draftWrites = useRef<Promise<unknown>>(Promise.resolve());
  const logKey = useRef("");
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
    if (!restored || !userId || completed.current) return;
    // Do not overwrite a restored payload with the form's initial values
    // during the hydration render. Subsequent user edits still autosave.
    if (!initialDraftWriteSkipped.current) {
      initialDraftWriteSkipped.current = true;
      return;
    }
    const envelope = createDraftEnvelope({
      userId,
      draftType,
      payload: { name, calories, protein, carbs, fat, servingGrams, unit, assumption },
      baseVersions: { profileRevision },
    ttlMs: draftTtlMs(draftType),
  });
    draftWrites.current = draftWrites.current.then(() => completed.current ? true : writeDraft(envelope)).then(saved => setDraftWriteUnavailable(!saved));
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
    <div className="mt-3 grid gap-2" onChangeCapture={() => { setReviewed(false); logKey.current = ""; }}>
      {draftWasRestored ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-mint-100 px-3 py-2 text-xs font-bold" role="status">
          <span>Draft restored from this device.</span>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => {
              completed.current = true;
              if (snapshot.userId) void draftWrites.current.then(() => clearDraft(snapshot.userId!, draftType));
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
      {!reviewed ? <Button disabled={!valid || !Number.isFinite(Number(servingGrams)) || Number(servingGrams) <= 0} onClick={() => setReviewed(true)}>Review meal</Button> : <>
      <Button
        disabled={!valid}
        onClick={async () => {
          logKey.current ||= clientId("manual-log");
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
          }, logKey.current);
          if (saved) {
            completed.current = true;
            await draftWrites.current;
            if (snapshot.userId) await clearDraft(snapshot.userId, draftType);
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
            completed.current = true;
            await draftWrites.current;
            if (snapshot.userId) await clearDraft(snapshot.userId, draftType);
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
            completed.current = true;
            await draftWrites.current;
            if (snapshot.userId) await clearDraft(snapshot.userId, draftType);
            onDone();
          }
        }}
      >
        Save to My Foods & log
      </Button></>}
      {!validNumbers ? (
        <p className="text-[11px] font-bold text-danger-900">
          Nutrition values must be finite, non-negative numbers.
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-ink-soft">Enter all four nutrition values.</p><HelpPopover title="Manual nutrition"><p>Custom entries are marked as your values, distinct from catalog estimates.</p></HelpPopover></div>
    </div>
  );
}

export function GuidedSearchPicker({
  slot,
  onMode,
  onDone,
  foods, snapshot, actions, selected, canAddPlan, carbLimit, addToPlan, pendingMutation, onSavingChange,
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
  const [foodSubmission, setFoodSubmission] = useState<FoodSubmission | null>(null);
  const recipeBlockedId = useId();
  const foodBlockedId = useId();
  const submitting = useRef(false);
  const recipeInput = useRef<HTMLInputElement>(null);
  const draftWrites = useRef<Promise<boolean>>(Promise.resolve(true));
  const restoredFor = useRef("");
  const closingDraft = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const quantityInput = useRef<HTMLInputElement>(null);
  const reviewing = Boolean(recipeSelection || quantityFood);
  const busy = savingIntent || Boolean(pendingMutation);
  const currentRecipe = snapshot.savedMeals.find(recipe => recipe.id === recipeSelection?.id);
  const liveFood = quantityFood ? foods.find(food => food.id === quantityFood.id) : undefined;
  const foodUnavailable = Boolean(quantityFood && !quantityFood.fdcId && !liveFood);
  const foodChanged = Boolean(quantityFood && liveFood && foodReviewToken(liveFood) !== foodReviewToken(quantityFood));
  const recipeChanged = Boolean(recipeSelection && currentRecipe && (currentRecipe.revision !== recipeSelection.revision || recipeReviewToken(currentRecipe, foods) !== recipeSelection.token));
  const portion = recipePortion(currentRecipe, foods, recipeSelection?.servings ?? "");
  const recipeResults = searchRecipes(snapshot.savedMeals, query);
  const draftType = `nutrition-guided:${selected}:${slot}`;
  const userId = snapshot.userId;
  const profileRevision = snapshot.profile?.revision;
  const planBasis = JSON.stringify([profileRevision, snapshot.mealPlan?.version ?? 0, snapshot.grocery?.revision ?? 0]);
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
        setFoodSubmission(saved.payload.foodSubmission ?? null);
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
      payload: { query, mealName, ingredients, quantityFood, quantity, quantityUnit, recipeSelection, foodSubmission },
      baseVersions: { profileRevision }, ttlMs: draftTtlMs(draftType),
    });
    draftWrites.current = draftWrites.current.then(() => writeDraft(envelope));
    void draftWrites.current.then(saved => {
      if (!saved) setAnalysisError("Review recovery could not be written on this device. Keep this screen open until you confirm or discard it.");
    });
  }, [draftReady, draftType, ingredients, mealName, profileRevision, quantity, quantityFood, quantityUnit, query, recipeSelection, foodSubmission, userId]);

  useEffect(() => {
    onSavingChange(savingIntent);
    return () => onSavingChange(false);
  }, [savingIntent, onSavingChange]);
  useEffect(() => {
    if (!draftReady) return;
    if (quantityFood) quantityInput.current?.focus();
    else if (recipeSelection) recipeInput.current?.focus();
    else {
      searchInput.current?.focus();
    }
  }, [draftReady, quantityFood, recipeSelection]);

  function cancelReview() {
    setQuantityFood(null); setRecipeSelection(null); setFoodSubmission(null); setRecipeError(""); setAnalysisError("");
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
    if (busy || submitting.current || !recipeSelection || !currentRecipe || recipeChanged || !portion || (intent === "plan" && !canAddPlan)) return;
    submitting.current = true;
    setSavingIntent(true);
    onSavingChange(true);
    setRecipeError("");
    const nextOrder = Math.max(0, ...(snapshot.mealPlan?.meals.filter(entry => entry.date === selected && entry.slot === slot).map(entry => entry.sortOrder ?? 0) ?? [])) + 1;
    const identity = intent === "plan" && recipeSelection.planBasis !== planBasis ? { ...recipeSelection, profileRevision, planBasis, planKey: clientId("recipe-plan") } : recipeSelection;
    const reviewed = intent === "plan" && !identity.plannedMeal ? { ...identity, plannedMeal: {
      id: clientId("planned-meal"), date: selected, slot, slotKey: `date:${selected}:slot:${slot}:order:${nextOrder}`, sortOrder: nextOrder,
      mealId: currentRecipe.id, label: currentRecipe.name, servings: Number(recipeSelection.servings),
    } } : identity;
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
        ? await logMeal(actions, portion.ingredients, selected, slot, currentRecipe, foods, undefined, reviewed.logKey, Number(reviewed.servings))
        : await addToPlan(slot, { meal: currentRecipe, servings: Number(reviewed.servings), plannedMeal: reviewed.plannedMeal, fixedKey: reviewed.planKey, review: { reviewAcknowledged: true, reviewPolicyVersion: "advisory_v1", profileRevision: profileRevision ?? 0, recipeRevision: currentRecipe.revision ?? 1 } });
      if (!saved) { setRecipeError("The save was not confirmed. Your recipe and portion are retained; review any error and retry."); return; }
      closingDraft.current = true;
      setDraftReady(false);
      await draftWrites.current;
      if (userId) await clearDraft(userId, draftType);
      onDone();
    } catch {
      setRecipeError("The save was not confirmed. Your recipe and portion are retained; reconnect and retry.");
    } finally { submitting.current = false; setSavingIntent(false); onSavingChange(false); }
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

  function selectFood(food: Food) {
    setRecipeSelection(null); setRecipeError(""); setAnalysisError("");
    setQuantityFood(food); setQuantity("1"); setQuantityUnit(food.unit === "piece" ? "piece" : "serving");
    setFoodSubmission({ logKey: clientId("food-log"), planKey: clientId("food-plan"), profileRevision, planBasis });
  }
  function changeFoodPortion(value: string, unit = quantityUnit) {
    setQuantity(value); setQuantityUnit(unit); setAnalysisError("");
    setFoodSubmission({ logKey: clientId("food-log"), planKey: clientId("food-plan"), profileRevision });
  }
  async function confirmQuantity(intent: "plan" | "log") {
    if (busy || submitting.current || !quantityFood || foodUnavailable || foodChanged || (intent === "plan" && !canAddPlan)) return;
    const serving = servingPlanForCandidate(quantityFood, Number(quantity), quantityUnit);
    if (!serving || !Object.values(foodMacros(quantityFood, serving.servings)).every(value => Number.isFinite(value) && value >= 0)) return;
    submitting.current = true;
    onSavingChange(true); setAnalysisError(""); setSavingIntent(true);
    const nextOrder = Math.max(0, ...(snapshot.mealPlan?.meals.filter(entry => entry.date === selected && entry.slot === slot).map(entry => entry.sortOrder ?? 0) ?? [])) + 1;
    const identity = foodSubmission ?? { logKey: clientId("food-log"), planKey: clientId("food-plan"), profileRevision };
    const submitted = { ...identity, ...(intent === "plan" && identity.planBasis !== planBasis ? { planKey: clientId("food-plan"), profileRevision, planBasis } : {}),
      ...(intent === "plan" && !identity.plannedMeal ? { plannedMeal: { id: clientId("planned-meal"), date: selected, slot, slotKey: `date:${selected}:slot:${slot}:order:${nextOrder}`, sortOrder: nextOrder, foodId: quantityFood.id, label: quantityFood.name, servings: serving.servings } } : {}) };
    setFoodSubmission(submitted);
    try {
      await draftWrites.current;
      const retained = userId && await writeDraft(createDraftEnvelope({ userId, draftType,
        payload: { query, mealName, ingredients, quantityFood, quantity, quantityUnit, recipeSelection: null, foodSubmission: submitted },
        baseVersions: { profileRevision }, ttlMs: draftTtlMs(draftType),
      }));
      if (!retained) { setAnalysisError("The food portion could not be retained on this device. Retry when draft storage is available."); return; }
      const newFood = !snapshot.foods.some(food => food.id === quantityFood.id) && quantityFood.fdcId ? quantityFood : null;
      let saved = false;
      if (intent === "plan") {
        saved = await addToPlan(slot, { food: quantityFood, servings: serving.servings, newFoods: newFood ? [newFood] : [], plannedMeal: submitted.plannedMeal, fixedKey: submitted.planKey,
          review: { reviewAcknowledged: true, reviewPolicyVersion: "advisory_v1", profileRevision: profileRevision ?? 0 } });
      } else {
        if (newFood && !await actions.saveFood(newFood)) { setAnalysisError("The food could not be saved. Your portion is retained; retry when ready."); return; }
        saved = await addFood(actions, slot, selected, quantityFood, serving, undefined, submitted.logKey);
      }
      if (!saved) { setAnalysisError("The save was not confirmed. Your food portion is retained; retry when ready."); return; }
      closingDraft.current = true; setDraftReady(false);
      await draftWrites.current;
      if (userId) await clearDraft(userId, draftType);
      onDone();
    } catch { setAnalysisError("The save was not confirmed. Your food portion is retained; reconnect and retry."); }
    finally { submitting.current = false; setSavingIntent(false); onSavingChange(false); }
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
          closingDraft.current = true;
          await draftWrites.current;
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
      closingDraft.current = true;
      await draftWrites.current;
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
  const quantityValid = Boolean(!foodUnavailable && !foodChanged && quantityServing && quantityServing.servings >= 0.0001 && quantityServing.servings <= 10000 && quantityMacros && Object.values(quantityMacros).every(value => Number.isFinite(value) && value >= 0));

  return (
    <div className="mt-3 grid min-w-0 gap-2">
      {draftRestored ? <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-mint-100 px-3 py-2 text-xs font-bold [overflow-wrap:anywhere]" role="status"><span>Meal review draft restored.</span><button type="button" className="min-h-11 underline" disabled={busy} onClick={() => { closingDraft.current = true; if (userId) void draftWrites.current.then(() => clearDraft(userId, draftType)); setDraftRestored(false); setDraftReady(false); setQuery(""); setMealName("Meal"); setIngredients([]); setQuantityFood(null); setRecipeSelection(null); setProviderResults({ candidates: [] }); setAnalysisError(""); onDone(); }}>Discard draft</button></div> : null}
      {!reviewing ? <>
      <input value={query} onChange={(event) => setQuery(event.target.value)} ref={searchInput} disabled={busy} placeholder="Search foods or saved recipes, or describe a meal." className="input" aria-label="Search foods or saved recipes, or describe a meal." />
      <div className="flex flex-wrap gap-2">
        <Button variant="soft" className="!min-h-11 !px-3 text-xs" disabled={busy || providerLoading || query.trim().length < 2} onClick={() => void runProviderSearch()}>{providerLoading ? "Searching USDA…" : "Search trusted USDA"}</Button>
        <Button variant="ghost" className="!min-h-11 !px-3 text-xs" disabled={busy} onClick={() => onMode("custom")}>Enter manually</Button>
      </div>
      {shouldSuggestAnalysis ? <div className="rounded-xl bg-lav-50 px-3 py-2 text-xs font-semibold"><div className="flex items-center justify-between gap-2"><p>Analyze sends your description to DeepSeek.</p><HelpPopover title="Meal analysis"><p>DeepSeek suggests ingredients and questions for you to review. It does not save meals. Catalog values are authoritative; optional AI estimates remain low-confidence ranges and require confirmation.</p></HelpPopover></div><Button className="mt-2 !min-h-11 !px-3 text-xs" disabled={busy || analysisLoading} onClick={() => void analyzeMeal()}><Sparkles className="h-4 w-4" aria-hidden /> {analysisLoading ? "Analyzing…" : "Analyze this meal"}</Button></div> : null}
      {providerError || analysisError ? <div className="grid gap-1 text-[11px] font-bold text-danger-900" role="alert"><p>{providerError || analysisError}</p>{authenticationExpired ? <a className="w-fit underline underline-offset-2" href="/auth/sign-in?next=%2Fnutrition">Sign in again</a> : null}</div> : null}
      {recipeResults.length > 0 ? <section className="grid gap-1" aria-label="Saved recipes matches"><h3 className="text-xs font-extrabold">Saved recipes</h3><ul className="grid gap-1">{recipeResults.map(({ recipe, kind }) => {
      const calories = recipeCardCalories(recipe, foods);
      return <li key={recipe.id}><button type="button" aria-pressed={recipeSelection?.id === recipe.id} disabled={busy} className="flex min-h-11 w-full min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold" onClick={() => selectRecipe(recipe)}><span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg"><RecipeCover image={recipe.image} name={recipe.name} selection /></span><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{recipe.name}{kind === "close" ? <span className="ml-2 text-xs text-ink-soft">Close match</span> : null}</span>{calories !== undefined ? <NutritionPills label={`${recipe.name} nutrition per serving`} values={{ calories }} approximate precision={0} /> : <span className="text-xs text-muted">Calories unavailable</span>}</button></li>;
    })}</ul></section> : null}
      </> : null}
    {recipeSelection ? <section className="mt-2 grid min-w-0 gap-3 rounded-2xl bg-lav-50 p-3 [overflow-wrap:anywhere]" aria-label="Selected meal portion" aria-busy={busy}>
      <div className="flex min-w-0 items-center gap-3"><span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl"><RecipeCover image={currentRecipe?.image} name={currentRecipe?.name ?? "Saved recipe"} selection /></span><h3 className="min-w-0 break-words text-sm font-extrabold">{currentRecipe?.name ?? "Recipe unavailable"}</h3></div>
      <label className="grid min-w-0 gap-1 text-xs font-bold">Servings<span className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2"><Button variant="soft" className="!px-0" aria-label="Decrease recipe servings" disabled={busy} onClick={() => changeRecipeServings(String(Math.max(.25, Number(recipeSelection.servings) - .25)))}>−</Button><input ref={recipeInput} className="input min-w-0 text-center" aria-label="Recipe servings" inputMode="decimal" value={recipeSelection.servings} disabled={busy} aria-invalid={!portion} aria-describedby={!portion || recipeChanged || !currentRecipe || currentRecipe.archivedAt ? recipeBlockedId : undefined} onChange={event => changeRecipeServings(event.target.value)} /><Button variant="soft" className="!px-0" aria-label="Increase recipe servings" disabled={busy} onClick={() => changeRecipeServings(String(Number(recipeSelection.servings) + .25))}>+</Button></span></label>
      {portion ? <><NutritionPills label="Selected portion preview" values={portion.nutrition} approximate /><div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><p className="text-xs text-ink-soft">{portion.source}</p>{portion.sourceDetails?.length ? <HelpPopover title="Recipe nutrition sources"><ul className="grid gap-2">{portion.sourceDetails.map(source => <li key={source}>{source}</li>)}</ul></HelpPopover> : null}</div><MealEntryWarnings review={mealEntryReview(snapshot, selected, slot, Number(recipeSelection.servings), { meal: currentRecipe })} /></> : null}
      {recipeError ? <p role="alert" className="text-xs text-danger-900">{recipeError}</p> : null}
      <SelectedMealActions blockedId={recipeBlockedId} pending={busy} valid={Boolean(portion) && !recipeChanged && Boolean(currentRecipe) && !currentRecipe?.archivedAt} canPlan={canAddPlan}
        blocked={!currentRecipe || currentRecipe.archivedAt ? "This recipe is archived or unavailable. Your portion is retained; refresh recipes or change selection." : recipeChanged ? "This recipe changed. Check the updated recipe before continuing." : !portion ? "Enter positive servings and resolve missing or invalid recipe nutrition before saving." : undefined}
        onLog={() => void confirmRecipe("log")} onPlan={() => void confirmRecipe("plan")} onChange={cancelReview} />
      {recipeChanged ? <Button variant="soft" disabled={busy} onClick={() => { if (currentRecipe) setRecipeSelection(current => current ? { ...current, revision: currentRecipe.revision, token: recipeReviewToken(currentRecipe, foods), logKey: clientId("recipe-log"), planKey: clientId("recipe-plan"), plannedMeal: undefined } : null); setRecipeError(""); }}>Use updated recipe</Button> : null}
      {!currentRecipe || currentRecipe.archivedAt || recipeChanged || !portion || recipeError ? <Button variant="ghost" disabled={busy} onClick={() => void actions.refreshSnapshot()}>Refresh recipes</Button> : null}
    </section> : null}
    {!reviewing && localResults.length > 0 ? <section aria-label="Food matches"><h3 className="mb-1 text-xs font-extrabold">Foods</h3><ul className="grid gap-1">{localResults.map(({ food, kind }) => <li key={food.id}><button type="button" disabled={busy} className="flex min-h-11 w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold" onClick={() => selectFood(food)}><span>{food.name}{kind === "close" ? <span className="ml-2 text-xs font-semibold text-ink-soft">Close match</span> : null}<span className="mt-1 block text-[11px] font-semibold text-ink-soft">{food.servingLabel} · {food.valueSource === "trusted_catalog" ? "trusted catalog" : "development catalog"}</span><NutritionPills className="mt-1" values={{ calories: food.calories }} /></span><Plus className="h-4 w-4 text-muted" aria-hidden /></button></li>)}</ul></section> : null}
      {quantityFood ? <section className="grid min-w-0 gap-3 rounded-2xl bg-lav-50 p-3 [overflow-wrap:anywhere]" aria-label="Selected food portion" aria-busy={busy}>
        <h3 className="text-sm font-extrabold">{quantityFood.name}</h3>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-xs font-bold">Quantity<input ref={quantityInput} disabled={busy} className="input min-w-0" type="number" min="0.01" step="any" value={quantity} onChange={event => changeFoodPortion(event.target.value)} aria-label="Quantity" aria-invalid={!quantityValid} aria-describedby={!quantityValid ? foodBlockedId : undefined} /></label><label className="grid min-w-0 gap-1 text-xs font-bold">Serving unit<select disabled={busy} className="input min-w-0 max-w-full" value={quantityUnit} onChange={event => changeFoodPortion(quantity, event.target.value)} aria-label="Serving unit"><option value="serving">serving</option><option value="g">grams</option><option value="piece">piece</option>{quantityFood.servingOptions?.map(option => <option key={`${option.label}-${option.grams}`} value={option.unit}>{option.label}</option>)}</select></label></div>
        <p className="text-xs text-ink-soft">{quantityFood.preparationBasis ?? "Preparation basis not specified"} · {quantityFood.source} {quantityFood.sourceVersion} · {quantityFood.valueSource === "trusted_catalog" ? "Trusted catalog nutrition" : quantityFood.valueSource === "user_provided" ? "User-provided nutrition" : "Estimated or unverified nutrition"} · {quantityFood.confidence} confidence</p>
        {quantityValid && quantityMacros ? <NutritionPills label="Nutrition preview" values={quantityMacros} approximate={quantityFood.estimated} /> : null}
        {quantityValid && quantityServing ? <MealEntryWarnings review={mealEntryReview(snapshot, selected, slot, quantityServing.servings, { food: quantityFood })} /> : null}
        {analysisError ? <p role="alert" className="text-xs font-semibold text-danger-900">{analysisError}</p> : null}
        <SelectedMealActions blockedId={foodBlockedId} pending={busy} valid={quantityValid} canPlan={canAddPlan} blocked={foodUnavailable || foodChanged ? "This food changed or is unavailable. Change selection to choose the current food; your portion is retained." : !quantityValid ? "Choose a valid positive quantity and unit with usable nutrition before saving (up to 10,000 servings)." : undefined} onLog={() => void confirmQuantity("log")} onPlan={() => void confirmQuantity("plan")} onChange={cancelReview} />
        {analysisError ? <Button variant="ghost" disabled={busy} onClick={() => void actions.refreshSnapshot()}>Refresh foods</Button> : null}
      </section> : null}
      {!reviewing && providerResults.candidates.length > 0 ? <div className="rounded-xl bg-mint-100 p-2"><p className="text-[11px] font-extrabold uppercase tracking-wide">USDA FoodData Central</p><ul className="mt-1 grid gap-1">{providerResults.candidates.map((candidate) => { const food = providerFood(candidate); return <li key={candidate.fdcId}><button type="button" disabled={busy} className="flex min-h-11 w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-sm font-semibold" onClick={() => selectFood(food)}><span>{candidate.name}<span className="block text-[11px] font-semibold text-muted">{candidate.servingLabel} · {candidate.preparationBasis} · USDA {candidate.sourceVersion}</span></span><Check className="h-4 w-4" aria-hidden /></button></li>; })}</ul></div> : null}
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
                  <p className="text-[11px] font-bold text-danger-900">Needs a catalog value, custom value, or explicit AI estimate.</p>
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
