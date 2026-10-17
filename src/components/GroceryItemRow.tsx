"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";
import { MAX_GROCERY_QUANTITY, parseGroceryQuantity } from "@/utility/groceryQuantity";
import type { GroceryItem } from "@/types/domain";
import type { NutritionWeekReadModel } from "@/types/backend";

type QuantityDraft = { value: string; revision: number; calendarRevision: number; listId: string; saveKey: string };
const newKey = () => crypto.randomUUID();
const iconClass = "grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full bg-white text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lav-500";

export function GroceryItemRow({ item, week, disabled, onRefresh, onSavingChange }: { item: GroceryItem; week: NutritionWeekReadModel; disabled: boolean; onRefresh: () => void; onSavingChange: (saving: boolean) => void }) {
  const { snapshot, actions, error } = useApp();
  const [draft, setDraft] = useState<QuantityDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [restored, setRestored] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLLIElement>(null);
  const edit = useRef<HTMLButtonElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const active = useRef(true);
  const submitting = useRef(false);
  const focusBack = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const fieldId = useId();
  const userId = snapshot.userId;
  const draftType = `grocery-quantity:${week.weekOf}:${item.id}`;
  const revision = week.grocery?.revision ?? 0;
  const calendarRevision = snapshot.profile?.calendarRevision ?? 0;
  const listId = week.grocery?.id ?? "";
  const editing = draft !== null;
  const quantity = draft ? parseGroceryQuantity(draft.value) : null;
  const calendarChanged = Boolean(draft && (draft.calendarRevision !== calendarRevision || draft.listId !== listId));
  const stale = Boolean(draft && (calendarChanged || draft.revision !== revision || failed && error?.code === "stale_version"));
  const locked = disabled || busy || !ready;

  useEffect(() => {
    active.current = true;
    void readDraft<QuantityDraft>(userId, draftType).then(saved => {
      if (!active.current) return;
      if (saved && typeof saved.payload.value === "string") {
        setDraft({ ...saved.payload, revision: saved.baseVersions.groceryRevision ?? 0, calendarRevision: saved.payload.calendarRevision ?? -1, saveKey: saved.payload.saveKey || newKey() });
        setRestored(true);
      }
      setReady(true);
    });
    return () => { active.current = false; };
  }, [userId, draftType]);

  useEffect(() => {
    if (!ready || !draft) return;
    queue.current = queue.current.then(() => writeDraft(createDraftEnvelope({ userId, draftType, payload: draft, baseVersions: { groceryRevision: draft.revision }, ttlMs: draftTtlMs(draftType) }))).then(saved => { if (active.current) setStorageUnavailable(!saved); });
  }, [ready, draft, userId, draftType]);

  useEffect(() => {
    if (editing && ready && !disabled) { input.current?.focus(); input.current?.select(); }
    if (!editing && !locked && focusBack.current) { edit.current?.focus(); focusBack.current = false; }
  }, [editing, ready, disabled, locked]);

  function change(value: string) {
    if (!draft) return;
    setDraft({ ...draft, value, saveKey: newKey() });
    setFailed(current => current && error?.code === "stale_version");
  }

  async function cancel() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); onSavingChange(true);
    try {
      await queue.current; await clearDraft(userId, draftType);
      if (!active.current) return;
      if (failed) actions.clearError();
      setDraft(null); setFailed(false); setRestored(false); focusBack.current = true;
    } finally { submitting.current = false; onSavingChange(false); if (active.current) setBusy(false); }
  }

  async function save() {
    if (locked || !draft || quantity === null || stale || submitting.current) return;
    submitting.current = true; setBusy(true); onSavingChange(true); setFailed(false);
    try {
      await queue.current;
      const saved = await actions.setGroceryQuantity(item.id, quantity, week, { calendarRevision: draft.calendarRevision, groceryRevision: draft.revision, idempotencyKey: draft.saveKey });
      if (!active.current) return;
      if (!saved) { setFailed(true); onRefresh(); return; }
      await clearDraft(userId, draftType);
      if (!active.current) return;
      setDraft(null); setRestored(false); focusBack.current = true; onRefresh();
    } finally { submitting.current = false; onSavingChange(false); if (active.current) setBusy(false); }
  }

  async function remove() {
    if (locked || submitting.current) return;
    submitting.current = true; setBusy(true); onSavingChange(true);
    try {
      await queue.current;
      const focusTarget = row.current?.nextElementSibling?.querySelector<HTMLButtonElement>('button[aria-label^="Edit quantity for"]')
        ?? row.current?.previousElementSibling?.querySelector<HTMLButtonElement>('button[aria-label^="Edit quantity for"]')
        ?? document.querySelector<HTMLElement>("[data-grocery-heading]");
      const removed = await actions.removeGroceryItem(item.id, week);
      if (removed) { await clearDraft(userId, draftType); onRefresh(); requestAnimationFrame(() => focusTarget?.focus()); }
      else if (active.current) { setFailed(true); onRefresh(); }
    } finally { submitting.current = false; onSavingChange(false); if (active.current) setBusy(false); }
  }

  const deleteButton = <button type="button" disabled={locked} onClick={() => void remove()} aria-label={`Remove ${item.name}`} className={`${iconClass} ${draft ? "col-start-5 row-start-1 @[18rem]:col-start-6" : ""}`}><Trash2 className="h-4 w-4" aria-hidden /></button>;
  return <li ref={row} aria-label={item.name} className={`grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-xl px-2 py-1.5 md:grid-cols-[44px_minmax(0,1fr)_minmax(0,22rem)] ${item.checked ? "bg-mint-50" : "bg-cream"}`}>
    <label className="col-start-1 row-start-1 grid h-[44px] w-[44px] place-items-center"><input type="checkbox" checked={item.checked} disabled={locked} onChange={() => actions.toggleGrocery(item.id, week)} aria-label={`Mark ${item.name} as done`} className="h-5 w-5 accent-lav-500" /></label>
    <div className="col-start-2 row-start-1 min-w-0">
      <p className={`break-words text-sm font-bold [overflow-wrap:anywhere] ${item.checked ? "line-through opacity-60" : ""}`}>{item.name}{item.custom ? <span className="ml-1 rounded-full bg-lav-100 px-1.5 text-[9px] uppercase">custom</span> : null}</p>
      <p className="break-words text-[10px] font-semibold text-muted">generated {item.generatedQuantity} {item.unit}{item.carriedFromWeek ? ` | Carried from ${item.carriedFromWeek}` : ""}{item.quantity !== item.generatedQuantity ? " · adjusted by you" : ""}</p>
    </div>
    <div className="@container col-span-2 col-start-1 row-start-2 min-w-0 md:col-span-1 md:col-start-3 md:row-start-1">
      {draft ? <form aria-label={`Edit quantity for ${item.name}`} onSubmit={event => { event.preventDefault(); void save(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); void cancel(); } }}>
        <fieldset disabled={locked} className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_44px_44px_44px] items-center gap-1 @[18rem]:grid-cols-[44px_minmax(0,1fr)_44px_44px_44px_44px]">
          <button type="button" disabled={quantity === null || quantity >= MAX_GROCERY_QUANTITY} onClick={() => change(String(Math.min(MAX_GROCERY_QUANTITY, Number((quantity! + 1).toFixed(12)))))} aria-label={`Increase ${item.name}`} className={`${iconClass} col-start-1 row-start-1`}><Plus className="h-4 w-4" aria-hidden /></button>
          <label className="col-start-2 row-start-1 flex min-h-[44px] min-w-0 items-center rounded-xl bg-white px-1" htmlFor={fieldId}><span className="sr-only">Quantity for {item.name}</span><input ref={input} id={fieldId} inputMode="decimal" aria-label={`Quantity for ${item.name}`} className="min-h-[44px] w-full min-w-0 bg-transparent text-center text-sm font-extrabold tabular-nums outline-offset-2 focus-visible:outline-2 focus-visible:outline-lav-500" value={draft.value} onChange={event => change(event.target.value)} aria-invalid={quantity === null} aria-describedby={quantity === null ? `${fieldId}-error` : undefined} /><span className="shrink-0 text-xs font-bold text-muted">{item.unit}</span></label>
          <button type="button" disabled={quantity === null || quantity <= 0} onClick={() => change(String(Math.max(0, Number((quantity! - 1).toFixed(12)))))} aria-label={`Decrease ${item.name}`} className={`${iconClass} col-start-3 row-start-1`}><Minus className="h-4 w-4" aria-hidden /></button>
          <button ref={saveButton} type="submit" disabled={quantity === null || stale} aria-label={`${failed && !stale ? "Retry saving" : "Save quantity for"} ${item.name}`} className={`${iconClass} col-start-4 row-start-1 !bg-ink !text-white`}><Check className="h-4 w-4" aria-hidden /></button>
          <button type="button" onClick={() => void cancel()} aria-label={`Cancel quantity edit for ${item.name}`} className={`${iconClass} col-start-5 row-start-2 @[18rem]:row-start-1`}><X className="h-4 w-4" aria-hidden /></button>
          {deleteButton}
        </fieldset>
      </form> : <div className="flex min-w-0 items-center gap-1">
        <span className="flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1 rounded-xl bg-white px-2 text-sm font-extrabold tabular-nums [overflow-wrap:anywhere]"><span className="min-w-0">{item.quantity}</span><span className="shrink-0 text-xs font-bold text-muted">{item.unit}</span></span>
        <button ref={edit} type="button" disabled={locked} onClick={() => { setFailed(false); setDraft({ value: String(item.quantity), revision, calendarRevision, listId, saveKey: newKey() }); }} aria-label={`Edit quantity for ${item.name}`} className={iconClass}><Pencil className="h-4 w-4" aria-hidden /></button>
        {deleteButton}
      </div>}
    </div>
    <div className="col-span-full grid min-w-0 gap-1 text-xs">
      {draft && quantity === null ? <p id={`${fieldId}-error`} role="alert">Enter a quantity from 0 to 1,000,000, using numbers and an optional decimal point.</p> : null}
      {draft && restored ? <p role="status">Quantity draft restored. Review before saving.</p> : null}
      {draft && stale ? <div role="status" className="grid gap-1"><p>{calendarChanged ? "Your calendar grouping changed. Cancel this edit and reopen the item in the newly grouped list." : `This list changed. Latest saved quantity: ${item.quantity} ${item.unit}. Your input is retained.`}</p>{!calendarChanged ? <button type="button" disabled={locked} className="min-h-[44px] w-fit font-bold underline underline-offset-2" onClick={() => { actions.clearError(); setFailed(false); setDraft({ ...draft, revision, calendarRevision, listId, saveKey: newKey() }); requestAnimationFrame(() => saveButton.current?.focus()); }}>Review latest quantity</button> : null}</div> : null}
      {failed && !stale ? <p role="alert">{error?.message ?? "The change was not confirmed. Your input is retained; retry."}</p> : null}
      {busy ? <p role="status">Saving changes…</p> : null}
      {storageUnavailable ? <p role="status">Draft recovery is unavailable on this device. Keep this edit open until saved.</p> : null}
    </div>
  </li>;
}
