"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ListChecks, ListX, Shuffle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DayCheckboxStrip } from "@/components/DayStrip";
import { RecipeCover } from "@/components/nutrition/RecipeCover";
import { MealRow } from "@/components/nutrition/MealRow";
import { useApp } from "@/contexts/AppContext";
import { clearDraft, createDraftEnvelope, readDraft, writeDraft } from "@/services/draftStore";
import { defaultPlanningDates } from "@/utility/weeklyMealGeneration";
import { formatFullDate, weekDates } from "@/utility/dates";
import type { GroupPlanningInput, GroupPreview, GroupWeek } from "@/types/cookingGroup";

const bulkClass = "!min-h-11 min-w-11 !px-3 text-xs";
export function GroupGenerateDialog({ week, returnFocus, onClose, onPersonal }: { week: GroupWeek; returnFocus?: RefObject<HTMLElement | null>; onClose: () => void; onPersonal?: () => void }) {
  const { snapshot, actions, pendingMutation } = useApp(); const group = week.group!;
  const [input, setInput] = useState<GroupPlanningInput>(() => ({ groupId: group.id, weekOf: week.weekOf, memberIds: group.members.map(m => m.id), selectedDates: defaultPlanningDates(week.weekOf), mode: "fill", recipes: week.recipes.filter(r => r.mealSlots?.length).map(r => ({ id: r.id, revision: r.revision ?? 1, maxBatches: group.members.length })), seed: crypto.randomUUID(), overrides: {} }));
  const [ready, setReady] = useState(false); const [restored, setRestored] = useState(false); const [preview, setPreview] = useState<{ value: GroupPreview; tag: string } | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [acknowledged, setAcknowledged] = useState(false); const [retry, setRetry] = useState(0);
  const retryKey = useRef(crypto.randomUUID()); const saving = useRef(false); const draftQueue = useRef<Promise<unknown>>(Promise.resolve());
  const draftType = `nutrition-group-generation:${group.id}:${week.weekOf}`;
  const basis = JSON.stringify({ group: group.revision, revision: week.revision, recipes: week.recipes.map(r => [r.id, r.revision]) });
  const tag = JSON.stringify({ input, basis }); const current = preview?.tag === tag; const disabled = Boolean(pendingMutation);
  useEffect(() => {
    let active = true;
    void readDraft<{ input: GroupPlanningInput }>(snapshot.userId, draftType).then(saved => {
      if (!active) return;
      if (saved?.payload.input?.groupId === group.id && saved.payload.input.weekOf === week.weekOf) { setInput(saved.payload.input); setRestored(true); }
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
      if (!input.memberIds.length || !input.selectedDates.length || !input.recipes.length) { setLoading(false); return; }
      setLoading(true);
      void actions.previewCookingGroup(input).then(value => { if (active) setPreview({ value, tag }); }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [ready, tag, input, retry, actions]);
  function change(next: GroupPlanningInput) { setInput(next); setAcknowledged(false); setError(""); }
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
    if (saving.current || !current || !preview || !acknowledged) return;
    saving.current = true; setError("");
    try {
      await actions.cookingGroupCommand({ action: "commit", previewId: preview.value.id, acknowledged, idempotencyKey: retryKey.current });
      await draftQueue.current; await clearDraft(snapshot.userId, draftType); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Save failed. Your choices are retained."); }
    finally { saving.current = false; }
  }
  const shown = preview?.value;
  return <Modal open title="Generate group plan" returnFocus={returnFocus} dismissalDisabled={disabled} onClose={onClose}
    footer={<div className="grid gap-2">{error ? <p role="alert" className="text-sm">{error} <button className="min-h-11 underline" disabled={disabled} onClick={() => void refreshPreview()}>Refresh preview and review</button></p> : null}<div className="flex flex-wrap justify-between gap-2"><Button variant="soft" disabled={disabled} onClick={onClose}>Close</Button><Button disabled={disabled || loading || !current || !acknowledged || !shown?.assignments.length} onClick={() => void save()}>{disabled ? "Saving…" : "Save group plan"}</Button></div></div>}>
    <div className="grid min-w-0 gap-6">
      {restored ? <p role="status" className="rounded-xl bg-lav-50 p-3 text-sm">Group draft restored. A fresh preview requires your review before saving.</p> : null}
      {onPersonal ? <Button variant="soft" disabled={disabled} onClick={onPersonal}>Plan for my account only</Button> : null}
      <fieldset disabled={disabled || !ready} className="min-w-0"><legend className="mb-3 font-extrabold">People</legend><div className="flex flex-wrap gap-2">{group.members.map(m => <label key={m.id} className={`flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${input.memberIds.includes(m.id) ? "border-ink bg-lav-100" : "border-ink/20"}`}><input type="checkbox" checked={input.memberIds.includes(m.id)} onChange={e => change({ ...input, memberIds: e.target.checked ? [...input.memberIds, m.id] : input.memberIds.filter(id => id !== m.id), overrides: {} })} /><span className="min-w-0 break-words">{m.name}</span></label>)}</div>{!input.memberIds.length ? <p className="mt-2 text-sm">Choose at least one person.</p> : null}</fieldset>
      <fieldset disabled={disabled || !ready} className="min-w-0" aria-label="Choose days"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">Choose days</h3><div className="flex gap-1"><Button className={bulkClass} aria-label="Select all" onClick={() => change({ ...input, selectedDates: weekDates(week.weekOf) })}><ListChecks className="h-4 w-4" aria-hidden /><span className="hidden md:inline">Select all</span></Button><Button variant="soft" className={bulkClass} aria-label="Clear" onClick={() => change({ ...input, selectedDates: [] })}><ListX className="h-4 w-4" aria-hidden /><span className="hidden md:inline">Clear</span></Button></div></div><DayCheckboxStrip weekOf={week.weekOf} selectedDates={input.selectedDates} disabled={disabled} onToggle={(date, checked) => change({ ...input, selectedDates: checked ? [...input.selectedDates, date] : input.selectedDates.filter(d => d !== date) })} />{!input.selectedDates.length ? <p className="text-sm">Choose at least one day.</p> : null}</fieldset>
      <fieldset disabled={disabled || !ready} className="grid min-w-0 gap-2"><legend className="mb-3 font-extrabold">Planning mode</legend><label className="flex min-h-11 items-center gap-2"><input type="radio" name="group-mode" checked={input.mode === "fill"} onChange={() => change({ ...input, mode: "fill", overrides: {} })} />Fill empty meals</label><label className="flex min-h-11 items-center gap-2"><input type="radio" name="group-mode" checked={input.mode === "replace"} onChange={() => change({ ...input, mode: "replace", overrides: {} })} />Replace planned meals on selected days</label><p className="text-xs text-ink-soft">Only selected people and days change. Eaten entries and their linked planned meals stay intact. Portions are estimates and remain editable.</p></fieldset>
      <fieldset disabled={disabled || !ready} className="min-w-0" aria-label="Choose recipes"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">Choose recipes</h3><div className="flex gap-1"><Button className={bulkClass} aria-label="Select all" onClick={() => change({ ...input, recipes: week.recipes.filter(r => r.mealSlots?.length).map(r => ({ id: r.id, revision: r.revision ?? 1, maxBatches: input.memberIds.length || 1 })) })}><ListChecks className="h-4 w-4" aria-hidden /><span className="hidden md:inline">Select all</span></Button><Button variant="soft" className={bulkClass} aria-label="Clear" onClick={() => change({ ...input, recipes: [] })}><ListX className="h-4 w-4" aria-hidden /><span className="hidden md:inline">Clear</span></Button></div></div>
      <ul className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-4">{week.recipes.map(r => { const selected = input.recipes.find(s => s.id === r.id); return <li key={r.id} className="grid min-w-0 content-start gap-2"><label className={`relative grid min-w-0 cursor-pointer gap-2 rounded-2xl border p-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-lav-500 ${selected ? "border-ink bg-lav-50" : "border-ink/15 bg-white"}`}><input type="checkbox" className="sr-only" aria-label={r.name} checked={Boolean(selected)} onChange={e => change({ ...input, recipes: e.target.checked ? [...input.recipes, { id: r.id, revision: r.revision ?? 1, maxBatches: input.memberIds.length || 1 }] : input.recipes.filter(s => s.id !== r.id) })} /><span className="grid aspect-square rounded-xl bg-lav-100 p-2"><RecipeCover image={r.image} name={r.name} selection /></span><span className="min-h-11 break-words text-sm font-extrabold">{r.name}</span><span className="break-words text-xs text-ink-soft">{r.ownerName} · {r.servings} servings per batch</span></label>{selected ? <label className="grid gap-1 text-xs font-bold">Maximum batches for {r.name}<input className="input" type="number" min={1} max={100} step={1} value={selected.maxBatches} onChange={e => change({ ...input, recipes: input.recipes.map(s => s.id === r.id ? { ...s, maxBatches: Number(e.target.value) } : s) })} /></label> : null}</li>; })}</ul></fieldset>
      <section className="grid min-w-0 gap-3" aria-label="Group generation preview"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">Preview · {shown?.assignments.length ?? 0} {shown?.assignments.length === 1 ? "meal" : "meals"}</h3><Button variant="soft" disabled={disabled || loading} onClick={() => change({ ...input, seed: crypto.randomUUID(), overrides: {} })}><Shuffle className="h-4 w-4" aria-hidden />Shuffle</Button></div>
      {loading ? <p role="status" className="text-sm">Checking portions and planning limits privately…</p> : null}
      <ul className="grid gap-2">{shown?.assignments.map(a => <MealRow key={a.id} summary={<p className="text-xs text-ink-soft">{formatFullDate(a.date)} · {group.members.find(m => m.id === a.memberId)?.name}</p>}><p className="font-extrabold">{week.recipes.find(r => r.id === a.recipeId)?.name}</p><p className="text-xs capitalize">{a.slot}</p><label className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold">Estimated servings<input className="input !w-28" type="number" min={.25} max={4} step={.25} disabled={disabled || loading} key={`${a.id}:${a.servings}`} defaultValue={a.servings} aria-label={`Servings for ${group.members.find(m => m.id === a.memberId)?.name}, ${a.date}, ${a.slot}`} onBlur={e => { if (Number(e.target.value) !== a.servings) change({ ...input, overrides: { ...input.overrides, [`${a.memberId}:${a.date}:${a.slot}`]: Number(e.target.value) } }); }} /></label></MealRow>)}</ul>
      {shown?.replacements.length ? <div className="rounded-xl bg-peach-100 p-3"><h4 className="font-bold">Planned meals being replaced</h4><ul className="mt-2 grid gap-1 text-sm">{shown.replacements.map((r, i) => <li key={i}>{group.members.find(m => m.id === r.memberId)?.name} · {r.date} · {r.slot}: {r.name}</li>)}</ul></div> : null}
      {shown?.batches.length ? <div><h4 className="font-extrabold">Recipes to cook</h4><ul className="mt-2 grid gap-2">{shown.batches.map(b => <li key={`${b.recipeId}:${b.recipeRevision ?? 1}`} className="rounded-xl bg-lav-50 p-3 text-sm"><strong>{b.name}</strong><p>{b.batches} {b.batches === 1 ? "batch" : "batches"} · {b.portions} assigned servings · {b.leftovers} leftover servings</p></li>)}</ul></div> : null}
      {shown?.warnings.map((w, i) => <p key={i} className="text-xs text-ink-soft">{w}</p>)}
      <label className="flex min-h-11 items-start gap-2 rounded-xl bg-lav-50 p-3 text-sm"><input type="checkbox" className="mt-1" checked={acknowledged} disabled={disabled || loading || !current} onChange={e => setAcknowledged(e.target.checked)} /><span>I reviewed personal meals being replaced, each person&apos;s portions, whole batches, leftovers, and any unfilled meals.</span></label></section>
    </div>
  </Modal>;
}
