import { useEffect, useRef, useState } from "react";
import { RecipePortionReview } from "./RecipePortionReview";
import { recipePortion, recipeReviewToken } from "@/utility/recipePortion";
import type { Food, Meal, MealSlot, PlannedMeal } from "@/types/domain";

const slots: Array<{ value: MealSlot; label: string }> = [
  { value: "breakfast", label: "Breakfast" }, { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" }, { value: "snack", label: "Snack" },
];

export function SavedRecipePlanReview({ recipe, name, foods, date, canPlan, carbLimited, pending,
  createPlan, onPlan, onSavingChange, onClose, onRefresh }: {
  recipe: Meal | undefined; name: string; foods: Food[]; date: string;
  canPlan: boolean; carbLimited: boolean; pending: boolean;
  createPlan: (slot: MealSlot, servings: number) => PlannedMeal;
  onPlan: (recipe: Meal, plan: PlannedMeal, retryKey: string) => Promise<boolean>;
  onSavingChange: (saving: boolean) => void; onClose: () => void; onRefresh: () => void;
}) {
  const [slot, setSlot] = useState<MealSlot | "">("");
  const [servings, setServings] = useState("1");
  const [reviewedToken, setReviewedToken] = useState(() => recipe ? recipeReviewToken(recipe, foods) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const intent = useRef<{ plan: PlannedMeal; key: string } | null>(null);
  const slotInput = useRef<HTMLSelectElement>(null);
  const submitting = useRef(false);
  const busy = pending || saving;
  const unavailable = !recipe || Boolean(recipe.archivedAt);
  const changed = Boolean(recipe && recipeReviewToken(recipe, foods) !== reviewedToken);
  const portion = recipePortion(recipe, foods, servings, carbLimited);

  useEffect(() => { slotInput.current?.focus(); }, []);
  useEffect(() => () => onSavingChange(false), [onSavingChange]);

  function changeIntent() {
    intent.current = null;
    setError("");
  }

  async function confirm() {
    if (submitting.current || busy || !slot || !recipe || unavailable || changed || !portion || !portion.canPlan || !canPlan) return;
    submitting.current = true;
    setSaving(true);
    onSavingChange(true);
    setError("");
    // Retain both the row identity and retry key after a failed or lost response.
    try {
      intent.current ??= { plan: createPlan(slot, Number(servings)), key: `recipe-plan-${crypto.randomUUID()}` };
      if (await onPlan(recipe, intent.current.plan, intent.current.key)) onClose();
      else setError("The plan change was not confirmed. Your meal slot and servings are retained; review the error and retry.");
    } catch {
      setError("The plan change was not confirmed. Your meal slot and servings are retained; reconnect and retry.");
    } finally {
      submitting.current = false;
      setSaving(false);
      onSavingChange(false);
    }
  }

  return <div id="saved-recipe-plan-review" role="group" aria-label={`Add ${name} to plan`} aria-busy={busy}
    className="mt-3 grid min-w-0 gap-2 rounded-xl bg-cream p-3 [overflow-wrap:anywhere] max-[400px]:p-2">
    <label className="grid min-w-0 gap-1 text-xs font-bold text-ink-soft">
      Meal slot
      <select ref={slotInput} className="input min-w-0 max-w-full" value={slot} required disabled={busy}
        onChange={event => { setSlot(event.target.value as MealSlot | ""); changeIntent(); }}>
        <option value="">Choose a slot</option>
        {slots.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <RecipePortionReview name={recipe?.name ?? name} date={date} slot={slots.find(option => option.value === slot)?.label ?? "Choose a meal slot"}
      servings={servings} portion={portion} changed={changed} unavailable={unavailable} pending={busy}
      canPlan={canPlan && Boolean(slot)} error={error}
      onServings={value => { setServings(value); changeIntent(); }} onPlan={() => void confirm()} onCancel={onClose}
      onReview={() => { if (recipe) setReviewedToken(recipeReviewToken(recipe, foods)); changeIntent(); }} onRefresh={onRefresh} />
  </div>;
}
