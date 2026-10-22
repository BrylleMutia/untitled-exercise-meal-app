"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { RecipeCard } from "@/components/nutrition/RecipeCard";
import { formatFullDate } from "@/utility/dates";
import type { GroupAssignment, GroupWeek } from "@/types/cookingGroup";
import { LastGenerated } from "./GenerationSummary";

export function CookingOverview({ week, loading, error, refresh, onClose, onSummary, disabled, assignmentId, returnFocus }: {
  week?: GroupWeek; loading: boolean; error?: string; refresh: () => void; onClose: () => void; onSummary: () => void;
  disabled: boolean; assignmentId?: string; returnFocus: RefObject<HTMLElement | null>;
}) {
  const { snapshot } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<HTMLElement | null>(null);
  const focused = useRef<string | null>(null);
  const attachRoot = useCallback((node: HTMLDivElement | null) => {
    root.current = node;
    const row = Array.from(node?.querySelectorAll<HTMLElement>("[data-cooking-assignment]") ?? []).find(item => item.dataset.cookingAssignment === assignmentId);
    const details = row?.closest("details");
    if (details) details.open = true;
    initialFocus.current = row?.querySelector<HTMLElement>("button:not(:disabled)") ?? row ?? node;
  }, [assignmentId]);
  useEffect(() => {
    if (!assignmentId || focused.current === assignmentId) return;
    let frame = 0, tries = 0;
    const focus = () => {
      const row = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-cooking-assignment]") ?? []).find(node => node.dataset.cookingAssignment === assignmentId);
      if (!row && tries++ < 10) { frame = requestAnimationFrame(focus); return; }
      if (row) focused.current = assignmentId;
      const details = row?.closest("details"); if (details) details.open = true;
      (row?.querySelector<HTMLElement>("button:not(:disabled)") ?? row)?.focus();
    };
    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [assignmentId, week]);
  const slots = ["breakfast", "lunch", "dinner", "snack"];
  const assignments = [...(week?.assignments ?? [])].sort((a, b) => a.date.localeCompare(b.date)
    || slots.indexOf(a.slot) - slots.indexOf(b.slot) || a.memberId.localeCompare(b.memberId) || a.id.localeCompare(b.id));
  return <Modal open title="Cooking overview" initialFocus={initialFocus} returnFocus={returnFocus} dismissalDisabled={disabled} onClose={onClose}
    footer={<div className="flex flex-wrap items-center justify-between gap-2"><Button variant="soft" disabled={disabled} onClick={onClose}>Close</Button>{week?.generation ? <Button variant="soft" disabled={disabled} onClick={onSummary}>View generation summary</Button> : null}</div>}>
    <div ref={attachRoot} tabIndex={-1} className="grid min-w-0 gap-4">
      {week ? <p className="text-sm font-bold">Week of {formatFullDate(week.weekOf)}</p> : null}
      <p className="text-xs text-ink-soft">Current saved cooking plan. Portions and batches include planned meals already logged; actual intake stays private. Skipped portions are excluded from cooking totals.</p>
      <LastGenerated generation={week?.generation ?? null} />
      {loading ? <p role="status">Loading this week&apos;s cooking…</p> : null}
      {error || week?.group && !week.cooking ? <div role="alert" className="text-danger-900"><p>{error ?? "Cooking overview needs the latest database update."}</p><Button variant="soft" disabled={disabled} onClick={refresh}>Retry cooking overview</Button></div> : null}
      {!loading && !error && week && !week.group ? <p role="status">You are no longer connected to this cooking group.</p> : null}
      {!loading && !error && week?.group && week.cooking?.length === 0 ? <p>Nothing planned for the group this week.</p> : null}
      {week?.group && week.cooking ? <ul className="grid min-w-0 gap-4">{week.cooking.map(cooking => <li key={`${cooking.recipeId}:${cooking.recipeRevision}`} className="min-w-0">
        <RecipeCard context={`Saved recipe · version ${cooking.recipeRevision ?? 1}`} name={cooking.name} image={cooking.image} calories={cooking.caloriesPerServing} recipeServings={cooking.yield}
          actions={<details><summary className="min-h-11 cursor-pointer content-center rounded-xl px-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-lav-500">Meal distribution</summary><ul className="mt-3 grid min-w-0 gap-2">{assignments.filter(assignment => cooking.assignmentIds.includes(assignment.id)).map(assignment => <GroupAssignmentRow key={`${assignment.memberId}:${assignment.id}`} assignment={assignment} week={week} refresh={refresh} disabled={disabled || Boolean(error)} />)}</ul></details>}>
          <p className="text-sm font-bold">{cooking.portions} assigned servings · {cooking.batches} {cooking.batches === 1 ? "batch" : "batches"} · {cooking.leftovers} leftover servings</p>
          <p className="break-words text-xs text-ink-soft">For: {[...new Set(assignments.filter(a => cooking.assignmentIds.includes(a.id)).map(a => `${week.group?.members.find(member => member.id === a.memberId)?.name ?? "Former member"}${a.memberId === snapshot.userId ? " (you)" : ""}`))].join(", ")}</p>
        </RecipeCard>
      </li>)}</ul> : null}
    </div>
  </Modal>;
}

function GroupAssignmentRow({ assignment: a, week, refresh, disabled = false }: { assignment: GroupAssignment; disabled?: boolean; week: GroupWeek; refresh: () => void }) {
  const { actions, pendingMutation, snapshot } = useApp(); const [editing, setEditing] = useState(false); const [value, setValue] = useState(String(a.servings)); const [recipeId, setRecipeId] = useState(a.recipeId); const [skipped, setSkipped] = useState(Boolean(a.skipped)); const [error, setError] = useState(""); const [revision, setRevision] = useState(week.revision); const key = useRef(crypto.randomUUID());
  const row = useRef<HTMLLIElement>(null);
  const locked = disabled || Boolean(pendingMutation);
  function finishEditing() { setEditing(false); requestAnimationFrame(() => row.current?.querySelector<HTMLButtonElement>("[data-edit-cooking-assignment]")?.focus()); }
  const name = `${week.group?.members.find(m => m.id === a.memberId)?.name ?? "Former member"}${a.memberId === snapshot.userId ? " (you)" : ""}`;
  return <li ref={row} data-cooking-assignment={a.id} tabIndex={-1} className="grid min-w-0 gap-2 rounded-xl bg-lav-50 p-3"><p className="text-xs text-ink-soft">{formatFullDate(a.date)} · {a.slot} · {name}</p><strong className="break-words text-sm">{a.label ?? week.recipes.find(r => r.id === a.recipeId)?.name ?? "Saved recipe"}</strong><p className="text-xs">{a.servings} servings{a.skipped ? " · skipped" : ""}</p>
    {!a.protected ? editing ? <form className="grid gap-2" onSubmit={async e => { e.preventDefault(); if (locked) return; setError(""); try { await actions.cookingGroupCommand({ action: "edit-assignment", groupId: week.group!.id, weekOf: week.weekOf, revision, assignmentId: a.id, recipeId, servings: Number(value), skipped, idempotencyKey: key.current }); finishEditing(); refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Save failed; input retained."); refresh(); } }}><label className="grid gap-1 text-xs font-bold">Recipe for {name}<select className="input" value={recipeId} disabled={locked} onChange={e => { setRecipeId(e.target.value); key.current = crypto.randomUUID(); }}>{week.recipes.filter(r => r.mealSlots?.includes(a.slot)).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label className="grid gap-1 text-xs font-bold">Servings for {name}<input autoFocus className="input" type="number" min={.25} max={4} step={.25} value={value} disabled={locked} onChange={e => { setValue(e.target.value); key.current = crypto.randomUUID(); }} /></label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={locked} checked={skipped} onChange={e => { setSkipped(e.target.checked); key.current = crypto.randomUUID(); }} />Skipped</label>{revision !== week.revision ? <Button variant="soft" disabled={locked} onClick={() => { setRevision(week.revision); key.current = crypto.randomUUID(); setError(""); }}>Review latest portion: {a.servings}</Button> : null}<div className="flex flex-wrap justify-end gap-2"><Button variant="soft" disabled={locked} onClick={finishEditing}>Cancel</Button><Button type="submit" disabled={locked || revision !== week.revision || !Number.isFinite(Number(value)) || Number(value) < .25 || Number(value) > 4}>Save portion</Button></div></form> : <Button data-edit-cooking-assignment variant="soft" className="justify-self-end" disabled={locked} onClick={() => { setRevision(week.revision); setValue(String(a.servings)); setRecipeId(a.recipeId); setSkipped(Boolean(a.skipped)); key.current = crypto.randomUUID(); setEditing(true); }}>Edit planned meal</Button> : <p className="text-xs text-ink-soft">Logged planned basis preserved.</p>}
    {error ? <p role="alert" className="text-sm text-danger-900">{error}</p> : null}</li>;
}
