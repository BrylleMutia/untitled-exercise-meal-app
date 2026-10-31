"use client";

import type { RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { NutritionPills } from "@/components/ui/NutritionPills";
import { formatFullDate } from "@/utility/dates";
import { mealSlotLabels } from "@/utility/dailyMealRows";
import { totalsForDate } from "@/utility/nutrition";
import type { Food, LoggedMeal, MealSlot, NutritionLog } from "@/types/domain";

export type RecordedMealDetailsInput = {
  name: string; date: string; slot: MealSlot; meal?: LoggedMeal; entries: NutritionLog[];
};

export function RecordedMealDetails({ details, foods, returnFocus, onClose }: {
  details: RecordedMealDetailsInput; foods: Food[]; returnFocus: RefObject<HTMLElement | null>; onClose: () => void;
}) {
  const totals = totalsForDate(details.entries, details.date);
  return <Modal open title="Recorded meal details" returnFocus={returnFocus} onClose={onClose}
    footer={<Button variant="soft" onClick={onClose}>Close</Button>}>
    <div className="grid min-w-0 gap-4 [overflow-wrap:anywhere]">
      <h3 className="text-xl font-extrabold">{details.name}</h3>
      <p className="text-sm text-ink-soft">{formatFullDate(details.date)} · {mealSlotLabels[details.slot]}</p>
      <p className="text-sm text-ink-soft">Read-only saved log. No linked saved recipe is available; these are the values recorded for this entry.</p>
      {details.meal ? <p className="text-sm font-semibold">Recipe portion: {details.meal.recipeServings === undefined ? "not recorded" : `${details.meal.recipeServings} recipe servings`}</p> : null}
      {details.entries.length ? <NutritionPills values={totals} precision={1} approximate={details.entries.some(entry => entry.estimated)} label="Recorded portion nutrition" />
        : <p className="text-sm text-ink-soft">Recorded ingredient nutrition is unavailable.</p>}
      {totals.estimateRange ? <p className="text-xs text-ink-soft">Recorded estimated calorie range: {Math.round(totals.estimateRange.calories.low)}–{Math.round(totals.estimateRange.calories.high)} kcal.</p> : null}
      <section className="grid min-w-0 gap-2" aria-label="Recorded ingredients">
        <h3 className="text-sm font-extrabold">Recorded ingredients and portions</h3>
        {details.entries.length ? <ul className="grid min-w-0 gap-3">{details.entries.map(entry => {
          const food = foods.find(item => item.id === entry.foodId);
          return <li key={entry.id} className="grid min-w-0 gap-2 rounded-xl bg-lav-50 p-3">
            <p className="text-sm font-bold">{entry.customName ?? food?.name ?? "Ingredient name unavailable"}</p>
            <p className="text-xs text-ink-soft">Saved quantity: {entry.servingQuantity ?? entry.servings} {entry.servingUnit ?? "food servings"}{food?.servingLabel ? ` · ${food.servingLabel}` : ""} · {entry.preparationBasis ?? "preparation basis not recorded"}</p>
            <NutritionPills values={entry} precision={1} approximate={entry.estimated} label="Recorded ingredient nutrition" />
            <p className="text-xs text-ink-soft">{entry.valueSource === "ai_estimate" ? "AI estimate" : entry.valueSource === "trusted_catalog" ? "Catalog nutrition" : "User-provided nutrition"} · {entry.estimated ? "estimated" : "saved values"} · {entry.confidence} confidence</p>
            <p className="text-xs text-ink-soft">Source: {entry.source || "not recorded"}{entry.sourceVersion ? ` · ${entry.sourceVersion}` : ""}</p>
            <p className="whitespace-pre-wrap text-xs text-ink-soft">Assumptions: {entry.assumptions || "not recorded"}</p>
          </li>;
        })}</ul> : <p className="text-sm text-ink-soft">No ingredient records are available.</p>}
      </section>
      {details.meal?.assumptions ? <p className="whitespace-pre-wrap text-xs text-ink-soft">Meal assumptions: {details.meal.assumptions}</p> : null}
    </div>
  </Modal>;
}
