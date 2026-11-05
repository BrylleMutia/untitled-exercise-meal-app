"use client";

import { createUuid } from "@/utility/uuid";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { ListChecks, ListX, Shuffle } from "lucide-react";
import { Stepper, StepperActions } from "@/components/ui/Stepper";
import { GenerationStep, GenerationReview, GenerationDraftNotice, personalGenerationSteps, useGenerationSteps } from "./GenerationSteps";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { CardSwiper } from "@/components/ui/CardSwiper";
import { RecipeCover } from "./RecipeCover";
import { HelpPopover } from "@/components/ui/HelpPopover";
import { DayCheckboxStrip } from "@/components/DayStrip";
import { editedDefaultRecipeIds, recipeDisplayName } from "@/utility/recipeLibrary";
import { GenerationRecipeCard } from "./GenerationRecipeCard";
import { RecipeWarningReview, DailyWarningReview, PlanningAcknowledgment } from "./PreferenceReview";
import { PLANNING_REVIEW_POLICY } from "@/types/planningPreferences";
import { DailyPlanPreview } from "./DailyPlanPreview";
import { useApp } from "@/contexts/AppContext";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";
import { weekDates } from "@/utility/dates";
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
  const { step, setStep, headingRef, resetSteps } = useGenerationSteps();
  const dayHeadingId = useId();
  const recipeHeadingId = useId();
  const [draft, setDraft] = useState<GenerationDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  const [restored, setRestored] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const discardingRef = useRef(false);
  const unpersistedDraft = useRef<GenerationDraft | null>(null);
  const submitting = useRef(false), completed = useRef(false);
  const writes = useRef(Promise.resolve());
  const initial = useRef(snapshot);
  const userId = snapshot.userId, draftType = `nutrition-generation:${weekOf}`;
  const basis = generationBasis(snapshot, weekOf);
  const options = weeklyRecipeOptions(snapshot, weekOf);
  const editedIds = editedDefaultRecipeIds(snapshot.savedMeals);
  const changed = Boolean(draft && draft.basis !== basis);
  const busy = saving || pending || discarding;
  const selectionDisabled = busy || unavailable || !draft || changed;

  function create(selected: string[], source = snapshot, selectedDates = defaultPlanningDates(weekOf)): GenerationDraft {
    const seed = createUuid();
    return { basis: generationBasis(source, weekOf), selectedDates, selected, seed, preview: generateWeeklyMeals(source, weekOf, selected, seed, selectedDates),
      key: `generate-week-${createUuid()}`, acknowledged: false,
      recipes: source.savedMeals.filter(recipe => selected.includes(recipe.id)).map(recipe => ({ id: recipe.id, revision: recipe.revision ?? 1 })),
      expectedVersions: { profileRevision: source.profile?.revision, mealPlanVersion: source.mealPlan?.version ?? 0, groceryRevision: source.grocery?.revision ?? 0 } };
  }

  useEffect(() => {
    let active = true;
    void readDraft<GenerationDraft>(userId, draftType).then(saved => {
      if (!active) return;
      const value = saved?.payload;
      if (value && Array.isArray(value.selectedDates) && value.selectedDates.every(date => weekDates(weekOf).includes(date)) && new Set(value.selectedDates).size === value.selectedDates.length && Array.isArray(value.selected) && value.preview && Array.isArray(value.preview.assignments) && Array.isArray(value.preview.unused) && typeof value.basis === "string" && value.expectedVersions && Array.isArray(value.recipes) && value.key) {
        setDraft(create(value.selected, initial.current, value.selectedDates)); setRestored(true);
      } else {
        const source = initial.current;
        setDraft(create([], source));
      }
    });
    return () => { active = false; };
    // One account/week owns this dialog; refreshed data requires explicit renewed review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, draftType]);

  useEffect(() => {
    if (!draft || completed.current || discardingRef.current || draft === unpersistedDraft.current) return;
    let active = true;
    writes.current = writes.current.then(async () => {
      const saved = await writeDraft(createDraftEnvelope({ userId, draftType, payload: draft, baseVersions: draft.expectedVersions, ttlMs: draftTtlMs(draftType) }));
      if (active) setStorageFailed(!saved);
    });
    return () => { active = false; };
  }, [draft, userId, draftType]);

  function update(selected: string[], selectedDates = draft?.selectedDates ?? defaultPlanningDates(weekOf)) { setDraft(create(selected, snapshot, selectedDates)); setMessage(""); }
  function chooseRecipe(id: string, selected: boolean) {
    if (selectionDisabled || draft!.selected.includes(id) === selected) return;
    update(selected ? [...draft!.selected, id] : draft!.selected.filter(value => value !== id));
  }
  async function discard() {
    if (busy || discardingRef.current || submitting.current || !restored) return;
    discardingRef.current = true; setDiscarding(true); setMessage("");
    try {
      await writes.current;
      await clearDraft(userId, draftType);
      if (await readDraft(userId, draftType)) throw new Error("The draft could not be discarded on this device. Your choices are retained. Try again.");
      const fresh = create([]);
      // Keep untouched reset defaults out of recovery storage until the next edit.
      unpersistedDraft.current = fresh;
      setDraft(fresh); setRestored(false); setStorageFailed(false); setResetVersion(value => value + 1);
      resetSteps(); setMessage("Draft discarded. Start a new plan with the default choices.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "The draft could not be discarded. Your choices are retained. Try again.");
    } finally { discardingRef.current = false; setDiscarding(false); }
  }
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
  const continueDisabled = selectionDisabled || !draft?.selectedDates.length || (step >= 1 && !draft?.selected.length);
  return <Modal open title="Generate plan" initialFocus={headingRef} stepper={<Stepper label="Generate plan" steps={personalGenerationSteps} step={step} headingRef={headingRef} headingLevel="h3" />} returnFocus={returnFocus} dismissalDisabled={busy} onClose={onClose}
    help={<HelpPopover key={`${resetVersion}:${step}`} title="Generate plan" label="About generate plan"><p>Fill this week’s empty meals with one serving per entry. Each recipe has one weekly batch; existing active planned servings count toward its yield.</p></HelpPopover>}
    footer={<div className="grid gap-2">
      {message ? <p className="text-sm text-ink-soft" role="status">{message}</p> : null}
      {error ? <p className="text-sm text-danger-900" role="alert">{error.message}</p> : null}
      <StepperActions step={step} total={personalGenerationSteps.length} busy={busy} continueDisabled={continueDisabled} onClose={onClose} onBack={() => setStep(value => value - 1)} onContinue={() => setStep(value => value + 1)}
        finalAction={<Button className="min-w-0 flex-1" disabled={busy || unavailable || !draft || changed || !draft.preview.assignments.length || !draft.acknowledged} aria-busy={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save plan"}</Button>} />
    </div>}>
    <div key={resetVersion} className="grid min-w-0 gap-5">
      {!draft ? <LoadingIndicator label="Restoring plan draft…" /> : null}
      {restored ? <GenerationDraftNotice disabled={busy} discarding={discarding} onDiscard={() => void discard()}>Weekly plan draft restored. Review the preview before saving.</GenerationDraftNotice> : null}
      {storageFailed ? <p className="text-sm" role="status">Draft recovery is unavailable. Keep this dialog open until saved.</p> : null}
      {unavailable ? <p className="text-sm" role="status">Refresh recipes and this week before saving. Your preview is retained.</p> : null}
      {changed ? <div className="grid gap-2 rounded-2xl bg-peach-50 p-3" role="status"><p className="text-sm">This week, a recipe, or your planning settings changed. Review a fresh preview before saving.</p><Button variant="soft" disabled={busy || unavailable} onClick={() => update(draft!.selected.filter(id => options.some(option => option.recipe.id === id)))}>Review updated preview</Button></div> : null}
      <GenerationStep active={step === 0} title="Choose days">
      <fieldset disabled={selectionDisabled} aria-labelledby={dayHeadingId} className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span id={dayHeadingId} className="sr-only">Choose days</span>
          <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
            <Button variant="primary" className={bulkActionClassName} disabled={selectionDisabled} onClick={() => update(draft!.selected, weekDates(weekOf))}><ListChecks className="h-4 w-4 shrink-0" aria-hidden /><span className="sr-only md:not-sr-only">Select all</span></Button>
            <Button variant="soft" className={bulkActionClassName} disabled={selectionDisabled} onClick={() => update(draft!.selected, [])}><ListX className="h-4 w-4 shrink-0" aria-hidden /><span className="sr-only md:not-sr-only">Clear</span></Button>
          </div>
        </div>
        <DayCheckboxStrip weekOf={weekOf} selectedDates={draft?.selectedDates ?? []} disabled={selectionDisabled}
          onToggle={(date, checked) => update(draft!.selected, checked ? [...draft!.selectedDates, date].sort() : draft!.selectedDates.filter(value => value !== date))} />
        {!draft?.selectedDates.length ? <p className="mt-2 text-sm text-ink-soft" role="status">Choose at least one day to preview meals.</p> : null}
      </fieldset>
      </GenerationStep>
      <GenerationStep active={step === 1} title="Choose recipes">
      <p className="text-xs text-ink-soft">Cost checks are temporarily paused.</p>
      <fieldset disabled={selectionDisabled} aria-labelledby={recipeHeadingId} className="min-w-0">
        <span id={recipeHeadingId} className="sr-only">Choose recipes</span>
        {draft ? <CardSwiper items={options.map(option => ({ id: option.recipe.id, label: recipeDisplayName(option.recipe, editedIds), selected: draft.selected.includes(option.recipe.id), value: draft.selected.includes(option.recipe.id) }))}
          basisKey={basis} active={step === 1} disabled={selectionDisabled}
          renderCard={item => <GenerationRecipeCard option={options.find(option => option.recipe.id === item.id)!} displayName={item.label} foods={snapshot.foods} />}
          renderThumbnail={item => <RecipeCover image={options.find(option => option.recipe.id === item.id)?.recipe.image} name={item.label} fill />}
          onDecision={(id, decision) => chooseRecipe(id, decision === "add")} onUndo={chooseRecipe}
          onSelectAll={() => { if (draft.selected.length !== options.length || options.some(option => !draft.selected.includes(option.recipe.id))) update(options.map(option => option.recipe.id)); }}
          onClear={() => { if (draft.selected.length) update([]); }} /> : <p role="status" className="text-sm text-ink-soft">Loading recipe choices…</p>}
      </fieldset>
      {!draft?.selected.length ? <p className="text-sm text-ink-soft">Choose at least one recipe to continue.</p> : null}
      </GenerationStep>
      <GenerationStep active={step === 2} title="Preview">
      <section className="grid min-w-0 gap-3" aria-label="Generated plan preview"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">Preview · {draft?.preview.assignments.length ?? 0} {draft?.preview.assignments.length === 1 ? "meal" : "meals"}</h3><Button variant="soft" disabled={busy || unavailable || !draft || changed || !draft.selected.length} onClick={() => update(draft!.selected)}><Shuffle className="h-4 w-4" aria-hidden />Shuffle</Button></div>
        <DailyPlanPreview weekOf={weekOf} dates={draft?.selectedDates ?? []} userId={snapshot.userId} current={Boolean(draft && !changed && !unavailable && !discarding)} disabled={busy}
          meals={draft ? [...(snapshot.mealPlan?.weekOf === weekOf ? snapshot.mealPlan.meals : []).filter(meal => !meal.skipped && draft.selectedDates.includes(meal.date)).map(meal => ({ ...meal, status: "kept" as const, image: snapshot.savedMeals.find(recipe => recipe.id === meal.mealId)?.image })), ...draft.preview.assignments.map(meal => ({ ...meal, status: "new" as const, image: snapshot.savedMeals.find(recipe => recipe.id === meal.mealId)?.image }))] : []} />
        {draft && !changed && !unavailable && !draft.preview.assignments.length ? <p className="text-sm text-ink-soft">No meals fit the selected days, recipes, empty slots, and eligible daily targets.</p> : null}
      </section>
      </GenerationStep>
      <GenerationStep active={step === 3} title="Unused servings">
      {draft?.preview.unused.length ? <section className="grid gap-2" aria-label="Unused servings"><ul className="grid gap-2 text-sm">{draft.preview.unused.map(row => <li key={row.mealId}><span className="font-bold">{row.name}: {Number(row.servings.toFixed(4))}</span> — {row.reason}</li>)}</ul></section> : null}
      {draft && !draft.preview.unused.length ? <p className="text-sm text-ink-soft">No unused servings in this preview.</p> : null}
      </GenerationStep>
      <GenerationStep active={step === 4} title="Review">
      <GenerationReview disabled={busy} onEdit={setStep} items={[
        { label: "Days", value: `${draft?.selectedDates.length ?? 0} selected`, step: 0 },
        { label: "Recipes", value: `${draft?.selected.length ?? 0} selected`, step: 1 },
        { label: "Preview", value: `${draft?.preview.assignments.length ?? 0} new meals`, step: 2 },
      ]} />
      {!changed && !unavailable && draft?.preview.preferenceReview ? <RecipeWarningReview key={`recipes:${draft.seed}`} collapsible review={draft.preview.preferenceReview} disabled={selectionDisabled} onRemove={id => update(draft.selected.filter(selected => selected !== id))} /> : null}
      {!changed && !unavailable && draft?.preview.preferenceReview && !draft.preview.preferenceReview.recipeWarnings.length ? <p className="text-sm text-ink-soft">No recipe warnings were returned for this preview. Review ingredients before preparing or eating.</p> : null}
      {!changed && !unavailable && draft?.preview.preferenceReview ? <DailyWarningReview key={`daily:${draft.seed}`} collapsible review={draft.preview.preferenceReview} /> : null}
      {draft ? <PlanningAcknowledgment checked={!changed && draft.acknowledged} disabled={busy || changed || unavailable} onChange={acknowledged => setDraft({ ...draft, acknowledged })} /> : null}
      </GenerationStep>
      <Button variant="ghost" disabled={busy} className="w-fit text-xs underline" onClick={onRefresh}>Refresh recipes and week</Button>
    </div>
  </Modal>;
}
