"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ListChecks, ListX, Minus, Plus, Shuffle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DayCheckboxStrip } from "@/components/DayStrip";
import { RecipeCover } from "@/components/nutrition/RecipeCover";
import { RecipeResourcePills } from "@/components/nutrition/RecipeResourcePills";
import { RecipeWarningReview, DailyWarningReview, planningAcknowledgment } from "@/components/nutrition/PreferenceReview";
import { PLANNING_REVIEW_POLICY } from "@/types/planningPreferences";
import { MealRow } from "@/components/nutrition/MealRow";
import { useApp } from "@/contexts/AppContext";
import { clearDraft, createDraftEnvelope, readDraft, writeDraft } from "@/services/draftStore";
import { defaultPlanningDates } from "@/utility/weeklyMealGeneration";
import { formatFullDate, weekDates } from "@/utility/dates";
import { editedDefaultRecipeIds, recipeDisplayName, uniqueGroupRecipes } from "@/utility/recipeLibrary";
import { groupPlanningWarnings } from "@/utility/groupPlanningWarnings";
import type { GroupPlanningInput, GroupPreview, GroupWeek } from "@/types/cookingGroup";

const bulkClass = "!min-h-11 min-w-11 !px-3 text-xs";
const validBatchLimit = (value: number) => Number.isInteger(value) && value >= 1 && value <= 100;
export function GroupGenerateDialog({ week: sourceWeek, returnFocus, onClose }: { week: GroupWeek; returnFocus?: RefObject<HTMLElement | null>; onClose: () => void }) {
  const week = { ...sourceWeek, recipes: uniqueGroupRecipes(sourceWeek.recipes) };
  const { snapshot, actions, pendingMutation } = useApp(); const group = week.group!;
  const [input, setInput] = useState<GroupPlanningInput>(() => ({ reviewPolicyVersion: PLANNING_REVIEW_POLICY, groupId: group.id, weekOf: week.weekOf, memberIds: group.members.map(m => m.id), selectedDates: defaultPlanningDates(week.weekOf), mode: "fill", recipes: week.recipes.filter(r => r.mealSlots?.length).map(r => ({ id: r.id, revision: r.revision ?? 1, maxBatches: group.members.length })), seed: crypto.randomUUID(), overrides: {} }));
  const [ready, setReady] = useState(false); const [restored, setRestored] = useState(false); const [preview, setPreview] = useState<{ value: GroupPreview; tag: string } | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [acknowledged, setAcknowledged] = useState(false); const [retry, setRetry] = useState(0);
  const [batchText, setBatchText] = useState<Record<string, string>>({});
  const invalidBatches = input.recipes.some(recipe => !validBatchLimit(recipe.maxBatches) || batchText[recipe.id] !== undefined);
  const retryKey = useRef(crypto.randomUUID()); const saving = useRef(false); const draftQueue = useRef<Promise<unknown>>(Promise.resolve());
  const editedIds = editedDefaultRecipeIds(snapshot.savedMeals, week.recipes);
  const draftType = `nutrition-group-generation:${group.id}:${week.weekOf}`;
  const basis = JSON.stringify({ policyVersion: PLANNING_REVIEW_POLICY, profile: snapshot.profile, targets: snapshot.nutritionWeekTargets, plan: snapshot.mealPlan, logs: snapshot.nutritionLogs, group: group.revision, revision: week.revision, recipes: week.recipes.map(r => [r.id, r.revision]) });
  const tag = JSON.stringify({ input, basis }); const current = preview?.tag === tag && preview?.value.preferenceReview?.policyVersion === PLANNING_REVIEW_POLICY && !invalidBatches && !loading && !error; const disabled = Boolean(pendingMutation);
  useEffect(() => {
    let active = true;
    void readDraft<{ input: GroupPlanningInput }>(snapshot.userId, draftType).then(saved => {
      if (!active) return;
      if (saved?.payload.input?.groupId === group.id && saved.payload.input.weekOf === week.weekOf) { setInput({ ...saved.payload.input, reviewPolicyVersion: PLANNING_REVIEW_POLICY }); setRestored(true); }
      setReady(true);
    }); return () => { active = false; };
  }, [snapshot.userId, draftType, group.id, week.weekOf]);
  useEffect(() => {
    if (!ready) return;
    draftQueue.current = draftQueue.current.then(() => writeDraft(createDraftEnvelope({ userId: snapshot.userId, draftType, payload: { input }, baseVersions: {}, ttlMs: 7 * 86400000 })));
  }, [ready, input, snapshot.userId, draftType]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const timer = setTimeout(() => {
      setAcknowledged(false); retryKey.current = crypto.randomUUID(); setError("");
      if (invalidBatches || !input.memberIds.length || !input.selectedDates.length || !input.recipes.length) { setLoading(false); return; }
      setLoading(true);
      void actions.previewCookingGroup(input).then(value => { if (active) setPreview({ value, tag }); }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [ready, tag, input, retry, actions, invalidBatches]);
  function change(next: GroupPlanningInput) {
    setInput(next); setAcknowledged(false); setError("");
    setBatchText(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => next.recipes.some(recipe => recipe.id === id))));
  }
  function editBatches(id: string, text: string) {
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
  async function refreshPreview() {
    try {
      const fresh = await actions.loadCookingGroupWeek(week.weekOf);
      if (!fresh.group) throw new Error("You are no longer connected to this cooking group.");
      const members = new Set(fresh.group.members.map(m => m.id));
      change({ ...input, memberIds: input.memberIds.filter(id => members.has(id)), recipes: input.recipes.flatMap(selected => { const recipe = fresh.recipes.find(r => r.id === selected.id); return recipe ? [{ ...selected, revision: recipe.revision ?? 1 }] : []; }) });
      setRetry(n => n + 1);
      void actions.refreshSnapshot({ silent: true });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Refresh failed. Your choices are retained."); }
  }
  async function save() {
    if (saving.current || loading || !current || !preview?.value.assignments.length || !acknowledged) return;
    saving.current = true; setError("");
    try {
      await actions.cookingGroupCommand({ action: "commit", previewId: preview.value.id, acknowledged, idempotencyKey: retryKey.current });
      await draftQueue.current; await clearDraft(snapshot.userId, draftType); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Save failed. Your choices are retained."); }
    finally { saving.current = false; }
  }
  const shown = preview?.value;
  const warnings = current && !loading && !error && shown ? groupPlanningWarnings(shown.warnings) : null;
  return <Modal open title="Generate plan" returnFocus={returnFocus} dismissalDisabled={disabled} onClose={onClose}
    footer={<div className="grid gap-2">{error ? <p role="alert" className="text-sm text-danger-900">{error} <button className="min-h-11 underline" disabled={disabled} onClick={() => void refreshPreview()}>Refresh preview and review</button></p> : null}<div className="flex flex-wrap justify-between gap-2"><Button variant="soft" disabled={disabled} onClick={onClose}>Close</Button><Button disabled={disabled || loading || !current || !acknowledged || !shown?.assignments.length} onClick={() => void save()}>{disabled ? "Saving…" : "Save plan"}</Button></div></div>}>
    <div className="grid min-w-0 gap-6"><p className="text-xs text-ink-soft">Cost checks are temporarily paused.</p><p className="text-xs text-ink-soft">Personal warnings shown here use your settings only. Review ingredients with other members; each selected member receives their own private review after saving.</p>
      {restored ? <p role="status" className="rounded-xl bg-lav-50 p-3 text-sm">Group draft restored. A fresh preview requires your review before saving.</p> : null}
      <fieldset disabled={disabled || !ready} className="min-w-0"><legend className="mb-3 font-extrabold">People</legend><p className="mb-3 text-xs text-ink-soft">Select only yourself to plan for you. These meals still contribute to shared groceries. Unchecked people keep their existing meals.</p><div className="flex flex-wrap gap-2">{group.members.map(m => <label key={m.id} className={`flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${input.memberIds.includes(m.id) ? "border-ink bg-lav-100" : "border-ink/20"}`}><input type="checkbox" checked={input.memberIds.includes(m.id)} onChange={e => change({ ...input, memberIds: e.target.checked ? [...input.memberIds, m.id] : input.memberIds.filter(id => id !== m.id), overrides: {} })} /><span className="min-w-0 break-words">{m.name}{m.id === snapshot.userId ? " (you)" : ""}</span></label>)}</div>{!input.memberIds.length ? <p className="mt-2 text-sm">Choose at least one person.</p> : null}</fieldset>
      <fieldset disabled={disabled || !ready} className="min-w-0" aria-label="Choose days"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">Choose days</h3><div className="flex gap-1"><Button className={bulkClass} aria-label="Select all" onClick={() => change({ ...input, selectedDates: weekDates(week.weekOf) })}><ListChecks className="h-4 w-4" aria-hidden /><span className="hidden md:inline">Select all</span></Button><Button variant="soft" className={bulkClass} aria-label="Clear" onClick={() => change({ ...input, selectedDates: [] })}><ListX className="h-4 w-4" aria-hidden /><span className="hidden md:inline">Clear</span></Button></div></div><DayCheckboxStrip weekOf={week.weekOf} selectedDates={input.selectedDates} disabled={disabled} onToggle={(date, checked) => change({ ...input, selectedDates: checked ? [...input.selectedDates, date] : input.selectedDates.filter(d => d !== date) })} />{!input.selectedDates.length ? <p className="text-sm">Choose at least one day.</p> : null}</fieldset>
      <fieldset disabled={disabled || !ready} className="grid min-w-0 gap-2"><legend className="mb-3 font-extrabold">Planning mode</legend><label className="flex min-h-11 items-center gap-2"><input type="radio" name="group-mode" checked={input.mode === "fill"} onChange={() => change({ ...input, mode: "fill", overrides: {} })} />Fill empty meals</label><label className="flex min-h-11 items-center gap-2"><input type="radio" name="group-mode" checked={input.mode === "replace"} onChange={() => change({ ...input, mode: "replace", overrides: {} })} />Replace planned meals on selected days</label><p className="text-xs text-ink-soft">Only selected people and days change. Eaten entries and their linked planned meals stay intact. Portions are estimates and remain editable.</p></fieldset>
      <fieldset disabled={disabled || !ready} className="min-w-0" aria-label="Choose recipes"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">Choose recipes</h3><div className="flex gap-1"><Button className={bulkClass} aria-label="Select all" onClick={() => { setBatchText({}); change({ ...input, recipes: week.recipes.filter(r => r.mealSlots?.length).map(r => ({ id: r.id, revision: r.revision ?? 1, maxBatches: input.memberIds.length || 1 })) }); }}><ListChecks className="h-4 w-4" aria-hidden /><span className="hidden md:inline">Select all</span></Button><Button variant="soft" className={bulkClass} aria-label="Clear" onClick={() => change({ ...input, recipes: [] })}><ListX className="h-4 w-4" aria-hidden /><span className="hidden md:inline">Clear</span></Button></div></div>
        <p className="mb-2 text-xs text-ink-soft">Selected recipes are options for the planner. Preference conflicts are warnings, not automatic exclusions. Other planning limits still apply.</p>
        <p className="mb-3 text-xs text-ink-soft">Batches set the most you may cook this week. Each batch makes the servings shown on the recipe. Meals already kept in the shared plan count toward this limit.</p>
        <ul className="grid min-w-0 auto-rows-fr gap-2 [--recipe-columns:2] lg:[--recipe-columns:4]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, max(10rem, calc((100% - (var(--recipe-columns) - 1) * 0.5rem) / var(--recipe-columns)))), 1fr))" }}>{week.recipes.map(r => {
          const selected = input.recipes.find(s => s.id === r.id);
          const displayName = recipeDisplayName(r, editedIds);
          const value = batchText[r.id] ?? String(selected?.maxBatches ?? (input.memberIds.length || 1));
          const valid = value.trim() !== "" && validBatchLimit(Number(value));
          const invalid = Boolean(selected) && !valid;
          const helperId = `batch-help-${r.id}`;
          return <li key={r.id} className={`flex min-w-0 flex-col rounded-2xl border has-[input[type=checkbox]:focus]:outline-2 has-[input[type=checkbox]:focus]:outline-offset-2 has-[input[type=checkbox]:focus]:outline-lav-500 ${selected ? "border-ink bg-lav-50" : "border-ink/15 bg-white"}`}>
            <label className="relative flex min-w-0 flex-1 cursor-pointer flex-col gap-2 rounded-2xl p-2">
              <input type="checkbox" className="sr-only" aria-label={displayName} aria-describedby={`recipe-pills-${r.id} ${helperId}`} checked={Boolean(selected)} onChange={e => change({ ...input, recipes: e.target.checked ? [...input.recipes, { id: r.id, revision: r.revision ?? 1, maxBatches: input.memberIds.length || 1 }] : input.recipes.filter(s => s.id !== r.id) })} />
              <span className="grid aspect-square shrink-0 rounded-xl bg-lav-100 p-2"><RecipeCover image={r.image} name={displayName} selection /></span>
              <span className="min-h-11 break-words text-sm font-extrabold">{displayName}</span>
              <span className="mt-auto min-w-0"><RecipeResourcePills id={`recipe-pills-${r.id}`} compact calories={r.caloriesPerServing} recipeServings={r.servings} totalTimeMinutes={r.totalTimeMinutes} complexity={r.complexity} /></span>
              <span id={helperId} className="sr-only">{r.ownerName}. {selected ? valid ? `Up to ${r.servings * Number(value)} servings this week.` : "Set a valid weekly batch limit." : "Select recipe to set batches."}</span>
            </label>
            <div className="grid min-w-0 gap-1 p-2 pt-0">
              <div className="grid min-w-0 grid-cols-[44px_minmax(44px,1fr)_44px] items-center">
                <Button variant="ghost" className="!min-h-[44px] w-[44px] !px-0 focus-visible:outline-2 focus-visible:outline-lav-500" aria-label={`Decrease batches for ${displayName}`} disabled={!selected || !valid || Number(value) <= 1} onClick={() => editBatches(r.id, String(Number(value) - 1))}><Minus className="h-4 w-4" aria-hidden /></Button>
                <input className="input !min-h-11 !px-1 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" type="number" inputMode="numeric" min={1} max={100} step={1} placeholder="Batches" aria-label={`Batches for ${displayName}`} aria-describedby={invalid ? `${helperId} batch-error-${r.id}` : helperId} aria-invalid={invalid || undefined} disabled={!selected} value={value} onChange={e => editBatches(r.id, e.target.value)} />
                <Button variant="ghost" className="!min-h-[44px] w-[44px] !px-0 focus-visible:outline-2 focus-visible:outline-lav-500" aria-label={`Increase batches for ${displayName}`} disabled={!selected || !valid || Number(value) >= 100} onClick={() => editBatches(r.id, String(Number(value) + 1))}><Plus className="h-4 w-4" aria-hidden /></Button>
              </div>
              {invalid ? <p id={`batch-error-${r.id}`} role="status" className="break-words text-xs text-danger-900">Enter a whole number from 1 to 100.</p> : null}
            </div>
          </li>;
        })}</ul>
      </fieldset>
      {current && !loading && !error && shown?.preferenceReview ? <RecipeWarningReview review={shown.preferenceReview} disabled={disabled} onRemove={id => change({ ...input, recipes: input.recipes.filter(r => r.id !== id) })} /> : null}
      <section className="grid min-w-0 gap-3" aria-label="Group generation preview"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">Preview · {shown?.assignments.length ?? 0} {shown?.assignments.length === 1 ? "new meal assignment" : "new meal assignments"}</h3><Button variant="soft" disabled={disabled || loading} onClick={() => change({ ...input, seed: crypto.randomUUID(), overrides: {} })}><Shuffle className="h-4 w-4" aria-hidden />Shuffle</Button></div>
      <p className="text-xs text-ink-soft">Each assignment is one person’s meal on a selected date and meal time. Meals already kept in the plan are not counted here.</p>
      {invalidBatches ? <p role="status" className="text-sm text-danger-900">Correct the batch limits to refresh and review this preview.</p> : null}
      {loading && !invalidBatches ? <p role="status" className="text-sm">Checking portions and planning limits privately…</p> : null}
      <ul className="grid gap-2">{shown?.assignments.map(a => <MealRow key={a.id} summary={<p className="text-xs text-ink-soft">{formatFullDate(a.date)} · {group.members.find(m => m.id === a.memberId)?.name}</p>}><p className="font-extrabold">{week.recipes.find(r => r.id === a.recipeId)?.name}</p><p className="text-xs capitalize">{a.slot}</p><label className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold">Estimated servings<input className="input !w-28" type="number" min={.25} max={4} step={.25} disabled={disabled || loading} key={`${a.id}:${a.servings}`} defaultValue={a.servings} aria-label={`Servings for ${group.members.find(m => m.id === a.memberId)?.name}, ${a.date}, ${a.slot}`} onBlur={e => { if (Number(e.target.value) !== a.servings) change({ ...input, overrides: { ...input.overrides, [`${a.memberId}:${a.date}:${a.slot}`]: Number(e.target.value) } }); }} /></label></MealRow>)}</ul>
      {shown?.replacements.length ? <div className="rounded-xl bg-peach-100 p-3"><h4 className="font-bold">Planned meals being replaced</h4><ul className="mt-2 grid gap-1 text-sm">{shown.replacements.map((r, i) => <li key={i}>{group.members.find(m => m.id === r.memberId)?.name} · {r.date} · {r.slot}: {r.name}</li>)}</ul></div> : null}
      {shown?.batches.length ? <div><h4 className="font-extrabold">Recipes to cook</h4><p className="mt-1 text-xs text-ink-soft">Whole batches needed for these assignments, including servings left over.</p><ul className="mt-2 grid gap-2">{shown.batches.map(b => <li key={`${b.recipeId}:${b.recipeRevision ?? 1}`} className="rounded-xl bg-lav-50 p-3 text-sm"><strong>{b.name}</strong><p>{b.batches} {b.batches === 1 ? "batch" : "batches"} · {b.portions} assigned servings · {b.leftovers} leftover servings</p></li>)}</ul></div> : null}
      {warnings?.mealTimes ? <div className="grid min-w-0 gap-1">
        <p role="status" className="text-sm font-bold">Some meal slots are still unfilled.</p>
        <details className="min-w-0">
          <summary className="min-h-11 cursor-pointer content-center rounded-xl px-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-lav-500">Review unfilled meals <span className="font-normal">({warnings.mealTimes} {warnings.mealTimes === 1 ? "meal time" : "meal times"})</span></summary>
          <div className="grid min-w-0 gap-3 px-2 pb-2">
            <p className="text-xs text-ink-soft">Each listed meal time could not be filled for at least one selected person. The selected recipes, occupied meals, eligible targets, calorie capacity, or batch limits could not fill these meal slots. Try selecting more suitable recipes or reviewing batch limits.</p>
            <ul className="grid min-w-0 gap-2">{warnings.unfilled.map(day => <li key={day.date} className="min-w-0 text-sm"><p className="break-words font-bold">{formatFullDate(day.date)}</p><ul className="flex flex-wrap gap-x-4 gap-y-1">{day.slots.map(slot => <li key={slot} className="capitalize">{slot}</li>)}</ul></li>)}</ul>
          </div>
        </details>
      </div> : null}
      {warnings?.notes.length ? <div className="grid min-w-0 gap-1"><h4 className="text-sm font-bold">Planning notes</h4>{warnings.notes.map((note, i) => <p key={i} className="break-words text-xs text-ink-soft">{note}</p>)}</div> : null}
      {current && !loading && !error && shown?.preferenceReview ? <DailyWarningReview review={shown.preferenceReview} /> : null}
      <label className="flex min-h-11 items-start gap-2 rounded-xl bg-lav-50 p-3 text-sm"><input type="checkbox" className="mt-1" checked={Boolean(current && acknowledged)} disabled={disabled || loading || !current} onChange={e => setAcknowledged(e.target.checked)} /><span>{planningAcknowledgment}</span></label></section>
    </div>
  </Modal>;
}
