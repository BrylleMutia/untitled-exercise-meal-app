"use client";

import { useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { emptyRecipeFilters, type RecipeFilters, type RecipeSource } from "@/utility/recipeFilters";
import type { MealSlot, RecipeComplexity } from "@/types/domain";

const sources: [RecipeSource, string][] = [["default", "Default recipes"], ["mine", "My recipes"], ["shared", "Shared recipes"]];
const slots: [MealSlot, string][] = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snack"]];
const difficulties: [RecipeComplexity, string][] = [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]];
function toggle<T>(values: T[], value: T): T[] { return values.includes(value) ? values.filter(item => item !== value) : [...values, value]; }

export function RecipeFilterDialog({ applied, favoritesAvailable, returnFocus, onApply, onClose }: {
  applied: RecipeFilters; favoritesAvailable: boolean; returnFocus: RefObject<HTMLButtonElement | null>;
  onApply: (filters: RecipeFilters) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(applied);
  const search = useRef<HTMLInputElement>(null);
  return <Modal open title="Filter recipes" initialFocus={search} returnFocus={returnFocus} onClose={onClose}
    footer={<div className="flex flex-wrap gap-2 pb-2">
      <Button onClick={() => onApply({ ...draft, query: draft.query.trim() })}>Apply filters</Button>
      <Button variant="soft" onClick={() => setDraft(emptyRecipeFilters())}>Reset</Button>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
    </div>}>
    <div className="grid min-w-0 gap-5">
      <label className="grid min-w-0 gap-2 text-sm font-bold">Recipe name<input ref={search} type="search" className="input" value={draft.query} onChange={event => setDraft({ ...draft, query: event.target.value })} /></label>
      <div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="h-5 w-5 shrink-0" checked={draft.favoritesOnly} disabled={!favoritesAvailable} aria-describedby={!favoritesAvailable ? "recipe-filter-favorites-status" : undefined} onChange={event => setDraft({ ...draft, favoritesOnly: event.target.checked })} />Favorites only</label>
        {!favoritesAvailable ? <p id="recipe-filter-favorites-status" className="text-xs text-ink-soft">Favorites are unavailable until card metadata loads. Other filters remain available.</p> : null}
      </div>
      <FilterChoices legend="Source" options={sources} selected={draft.sources} onToggle={value => setDraft({ ...draft, sources: toggle(draft.sources, value) })} />
      <FilterChoices legend="Meal time" options={slots} selected={draft.mealSlots} onToggle={value => setDraft({ ...draft, mealSlots: toggle(draft.mealSlots, value) })} />
      <label className="grid min-w-0 gap-2 text-sm font-bold">Total cooking time<select className="input w-full" value={draft.maxMinutes} onChange={event => setDraft({ ...draft, maxMinutes: event.target.value as RecipeFilters["maxMinutes"] })}>
        <option value="">Any time</option><option value="15">Up to 15 minutes</option><option value="30">Up to 30 minutes</option><option value="60">Up to 60 minutes</option>
      </select></label>
      <FilterChoices legend="Difficulty" options={difficulties} selected={draft.difficulties} onToggle={value => setDraft({ ...draft, difficulties: toggle(draft.difficulties, value) })} />
    </div>
  </Modal>;
}

function FilterChoices<T extends string>({ legend, options, selected, onToggle }: {
  legend: string; options: [T, string][]; selected: T[]; onToggle: (value: T) => void;
}) {
  return <fieldset className="min-w-0"><legend className="mb-2 text-sm font-bold">{legend}</legend>
    <div className="grid min-w-0 gap-x-4 sm:grid-cols-2">{options.map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="h-5 w-5 shrink-0" checked={selected.includes(value)} onChange={() => onToggle(value)} /><span className="min-w-0 break-words">{label}</span></label>)}</div>
  </fieldset>;
}
