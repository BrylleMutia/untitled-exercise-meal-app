"use client";

import { createUuid } from "@/utility/uuid";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ListChecks, ListX, Minus, Plus, Shuffle } from "lucide-react";
import { Stepper, StepperActions } from "@/components/ui/Stepper";
import { GenerationStep, GenerationReview, GenerationDraftNotice, groupGenerationSteps, useGenerationSteps } from "@/components/nutrition/GenerationSteps";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { HelpPopover } from "@/components/ui/HelpPopover";
import { ReviewDisclosure } from "@/components/nutrition/ReviewDisclosure";
import { CardSwiper } from "@/components/ui/CardSwiper";
import { DayCheckboxStrip } from "@/components/DayStrip";
import { RecipeCover } from "@/components/nutrition/RecipeCover";
import { RecipeResourcePills } from "@/components/nutrition/RecipeResourcePills";
import { RecipeSwipeCard } from "@/components/nutrition/RecipeSwipeCard";
import { RecipeWarningReview, DailyWarningReview, PlanningAcknowledgment } from "@/components/nutrition/PreferenceReview";
import { PLANNING_REVIEW_POLICY } from "@/types/planningPreferences";
import { DailyPlanPreview } from "@/components/nutrition/DailyPlanPreview";
import { useApp } from "@/contexts/AppContext";
import { clearDraft, createDraftEnvelope, readDraft, writeDraft } from "@/services/draftStore";
import { defaultPlanningDates } from "@/utility/weeklyMealGeneration";
import { formatFullDate, weekDates } from "@/utility/dates";
import { editedDefaultRecipeIds, recipeDisplayName, uniqueGroupRecipes } from "@/utility/recipeLibrary";
import { groupPlanningWarnings } from "@/utility/groupPlanningWarnings";
import type { GroupPlanningInput, GroupPreview, GroupWeek } from "@/types/cookingGroup";

const bulkClass = "!min-h-11 min-w-11 !px-3 text-xs";
const validBatchLimit = (value: number) => Number.isInteger(value) && value >= 1 && value <= 100;
type RecipeChoice = { recipe: GroupPlanningInput["recipes"][number] | undefined; text: string };
export function GroupGenerateDialog({ week: sourceWeek, returnFocus, onClose }: { week: GroupWeek; returnFocus?: RefObject<HTMLElement | null>; onClose: () => void }) {
  const week = { ...sourceWeek, recipes: uniqueGroupRecipes(sourceWeek.recipes) };
  const { snapshot, actions, pendingMutation } = useApp(); const group = week.group!;
  const { step, setStep, headingRef, resetSteps } = useGenerationSteps();
  const [isSaving, setIsSaving] = useState(false);
  function createInput(): GroupPlanningInput {
    return { reviewPolicyVersion: PLANNING_REVIEW_POLICY, groupId: group.id, weekOf: week.weekOf, memberIds: group.members.map(m => m.id), selectedDates: defaultPlanningDates(week.weekOf), mode: "fill", recipes: [], seed: createUuid(), overrides: {} };
  }
  const [input, setInput] = useState<GroupPlanningInput>(createInput);
  const [ready, setReady] = useState(false); const [restored, setRestored] = useState(false); const [preview, setPreview] = useState<{ value: GroupPreview; tag: string } | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [discardMessage, setDiscardMessage] = useState("");
  const [resetVersion, setResetVersion] = useState(0);
  const discardingRef = useRef(false);
  const unpersistedInput = useRef<GroupPlanningInput | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [acknowledged, setAcknowledged] = useState(false); const [retry, setRetry] = useState(0);
  const [portionText, setPortionText] = useState<Record<string, string>>({});
  const hasPortionEdits = Object.keys(portionText).length > 0;
  const [batchText, setBatchText] = useState<Record<string, string>>({});
  const [stagedBatches, setStagedBatches] = useState<Record<string, string>>({});
  const [refreshingSource, setRefreshingSource] = useState(false);
  const refreshRequest = useRef(0);
  const refreshPending = useRef(false);
  const refreshFailed = useRef(false);
  useEffect(() => () => { refreshRequest.current++; }, []);
  const invalidBatches = input.recipes.some(recipe => !validBatchLimit(recipe.maxBatches) || batchText[recipe.id] !== undefined);
  const retryKey = useRef(createUuid()); const saving = useRef(false); const draftQueue = useRef<Promise<unknown>>(Promise.resolve());
  const editedIds = editedDefaultRecipeIds(snapshot.savedMeals, week.recipes);
  const draftType = `nutrition-group-generation:${group.id}:${week.weekOf}`;
  const basis = JSON.stringify({ policyVersion: PLANNING_REVIEW_POLICY, profile: snapshot.profile, targets: snapshot.nutritionWeekTargets, plan: snapshot.mealPlan, logs: snapshot.nutritionLogs, group: group.revision, revision: week.revision, recipes: week.recipes.map(r => [r.id, r.revision]) });
  const tag = JSON.stringify({ input, basis }); const current = preview?.tag === tag && preview?.value.preferenceReview?.policyVersion === PLANNING_REVIEW_POLICY && !invalidBatches && !loading && !error && !discarding && !refreshingSource; const disabled = Boolean(pendingMutation) || isSaving || discarding || refreshingSource;
  const validInputs = !invalidBatches && input.memberIds.length > 0 && input.selectedDates.length > 0 && input.recipes.length > 0;
  const previewPending = ready && !discarding && (refreshingSource || validInputs && !error && (loading || preview?.tag !== tag));
  useEffect(() => {
    let active = true;
    void readDraft<{ input: GroupPlanningInput }>(snapshot.userId, draftType).then(saved => {
      if (!active) return;
      if (saved?.payload.input?.groupId === group.id && saved.payload.input.weekOf === week.weekOf) { setInput({ ...saved.payload.input, reviewPolicyVersion: PLANNING_REVIEW_POLICY }); setRestored(true); }
      setReady(true);
    }); return () => { active = false; };
  }, [snapshot.userId, draftType, group.id, week.weekOf]);
  useEffect(() => {
    if (!ready || discardingRef.current || input === unpersistedInput.current) return;
    draftQueue.current = draftQueue.current.then(() => writeDraft(createDraftEnvelope({ userId: snapshot.userId, draftType, payload: { input }, baseVersions: {}, ttlMs: 7 * 86400000 })));
  }, [ready, input, snapshot.userId, draftType]);
  useEffect(() => {
    if (!ready || discarding || refreshingSource || refreshFailed.current) return;
    let active = true;
    const timer = setTimeout(() => {
      setAcknowledged(false); retryKey.current = createUuid(); setError("");
      if (invalidBatches || !input.memberIds.length || !input.selectedDates.length || !input.recipes.length) { setLoading(false); return; }
      setLoading(true);
      void actions.previewCookingGroup(input).then(value => { if (active) {
        if (!Array.isArray(value.resultingMeals)) throw new Error("The complete daily preview is unavailable. Refresh after the preview service is updated.");
        setPreview({ value, tag });
      } }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [ready, tag, input, retry, actions, invalidBatches, discarding, refreshingSource]);
  function change(next: GroupPlanningInput, keepPortionDrafts = false) {
    refreshFailed.current = false;
    // Returning to a previous input must still await a fresh authoritative preview.
    setPreview(null); if (!keepPortionDrafts) setPortionText({}); setInput(next); setAcknowledged(false); setError(""); setDiscardMessage("");
    setBatchText(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => next.recipes.some(recipe => recipe.id === id))));
  }
  async function discard() {
    if (disabled || discardingRef.current || saving.current || !ready || !restored) return;
    discardingRef.current = true; setDiscarding(true); setDiscardMessage(""); setAcknowledged(false); setPreview(null); setError("");
    refreshRequest.current++; refreshPending.current = false; refreshFailed.current = false;
    try {
      await draftQueue.current;
      await clearDraft(snapshot.userId, draftType);
      if (await readDraft(snapshot.userId, draftType)) throw new Error("The draft could not be discarded on this device. Your choices are retained. Try again.");
      const fresh = createInput();
      // Resetting is not an edit; resume autosave only after a subsequent choice.
      unpersistedInput.current = fresh;
      setInput(fresh); setBatchText({}); setStagedBatches({}); setPortionText({}); setRestored(false); setLoading(false);
      retryKey.current = createUuid(); setResetVersion(value => value + 1); resetSteps();
      setDiscardMessage("Draft discarded. Start a new plan with the default choices.");
    } catch (reason) {
      setDiscardMessage(reason instanceof Error ? reason.message : "The draft could not be discarded. Your choices are retained. Try again.");
    } finally { discardingRef.current = false; setDiscarding(false); }
  }
  function editBatches(id: string, text: string) {
    if (!input.recipes.some(recipe => recipe.id === id)) {
      setStagedBatches(previous => ({ ...previous, [batchKey(id)]: text })); return;
    }
    const value = Number(text);
    setAcknowledged(false); setError("");
    if (text.trim() && validBatchLimit(value)) {
      setBatchText(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== id)));
      change({ ...input, recipes: input.recipes.map(recipe => recipe.id === id ? { ...recipe, maxBatches: value } : recipe) });
    } else {
      // Invalid text stays local; recoverable planning drafts retain the last valid allowance.
      setBatchText(previous => ({ ...previous, [id]: text }));
    }
  }
  function batchKey(id: string) { return `${id}:${week.recipes.find(recipe => recipe.id === id)?.revision ?? 1}`; }
  function batchValue(id: string) { const selected = input.recipes.find(recipe => recipe.id === id); return selected ? batchText[id] ?? String(selected.maxBatches) : stagedBatches[batchKey(id)] ?? "1"; }
  function chooseRecipe(id: string, decision: "add" | "skip") {
    const selected = input.recipes.find(recipe => recipe.id === id);
    const value = Number(batchValue(id));
    if (decision === "add") {
      if (!batchValue(id).trim() || !validBatchLimit(value)) return;
      const recipe = week.recipes.find(recipe => recipe.id === id)!;
      if (!selected || selected.maxBatches !== value) change({ ...input, recipes: [...input.recipes.filter(recipe => recipe.id !== id), { id, revision: recipe.revision ?? 1, maxBatches: value }] });
    } else if (selected) change({ ...input, recipes: input.recipes.filter(recipe => recipe.id !== id) });
    setBatchText(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== id)));
    setStagedBatches(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== batchKey(id))));
  }
  function restoreRecipe(id: string, previous: RecipeChoice) {
    const selected = input.recipes.find(recipe => recipe.id === id);
    if (selected?.maxBatches !== previous.recipe?.maxBatches || selected?.revision !== previous.recipe?.revision) {
      change({ ...input, recipes: [...input.recipes.filter(recipe => recipe.id !== id), ...(previous.recipe ? [previous.recipe] : [])] });
    }
    setBatchText(current => ({ ...Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)), ...(previous.recipe && previous.text !== String(previous.recipe.maxBatches) ? { [id]: previous.text } : {}) }));
    setStagedBatches(current => ({ ...current, [batchKey(id)]: previous.text }));
  }
  async function refreshPreview() {
    if (refreshPending.current || disabled) return;
    refreshPending.current = true;
    refreshFailed.current = false;
    const request = ++refreshRequest.current;
    setRefreshingSource(true); setPreview(null); setAcknowledged(false); setError("");
    try {
      const fresh = await actions.loadCookingGroupWeek(week.weekOf);
      if (request !== refreshRequest.current) return;
      if (!fresh.group) throw new Error("You are no longer connected to this cooking group.");
      const members = new Set(fresh.group.members.map(m => m.id));
      change({ ...input, memberIds: input.memberIds.filter(id => members.has(id)), recipes: input.recipes.flatMap(selected => { const recipe = fresh.recipes.find(r => r.id === selected.id); return recipe ? [{ ...selected, revision: recipe.revision ?? 1 }] : []; }) });
      setRetry(n => n + 1);
      void actions.refreshSnapshot({ silent: true });
    } catch (reason) { if (request === refreshRequest.current) { refreshFailed.current = true; setError(reason instanceof Error ? reason.message : "Refresh failed. Your choices are retained."); } }
    finally { if (request === refreshRequest.current) { refreshPending.current = false; setRefreshingSource(false); setLoading(false); } }
  }
  async function save() {
    if (saving.current || loading || !current || hasPortionEdits || !preview?.value.assignments.length || !acknowledged) return;
    saving.current = true; setIsSaving(true); setError("");
    try {
      await actions.cookingGroupCommand({ action: "commit", previewId: preview.value.id, acknowledged, idempotencyKey: retryKey.current });
      await draftQueue.current; await clearDraft(snapshot.userId, draftType); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Save failed. Your choices are retained."); }
    finally { saving.current = false; setIsSaving(false); }
  }
  const shown = current ? preview?.value : undefined;
  const warnings = current && !loading && !error && shown ? groupPlanningWarnings(shown.warnings) : null;
  const continueDisabled = disabled || !ready || (step === 0 && (!input.memberIds.length || !input.selectedDates.length)) || (step === 1 && (!input.recipes.length || invalidBatches)) || (step >= 2 && (!current || loading)) || (step === 2 && hasPortionEdits);
  const helpContent = step === 0 ? <p>Only selected people and days change. Eaten entries and their linked planned meals stay intact. Portions are estimates and remain editable.</p>
    : step === 1 ? <><p>Selected recipes are options for the planner. Preference conflicts are warnings, not automatic exclusions. Other planning limits still apply.</p><p>Batches set the most you may cook this week. Each batch makes the servings shown on the recipe. Meals already kept in the shared plan count toward this limit.</p></>
      : step === 4 ? <p>Personal warnings shown here use your settings only. Review ingredients with other members; each selected member receives their own private review after saving.</p> : null;
  return <Modal open title="Generate plan" initialFocus={headingRef} stepper={<Stepper label="Generate plan" steps={groupGenerationSteps} step={step} headingRef={headingRef} headingLevel="h3" />} returnFocus={returnFocus} dismissalDisabled={disabled} onClose={onClose}
    help={helpContent ? <HelpPopover key={`${resetVersion}:${step}`} title={groupGenerationSteps[step]} label={`About ${groupGenerationSteps[step].toLowerCase()}`}>{helpContent}</HelpPopover> : null}
    footer={<div className="grid gap-2">{error ? <p role="alert" className="text-sm text-danger-900">{error} <button className="min-h-11 underline" disabled={disabled} onClick={() => void refreshPreview()}>Refresh preview and review</button></p> : null}<StepperActions step={step} total={groupGenerationSteps.length} busy={disabled} continueDisabled={continueDisabled} onClose={onClose} onBack={() => setStep(value => value - 1)} onContinue={() => setStep(value => value + 1)} finalAction={<Button className="min-w-0 flex-1" disabled={disabled || loading || !current || hasPortionEdits || !acknowledged || !shown?.assignments.length} aria-busy={isSaving} onClick={() => void save()}>{isSaving ? "Saving…" : "Save plan"}</Button>} /></div>}>
    <div key={resetVersion} className="grid min-w-0 gap-6">
      {!ready ? <LoadingIndicator label="Restoring plan draft…" /> : null}
      {restored ? <GenerationDraftNotice disabled={disabled || !ready} discarding={discarding} onDiscard={() => void discard()}>Group draft restored. A fresh preview requires your review before saving.</GenerationDraftNotice> : null}
      {previewPending && step !== 2 && step !== 3 ? <LoadingIndicator label="Generating plan preview…" /> : null}
      {discardMessage ? <p role="status" className="text-sm text-ink-soft">{discardMessage}</p> : null}
      <GenerationStep active={step === 0} title="Setup">
      <fieldset disabled={disabled || !ready} className="min-w-0"><legend className="mb-3 font-extrabold">People</legend><p className="mb-3 text-xs text-ink-soft">Select only yourself to plan for you. These meals still contribute to shared groceries. Unchecked people keep their existing meals.</p><div className="flex flex-wrap gap-2">{group.members.map(m => <label key={m.id} className={`flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${input.memberIds.includes(m.id) ? "border-ink bg-lav-100" : "border-ink/20"}`}><input type="checkbox" checked={input.memberIds.includes(m.id)} onChange={e => change({ ...input, memberIds: e.target.checked ? [...input.memberIds, m.id] : input.memberIds.filter(id => id !== m.id), overrides: {} })} /><span className="min-w-0 break-words">{m.name}{m.id === snapshot.userId ? " (you)" : ""}</span></label>)}</div>{!input.memberIds.length ? <p className="mt-2 text-sm">Choose at least one person.</p> : null}</fieldset>
      <fieldset disabled={disabled || !ready} className="min-w-0" aria-label="Choose days"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-extrabold">Choose days</h4><div className="ml-auto flex gap-1"><Button className={bulkClass} aria-label="Select all" onClick={() => change({ ...input, selectedDates: weekDates(week.weekOf) })}><ListChecks className="h-4 w-4" aria-hidden /><span className="hidden md:inline">Select all</span></Button><Button variant="soft" className={bulkClass} aria-label="Clear" onClick={() => change({ ...input, selectedDates: [] })}><ListX className="h-4 w-4" aria-hidden /><span className="hidden md:inline">Clear</span></Button></div></div><DayCheckboxStrip weekOf={week.weekOf} selectedDates={input.selectedDates} disabled={disabled} onToggle={(date, checked) => change({ ...input, selectedDates: checked ? [...input.selectedDates, date] : input.selectedDates.filter(d => d !== date) })} />{!input.selectedDates.length ? <p className="text-sm">Choose at least one day.</p> : null}</fieldset>
      <fieldset disabled={disabled || !ready} className="grid min-w-0 gap-2"><legend className="mb-3 font-extrabold">Planning mode</legend><label className="flex min-h-11 items-center gap-2"><input type="radio" name="group-mode" checked={input.mode === "fill"} onChange={() => change({ ...input, mode: "fill", overrides: {} })} />Fill empty meals</label><label className="flex min-h-11 items-center gap-2"><input type="radio" name="group-mode" checked={input.mode === "replace"} onChange={() => change({ ...input, mode: "replace", overrides: {} })} />Replace planned meals on selected days</label></fieldset>
      </GenerationStep>
      <GenerationStep active={step === 1} title="Choose recipes">
      <p className="text-xs text-ink-soft">Cost checks are temporarily paused.</p>
      <fieldset disabled={disabled || !ready} className="min-w-0" aria-label="Choose recipes">
        {ready ? <CardSwiper<RecipeChoice> items={week.recipes.map(recipe => ({ id: recipe.id, label: recipeDisplayName(recipe, editedIds), selected: input.recipes.some(selected => selected.id === recipe.id), value: { recipe: input.recipes.find(selected => selected.id === recipe.id), text: batchValue(recipe.id) }, canAdd: batchValue(recipe.id).trim() !== "" && validBatchLimit(Number(batchValue(recipe.id))) }))}
          basisKey={basis} active={step === 1} disabled={disabled}
          renderThumbnail={item => <RecipeCover image={week.recipes.find(recipe => recipe.id === item.id)?.image} name={item.label} fill />}
          renderCard={item => {
            const recipe = week.recipes.find(recipe => recipe.id === item.id)!;
            const value = batchValue(item.id);
            const valid = value.trim() !== "" && validBatchLimit(Number(value));
            const helperId = `batch-help-${item.id}`;
            return <RecipeSwipeCard name={item.label} image={recipe.image}>
              <RecipeResourcePills compact calories={recipe.caloriesPerServing} recipeServings={recipe.servings} totalTimeMinutes={recipe.totalTimeMinutes} complexity={recipe.complexity} />
              <div className="grid min-w-0 gap-2 border-t border-ink/10 pt-3">
                <div className="mx-auto grid w-full max-w-64 grid-cols-[44px_minmax(44px,1fr)_44px] items-center gap-1">
                  <Button variant="ghost" className="!min-h-[44px] w-[44px] !px-0 focus-visible:outline-2 focus-visible:outline-lav-500" aria-label={`Decrease batches for ${item.label}`} disabled={disabled || !valid || Number(value) <= 1} onClick={() => editBatches(item.id, String(Number(value) - 1))}><Minus className="h-4 w-4" aria-hidden /></Button>
                  <input className="input !min-h-11 !px-1 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" type="number" inputMode="numeric" min={1} max={100} step={1} placeholder="Batches" aria-label={`Batches for ${item.label}`} aria-describedby={helperId} aria-invalid={!valid || undefined} disabled={disabled} value={value} onChange={event => editBatches(item.id, event.target.value)} />
                  <Button variant="ghost" className="!min-h-[44px] w-[44px] !px-0 focus-visible:outline-2 focus-visible:outline-lav-500" aria-label={`Increase batches for ${item.label}`} disabled={disabled || !valid || Number(value) >= 100} onClick={() => editBatches(item.id, String(Number(value) + 1))}><Plus className="h-4 w-4" aria-hidden /></Button>
                </div>
                <p id={helperId} className={`break-words text-center text-xs ${valid ? "text-ink-soft" : "text-danger-900"}`} role={!valid ? "status" : undefined}>{valid ? `${value} ${Number(value) === 1 ? "batch" : "batches"} · Up to ${recipe.servings * Number(value)} servings this week.` : "Enter a whole number from 1 to 100."}</p>
              </div>
            </RecipeSwipeCard>;
          }}
          onDecision={chooseRecipe} onUndo={restoreRecipe}
          onSelectAll={() => { setBatchText({}); setStagedBatches({}); const recipes = week.recipes.filter(recipe => recipe.mealSlots?.length).map(recipe => ({ id: recipe.id, revision: recipe.revision ?? 1, maxBatches: 1 })); if (recipes.length !== input.recipes.length || recipes.some(recipe => !input.recipes.some(selected => selected.id === recipe.id && selected.maxBatches === 1))) change({ ...input, recipes }); }}
          onClear={() => { setBatchText({}); setStagedBatches({}); if (input.recipes.length) change({ ...input, recipes: [] }); }} /> : <p role="status" className="text-sm text-ink-soft">Loading recipe choices…</p>}
      </fieldset>
      {!input.recipes.length ? <p className="text-sm text-ink-soft">Choose at least one recipe to continue.</p> : null}
      </GenerationStep>
      <GenerationStep active={step === 2} title="Preview">
      <section className="grid min-w-0 gap-3" aria-label="Group generation preview"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">Preview · {shown?.assignments.length ?? 0} {shown?.assignments.length === 1 ? "new meal assignment" : "new meal assignments"}</h3><Button variant="soft" disabled={disabled || loading} onClick={() => change({ ...input, seed: createUuid(), overrides: {} })}><Shuffle className="h-4 w-4" aria-hidden />Shuffle</Button></div>
      {invalidBatches ? <p role="status" className="text-sm text-danger-900">Correct the batch limits to refresh and review this preview.</p> : null}
      <DailyPlanPreview weekOf={week.weekOf} dates={input.selectedDates} people={group.members.filter(member => input.memberIds.includes(member.id))} userId={snapshot.userId} meals={shown?.resultingMeals ?? []} current={Boolean(current)} disabled={disabled} loading={previewPending && step === 2}
        renderServings={meal => {
          const portionId = `${meal.memberId}:${meal.date}:${meal.slot}`;
          const value = portionText[portionId] ?? String(meal.servings);
          const valid = value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= .25 && Number(value) <= 4 && Number.isInteger(Number(value) * 4);
          return <div className="grid min-w-0 gap-1"><label className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold">Estimated servings<input className="input !w-28" type="number" min={.25} max={4} step={.25} disabled={disabled || loading} value={value} aria-invalid={!valid || undefined} aria-describedby={!valid ? `portion-error-${meal.id}` : undefined} aria-label={`Servings for ${group.members.find(member => member.id === meal.memberId)?.name}, ${meal.date}, ${meal.slot}`}
            onChange={event => { setAcknowledged(false); setPortionText(previous => ({ ...previous, [portionId]: event.target.value })); }}
            onBlur={() => { if (!valid) return; setPortionText(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== portionId))); if (Number(value) !== meal.servings) change({ ...input, overrides: { ...input.overrides, [portionId]: Number(value) } }, true); }} /></label>
            {!valid ? <p id={`portion-error-${meal.id}`} role="status" className="text-xs text-danger-900">Enter 0.25–4 servings in steps of 0.25.</p> : null}
          </div>;
        }} />

      </section>
      </GenerationStep>
      <GenerationStep active={step === 3} title="Recipes to cook">
      {previewPending && step === 3 ? <LoadingIndicator label="Updating cooking requirements…" /> : null}
      {shown?.batches.length ? <div><p className="mt-1 text-xs text-ink-soft">Whole batches needed for these assignments, including servings left over.</p><ul className="mt-2 grid gap-2">{shown.batches.map(b => <li key={`${b.recipeId}:${b.recipeRevision ?? 1}`} className="rounded-xl bg-lav-50 p-3 text-sm"><strong>{b.name}</strong><p>{b.batches} {b.batches === 1 ? "batch" : "batches"} · {b.portions} assigned servings · {b.leftovers} leftover servings</p></li>)}</ul></div> : null}
      {current && !shown?.batches.length ? <p className="text-sm text-ink-soft">No new cooking batches are needed in this preview.</p> : null}
      {!current && !previewPending ? <p role="status" className="text-sm text-ink-soft">Refresh the preview to review cooking requirements.</p> : null}
      </GenerationStep>
      <GenerationStep active={step === 4} title="Review">
      <GenerationReview disabled={disabled} onEdit={setStep} items={[
        { label: "People", value: group.members.filter(member => input.memberIds.includes(member.id)).map(member => member.name).join(", ") || "None selected", step: 0 },
        { label: "Days", value: `${input.selectedDates.length} selected`, step: 0 },
        { label: "Planning mode", value: input.mode === "fill" ? "Fill empty meals" : "Replace planned meals", step: 0 },
        { label: "Recipes", value: `${input.recipes.length} selected`, step: 1 },
        { label: "Preview", value: `${shown?.assignments.length ?? 0} new meal assignments`, step: 2 },
      ]} />
      {!current && !previewPending ? <p role="status" className="text-sm text-ink-soft">A fresh preview is needed to review recipe warnings. Check your choices in the earlier steps.</p> : null}
      {current && !loading && !error && shown?.preferenceReview ? <RecipeWarningReview key={`recipes:${shown.id}`} collapsible review={shown.preferenceReview} disabled={disabled} onRemove={id => change({ ...input, recipes: input.recipes.filter(r => r.id !== id) })} /> : null}
      {current && shown?.preferenceReview && !shown.preferenceReview.recipeWarnings.length ? <p className="text-sm text-ink-soft">No recipe warnings were returned for this preview. Review ingredients before preparing or eating.</p> : null}
      {shown?.replacements.length ? <div className="rounded-xl bg-peach-100 p-3"><h4 className="font-bold">Planned meals being replaced</h4><ul className="mt-2 grid gap-1 text-sm">{shown.replacements.map((r, i) => <li key={i}>{group.members.find(m => m.id === r.memberId)?.name} · {r.date} · {r.slot}: {r.name}</li>)}</ul></div> : null}
      {warnings?.mealTimes ? <ReviewDisclosure key={`unfilled:${shown?.id}`} title="Review unfilled meals" count={`${warnings.mealTimes} ${warnings.mealTimes === 1 ? "meal time" : "meal times"}`}>
            <p className="text-xs text-ink-soft">Each listed meal time could not be filled for at least one selected person. The selected recipes, occupied meals, eligible targets, calorie capacity, or batch limits could not fill these meal slots. Try selecting more suitable recipes or reviewing batch limits.</p>
            <ul className="grid min-w-0 gap-2">{warnings.unfilled.map(day => <li key={day.date} className="min-w-0 text-sm"><p className="break-words font-bold">{formatFullDate(day.date)}</p><ul className="flex flex-wrap gap-x-4 gap-y-1">{day.slots.map(slot => <li key={slot} className="capitalize">{slot}</li>)}</ul></li>)}</ul>
      </ReviewDisclosure> : null}
      {warnings?.notes.length ? <div className="grid min-w-0 gap-1"><h4 className="text-sm font-bold">Planning notes</h4>{warnings.notes.map((note, i) => <p key={i} className="break-words text-xs text-ink-soft">{note}</p>)}</div> : null}
      {current && !loading && !error && shown?.preferenceReview ? <DailyWarningReview key={`daily:${shown.id}`} collapsible review={shown.preferenceReview} /> : null}
      <PlanningAcknowledgment checked={Boolean(current && acknowledged)} disabled={disabled || loading || !current || hasPortionEdits} onChange={setAcknowledged} />
      </GenerationStep>
    </div>
  </Modal>;
}
