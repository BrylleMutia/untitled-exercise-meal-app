"use client";
import { GroceryCategoryField, categoryChoice } from "./GroceryCategoryField";
import type { GroceryCategoryDraft } from "@/utility/groceryCategory";
import { cookingUnitLabel } from "@/utility/cookingUnits";

import { createUuid } from "@/utility/uuid";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";
import { parseGroceryQuantity } from "@/utility/groceryQuantity";
import { groceryItemOrigin } from "@/utility/groceryItemOrigin";
import { GroceryQuantityControl } from "./GroceryQuantityControl";
import type { GroceryItem } from "@/types/domain";
import type { NutritionWeekReadModel } from "@/types/backend";

type QuantityDraft = { categoryDraft?: GroceryCategoryDraft; value: string; revision: number; calendarRevision: number; listId: string; saveKey: string };
const newKey = () => createUuid();
// A category move remounts the row during realtime refresh. Its replacement must
// wait until the in-flight save clears the old draft before attempting recovery.
const pendingQuantitySaves = new Map<string, Promise<boolean>>();
const controlClass = "grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lav-500";
const iconClass = `${controlClass} bg-white text-ink`;

export function GroceryItemRow({ item, week, disabled, onRefresh, onSavingChange, groupId, addedByName }: { item: GroceryItem; week: NutritionWeekReadModel; disabled: boolean; onRefresh: () => void; onSavingChange: (saving: boolean) => void; groupId?: string; addedByName?: string }) {
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
  const draftType = `grocery-quantity:${groupId ? `group:${groupId}:` : ""}${week.weekOf}:${item.id}`;
  const saveScope = `${userId}:${draftType}`;
  const revision = week.grocery?.revision ?? 0;
  const calendarRevision = snapshot.profile?.calendarRevision ?? 0;
  const listId = week.grocery?.id ?? "";
  const editing = draft !== null;
  const quantity = draft ? parseGroceryQuantity(draft.value) : null;
  const origin = groceryItemOrigin(item);
  const sharedManual = Boolean(groupId) && origin === "Manual";
  const itemNotices = [
    item.carriedFromWeek ? `Carried from ${item.carriedFromWeek}` : null,
    sharedManual && addedByName?.trim() ? `Added by ${addedByName}` : null,
    !sharedManual && item.quantity !== item.generatedQuantity ? "adjusted by you" : null,
  ].filter(Boolean).join(" · ");
  const showPlanQuantity = editing && origin === "Generated" && (quantity ?? item.quantity) !== item.generatedQuantity;
  const calendarChanged = Boolean(draft && (draft.calendarRevision !== calendarRevision || draft.listId !== listId));
  const stale = Boolean(draft && (calendarChanged || draft.revision !== revision || failed && error?.code === "stale_version" && !/saved category changed/i.test(error.message)));
  const locked = disabled || busy || !ready;

  useEffect(() => {
    active.current = true;
    void (async () => {
      const pending = pendingQuantitySaves.get(saveScope);
      if (pending && await pending) return null;
      return readDraft<QuantityDraft>(userId, draftType);
    })().then(saved => {
      if (!active.current) return;
      if (saved && typeof saved.payload.value === "string") {
        setDraft({ ...saved.payload, revision: saved.baseVersions.groceryRevision ?? 0, calendarRevision: saved.payload.calendarRevision ?? -1, saveKey: saved.payload.saveKey || newKey() });
        setRestored(true);
      }
      setReady(true);
    });
    return () => { active.current = false; };
  }, [userId, draftType, saveScope]);

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
    let completed = false;
    let settle!: (saved: boolean) => void;
    const pending = new Promise<boolean>(resolve => { settle = resolve; });
    pendingQuantitySaves.set(saveScope, pending);
    try {
      await queue.current;
      const saved = groupId ? await actions.cookingGroupCommand({ action: "grocery", groupId, weekOf: week.weekOf, revision: draft.revision, operation: "quantity", itemId: item.id, quantity, categoryChoice: categoryChoice(item.name, draft.categoryDraft), idempotencyKey: draft.saveKey }).then(() => true).catch(() => false) : await actions.setGroceryQuantity(item.id, quantity, week, { calendarRevision: draft.calendarRevision, groceryRevision: draft.revision, idempotencyKey: draft.saveKey, categoryChoice: categoryChoice(item.name, draft.categoryDraft) });
      if (!saved) { if (active.current) { setFailed(true); onRefresh(); } return; }
      await clearDraft(userId, draftType);
      completed = true;
      const moved = draft.categoryDraft && draft.categoryDraft.category !== item.category;
      if (moved) focusMovedGroceryItem(saveScope, item.category);
      if (active.current) { setDraft(null); setRestored(false); focusBack.current = !moved; }
      onRefresh();
    } finally {
      settle(completed);
      if (pendingQuantitySaves.get(saveScope) === pending) pendingQuantitySaves.delete(saveScope);
      submitting.current = false; onSavingChange(false); if (active.current) setBusy(false);
    }
  }

  async function remove() {
    if (locked || submitting.current) return;
    submitting.current = true; setBusy(true); onSavingChange(true);
    try {
      await queue.current;
      const focusTarget = row.current?.nextElementSibling?.querySelector<HTMLButtonElement>('button[aria-label^="Edit quantity for"]')
        ?? row.current?.previousElementSibling?.querySelector<HTMLButtonElement>('button[aria-label^="Edit quantity for"]')
        ?? row.current?.closest("[data-grocery-section]")?.querySelector<HTMLElement>("[data-grocery-heading]")
        ?? document.querySelector<HTMLElement>("[data-grocery-heading]");
      const removed = groupId ? await actions.cookingGroupCommand({ action: "grocery", groupId, weekOf: week.weekOf, revision, operation: "remove", itemId: item.id, idempotencyKey: newKey() }).then(() => true).catch(() => false) : await actions.removeGroceryItem(item.id, week);
      if (removed) { await clearDraft(userId, draftType); onRefresh(); requestAnimationFrame(() => focusTarget?.focus()); }
      else if (active.current) { setFailed(true); onRefresh(); }
    } finally { submitting.current = false; onSavingChange(false); if (active.current) setBusy(false); }
  }

  const deleteButton = <button type="button" disabled={locked} onClick={() => void remove()} aria-label={`Remove ${item.name}`} className={`${controlClass} bg-danger-200 text-danger-900 hover:bg-danger-300`}><Trash2 className="h-4 w-4" aria-hidden /></button>;
  return <li ref={row} data-grocery-scope={saveScope} data-grocery-item={item.id} data-grocery-category={item.category} aria-label={item.name} className={`grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-xl px-2 py-1.5 md:grid-cols-[44px_minmax(0,1fr)_minmax(0,22rem)] ${item.checked ? "bg-mint-50" : "bg-cream"}`}>
    <label className="col-start-1 row-start-1 grid h-[44px] w-[44px] place-items-center"><input type="checkbox" checked={item.checked} disabled={locked} onChange={() => { if (groupId) void actions.cookingGroupCommand({ action: "grocery", groupId, weekOf: week.weekOf, revision, operation: "toggle", itemId: item.id, idempotencyKey: newKey() }).then(onRefresh).catch(onRefresh); else void actions.toggleGrocery(item.id, week); }} aria-label={`Mark ${item.name} as done`} className="h-5 w-5 accent-lav-500" /></label>
    <div className="col-start-2 row-start-1 min-w-0">
      <p className={`break-words text-sm font-bold [overflow-wrap:anywhere] ${item.checked ? "line-through opacity-60" : ""}`}>{item.name}{origin === "Generated" ? <span className="ml-1 inline-block rounded-full bg-lav-100 px-1.5 text-[9px]">Generated</span> : null}</p>
      {itemNotices ? <p className="break-words text-[10px] font-semibold text-muted">{itemNotices}</p> : null}
    </div>
    <div className="@container col-span-2 col-start-1 row-start-2 min-w-0 md:col-span-1 md:col-start-3 md:row-start-1">
      {draft ? <form aria-label={`Edit quantity for ${item.name}`} onSubmit={event => { event.preventDefault(); void save(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); void cancel(); } }}>
        <fieldset disabled={locked} className="flex min-w-0 flex-wrap items-start gap-1">
          <GroceryQuantityControl value={draft.value} onChange={change} inputRef={input} inputId={fieldId} label={`Quantity for ${item.name}`} decreaseLabel={`Decrease ${item.name}`} increaseLabel={`Increase ${item.name}`} unit={cookingUnitLabel(item.unit, item.quantity)} disabled={locked} describedBy={quantity === null ? `${fieldId}-error` : undefined} className="min-w-0 flex-1 basis-48" />
          <div className="ml-auto flex shrink-0 gap-1">
            <button ref={saveButton} type="submit" disabled={quantity === null || stale} aria-label={`${failed && !stale ? "Retry saving" : "Save quantity for"} ${item.name}`} className={`${iconClass} !bg-ink !text-white`}><Check className="h-4 w-4" aria-hidden /></button>
            <button type="button" onClick={() => void cancel()} aria-label={`Cancel quantity edit for ${item.name}`} className={iconClass}><X className="h-4 w-4" aria-hidden /></button>
            {deleteButton}
          </div>
        </fieldset>
        {origin === "Manual" ? <div className="mt-2"><GroceryCategoryField name={item.name} value={draft.categoryDraft} initialCategory={item.category} groupId={groupId} disabled={locked} onChange={categoryDraft => setDraft({ ...draft, categoryDraft, saveKey: newKey() })} /></div> : null}
        {showPlanQuantity ? <p className="mt-1 break-words text-xs text-muted">Plan quantity: {item.generatedQuantity} {cookingUnitLabel(item.unit, item.quantity)}</p> : null}
      </form> : <div className="flex min-w-0 items-center gap-1">
        <span className="flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1 rounded-xl bg-white px-2 text-sm font-extrabold tabular-nums [overflow-wrap:anywhere]"><span className="min-w-0">{item.quantity}</span><span className="shrink-0 text-xs font-bold text-muted">{cookingUnitLabel(item.unit, item.quantity)}</span></span>
        <button ref={edit} type="button" disabled={locked} onClick={() => { setFailed(false); setDraft({ value: String(item.quantity), revision, calendarRevision, listId, saveKey: newKey() }); }} aria-label={`Edit quantity for ${item.name}`} className={iconClass}><Pencil className="h-4 w-4" aria-hidden /></button>
        {deleteButton}
      </div>}
    </div>
    <div className="col-span-full grid min-w-0 gap-1 text-xs">
      {draft && quantity === null ? <p id={`${fieldId}-error`} role="alert" className="text-danger-900">Enter a quantity from 0 to 1,000,000, using numbers and an optional decimal point.</p> : null}
      {draft && restored ? <p role="status">Quantity draft restored. Review before saving.</p> : null}
      {draft && stale ? <div role="status" className="grid gap-1"><p>{calendarChanged ? "Your calendar grouping changed. Cancel this edit and reopen the item in the newly grouped list." : `This list changed. Latest saved quantity: ${item.quantity} ${cookingUnitLabel(item.unit, item.quantity)}. Your input is retained.`}</p>{!calendarChanged ? <button type="button" disabled={locked} className="min-h-[44px] w-fit font-bold underline underline-offset-2" onClick={() => { actions.clearError(); setFailed(false); setDraft({ ...draft, revision, calendarRevision, listId, saveKey: newKey() }); requestAnimationFrame(() => saveButton.current?.focus()); }}>Review latest quantity</button> : null}</div> : null}
      {failed && !stale ? <p role="alert" className="text-danger-900">{error?.message ?? "The change was not confirmed. Your input is retained; retry."}</p> : null}
      {busy ? <p role="status">Saving changes…</p> : null}
      {storageUnavailable ? <p role="status">Draft recovery is unavailable on this device. Keep this edit open until saved.</p> : null}
    </div>
  </li>;
}

// Category cards remount a moved row. Wait for the refreshed destination before restoring focus.
function focusMovedGroceryItem(scope: string, previousCategory: string) {
  const find = () => [...document.querySelectorAll<HTMLElement>("[data-grocery-item]")].find(row => row.dataset.groceryScope === scope && row.dataset.groceryCategory !== previousCategory)?.querySelector<HTMLButtonElement>('button[aria-label^="Edit quantity for"]');
  const observer = new MutationObserver(() => { const button = find(); if (button && !button.disabled) { button.focus(); observer.disconnect(); clearTimeout(timer); } });
  const timer = setTimeout(() => observer.disconnect(), 10000);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
}
