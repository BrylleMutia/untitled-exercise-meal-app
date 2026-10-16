"use client";

import { useId } from "react";
import { RecipeCover } from "./RecipeCover";
import { mealSlotLabels, parseMealSlots } from "@/utility/recipeMealSlots";
import type { WeeklyRecipeOption } from "@/utility/weeklyMealGeneration";

function servingsLabel(value: number): string {
  const displayed = Number(value.toFixed(3));
  return `${displayed.toLocaleString("en-US")} ${displayed === 1 ? "serving" : "servings"}`;
}

export function GenerationRecipeCard({ option, selected, disabled, onChange }: {
  option: WeeklyRecipeOption; selected: boolean; disabled: boolean; onChange: (selected: boolean) => void;
}) {
  const id = useId();
  const { recipe, used, remaining } = option;
  return <label className={`relative grid h-full min-h-11 min-w-0 content-start gap-2 rounded-2xl border p-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-lav-500 ${selected ? "border-ink bg-lav-50" : "border-ink/15 bg-white"} ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:border-ink/60"}`}>
    <span className="grid aspect-square min-w-0 rounded-xl bg-lav-100 p-[15px]">
      <RecipeCover image={recipe.image} name={recipe.name} selection />
    </span>
    <span className="flex min-h-11 min-w-0 items-start gap-2">
    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-ink focus-visible:outline-none"
      aria-labelledby={`${id}-name`} aria-describedby={`${id}-details`} disabled={disabled} checked={selected}
      onChange={event => onChange(event.target.checked)} />
    <span id={`${id}-name`} className="min-w-0 break-words text-sm font-extrabold leading-snug [overflow-wrap:anywhere]">{recipe.name}</span>
    </span>
    <span id={`${id}-details`} className="grid min-w-0 gap-2 break-words text-xs leading-relaxed text-ink-soft [overflow-wrap:anywhere]">
      <span>{parseMealSlots(recipe.mealSlots).map(slot => mealSlotLabels[slot]).join(", ") || "No meals assigned"}</span>
      <span className="grid gap-0.5 tabular-nums">
        <span>Yield: <span className="font-bold text-ink">{servingsLabel(recipe.servings)}</span></span>
        <span>Planned: <span className="font-bold text-ink">{servingsLabel(used)}</span></span>
        <span>Remaining: <span className="font-bold text-ink">{servingsLabel(remaining)}</span></span>
      </span>
    </span>
  </label>;
}
