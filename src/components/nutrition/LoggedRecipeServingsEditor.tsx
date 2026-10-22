"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Food, LoggedMeal, Meal, NutritionLog } from "@/types/domain";
import { loggedRecipePortion, loggedRecipeServings, positiveRecipeServings } from "@/utility/loggedRecipeServings";
import { formatFullDate } from "@/utility/dates";
import { Button } from "@/components/ui/Button";
import { NutritionPills } from "@/components/ui/NutritionPills";

export function LoggedRecipeServingsEditor({ meal, entries, recipe, foods, onSave, onCancel }: {
  meal: LoggedMeal; entries: NutritionLog[]; recipe?: Meal; foods: Food[];
  onSave: (servings: number, previousServings: number, retryKey: string, expectedRevision: number) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [original] = useState(() => ({ meal, entries, basis: loggedRecipeServings(meal, entries, recipe, foods) }));
  const basis = original.basis;
  const [previousText, setPreviousText] = useState("");
  const [servings, setServings] = useState(basis === null ? "" : String(basis));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [retryKey, setRetryKey] = useState<string | null>(null);
  const invalidId = useId();
  useEffect(() => { input.current?.focus(); }, []);
  const previous = basis ?? positiveRecipeServings(previousText);
  const next = positiveRecipeServings(servings);
  const preview = loggedRecipePortion(original.entries, previous, next);
  const changed = meal.revision !== original.meal.revision;
  function change(set: (value: string) => void, value: string) { set(value); setRetryKey(null); setError(""); }
  async function submit() {
    if (!preview || previous === null || next === null || saving || (changed && !retryKey)) return;
    const key = retryKey ?? crypto.randomUUID();
    setRetryKey(key);
    setSaving(true); setError("");
    try {
      if (!await onSave(next, previous, key, original.meal.revision)) setError("Could not save the serving change. Your input is retained; try again.");
    } catch { setError("Could not save the serving change. Your input is retained; try again."); }
    finally { setSaving(false); }
  }
  return <div role="group" aria-label="Edit logged meal servings" aria-busy={saving} className="grid min-w-0 grid-cols-1 gap-3 rounded-xl bg-white p-3 [overflow-wrap:anywhere] max-[400px]:p-2">
    <h3 className="break-words text-sm font-extrabold">{original.meal.name}</h3>
    <p className="text-xs font-semibold text-ink-soft">{formatFullDate(meal.date)} · {meal.slot.charAt(0).toUpperCase() + meal.slot.slice(1)}</p>
    {basis === null ? <label className="grid min-w-0 grid-cols-1 gap-1 text-xs font-bold">Previously logged recipe servings
      <input className="input min-w-0 max-w-full !px-2" type="number" min="0" max="10000" step="any" value={previousText} disabled={saving} onChange={event => change(setPreviousText, event.target.value)} />
      <span className="font-normal text-ink-soft">This older entry has no reliable serving count. Confirm how many recipe servings it originally represented.</span>
    </label> : meal.recipeServings === undefined ? <p className="text-xs text-ink-soft">Serving count recovered from the recipe portion. Check it before saving.</p> : null}
    <label className="grid min-w-0 grid-cols-1 gap-1 text-xs font-bold">Recipe servings
      <input ref={input} className="input min-w-0 max-w-full !px-2" type="number" min="0" max="10000" step="any" value={servings} disabled={saving} aria-invalid={next === null} aria-describedby={next === null ? invalidId : undefined} onChange={event => change(setServings, event.target.value)} />
    </label>
    {next === null ? <p id={invalidId} role="alert" className="text-xs font-semibold text-danger-900">Enter a positive number of recipe servings, including fractions (up to 10,000).</p> : null}
    {preview ? <NutritionPills label="Corrected logged portion nutrition" values={{ calories: Math.round(preview.calories), proteinG: Number(preview.proteinG.toFixed(1)), carbsG: Number(preview.carbsG.toFixed(1)), fatG: Number(preview.fatG.toFixed(1)) }} approximate={entries.some(entry => entry.estimated)} /> : <p className="text-xs text-ink-soft">Portion nutrition is unavailable until the serving quantities are confirmed.</p>}
    <p className="text-xs text-ink-soft">Scales this entry’s saved nutrition. The recipe and plan stay unchanged.</p>
    {changed ? <p role="alert" className="text-xs font-semibold text-danger-900">This logged entry changed while editing. Cancel and reopen to review its latest servings. A retry of an unconfirmed save keeps its original intent.</p> : null}
    {error ? <p role="alert" className="text-xs font-semibold text-danger-900">{error}</p> : null}
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="ghost" className="min-w-0 max-w-full !px-3 text-xs" disabled={saving} onClick={onCancel}>Cancel</Button>
      <Button className="min-w-0 max-w-full !px-3 text-xs" disabled={saving || !preview || (changed && !retryKey)} onClick={() => void submit()}>{saving ? "Saving…" : "Save correction"}</Button>
    </div>
  </div>;
}
