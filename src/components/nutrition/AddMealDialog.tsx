"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { ArrowLeft } from "lucide-react";
import { useApp, type AppActions } from "@/contexts/AppContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { GuidedSearchPicker, ManualMealEntry, type Mode, type PlanChoice } from "./MealEntryContent";
import { nutritionWeekSnapshot } from "@/utility/nutritionWeek";
import { formatFullDate } from "@/utility/dates";
import { mealSlotLabels } from "@/utility/dailyMealRows";
import { targetForDate } from "@/utility/targetHistory";
import { totalCarbLimit } from "@/utility/health";
import { FOODS } from "@/constants/foods";
import { clientId } from "@/utility/mealLogging";
import type { NutritionWeekReadModel } from "@/types/backend";
import type { MealSlot } from "@/types/domain";

export function AddMealDialog({ date, slot, week, returnFocus, onClose }: {
  date: string; slot: MealSlot; week: NutritionWeekReadModel; returnFocus: RefObject<HTMLElement | null>; onClose: () => void;
}) {
  const { snapshot: current, actions: appActions, pendingMutation, error } = useApp();
  const snapshot = useMemo(() => nutritionWeekSnapshot(current, week), [current, week]);
  const [mode, setMode] = useState<Mode>("search");
  const [saving, setSaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const manualBusy = useRef(false);
  const busy = saving || Boolean(pendingMutation);
  const target = targetForDate(week.targets, date);
  const canAddPlan = Boolean(week.mealPlan || target && target.safetyOutcome !== "unsupported_population");
  const carbLimit = week.mealPlan?.totalCarbLimit !== undefined ? week.mealPlan.totalCarbLimit : totalCarbLimit(snapshot.profile?.dietaryPattern ?? "");
  const foods = snapshot.foods.map(food => food.servingOptions?.length ? food : { ...food, servingOptions: FOODS.find(item => item.id === food.id)?.servingOptions });
  const actions: AppActions = { ...appActions,
    logNutrition: (input, key) => appActions.logNutrition(input, key, week),
    saveReviewedMeal: (input, key) => appActions.saveReviewedMeal(input, key, week),
    addPlannedMeal: (planned, foods, meal, key, _week, review) => appActions.addPlannedMeal(planned, foods, meal, key, week, review),
  };
  async function addToPlan(selectedSlot: MealSlot, choice: PlanChoice) {
    // A lost response may have committed before the same retained draft is reopened.
    const completed = choice.plannedMeal && week.mealPlan?.meals.find(meal => meal.id === choice.plannedMeal!.id);
    if (completed && completed.date === date && completed.slot === selectedSlot && completed.servings === choice.servings
      && completed.foodId === choice.food?.id && completed.mealId === choice.meal?.id) return true;
    if (!canAddPlan) return false;
    const nextOrder = Math.max(0, ...(week.mealPlan?.meals ?? []).filter(meal => meal.date === date && meal.slot === selectedSlot).map(meal => meal.sortOrder ?? 0)) + 1;
    return actions.addPlannedMeal(choice.plannedMeal ?? {
      id: clientId("planned-meal"), date, slot: selectedSlot, slotKey: `date:${date}:slot:${selectedSlot}:order:${nextOrder}`, sortOrder: nextOrder,
      ...(choice.food ? { foodId: choice.food.id } : { mealId: choice.meal!.id }), label: choice.food?.name ?? choice.meal!.name, servings: choice.servings,
    }, choice.newFoods, choice.meal && !snapshot.savedMeals.some(meal => meal.id === choice.meal!.id) ? choice.meal : undefined, choice.fixedKey, week, choice.review);
  }
  function changeMode(next: Mode) {
    if (busy) return;
    setMode(next);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(next === "custom" ? '[aria-label="Custom food name"]' : 'input')?.focus());
  }
  async function manualOperation<T>(operation: () => Promise<T>): Promise<T | false> {
    if (manualBusy.current) return false;
    manualBusy.current = true; setSaving(true);
    try { return await operation(); } finally { manualBusy.current = false; setSaving(false); }
  }
  const manualActions: AppActions = { ...actions,
    logNutrition: (input, key) => manualOperation(() => actions.logNutrition(input, key)),
    saveFood: input => manualOperation(() => actions.saveFood(input)),
  };
  return <Modal open title="Add meal" returnFocus={returnFocus} dismissalDisabled={busy} onClose={onClose}
    footer={<div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><Button variant="soft" disabled={busy} onClick={onClose}>Cancel</Button>{busy ? <p role="status" className="text-sm font-bold">Saving meal…</p> : null}</div>}>
    <div ref={root} id="nutrition-log-editor" className="grid min-w-0 gap-4">
      <p className="text-sm font-semibold text-ink-soft">{mealSlotLabels[slot]} · <time dateTime={date}>{formatFullDate(date)}</time></p>
      {mode === "custom" ? <Button variant="ghost" className="justify-self-start !px-0 text-sm" disabled={busy} onClick={() => changeMode("search")}><ArrowLeft className="h-4 w-4" aria-hidden />Back to search</Button> : null}
      {error ? <p role="alert" className="rounded-xl bg-danger-50 p-3 text-sm text-danger-900">{error.message}</p> : null}
      <div hidden={mode !== "search"}><GuidedSearchPicker slot={slot} onMode={changeMode} onDone={onClose} onSavingChange={setSaving}
        foods={foods} snapshot={snapshot} actions={actions} selected={date} canAddPlan={canAddPlan} carbLimit={carbLimit} addToPlan={addToPlan} pendingMutation={pendingMutation} /></div>
      <div hidden={mode !== "custom"}><fieldset disabled={busy} className="min-w-0"><ManualMealEntry slot={slot} onDone={onClose} selected={date} snapshot={snapshot} actions={manualActions} canAddPlan={canAddPlan} carbLimit={carbLimit} addToPlan={addToPlan} /></fieldset></div>
    </div>
  </Modal>;
}
