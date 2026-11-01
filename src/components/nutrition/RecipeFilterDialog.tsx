"use client";

import { useId, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { emptyRecipeFilters, type RecipeFilters, type RecipeSource } from "@/utility/recipeFilters";
import type { MealSlot, RecipeComplexity } from "@/types/domain";

const sources: [RecipeSource, string][] = [["default", "Default recipes"], ["mine", "My recipes"], ["shared", "Shared recipes"]];
const slots: [MealSlot, string][] = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snack"]];
const difficulties: [RecipeComplexity, string][] = [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]];
const cookingTimes: [RecipeFilters["maxMinutes"], string][] = [["", "Any time"], ["15", "Up to 15 minutes"], ["30", "Up to 30 minutes"], ["60", "Up to 60 minutes"]];
const pillClass = "!min-h-11 min-w-0 max-w-full !rounded-full !px-4 !py-2 whitespace-normal [overflow-wrap:anywhere] focus-visible:!rounded-full";
function toggle<T>(values: T[], value: T): T[] { return values.includes(value) ? values.filter(item => item !== value) : [...values, value]; }

export function RecipeFilterDialog({ applied, favoritesAvailable, returnFocus, onApply, onClose }: {
  applied: RecipeFilters; favoritesAvailable: boolean; returnFocus: RefObject<HTMLButtonElement | null>;
  onApply: (filters: RecipeFilters) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(applied);
  const search = useRef<HTMLInputElement>(null);
  const cookingTimeGroup = useId();
  return <Modal open title="Filter recipes" initialFocus={search} returnFocus={returnFocus} onClose={onClose}
    footer={<div className="flex flex-wrap gap-2 pb-2">
      <Button onClick={() => onApply({ ...draft, query: draft.query.trim() })}>Apply filters</Button>
      <Button variant="soft" onClick={() => setDraft(emptyRecipeFilters())}>Reset</Button>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
    </div>}>
    <div className="grid min-w-0 gap-5">
      <label className="grid min-w-0 gap-2 text-sm font-bold">Recipe name<input ref={search} type="search" className="input" value={draft.query} onChange={event => setDraft({ ...draft, query: event.target.value })} /></label>
      <div>
        <FilterPill label="Favorites only" selected={draft.favoritesOnly} disabled={!favoritesAvailable} describedBy={!favoritesAvailable ? "recipe-filter-favorites-status" : undefined} onToggle={() => setDraft({ ...draft, favoritesOnly: !draft.favoritesOnly })} />
        {!favoritesAvailable ? <p id="recipe-filter-favorites-status" className="text-xs text-ink-soft">Favorites are unavailable until card metadata loads. Other filters remain available.</p> : null}
      </div>
      <FilterChoices legend="Source" options={sources} selected={draft.sources} onToggle={value => setDraft({ ...draft, sources: toggle(draft.sources, value) })} />
      <FilterChoices legend="Meal time" options={slots} selected={draft.mealSlots} onToggle={value => setDraft({ ...draft, mealSlots: toggle(draft.mealSlots, value) })} />
      <fieldset className="min-w-0" role="radiogroup"><legend className="mb-2 text-sm font-bold">Total cooking time</legend>
        <div className="flex min-w-0 flex-wrap gap-2">{cookingTimes.map(([value, label]) => <label key={value} className="group relative inline-flex min-w-0 max-w-full cursor-pointer">
          <input type="radio" name={cookingTimeGroup} value={value} checked={draft.maxMinutes === value} onChange={() => setDraft({ ...draft, maxMinutes: value })} className="peer absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0" />
          <span className={`inline-flex items-center justify-center text-center text-sm font-bold transition-colors motion-reduce:transition-none peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lav-500 ${pillClass} ${draft.maxMinutes === value ? "bg-ink text-white" : "bg-lav-50 text-ink group-hover:bg-lav-100"}`}>{label}</span>
        </label>)}</div>
      </fieldset>
      <FilterChoices legend="Difficulty" options={difficulties} selected={draft.difficulties} onToggle={value => setDraft({ ...draft, difficulties: toggle(draft.difficulties, value) })} />
    </div>
  </Modal>;
}

function FilterChoices<T extends string>({ legend, options, selected, onToggle }: {
  legend: string; options: [T, string][]; selected: T[]; onToggle: (value: T) => void;
}) {
  return <fieldset className="min-w-0"><legend className="mb-2 text-sm font-bold">{legend}</legend>
    <div className="flex min-w-0 flex-wrap gap-2">{options.map(([value, label]) => <FilterPill key={value} label={label} selected={selected.includes(value)} onToggle={() => onToggle(value)} />)}</div>
  </fieldset>;
}

function FilterPill({ label, selected, onToggle, disabled = false, describedBy }: {
  label: string; selected: boolean; onToggle: () => void; disabled?: boolean; describedBy?: string;
}) {
  return <Button variant={selected ? "primary" : "soft"} className={`${pillClass} ${selected ? "" : "!bg-lav-50 hover:!bg-lav-100"}`} aria-pressed={selected} aria-describedby={describedBy} disabled={disabled} onClick={onToggle}>{label}</Button>;
}
