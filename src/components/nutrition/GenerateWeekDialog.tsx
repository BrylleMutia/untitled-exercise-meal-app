"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { ListChecks, ListX, Shuffle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { HelpPopover } from "@/components/ui/HelpPopover";
import { DayCheckboxStrip } from "@/components/DayStrip";
import { editedDefaultRecipeIds, recipeDisplayName } from "@/utility/recipeLibrary";
import { GenerationRecipeCard } from "./GenerationRecipeCard";
import { RecipeWarningReview, DailyWarningReview, planningAcknowledgment } from "./PreferenceReview";
import { PLANNING_REVIEW_POLICY } from "@/types/planningPreferences";
import { MealRow } from "./MealRow";
import { useApp } from "@/contexts/AppContext";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";
import { formatFullDate, weekDates } from "@/utility/dates";
import { mealSlotLabels } from "@/utility/recipeMealSlots";
import { defaultPlanningDates, generateWeeklyMeals, generationBasis, weeklyRecipeOptions, type GenerationPreview } from "@/utility/weeklyMealGeneration";
import type { AppSnapshot } from "@/types/domain";
import type { ExpectedVersions, GenerateNutritionWeekInput } from "@/types/backend";

type GenerationDraft = {
  basis: string; selectedDates: string[]; selected: string[]; seed: string; preview: GenerationPreview; key: string;
  expectedVersions: ExpectedVersions; recipes: GenerateNutritionWeekInput["recipes"]; acknowledged: boolean;
};

const bulkActionClassName = "!min-h-11 min-w-11 !gap-0 !px-0 whitespace-nowrap text-xs md:!gap-2 md:!px-3";

export function GenerateWeekDialog({ snapshot, weekOf, returnFocus, pending, unavailable, onSave, onClose, onRefresh }: {
  snapshot: AppSnapshot; weekOf: string; returnFocus: RefObject<HTMLElement | null>; pending: boolean; unavailable: boolean;
  onSave: (input: Omit<GenerateNutritionWeekInput, "currentSnapshot">) => Promise<boolean>;
  onClose: () => void; onRefresh: () => void;
}) {
  const { error } = useApp();
  const dayHeadingId = useId();
  const recipeHeadingId = useId();
  const [draft, setDraft] = useState<GenerationDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  const submitting = useRef(false), completed = useRef(false);
  const writes = useRef(Promise.resolve());
  const initial = useRef(snapshot);
  const userId = snapshot.userId, draftType = `nutrition-generation:${weekOf}`;
  const basis = generationBasis(snapshot, weekOf);
  const options = weeklyRecipeOptions(snapshot, weekOf);
  const editedIds = editedDefaultRecipeIds(snapshot.savedMeals);
  const changed = Boolean(draft && draft.basis !== basis);
  const busy = saving || pending;
  const selectionDisabled = busy || unavailable || !draft || changed;

  function create(selected: string[], source = snapshot, selectedDates = defaultPlanningDates(weekOf)): GenerationDraft {
    const seed = crypto.randomUUID();
    return { basis: generationBasis(source, weekOf), selectedDates, selected, seed, preview: generateWeeklyMeals(source, weekOf, selected, seed, selectedDates),
      key: `generate-week-${crypto.randomUUID()}`, acknowledged: false,
      recipes: source.savedMeals.filter(recipe => selected.includes(recipe.id)).map(recipe => ({ id: recipe.id, revision: recipe.revision ?? 1 })),
      expectedVersions: { profileRevision: source.profile?.revision, mealPlanVersion: source.mealPlan?.version ?? 0, groceryRevision: source.grocery?.revision ?? 0 } };
  }

  useEffect(() => {
    let active = true;
    void readDraft<GenerationDraft>(userId, draftType).then(saved => {
      if (!active) return;
      const value = saved?.payload;
      if (value && Array.isArray(value.selectedDates) && value.selectedDates.every(date => weekDates(weekOf).includes(date)) && new Set(value.selectedDates).size === value.selectedDates.length && Array.isArray(value.selected) && value.preview && Array.isArray(value.preview.assignments) && Array.isArray(value.preview.unused) && typeof value.basis === "string" && value.expectedVersions && Array.isArray(value.recipes) && value.key) {
        setDraft(create(value.selected, initial.current, value.selectedDates)); setMessage("Weekly plan draft restored. Review the preview before saving.");
      } else {
        const source = initial.current;
        setDraft(create(weeklyRecipeOptions(source, weekOf).filter(option => !option.reason).map(option => option.recipe.id), source));
      }
    });
    return () => { active = false; };
    // One account/week owns this dialog; refreshed data requires explicit renewed review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, draftType]);

  useEffect(() => {
    if (!draft || completed.current) return;
    let active = true;
    writes.current = writes.current.then(async () => {
      const saved = await writeDraft(createDraftEnvelope({ userId, draftType, payload: draft, baseVersions: draft.expectedVersions, ttlMs: draftTtlMs(draftType) }));
      if (active) setStorageFailed(!saved);
    });
    return () => { active = false; };
  }, [draft, userId, draftType]);

  function update(selected: string[], selectedDates = draft?.selectedDates ?? defaultPlanningDates(weekOf)) { setDraft(create(selected, snapshot, selectedDates)); setMessage(""); }
  async function save() {
    if (!draft || changed || unavailable || busy || submitting.current || !draft.preview.assignments.length || !draft.acknowledged) return;
    submitting.current = true; setSaving(true); setMessage("");
    try {
      const confirmed = await onSave({ reviewAcknowledged: draft.acknowledged, reviewPolicyVersion: PLANNING_REVIEW_POLICY, weekOf, selectedDates: draft.selectedDates, assignments: draft.preview.assignments, recipes: draft.recipes, expectedVersions: draft.expectedVersions, idempotencyKey: draft.key });
      if (confirmed) { completed.current = true; await writes.current; await clearDraft(userId, draftType); onClose(); }
      else setMessage("The save was not confirmed. Your preview is retained; retry or refresh and review changes.");
    } catch { setMessage("The save was not confirmed. Your preview is retained; reconnect and retry."); }
    finally { submitting.current = false; setSaving(false); }
  }
  return <Modal open title="Generate plan" returnFocus={returnFocus} dismissalDisabled={busy} onClose={onClose}
    help={<HelpPopover title="Generate plan" label="About generate plan"><p>Fill this week’s empty meals with one serving per entry. Each recipe has one weekly batch; existing active planned servings count toward its yield.</p></HelpPopover>}
    footer={<div className="grid gap-2">
      {message ? <p className="text-sm text-ink-soft" role="status">{message}</p> : null}
      {error ? <p className="text-sm text-danger-900" role="alert">{error.message}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="soft" disabled={busy} onClick={onClose}>Close</Button>
        <Button disabled={busy || unavailable || !draft || changed || !draft.preview.assignments.length || Boolean(!draft.acknowledged)} onClick={() => void save()}>{saving ? "Saving…" : "Save plan"}</Button></div>
    </div>}>
    <div className="grid min-w-0 gap-5"><p className="text-xs text-ink-soft">Cost checks are temporarily paused.</p>
      {storageFailed ? <p className="text-sm" role="status">Draft recovery is unavailable. Keep this dialog open until saved.</p> : null}
      {unavailable ? <p className="text-sm" role="status">Refresh recipes and this week before saving. Your preview is retained.</p> : null}
      {changed ? <div className="grid gap-2 rounded-2xl bg-peach-50 p-3" role="status"><p className="text-sm">This week, a recipe, or your planning settings changed. Review a fresh preview before saving.</p><Button variant="soft" disabled={busy || unavailable} onClick={() => update(draft!.selected.filter(id => options.some(option => option.recipe.id === id)))}>Review updated preview</Button></div> : null}
      <fieldset disabled={selectionDisabled} aria-labelledby={dayHeadingId} className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 id={dayHeadingId} className="font-extrabold">Choose days</h3>
          <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
            <Button variant="primary" className={bulkActionClassName} disabled={selectionDisabled} onClick={() => update(draft!.selected, weekDates(weekOf))}><ListChecks className="h-4 w-4 shrink-0" aria-hidden /><span className="sr-only md:not-sr-only">Select all</span></Button>
            <Button variant="soft" className={bulkActionClassName} disabled={selectionDisabled} onClick={() => update(draft!.selected, [])}><ListX className="h-4 w-4 shrink-0" aria-hidden /><span className="sr-only md:not-sr-only">Clear</span></Button>
          </div>
        </div>
        <DayCheckboxStrip weekOf={weekOf} selectedDates={draft?.selectedDates ?? []} disabled={selectionDisabled}
          onToggle={(date, checked) => update(draft!.selected, checked ? [...draft!.selectedDates, date].sort() : draft!.selectedDates.filter(value => value !== date))} />
        {!draft?.selectedDates.length ? <p className="mt-2 text-sm text-ink-soft" role="status">Choose at least one day to preview meals.</p> : null}
      </fieldset>
      <fieldset disabled={selectionDisabled} aria-labelledby={recipeHeadingId} className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 id={recipeHeadingId} className="font-extrabold">Choose recipes</h3>
          <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
            <Button variant="primary" className={bulkActionClassName} disabled={selectionDisabled} onClick={() => update(options.map(option => option.recipe.id))}><ListChecks className="h-4 w-4 shrink-0" aria-hidden /><span className="sr-only md:not-sr-only">Select all</span></Button>
            <Button variant="soft" className={bulkActionClassName} disabled={selectionDisabled} onClick={() => update([])}><ListX className="h-4 w-4 shrink-0" aria-hidden /><span className="sr-only md:not-sr-only">Clear</span></Button>
          </div>
        </div>
        <div className="@container"><ul aria-label="Recipe choices" className="grid grid-cols-1 gap-2 @min-[17.5rem]:grid-cols-2 @min-[40rem]:grid-cols-4">{options.map(option => <li key={option.recipe.id} className="min-w-0">
          <GenerationRecipeCard option={option} displayName={recipeDisplayName(option.recipe, editedIds)} selected={draft?.selected.includes(option.recipe.id) ?? false}
            disabled={selectionDisabled}
            onChange={selected => update(selected ? [...draft!.selected, option.recipe.id] : draft!.selected.filter(id => id !== option.recipe.id))} />
        </li>)}</ul></div>
        {!options.length ? <p className="text-sm text-ink-soft">Create a recipe and assign its meals in Details to begin.</p> : null}
      </fieldset>
      {!changed && !unavailable && draft?.preview.preferenceReview ? <RecipeWarningReview review={draft.preview.preferenceReview} disabled={selectionDisabled} onRemove={id => update(draft.selected.filter(selected => selected !== id))} /> : null}
      <section className="grid min-w-0 gap-3" aria-label="Generated plan preview"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">Preview · {draft?.preview.assignments.length ?? 0} {draft?.preview.assignments.length === 1 ? "meal" : "meals"}</h3><Button variant="soft" disabled={busy || unavailable || !draft || changed || !draft.selected.length} onClick={() => update(draft!.selected)}><Shuffle className="h-4 w-4" aria-hidden />Shuffle</Button></div>
        {draft?.preview.assignments.length ? <ul className="grid gap-2">{draft.preview.assignments.map(row => <MealRow key={row.id} summary={<>
          <span className="block text-[11px] font-bold text-ink-soft">{formatFullDate(row.date)}</span>
          <span className="block break-words text-sm font-extrabold">{row.label}</span>
          <span className="block text-[11px] font-semibold text-ink-soft">{mealSlotLabels[row.slot]} · {row.servings} {row.servings === 1 ? "serving" : "servings"}</span>
        </>} />)}</ul> : <p className="text-sm text-ink-soft">No meals fit the selected days, recipes, empty slots, and eligible daily targets.</p>}
      </section>
      {draft?.preview.unused.length ? <section className="grid gap-2" aria-label="Unused servings"><h3 className="font-extrabold">Unused servings</h3><ul className="grid gap-2 text-sm">{draft.preview.unused.map(row => <li key={row.mealId}><span className="font-bold">{row.name}: {Number(row.servings.toFixed(4))}</span> — {row.reason}</li>)}</ul></section> : null}
      {!changed && !unavailable && draft?.preview.preferenceReview ? <DailyWarningReview review={draft.preview.preferenceReview} /> : null}
      {draft ? <label className="flex min-h-11 items-start gap-2 rounded-xl bg-lav-50 p-3 text-sm"><input type="checkbox" className="mt-1" checked={!changed && draft.acknowledged} disabled={busy || changed || unavailable} onChange={event => setDraft({ ...draft, acknowledged: event.target.checked })} /><span>{planningAcknowledgment}</span></label> : null}
      <Button variant="ghost" disabled={busy} className="w-fit text-xs underline" onClick={onRefresh}>Refresh recipes and week</Button>
    </div>
  </Modal>;
}
