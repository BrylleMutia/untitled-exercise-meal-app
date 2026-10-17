"use client";
import { recipeMealSlots, mealSlotLabels, parseMealSlots, validRecipeYield } from "@/utility/recipeMealSlots";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Clock, Minus, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/Button";
import { NutritionFieldLabel, NutritionPills } from "@/components/ui/NutritionPills";
import { HelpPopover } from "@/components/ui/HelpPopover";
import { Modal } from "@/components/ui/Modal";
import { RecipeCover } from "./RecipeCover";
import { RecipeImagePicker } from "./RecipeImagePicker";
import { RecipeTabs, type RecipeTab } from "./RecipeTabs";
import { RecipeNutritionBasis } from "./RecipeNutritionBasis";
import { RecipeConversionConfirmation } from "./RecipeConversionConfirmation";
import { complexityLabels, defaultRecipeComplexity, isRecipeComplexity } from "@/utility/recipeCard";
import { restoredRecipeImage } from "@/utility/recipeImage";
import { providedNutritionKeys, parseProvidedRecipeNutrition } from "@/utility/providedRecipeNutrition";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";
import { matchNutritionMeal, parseNutritionTextWithProvider, searchNutritionProvider } from "@/services/nutritionProvider";
import { createClient } from "@/lib/supabase/client";
import { ingredientDraftServing, patchRecipeIngredient, providerCandidateFood, recipeIngredientDraft, recipeIngredientIssue, recipeMethodPrefill, recipePreview, recipeServingsControl, recipeUnitConversion, prepareRecipeIngredient, recipeAuthoringUnit, recipeAuthoringUnits, type RecipeIngredientDraft, type RecipeIngredientMethod } from "@/utility/recipeEditor";
import { parseUnmeasuredIngredients } from "@/utility/cookingMeasurement";
import { searchFoods } from "@/utility/foodSearch";
import { maximumRecipeTimeMinutes, parseRecipeTime } from "@/utility/recipeTime";
import type { Food, GroceryCategory, Meal, MealSlot, PreparationBasis, RecipeImage, UnmeasuredIngredient } from "@/types/domain";
import type { CatalogRecipeEdit, ExpectedVersions, SaveRecipeInput } from "@/types/backend";

const categories: GroceryCategory[] = ["Produce", "Protein", "Dairy", "Grains", "Pantry", "Other"];
const metrics = ["calories", "proteinG", "carbsG", "fatG", "fiberG"] as const;
type CustomDraft = { name: string; servingLabel: string; grams: string; unit: "g" | "piece"; preparation: PreparationBasis; category: GroceryCategory; calories: string; proteinG: string; carbsG: string; fatG: string; fiberG: string };
type RecipeDraft = { mealSlots: MealSlot[]; mealId: string; name: string; servings: string; totalTimeMinutes: string; complexity: string; instructions: string; reference: string; image: RecipeImage | null; ingredients: RecipeIngredientDraft[]; unmeasuredIngredients: Array<UnmeasuredIngredient & { id: string }>; nutritionNotes: string; query: string; description: string; review: RecipeIngredientDraft[]; questions: string[]; custom: CustomDraft; saveKey: string; baseVersions: ExpectedVersions; catalog?: CatalogRecipeEdit; providedMacros?: Record<"calories" | "proteinG" | "carbsG" | "fatG", string> | null };
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const blankCustom = (): CustomDraft => ({ name: "", servingLabel: "", grams: "", unit: "g", preparation: "unknown", category: "Other", calories: "", proteinG: "", carbsG: "", fatG: "", fiberG: "" });
const validNumber = (value: string, min: number, max: number) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;

interface RecipeEditorProps {
  open: boolean;
  meal?: Meal;
  foods: Food[];
  returnFocus: RefObject<HTMLElement | null>;
  onSave: (input: Omit<SaveRecipeInput, "currentSnapshot">) => Promise<boolean>;
  onSaved: (mealId: string) => void;
  onCancel: () => void;
}

export function RecipeEditor({ open, meal, foods, returnFocus, onSave, onSaved, onCancel }: RecipeEditorProps) {
  const { snapshot, error, pendingMutation } = useApp();
  const source = meal;
  const freshDraft = (): RecipeDraft => ({ mealSlots: parseMealSlots(source?.mealSlots), mealId: meal?.isSystem ? uid("meal") : meal?.id ?? uid("meal"), name: meal?.name ?? "", servings: source ? String(source.servings) : "", totalTimeMinutes: source?.totalTimeMinutes === undefined ? "" : String(source.totalTimeMinutes), complexity: defaultRecipeComplexity(source?.complexity), instructions: source?.notes ?? "", reference: source?.reference ?? "", image: source?.image ?? null, ...(source?.providedNutrition ? { providedMacros: Object.fromEntries(Object.entries(source.providedNutrition).map(([key, value]) => [key, String(value)])) as RecipeDraft["providedMacros"] } : {}), ingredients: source?.ingredients.map(item => prepareRecipeIngredient(recipeIngredientDraft(item, foods.find(f => f.id === item.foodId) ?? null, uid("ingredient")))) ?? [], unmeasuredIngredients: source?.unmeasuredIngredients?.map(item => ({ ...item, id: uid("unmeasured") })) ?? [], nutritionNotes: source?.nutritionNotes ?? "", query: "", description: "", review: [], questions: [], custom: blankCustom(), saveKey: uid("recipe-save"), baseVersions: { recordRevision: meal?.isSystem ? undefined : meal?.revision, groceryRevision: snapshot.grocery?.revision }, ...(meal?.isSystem ? { catalog: { mealId: meal.id, recordRevision: meal.revision ?? 1, preferenceRevision: meal.catalogPreferenceRevision ?? 0 } } : {}) });
  const [draft, setDraft] = useState<RecipeDraft>(freshDraft);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [writeUnavailable, setWriteUnavailable] = useState(false);
  const [method, setMethod] = useState<RecipeIngredientMethod>("search");
  const [servingsBadInput, setServingsBadInput] = useState(false);
  const servingsId = useId();
  const timeId = useId();
  const complexityId = useId();
  const complexityInput = useRef<HTMLSelectElement>(null);
  const [timeBadInput, setTimeBadInput] = useState(false);
  const [tab, setTab] = useState<RecipeTab>("details");
  const [imageBusy, setImageBusy] = useState(false);
  const recipeTime = parseRecipeTime(draft.totalTimeMinutes);
  const timeInvalid = timeBadInput || !recipeTime.valid;
  const [results, setResults] = useState<Food[]>([]);
  const [searchTarget, setSearchTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState<"search" | "analyze" | "save" | null>(null);
  const [message, setMessage] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const draftType = `recipe:${meal?.id ?? "new"}`;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const completed = useRef(false);
  const active = useRef(true);
  const request = useRef(0);
  const busyRef = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [focusIngredient, setFocusIngredient] = useState<string | null>(null);
  const focusedIngredient = useRef<string | null>(null);
  const basisReturn = useRef<{ id: string; review: boolean } | null>(null);
  const userId = snapshot.userId;
  const pendingIngredient = [...draft.ingredients, ...draft.review].find(item => item.pendingConversion);
  const pendingIngredientId = pendingIngredient?.id;
  const pendingIngredientUnit = pendingIngredient?.pendingConversion?.unit;
  useEffect(() => {
    if (!open || !ready || tab !== "ingredients" || !pendingIngredientId) return;
    const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>('[data-conversion-confirmation] input')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, ready, tab, pendingIngredientId, pendingIngredientUnit]);

  useEffect(() => {
    if (!open || !ready) return;
    const frame = requestAnimationFrame(() => nameInput.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, ready]);

  useEffect(() => {
    let mounted = true;
    active.current = true;
    void readDraft<Omit<Partial<RecipeDraft>, "ingredients"> & { ingredients?: Array<RecipeIngredientDraft & { foodId?: string; servings?: string }> }>(userId, draftType).then(saved => {
      if (!mounted) return;
      if (saved) {
        const value = saved.payload;
        setDraft(current => {
          const ingredients = (value.ingredients ?? []).map(item => prepareRecipeIngredient(item.id ? item : { id: uid("ingredient"), name: foods.find(f => f.id === item.foodId)?.name ?? item.foodId ?? "Ingredient", food: foods.find(f => f.id === item.foodId) ?? null, quantity: item.servings ?? "", unit: "serving", included: true, assumptions: [] }));
          const review = (value.review ?? []).map(item => prepareRecipeIngredient(item));
          const changed = JSON.stringify(ingredients) !== JSON.stringify(value.ingredients ?? []) || JSON.stringify(parseMealSlots(value.mealSlots ?? current.mealSlots)) !== JSON.stringify(value.mealSlots);
          return { ...current, ...value, mealSlots: parseMealSlots(value.mealSlots ?? current.mealSlots), complexity: defaultRecipeComplexity(value.complexity), image: restoredRecipeImage(value.image, current.image), baseVersions: value.baseVersions ?? saved.baseVersions, ingredients, review, saveKey: changed ? uid("recipe-save") : value.saveKey ?? current.saveKey };
        });
        setRestored(true);
      }
      setReady(true);
    });
    return () => { mounted = false; active.current = false; request.current += 1; };
    // Catalog updates must not reset an open or restored recipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, draftType]);

  useEffect(() => {
    if (!ready || !userId || completed.current) return;
    if (!meal && !draft.mealSlots.length && !draft.name && !draft.servings && !draft.totalTimeMinutes && draft.complexity === "medium" && !draft.instructions && !draft.reference && !draft.nutritionNotes && !draft.unmeasuredIngredients.length && !draft.image && !draft.ingredients.length && !draft.query && !draft.description && !draft.review.length && !draft.custom.name && !draft.custom.servingLabel && !draft.custom.grams && !metrics.some(metric => draft.custom[metric])) return;
    queue.current = queue.current.then(() => writeDraft(createDraftEnvelope({ userId, draftType, payload: draft, baseVersions: draft.baseVersions, ttlMs: draftTtlMs(draftType) }))).then(saved => { if (active.current) setWriteUnavailable(!saved); });
  }, [draft, draftType, ready, userId, meal]);

  useEffect(() => {
    if (!open || tab !== "ingredients" || !focusIngredient || focusedIngredient.current === focusIngredient || disabledInputs()) return;
    root.current?.querySelector<HTMLInputElement>(`input[data-ingredient-id="${focusIngredient}"]`)?.focus();
    focusedIngredient.current = focusIngredient;
    function disabledInputs() { return Boolean(busy) || !ready; }
  }, [focusIngredient, busy, ready, open, tab]);

  function update(patch: Partial<RecipeDraft>, affectsSave = true) {
    setMessage("");
    setSaveFailed(false);
    setDraft(current => ({ ...current, ...patch, ...(affectsSave ? { saveKey: uid("recipe-save") } : {}) }));
  }
  function updateIngredient(id: string, patch: Partial<RecipeIngredientDraft>, review = false) {
    const key = review ? "review" : "ingredients";
    update({ [key]: draft[key].map(item => item.id === id ? patchRecipeIngredient(item, patch) : item) }, !review && Object.keys(patch).some(key => !["pendingConversion", "conversionBases"].includes(key)));
  }
  function changeUnit(item: RecipeIngredientDraft, food: Food | null, unit: string, review: boolean) {
    const result = recipeUnitConversion(item, food, unit);
    if (result.status === "converted") updateIngredient(item.id, result.patch, review);
    else updateIngredient(item.id, { pendingConversion: { unit, gramsPerUnit: "" } }, review);
  }
  function switchMethod(next: RecipeIngredientMethod) {
    const prefill = recipeMethodPrefill({ query: draft.query, description: draft.description, customName: draft.custom.name }, method, next);
    if (prefill) {
      if (prefill.field === "customName") update({ custom: { ...draft.custom, name: prefill.value } }, false);
      else update({ [prefill.field]: prefill.value }, false);
      if (prefill.field === "query") { request.current += 1; setResults([]); }
    }
    setMethod(next);
    setSearchTarget(null);
  }
  function choose(food: Food) {
    if (searchTarget) {
      updateIngredient(searchTarget, { food, name: food.name }, true);
      setSearchTarget(null);
    } else {
      const id = uid("ingredient");
      update({ ingredients: [...draft.ingredients, { id, name: food.name, food, quantity: "", unit: food.unit === "piece" ? "piece" : "g", included: true, assumptions: [] }] });
      setFocusIngredient(id);
    }
    setResults([]);
    update({ query: "" }, false);
  }
  async function search() {
    if (busyRef.current || draft.query.trim().length < 2) return;
    busyRef.current = true; setBusy("search"); setMessage("");
    const token = ++request.current;
    try { const matches = await searchNutritionProvider(createClient(), draft.query.trim()); if (active.current && token === request.current) { setResults(matches.candidates.map(providerCandidateFood)); if (!matches.candidates.length) setMessage("No trusted matches found. Try another name or add a custom ingredient."); } }
    catch { if (active.current) setMessage("Trusted search is unavailable. Your input is retained; retry or add a custom ingredient."); }
    finally { busyRef.current = false; if (active.current) setBusy(null); }
  }
  async function analyze() {
    if (busyRef.current || !draft.description.trim()) return;
    busyRef.current = true; setBusy("analyze"); setMessage("");
    const token = ++request.current;
    try {
      const extracted = await parseNutritionTextWithProvider(createClient(), draft.description);
      let suggested: Awaited<ReturnType<typeof matchNutritionMeal>> = [];
      let matchFailed = false;
      try { suggested = await matchNutritionMeal(createClient(), extracted.candidates.map(item => ({ name: item.name, preparation: item.preparation }))); } catch { matchFailed = true; }
      if (!active.current || token !== request.current) return;
      update({ review: extracted.candidates.map((item, index) => prepareRecipeIngredient({ id: uid("review"), name: item.name, quantity: String(item.quantity), unit: item.unit, included: item.presence === "stated", assumptions: [...item.assumptions, ...(item.presence === "possible_hidden" ? ["Possible hidden ingredient — include only if present."] : [])], food: suggested.find(match => match.ingredientIndex === index)?.candidates[0] ? providerCandidateFood(suggested.find(match => match.ingredientIndex === index)!.candidates[0]) : foods.find(food => food.name.toLowerCase() === item.name.toLowerCase()) ?? null })), questions: extracted.questions }, false);
      if (matchFailed) setMessage("Ingredient suggestions are ready, but trusted matching is unavailable. Match each ingredient, enter custom values, or retry analysis.");
    } catch { if (active.current) setMessage("Analysis is unavailable. Your description and review are retained; retry, search, or enter custom ingredients."); }
    finally { busyRef.current = false; if (active.current) setBusy(null); }
  }
  const recipeSettingsInvalid = !validRecipeYield(Number(draft.servings)) || servingsBadInput || !draft.mealSlots.length;
  const ingredientPreview = recipePreview(draft.ingredients, draft.servings, foods);
  const providedNutrition = draft.providedMacros && providedNutritionKeys.every(key => draft.providedMacros![key].trim() !== "") ? parseProvidedRecipeNutrition(Object.fromEntries(providedNutritionKeys.map(key => [key, Number(draft.providedMacros![key])]))) : null;
  const providedInvalid = Boolean(draft.providedMacros && !providedNutrition);
  const preview = providedInvalid ? null : ingredientPreview && providedNutrition ? { ...ingredientPreview, perServing: providedNutrition } : ingredientPreview;
  const extrasValid = parseUnmeasuredIngredients(draft.unmeasuredIngredients.map(({ name, measurement, optional }) => ({ name: name.trim(), measurement: measurement.trim(), ...(optional ? { optional: true } : {}) }))) !== null;
  const custom = draft.custom;
  const customValid = Boolean(custom.name.trim() && custom.servingLabel.trim()) && validNumber(custom.grams, 0.1, 100000) && metrics.slice(0, 4).every(metric => validNumber(custom[metric], 0, 10000)) && (!custom.fiberG.trim() || validNumber(custom.fiberG, 0, 10000));
  function addCustom() {
    if (!customValid) return;
    const food: Food = { id: uid("food"), name: custom.name.trim(), servingLabel: custom.servingLabel.trim(), servingGrams: Number(custom.grams), unit: custom.unit, preparationBasis: custom.preparation, category: custom.category, calories: Number(custom.calories), proteinG: Number(custom.proteinG), carbsG: Number(custom.carbsG), fatG: Number(custom.fatG), ...(custom.fiberG.trim() ? { fiberG: Number(custom.fiberG) } : {}), source: "User entered", sourceVersion: "1", valueSource: "user_provided", estimated: true, confidence: "medium" };
    choose(food);
    update({ custom: blankCustom() }, false);
    setMethod("search");
  }
  const selectedReview = draft.review.filter(item => item.included);
  const reviewIssues = selectedReview.flatMap(item => {
    const issue = recipeIngredientIssue(item, foods);
    return issue ? [{ item, issue }] : [];
  });
  const reviewValid = selectedReview.length > 0 && !reviewIssues.length && Boolean(recipePreview(selectedReview, "1", foods));
  const reviewLimit = draft.ingredients.length + draft.unmeasuredIngredients.length + selectedReview.length > 100;
  const reviewNeedsAddition = selectedReview.length > 0 || (!draft.ingredients.length && draft.review.length > 0);
  function reviewNutritionBasis(item: RecipeIngredientDraft, review: boolean) {
    basisReturn.current = { id: item.id, review };
    setTab("details");
    requestAnimationFrame(() => {
      const row = root.current?.querySelector<HTMLElement>(`[data-nutrition-basis-id="${item.id}"]`);
      (row?.querySelector<HTMLInputElement>("input") ?? row)?.focus();
    });
  }
  function returnToIngredientReview() {
    setTab("ingredients");
    requestAnimationFrame(() => {
      if (reviewValid && !reviewLimit) { root.current?.querySelector<HTMLButtonElement>("[data-add-reviewed]")?.focus(); return; }
      const id = basisReturn.current?.review ? basisReturn.current.id : selectedReview[0]?.id ?? draft.review[0]?.id;
      root.current?.querySelector<HTMLElement>(`[data-review-ingredient-id="${id}"] input`)?.focus();
    });
  }
  function resolveReview(item: RecipeIngredientDraft, issue: ReturnType<typeof recipeIngredientIssue>) {
    if (issue === "conversion") { reviewNutritionBasis(item, true); return; }
    setTab("ingredients");
    if (issue === "source") { setSearchTarget(item.id); setMethod("search"); update({ query: item.name }, false); }
    requestAnimationFrame(() => {
      const target = issue === "source" ? 'input[placeholder="e.g. cooked chicken breast"]' : issue === "pending-conversion" ? `[data-review-ingredient-id="${item.id}"] [data-conversion-confirmation] input` : `[data-review-ingredient-id="${item.id}"] input[data-ingredient-id]`;
      root.current?.querySelector<HTMLInputElement>(target)?.focus();
    });
  }
  function appendReview() {
    if (!reviewValid || reviewLimit) return;
    setDraft(current => {
      const selected = current.review.filter(item => item.included);
      if (!selected.length || selected.some(item => recipeIngredientIssue(item, foods)) || !recipePreview(selected, "1", foods) || current.ingredients.length + current.unmeasuredIngredients.length + selected.length > 100) return current;
      return { ...current, ingredients: [...current.ingredients, ...selected], review: current.review.filter(item => !item.included), questions: [], saveKey: uid("recipe-save") };
    });
    setMessage(""); setSaveFailed(false);
    focusedIngredient.current = null;
    setFocusIngredient(selectedReview[0].id);
  }
  async function discard() {
    if (busyRef.current || imageBusy) return;
    request.current += 1;
    await queue.current;
    await clearDraft(userId, draftType);
    setDraft(freshDraft()); setTab("details"); setRestored(false); setMessage(""); setSaveFailed(false); setResults([]); setSearchTarget(null);
    setMethod("search"); setServingsBadInput(false); setTimeBadInput(false);
    nameInput.current?.focus();
  }
  async function save() {
    if (busyRef.current || imageBusy || recipeSettingsInvalid || pendingConversions || reviewNeedsAddition || !extrasValid || !isRecipeComplexity(draft.complexity) || !preview || !draft.name.trim() || !draft.instructions.trim() || timeInvalid || !recipeTime.valid) return;
    busyRef.current = true; setBusy("save"); setMessage(""); setSaveFailed(false);
    const newFoods = [...new Map(draft.ingredients.flatMap(item => item.food && !foods.some(food => food.id === item.food!.id) ? [[item.food.id, item.food] as const] : [])).values()];
    try {
      await queue.current;
      const saved = await onSave({ meal: { mealSlots: draft.mealSlots, id: draft.mealId, name: draft.name.trim(), servings: Number(draft.servings), totalTimeMinutes: recipeTime.minutes, complexity: draft.complexity, notes: draft.instructions.trim(), reference: draft.reference.trim(), image: draft.image, providedNutrition, ingredients: preview.ingredients, unmeasuredIngredients: draft.unmeasuredIngredients.map(({ name, measurement, optional }) => ({ name: name.trim(), measurement: measurement.trim(), ...(optional ? { optional: true } : {}) })), nutritionNotes: draft.nutritionNotes, ...(!meal?.isSystem && meal?.revision ? { revision: meal.revision } : {}) }, newFoods, catalog: draft.catalog, expectedVersions: draft.baseVersions, idempotencyKey: draft.saveKey });
      if (saved) { completed.current = true; await queue.current; await clearDraft(userId, draftType); onSaved(draft.mealId); }
      else if (active.current) { setSaveFailed(true); setMessage("Recipe was not saved. Your draft is retained; review the message above and retry."); }
    } catch { if (active.current) { setSaveFailed(true); setMessage("Recipe was not saved. Your draft is retained; retry when the connection is available."); } }
    finally { busyRef.current = false; if (active.current) setBusy(null); }
  }
  const disabled = !ready || Boolean(busy) || Boolean(pendingMutation) || imageBusy;
  function close() {
    if (busy === "save" || imageBusy) return;
    if (draft.mealSlots.length || draft.name || draft.servings || draft.totalTimeMinutes || draft.complexity !== "medium" || draft.ingredients.length || draft.description || draft.query || draft.instructions || draft.reference || draft.nutritionNotes || draft.unmeasuredIngredients.length || draft.image || draft.custom.name) setRestored(true);
    setTab("details"); onCancel();
  }
  const servingsControl = recipeServingsControl(draft.servings);
  const local = searchFoods(foods.filter(food => food.valueSource !== "ai_estimate"), draft.query);
  const suggestions = [...local, ...results.filter(food => !local.some(match => match.food.id === food.id)).map(food => ({ food, kind: "exact" as const }))];
  function row(item: RecipeIngredientDraft, review = false) {
    const food = foods.find(food => food.id === item.food?.id) ?? item.food;
    const serving = food ? ingredientDraftServing(item, food) : null;
    const sourceUnresolved = item.measurementKind !== "unmeasured" && recipeAuthoringUnit(item.unit, food) !== item.unit;
    return <li key={item.id} data-review-ingredient-id={review ? item.id : undefined} className="grid min-w-0 gap-2 rounded-2xl bg-lav-50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-4">
      <div className="flex min-w-0 items-center gap-2">
        {review ? <label className="flex min-h-11 min-w-0 items-center gap-2 text-sm font-bold"><input type="checkbox" checked={item.included} onChange={event => updateIngredient(item.id, { included: event.target.checked }, true)} /><span className="break-words">{item.name}</span></label> : <label className="grid min-w-0 w-full gap-1 text-xs font-bold">Cooking ingredient name<input className="input min-w-0" aria-label={`${item.name} cooking name`} maxLength={256} value={item.name} onChange={event => updateIngredient(item.id, { name: event.target.value })} /></label>}
      </div>
      {!food ? <p className="text-xs font-semibold text-ink-soft">Choose a trusted match or supply custom nutrition.</p> : null}
      <label className="grid min-w-0 gap-1 text-xs font-bold">Measurement<select className="input min-w-0" aria-label={`${item.name} measurement type`} value={item.measurementKind ?? "amount"} onChange={event => updateIngredient(item.id, { measurementKind: event.target.value as RecipeIngredientDraft["measurementKind"], ...(event.target.value === "unmeasured" ? { cookingText: "To taste", nutritionServings: serving?.servings } : {}) }, review)}><option value="amount">Amount</option><option value="range">Range</option><option value="unmeasured">Unspecified</option></select></label>
      <div className="flex min-w-0 flex-wrap items-end gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1">
        {item.measurementKind === "unmeasured" ? <label className="grid min-w-0 w-full gap-1 text-xs font-bold">Cooking measurement<input className="input min-w-0" maxLength={256} value={item.cookingText ?? ""} aria-label={`${item.name} cooking measurement`} onChange={event => updateIngredient(item.id, { cookingText: event.target.value }, review)} /></label> : <>
        <label className="grid min-w-0 flex-[1_1_7rem] gap-1 text-xs font-bold">{sourceUnresolved ? `Original quantity (${item.unit})` : "Quantity"}<input data-ingredient-id={item.id} className="input" type="number" min="0.0001" step="any" placeholder="Quantity" aria-label={`${item.name} quantity`} value={item.quantity} onChange={event => updateIngredient(item.id, { quantity: event.target.value }, review)} /></label>
        {item.measurementKind === "range" ? <label className="grid min-w-0 flex-[1_1_7rem] gap-1 text-xs font-bold">Upper quantity<input className="input min-w-0" type="number" min="0.0001" step="any" value={item.upperQuantity ?? ""} aria-label={`${item.name} upper quantity`} onChange={event => updateIngredient(item.id, { upperQuantity: event.target.value }, review)} /></label> : null}
        <div className="flex min-w-0 flex-[2_1_11rem] items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-xs font-bold">Unit<select className="input" aria-label={`${item.name} unit`} value={recipeAuthoringUnit(item.pendingConversion?.unit ?? item.unit, food)} onChange={event => changeUnit(item, food, event.target.value, review)}>{recipeAuthoringUnits.map(unit => <option key={unit} value={unit}>{unit === "piece" ? "piece/s" : unit === "cup" ? "cups" : unit}</option>)}</select></label>
        </div></>}
          <Button variant="soft" className="!min-h-11 !w-11 shrink-0 !rounded-full !p-0" aria-label={`Remove ${item.name}`} onClick={() => {
            const remaining = draft[review ? "review" : "ingredients"].filter(candidate => candidate.id !== item.id);
            update({ [review ? "review" : "ingredients"]: remaining }, !review);
            focusedIngredient.current = null;
            if (remaining.length) {
              setFocusIngredient(remaining[0].id);
              root.current?.querySelector<HTMLInputElement>(`input[data-ingredient-id="${remaining[0].id}"]`)?.focus();
            } else {
              (root.current?.querySelector<HTMLInputElement>('input[placeholder="e.g. cooked chicken breast"]')
                ?? root.current?.querySelector<HTMLTextAreaElement>('textarea[placeholder="e.g. 200 g chicken breast and 100 g cooked rice"]')
                ?? nameInput.current)?.focus();
            }
          }}><Trash2 className="h-4 w-4" aria-hidden /></Button>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-xs font-bold"><input type="checkbox" checked={item.optional ?? false} aria-label={`${item.name} optional`} onChange={event => updateIngredient(item.id, { optional: event.target.checked }, review)} />Optional</label>
      <label className="grid min-w-0 gap-1 text-xs font-bold">Preparation note<input className="input min-w-0" maxLength={1000} aria-label={`${item.name} preparation note`} value={item.preparationNote ?? ""} onChange={event => updateIngredient(item.id, { preparationNote: event.target.value }, review)} placeholder="e.g. julienned, uncooked" /></label>
      {!serving && (item.quantity.trim() || item.measurementKind === "unmeasured") ? <div className="flex flex-wrap gap-2 text-xs font-semibold text-ink-soft sm:col-span-2"><p>Check this measurement or confirm its nutrition conversion in Details.</p><Button variant="ghost" className="!px-2 text-xs underline" onClick={() => reviewNutritionBasis(item, review)}>Review nutrition basis</Button></div> : null}
      {sourceUnresolved && !item.pendingConversion ? <div className="grid min-w-0 gap-2 text-xs sm:col-span-2"><p>Original measurement: {item.quantity} {item.unit}. Confirm a conversion before using an allowed unit.</p><Button variant="soft" className="w-fit !px-3 text-xs" onClick={() => changeUnit(item, food, recipeAuthoringUnit(item.unit, food), review)}>Confirm conversion</Button></div> : null}
      {item.pendingConversion ? <RecipeConversionConfirmation item={item} food={food} onChange={patch => {
        updateIngredient(item.id, patch, review);
        if ("pendingConversion" in patch && !patch.pendingConversion) requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>(`input[data-ingredient-id="${item.id}"]`)?.focus());
      }} /> : null}
      {review ? <Button variant="ghost" className="w-fit !px-2 text-xs" onClick={() => { setSearchTarget(item.id); setMethod("search"); update({ query: item.name }, false); }}>Choose or change match</Button> : null}
      {review && item.assumptions.length ? <p className="break-words text-xs text-ink-soft sm:col-span-2">{item.assumptions.join(" ")}</p> : null}
    </li>;
  }
  const pendingConversions = draft.ingredients.some(item => item.pendingConversion);
  const missingTab: RecipeTab | null = !draft.name.trim() || recipeSettingsInvalid || timeInvalid || providedInvalid || !isRecipeComplexity(draft.complexity) ? "details" : recipeSettingsInvalid || pendingConversions || reviewNeedsAddition || !extrasValid || !preview || draft.ingredients.length + draft.unmeasuredIngredients.length > 100 ? "ingredients" : !draft.instructions.trim() ? "instructions" : null;
  const missingMessage = !draft.name.trim() ? "Add a recipe name." : !validRecipeYield(Number(draft.servings)) || servingsBadInput ? "Enter a whole serving count from 1 to 10,000." : !draft.mealSlots.length ? "Choose at least one meal for this recipe." : timeInvalid ? "Check the recipe time." : !isRecipeComplexity(draft.complexity) ? "Choose a complexity before saving." : providedInvalid ? "Check all four provided macro values." : pendingConversions ? "Confirm or cancel the pending ingredient conversion before saving." : reviewNeedsAddition ? "Finish ingredient review, then choose Add selected ingredients before saving." : !extrasValid ? "Add names and measurements for seasonings or remove blank rows." : !preview ? "Add ingredients with valid quantities, confirm conversions in Details, and enter a serving count." : draft.ingredients.length + draft.unmeasuredIngredients.length > 100 ? "A recipe supports at most 100 ingredients." : !draft.instructions.trim() ? "Add instructions before saving." : "";
  const title = meal ? "Edit recipe" : "Create recipe";
  const detailsBasics = (<section className="grid min-w-0 gap-3" aria-label="Recipe basics">
        <fieldset><legend className="text-sm font-bold">Use this recipe for</legend><div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">{recipeMealSlots.map(slot => <label key={slot} className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.mealSlots.includes(slot)} onChange={event => update({ mealSlots: recipeMealSlots.filter(value => value === slot ? event.target.checked : draft.mealSlots.includes(value)) })} />{mealSlotLabels[slot]}</label>)}</div><p className="text-xs text-ink-soft">Choose one or more meals for weekly generation.</p></fieldset>
        <div className="flex min-w-0 flex-wrap items-start gap-3">
        {meal?.isSystem ? <p className="w-full rounded-xl bg-peach-50 p-3 text-sm text-ink-soft">Saving creates your personal version and replaces this predefined recipe in Saved meals. Existing planned and logged meals keep the original.</p> : null}
        <label className="grid min-w-0 flex-[2_1_16rem] gap-1 text-sm font-bold">Recipe name<input ref={nameInput} className="input" maxLength={256} value={draft.name} onChange={event => update({ name: event.target.value })} placeholder="What should we call this recipe?" /></label>
        <div className="grid min-w-0 flex-[1_1_14rem] gap-1 text-sm font-bold">
          <label htmlFor={servingsId}>Servings</label>
          <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-lav-50">
            <Button variant="soft" className="ml-[10px] !min-h-[44px] !w-[44px] shrink-0 !rounded-full !p-0" aria-label="Decrease recipe servings" disabled={servingsBadInput || servingsControl.minusDisabled} onClick={() => update({ servings: servingsControl.decrement })}><Minus className="h-4 w-4" aria-hidden /></Button>
            <input id={servingsId} className="input min-w-0 flex-1 !px-2 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" type="number" min="1" max="10000" step="1" aria-label="Recipe servings" value={draft.servings} onInput={event => setServingsBadInput(event.currentTarget.validity.badInput)} onChange={event => update({ servings: event.target.value })} placeholder="Servings" />
            <Button variant="soft" className="mr-[10px] !min-h-[44px] !w-[44px] shrink-0 !rounded-full !p-0" aria-label="Increase recipe servings" disabled={servingsBadInput || servingsControl.plusDisabled} onClick={() => update({ servings: servingsControl.increment })}><Plus className="h-4 w-4" aria-hidden /></Button>
          </div>
        </div>
        <div className="grid min-w-0 flex-[1_1_8rem] gap-1">
          <label htmlFor={timeId} className="text-sm font-bold">Time (mins.)</label>
          <div className="relative min-w-0">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center" aria-hidden><Clock className="h-4 w-4 text-ink-soft" /></span>
            <input id={timeId} className="input !pl-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" type="number" min="0" max={maximumRecipeTimeMinutes} step="1" value={draft.totalTimeMinutes} placeholder="e.g. 30" aria-invalid={timeInvalid} aria-describedby={`${timeId}-help${timeInvalid ? ` ${timeId}-error` : ""}`} onInput={event => setTimeBadInput(event.currentTarget.validity.badInput)} onChange={event => update({ totalTimeMinutes: event.target.value })} />
          </div>
        </div>
        <div className="grid min-w-0 flex-[1_1_9rem] gap-1 text-sm font-bold">
          <label htmlFor={complexityId}>Complexity (required)</label>
          <select ref={complexityInput} id={complexityId} className="input" required value={draft.complexity} aria-describedby={`${complexityId}-help`} onChange={event => update({ complexity: event.target.value })}>
            {Object.entries(complexityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        </div>
        <p id={`${complexityId}-help`} className="text-xs text-ink-soft">Choose how involved preparation is: Easy, Medium, or Hard.</p>
        <p id={`${timeId}-help`} className="text-xs text-ink-soft">Time is optional and includes preparation, cooking, and serving for the whole recipe.</p>
        {timeInvalid ? <p id={`${timeId}-error`} className="text-xs font-semibold" role="alert">Enter whole minutes between 0 and {maximumRecipeTimeMinutes.toLocaleString("en-US")}, or leave time blank.</p> : null}
        {draft.providedMacros ? <div className="grid min-w-0 gap-2 rounded-2xl bg-cream p-3" role="group" aria-label="Provided recipe nutrition">
          <h3 className="text-sm font-bold">Provided macros per serving</h3>
          <p className="text-xs text-ink-soft">These values come from the recipe source and stay as entered. Update them yourself if the recipe changes.</p>
          <div className="grid min-w-0 grid-cols-2 gap-2">{providedNutritionKeys.map(key => <label key={key} className="grid min-w-0 gap-1 text-xs font-bold">{key === "calories" ? "Provided calories (kcal)" : `Provided ${key === "proteinG" ? "protein" : key === "carbsG" ? "carbs" : "fat"} (g)`}<input className="input" type="number" min="0" max="10000" step="any" value={draft.providedMacros![key]} onChange={event => update({ providedMacros: { ...draft.providedMacros!, [key]: event.target.value } })} /></label>)}</div>
          {providedInvalid ? <p role="alert" className="text-xs font-semibold">Enter all four provided values between 0 and 10,000.</p> : null}
          <Button variant="ghost" className="w-fit text-xs" onClick={() => update({ providedMacros: null })}>Use ingredient calculations instead</Button>
        </div> : null}
      </section>);
  return <Modal open={open} title={title} initialFocus={nameInput} returnFocus={returnFocus} onClose={close} dismissalDisabled={busy === "save" || imageBusy}
    help={<HelpPopover title="Recipe authoring" label={`About ${title.toLowerCase()}`}><p>Search trusted foods or review an ingredient description. Provided recipe macros stay as entered per serving; otherwise nutrition follows ingredients and serving count. Recipe edits do not rewrite eaten entries.</p></HelpPopover>}
    footer={<div className="grid min-w-0 gap-3">
      {saveFailed && error ? <div className="grid gap-2 break-words text-sm text-ink-soft" role="alert">
        <p>{error.code === "stale_version" ? "Your saved recipe or groceries changed. Review your draft before applying it to the latest version." : error.message}</p>
        {error.code === "stale_version" && draft.catalog && snapshot.savedMeals.find(item => item.id === draft.catalog!.mealId)?.catalogReplacementId
          ? <p>There is now a personal version. Cancel this draft and open Edit on that saved version.</p>
          : error.code === "stale_version" ? <Button variant="soft" disabled={disabled} className="w-fit text-xs" onClick={() => {
            const catalog = draft.catalog && snapshot.savedMeals.find(item => item.id === draft.catalog!.mealId);
            update({ baseVersions: { recordRevision: draft.catalog ? undefined : snapshot.savedMeals.find(item => item.id === draft.mealId)?.revision, groceryRevision: snapshot.grocery?.revision },
              ...(catalog ? { catalog: { mealId: catalog.id, recordRevision: catalog.revision ?? 1, preferenceRevision: catalog.catalogPreferenceRevision ?? 0 } } : {}) });
          }}>Use latest version</Button> : null}
      </div> : null}
      {busy ? <p className="text-sm font-bold" role="status">{busy === "search" ? "Searching trusted foods…" : busy === "analyze" ? "Analyzing ingredients…" : "Saving recipe…"}</p> : null}
      {message ? <p className="break-words text-sm font-semibold" role="status">{message}</p> : null}
      {!disabled && missingMessage ? <div className="flex flex-wrap items-center gap-1 text-xs font-semibold text-ink-soft"><span>{missingMessage}</span>{!isRecipeComplexity(draft.complexity) ? <Button variant="ghost" className="!min-h-11 !px-2 text-xs underline" onClick={() => complexityInput.current?.focus()}>Choose complexity</Button> : null}{missingTab && tab !== missingTab ? <Button variant="ghost" className="!min-h-11 !px-2 text-xs underline" onClick={() => { setTab(missingTab); requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden]) input, [role="tabpanel"]:not([hidden]) textarea')?.focus()); }}>Go to {missingTab}</Button> : null}</div> : null}
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:justify-between">
        <Button variant="soft" className="min-w-0 !px-2 sm:!px-5" disabled={busy === "save" || imageBusy} onClick={close}>Cancel</Button>
        <Button className="min-w-0 !px-2 sm:!px-5" disabled={disabled || recipeSettingsInvalid || pendingConversions || reviewNeedsAddition || !extrasValid || !isRecipeComplexity(draft.complexity) || !preview || !draft.name.trim() || !draft.instructions.trim() || timeInvalid || draft.ingredients.length + draft.unmeasuredIngredients.length > 100} onClick={() => void save()}>{meal ? "Save changes" : "Save"}</Button>
      </div>
    </div>}>
    <div ref={root} className="grid min-w-0 gap-4">
    {restored ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold" role="status"><span>Recipe draft restored.</span><Button variant="ghost" disabled={disabled} className="!px-2 text-xs underline" onClick={() => void discard()}>Discard draft</Button></div> : null}
    {writeUnavailable ? <p className="mt-2 text-xs font-semibold" role="status">Draft recovery is unavailable on this device. Keep this form open until saved.</p> : null}
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-center gap-2 rounded-2xl bg-lav-50 px-3 py-4">
      <RecipeCover image={draft.image} name={draft.name} />
      <RecipeImagePicker image={draft.image} onChange={image => update({ image })} disabled={!ready || Boolean(busy) || Boolean(pendingMutation)} onBusy={setImageBusy} />
    </div>
    <fieldset disabled={disabled} className="grid min-w-0 gap-6 disabled:opacity-70">
      <RecipeTabs active={tab} onChange={setTab} disabled={disabled} panels={{
        ingredients: <section className="grid min-w-0 gap-3 " aria-label="Recipe ingredients">
        <h3 className="text-lg font-extrabold">Ingredients</h3>
        <div className="flex flex-wrap gap-2">{([['search','Search ingredients'],['describe','Describe ingredients'],['custom','Add custom ingredient']] as const).map(([key,label]) => <Button key={key} variant={method === key ? "primary" : "soft"} aria-pressed={method === key} className="!px-3 text-xs" onClick={() => switchMethod(key)}>{key === "search" ? <Search className="h-4 w-4" aria-hidden /> : key === "describe" ? <Sparkles className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}{label}</Button>)}</div>
        {method === "search" ? <div className="grid min-w-0 gap-2">
          {searchTarget ? <p className="text-xs font-semibold">Select a match for the reviewed ingredient.</p> : null}
          <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-xs font-bold">Ingredient search<input className="input" maxLength={180} value={draft.query} placeholder="e.g. cooked chicken breast" onChange={event => { request.current += 1; setResults([]); update({ query: event.target.value }, false); }} /></label>
          <Button variant="soft" className="w-fit !px-3 text-xs" disabled={draft.query.trim().length < 2} onClick={() => void search()}>Search trusted USDA</Button>
          {suggestions.map(({ food, kind }) => <Button key={food.id} variant="soft" className="min-w-0 !justify-between !px-3 !text-left text-xs" onClick={() => choose(food)}><span className="min-w-0 break-words">{food.name}{kind === "close" ? <span className="ml-2 font-semibold text-ink-soft">Close match</span> : null}<span className="block font-normal">{food.servingLabel} · {food.preparationBasis ?? "basis unknown"} · {food.source}</span></span><Plus className="h-4 w-4 shrink-0" aria-hidden /></Button>)}
        </div> : null}
        {method === "describe" ? <div className="grid min-w-0 gap-2">
          <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-sm font-bold">Ingredient description<textarea className="input min-h-24 resize-y !py-3" maxLength={4000} value={draft.description} placeholder="e.g. 200 g chicken breast and 100 g cooked rice" onChange={event => update({ description: event.target.value }, false)} /></label>
          <p className="text-xs text-ink-soft">Analyze sends this description to DeepSeek. Review the ingredients and trusted matches before adding them.</p>
          <Button className="w-fit !px-3 text-xs" disabled={!draft.description.trim()} onClick={() => void analyze()}>Analyze ingredients</Button>
        </div> : null}
        {method === "custom" ? <div className="grid min-w-0 gap-2" role="group" aria-label="Custom ingredient">
          <h4 className="text-sm font-bold">Custom ingredient</h4><p className="text-xs text-ink-soft">Enter nutrition for one labeled serving. This ingredient is saved with your recipe.</p>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">{([['name','Ingredient name'],['servingLabel','Serving label'],['grams','Grams per serving']] as const).map(([key,label]) => <label key={key} className="grid min-w-0 gap-1 text-xs font-bold">{label}<input className="input" aria-label={`Custom ${label.toLowerCase()}`} type={key === "grams" ? "number" : "text"} step="any" min={key === "grams" ? "0.1" : undefined} maxLength={256} value={custom[key]} placeholder={key === "servingLabel" ? "e.g. 1 scoop (30 g)" : label} onChange={event => update({ custom: { ...custom, [key]: event.target.value } }, false)} /></label>)}
          <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-xs font-bold">Serving type<select className="input" value={custom.unit} onChange={event => update({ custom: { ...custom, unit: event.target.value as CustomDraft["unit"] } }, false)}><option value="g">By weight</option><option value="piece">One piece per serving</option></select></label>
          <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-xs font-bold">Preparation<select className="input" value={custom.preparation} onChange={event => update({ custom: { ...custom, preparation: event.target.value as PreparationBasis } }, false)}>{["unknown","raw","cooked","baked","dry","prepared","as_labeled"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
          <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-xs font-bold">Grocery category<select className="input" value={custom.category} onChange={event => update({ custom: { ...custom, category: event.target.value as GroceryCategory } }, false)}>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">{metrics.map(metric => <NutritionFieldLabel key={metric} metric={metric}><input className="input" type="number" min="0" max="10000" step="any" aria-label={`Custom ${metric === "calories" ? "calories" : metric === "fiberG" ? "fiber (optional)" : metric.replace("G", "")}`} placeholder={metric === "fiberG" ? "Optional" : "Required"} value={custom[metric]} onChange={event => update({ custom: { ...custom, [metric]: event.target.value } }, false)} /></NutritionFieldLabel>)}</div>
          <Button variant="soft" className="w-fit !px-3 text-xs" disabled={!customValid} onClick={addCustom}>Add custom ingredient to recipe</Button>
        </div> : null}
        {draft.ingredients.length ? <ul className="grid min-w-0 gap-2">{draft.ingredients.map(item => row(item))}</ul> : <p className="text-sm text-ink-soft">Add an ingredient to start your recipe.</p>}
        <section className="grid min-w-0 gap-2" aria-label="Unmeasured cooking ingredients">
          <h4 className="text-sm font-bold">Seasonings and unmeasured items</h4>
          {draft.unmeasuredIngredients.map((item, index) => <div key={item.id} className="grid min-w-0 grid-cols-1 gap-2 rounded-xl bg-lav-50 p-3">
            <label className="grid min-w-0 gap-1 text-xs font-bold">Ingredient name<input className="input min-w-0" maxLength={256} aria-label={`Unmeasured ingredient ${index + 1} name`} value={item.name} onChange={event => update({ unmeasuredIngredients: draft.unmeasuredIngredients.map(candidate => candidate.id === item.id ? { ...candidate, name: event.target.value } : candidate) })} /></label>
            <label className="grid min-w-0 gap-1 text-xs font-bold">Measurement<input className="input min-w-0" maxLength={256} aria-label={`Unmeasured ingredient ${index + 1} measurement`} value={item.measurement} onChange={event => update({ unmeasuredIngredients: draft.unmeasuredIngredients.map(candidate => candidate.id === item.id ? { ...candidate, measurement: event.target.value } : candidate) })} /></label>
            <Button variant="ghost" className="w-fit !px-2 text-xs" onClick={() => update({ unmeasuredIngredients: draft.unmeasuredIngredients.filter(candidate => candidate.id !== item.id) })}>Remove seasoning</Button>
          </div>)}
          <Button variant="soft" className="w-fit !px-3 text-xs" disabled={draft.ingredients.length + draft.unmeasuredIngredients.length >= 100} onClick={() => update({ unmeasuredIngredients: [...draft.unmeasuredIngredients, { id: uid("unmeasured"), name: "", measurement: "To taste" }] })}><Plus className="h-4 w-4" aria-hidden />Add seasoning or garnish</Button>
        </section>
        {draft.review.length ? <section className="grid min-w-0 gap-3" aria-label="Ingredient review"><h4 className="text-sm font-bold">Review suggested ingredients</h4>{draft.questions.map((question,index) => <p key={index} className="text-xs text-ink-soft">{question}</p>)}<ul className="grid gap-2">{draft.review.map(item => row(item, true))}</ul>
          <div className="grid gap-2 text-xs font-semibold text-ink-soft" aria-live="polite">
            {!selectedReview.length ? <p>Select at least one suggested ingredient to add.</p> : null}
            {reviewIssues.map(({ item, issue }) => <div key={item.id} className="flex min-w-0 flex-wrap items-center gap-2"><p className="break-words">{item.name}: {issue === "source" ? "Choose a trusted source or supply custom nutrition." : issue === "amount" ? "Correct the quantity or range; nutrition servings must be between 0.0001 and 10,000." : issue === "pending-conversion" ? "Confirm or cancel the pending unit conversion." : item.measurementKind === "unmeasured" ? "Enter an assumed nutrition weight in Details → Nutrition basis." : `Confirm a valid ingredient-specific gram weight for ${item.unit} in Details → Nutrition basis.`}</p><Button variant="ghost" className="!px-2 text-xs underline" onClick={() => resolveReview(item, issue)}>{issue === "conversion" ? "Review nutrition basis" : issue === "source" ? "Choose nutrition source" : issue === "amount" ? "Review quantity" : "Review conversion"}</Button></div>)}
            {reviewLimit ? <p>A recipe supports at most 100 ingredients, including seasonings. Deselect suggestions or remove ingredients before adding.</p> : null}
            {reviewValid && !reviewLimit ? <p>Selected ingredients are ready. Choose Add selected ingredients to include them in the recipe.</p> : null}
          </div>
          <Button data-add-reviewed className="w-fit !px-3 text-xs" disabled={!reviewValid || reviewLimit} onClick={appendReview}>Add selected ingredients</Button></section> : null}
      </section>,
        details: <div className="grid min-w-0 gap-4">{detailsBasics}<section className="grid gap-2 rounded-2xl bg-lav-50 p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3" aria-label="Recipe nutrition"><h4 className="text-sm font-extrabold">Per serving</h4>{preview ? <NutritionPills values={preview.perServing} precision={1} approximate label="Recipe nutrition per serving" /> : <p className="text-sm text-ink-soft">Add ingredients with nutrition, enter valid quantities and a serving count to see the per-serving totals.</p>}</section><RecipeNutritionBasis ingredients={draft.ingredients} review={draft.review} foods={foods} notes={draft.nutritionNotes} hasUnmeasured={draft.unmeasuredIngredients.length > 0} onIngredient={updateIngredient} onReviewIngredient={(id, patch) => updateIngredient(id, patch, true)} onReview={returnToIngredientReview} onNotes={nutritionNotes => update({ nutritionNotes })} onIngredients={() => setTab("ingredients")} /><label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-sm font-bold">Reference (optional)<input className="input" maxLength={2000} value={draft.reference} placeholder="Recipe link, cookbook, or attribution" onChange={event => update({ reference: event.target.value })} /></label></div>,
        instructions: <div className="grid min-w-0 gap-3"><label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-sm font-bold">Instructions (required)<textarea className="input min-h-28 resize-y !py-3" required maxLength={10000} value={draft.instructions} placeholder="Describe how to prepare this recipe." onChange={event => update({ instructions: event.target.value })} /></label></div>,
      }} />
    </fieldset>
    </div>
  </Modal>;
}
