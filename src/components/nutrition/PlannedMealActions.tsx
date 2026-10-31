"use client";

import { useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { addFood, logMeal, clientId, plannedLogAvailable } from "@/utility/mealLogging";
import { formatFullDate } from "@/utility/dates";
import { mealSlotLabels } from "@/utility/dailyMealRows";
import type { AppSnapshot, PlannedMeal } from "@/types/domain";
import type { NutritionWeekReadModel } from "@/types/backend";

export function PlannedMealActions({ meal, snapshot, week, disabled = false, onChanged, focusAfterChange, unavailableGuidance = "edit" }: {
  meal: PlannedMeal; snapshot: AppSnapshot; week: NutritionWeekReadModel; disabled?: boolean;
  onChanged: () => void; focusAfterChange?: () => void;
  unavailableGuidance?: "edit" | "remove-and-add";
}) {
  const { actions, pendingMutation } = useApp();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const logKey = useRef(""); const removeKey = useRef("");
  const removeTrigger = useRef<HTMLButtonElement>(null); const cancel = useRef<HTMLButtonElement>(null);
  const locked = disabled || busy || Boolean(pendingMutation);
  const available = plannedLogAvailable(meal, snapshot);
  async function log() {
    if (submitting.current || locked || !available) return;
    submitting.current = true; setBusy(true); setMessage("");
    logKey.current ||= clientId("planned-log");
    const scoped = { ...actions,
      logNutrition: (input: Parameters<typeof actions.logNutrition>[0], key?: string, _week?: NutritionWeekReadModel, single?: boolean) => actions.logNutrition(input, key, week, single),
      saveReviewedMeal: (input: Parameters<typeof actions.saveReviewedMeal>[0], key?: string) => actions.saveReviewedMeal(input, key, week),
    };
    try {
      const food = snapshot.foods.find(food => food.id === meal.foodId);
      const recipe = snapshot.savedMeals.find(recipe => recipe.id === meal.mealId);
      const saved = food ? await addFood(scoped, meal.slot, meal.date, food, meal.servings, meal.id, logKey.current, true)
        : recipe ? await logMeal(scoped, recipe.ingredients.map(item => ({ ...item, servings: item.servings * meal.servings / recipe.servings })), meal.date, meal.slot, recipe, snapshot.foods, meal.id, logKey.current, meal.servings) : false;
      if (saved) { focusAfterChange?.(); onChanged(); }
      else setMessage("The meal was not confirmed as logged. Your plan is retained; retry or refresh this day.");
    } finally { submitting.current = false; setBusy(false); }
  }
  async function remove() {
    if (submitting.current || locked) return;
    submitting.current = true; setBusy(true); setMessage(""); removeKey.current ||= clientId("remove-planned");
    try {
      if (await actions.removePlannedMeal(meal.id, week, removeKey.current)) { setConfirming(false); focusAfterChange?.(); onChanged(); }
      else setMessage("The meal could not be removed. Your plan is retained; retry or refresh this day.");
    } finally { submitting.current = false; setBusy(false); }
  }
  return <>
    {meal.skipped ? <IconButton size="compact" label={`Restore planned ${meal.label}`} tooltip="Restore planned meal" disabled={locked} onClick={() => void actions.skipPlannedMeal(meal.id, week).then(onChanged)}><RotateCcw className="h-4 w-4" aria-hidden /></IconButton>
      : <IconButton id={`log-planned-${meal.id}`} size="compact" variant="primary" label={`Log planned ${meal.label}`} tooltip={available ? "Log planned portion" : unavailableGuidance === "remove-and-add" ? "Remove and re-add this meal with available nutrition before logging" : "Edit this meal to resolve its nutrition before logging"} disabled={locked || !available} onClick={() => void log()}><Check className="h-4 w-4" aria-hidden /></IconButton>}
    <IconButton buttonRef={removeTrigger} size="compact" label={`Remove planned ${meal.label}`} tooltip="Remove planned meal" disabled={locked} onClick={() => { setMessage(""); setConfirming(true); }}><X className="h-4 w-4" aria-hidden /></IconButton>
    {!available && !meal.skipped ? <p className="basis-full text-xs text-danger-900">{unavailableGuidance === "remove-and-add" ? "Nutrition unavailable. Remove and re-add this meal with available nutrition before logging." : "Nutrition unavailable. Edit this planned meal before logging."}</p> : null}
    {message && !confirming ? <p role="alert" className="basis-full text-xs text-danger-900">{message}</p> : null}
    {confirming ? <Modal open title="Remove planned meal?" initialFocus={cancel} returnFocus={removeTrigger} dismissalDisabled={busy || Boolean(pendingMutation)} onClose={() => setConfirming(false)}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button ref={cancel} variant="soft" disabled={locked} onClick={() => setConfirming(false)}>Cancel</Button><Button variant="danger" disabled={locked} onClick={() => void remove()}>{busy ? "Removing…" : "Remove meal"}</Button></div>}>
      <p className="break-words font-bold">{meal.label}</p><p className="mt-2 text-sm">{formatFullDate(meal.date)} · {mealSlotLabels[meal.slot]}</p>
      <p className="mt-3 text-sm">Remove this entry from your plan? Logged history stays available. Other people’s planned meals are kept. Grocery requirements will update.</p>
      {message ? <p role="alert" className="mt-3 rounded-xl bg-danger-50 p-3 text-sm text-danger-900">{message}</p> : null}
    </Modal> : null}
  </>;
}
