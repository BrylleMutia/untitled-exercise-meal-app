"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/Button";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";
import { formatGroceryAmount, groceryAmountInput, parseGroceryAmount } from "@/utility/groceryAmount";
import { formatFullDate } from "@/utility/dates";
import type { NutritionWeekReadModel } from "@/types/backend";

type AmountDraft = { value: string; revision: number; calendarRevision: number; saveKey: string };
const saveKey = () => crypto.randomUUID();

export function GroceryTotalAmount({ week, disabled, onRefresh, onSavingChange, groupId }: { week: NutritionWeekReadModel; disabled: boolean; onRefresh: () => void; onSavingChange: (saving: boolean) => void; groupId?: string }) {
  const { snapshot, actions, error } = useApp();
  const [draft, setDraft] = useState<AmountDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [restored, setRestored] = useState(false);
  const fieldId = useId();
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const active = useRef(true);
  const submitting = useRef(false);
  const returnFocus = useRef(false);
  const draftType = `grocery-total:${groupId ? `group:${groupId}:` : ""}${week.weekOf}`;
  const userId = snapshot.userId;
  const revision = week.grocery?.revision ?? 0;
  const calendarRevision = snapshot.profile?.calendarRevision ?? 0;
  const amount = week.grocery?.totalAmountCentavos ?? null;
  const parsed = draft ? parseGroceryAmount(draft.value) : null;
  const stale = Boolean(draft && (draft.revision !== revision || draft.calendarRevision !== calendarRevision || failed && error?.code === "stale_version"));
  const locked = disabled || !ready || busy;

  useEffect(() => {
    active.current = true;
    void readDraft<AmountDraft>(userId, draftType).then(saved => {
      if (!active.current) return;
      if (saved && typeof saved.payload.value === "string") {
        setDraft({ value: saved.payload.value, revision: saved.baseVersions.groceryRevision ?? 0, calendarRevision: saved.payload.calendarRevision ?? -1, saveKey: saved.payload.saveKey || saveKey() });
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

  const editing = draft !== null;
  useEffect(() => {
    if (editing && ready && !disabled) input.current?.focus();
  }, [editing, ready, disabled]);

  useEffect(() => {
    if (editing || disabled || busy || !ready || !returnFocus.current) return;
    root.current?.querySelector<HTMLButtonElement>('[aria-label="Edit total amount"]')?.focus();
    returnFocus.current = false;
  }, [editing, disabled, busy, ready]);

  function focusEdit() {
    returnFocus.current = true;
  }
  async function cancel() {
    if (submitting.current) return;
    setBusy(true); onSavingChange(true);
    try {
      await queue.current;
      await clearDraft(userId, draftType);
      if (!active.current) return;
      if (failed) actions.clearError();
      setDraft(null); setFailed(false); setRestored(false); focusEdit();
    } finally { onSavingChange(false); if (active.current) setBusy(false); }
  }
  async function save() {
    if (locked || !draft || !parsed?.valid || stale || submitting.current) return;
    submitting.current = true; setBusy(true); onSavingChange(true); setFailed(false);
    try {
      await queue.current;
      const saved = groupId ? await actions.cookingGroupCommand({ action: "grocery", groupId, weekOf: week.weekOf, revision: draft.revision, operation: "amount", amount: parsed.centavos, idempotencyKey: draft.saveKey }).then(() => true).catch(() => false) : await actions.setGroceryTotalAmount({ weekOf: week.weekOf, calendarRevision: draft.calendarRevision, totalAmountCentavos: parsed.centavos, expectedVersions: { groceryRevision: draft.revision }, idempotencyKey: draft.saveKey }, week);
      if (!active.current) return;
      if (!saved) { setFailed(true); onRefresh(); return; }
      await clearDraft(userId, draftType);
      if (!active.current) return;
      setDraft(null); setRestored(false); onRefresh(); focusEdit();
    } finally { submitting.current = false; onSavingChange(false); if (active.current) setBusy(false); }
  }
  return <section ref={root} aria-label={groupId ? "Shared grocery spending" : "Weekly grocery spending"} className="mt-4 grid min-w-0 gap-2 border-t border-ink/10 pt-4">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <div className="min-w-0"><h2 className="text-sm font-bold">Total Amount</h2><p className="break-words text-xl font-extrabold [overflow-wrap:anywhere]" aria-live="polite">{formatGroceryAmount(amount)}</p>{amount === null ? <p className="text-xs text-ink-soft">Not recorded</p> : null}</div>
      {!draft ? <Button variant="soft" aria-label="Edit total amount" className="!h-11 !min-h-11 !w-11 !p-0" disabled={locked} onClick={() => { setFailed(false); setDraft({ value: groceryAmountInput(amount), revision, calendarRevision, saveKey: saveKey() }); }}><Pencil className="h-4 w-4" aria-hidden /></Button> : null}
    </div>
    {week.grocery?.totalAmountCarriedFromWeek ? <p className="text-xs font-semibold" role="status">Carried from the week starting {formatFullDate(week.grocery.totalAmountCarriedFromWeek)}. Review this amount for the regrouped list.</p> : null}
    {draft ? <fieldset disabled={locked} className="grid min-w-0 gap-2" aria-label="Edit weekly grocery spending">
      {restored ? <p className="text-xs font-semibold" role="status">Weekly amount draft restored. Review before saving.</p> : null}
      <label className="grid min-w-0 gap-1 text-sm font-bold" htmlFor={fieldId}>Total amount (PHP)
        <span className="flex min-w-0 items-center rounded-2xl bg-cream"><span className="pl-4" aria-hidden>₱</span><input ref={input} id={fieldId} className="input min-w-0 !bg-transparent !pl-2" inputMode="decimal" maxLength={32} value={draft.value} placeholder="e.g. 1250.50" aria-invalid={!parsed?.valid} aria-describedby={!parsed?.valid ? `${fieldId}-error` : undefined} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); void cancel(); } }} onChange={event => { setFailed(current => current && error?.code === "stale_version"); setDraft({ ...draft, value: event.target.value, saveKey: saveKey() }); }} /></span>
      </label>
      {!parsed?.valid ? <p id={`${fieldId}-error`} className="text-xs font-semibold text-danger-900" role="alert">Enter a non-negative amount with up to two decimal places, within the supported range.</p> : null}
      {stale ? <div className="grid gap-2 text-xs" role="status"><p>This week changed. Latest recorded amount: {formatGroceryAmount(amount)}. Your input is retained.</p><Button variant="soft" className="w-fit" onClick={() => { actions.clearError(); setFailed(false); setDraft({ ...draft, revision, calendarRevision, saveKey: saveKey() }); requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>("[data-save-grocery-amount]")?.focus()); }}>Review latest amount</Button></div> : null}
      {failed && !stale ? <p className="text-xs font-semibold text-danger-900" role="alert">{error?.message ?? "The amount was not confirmed. Your input is retained; retry."}</p> : null}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="soft" onClick={() => void cancel()}>Cancel</Button><Button data-save-grocery-amount disabled={stale || !parsed?.valid} onClick={() => void save()}>{failed && !stale ? "Retry save" : "Save amount"}</Button></div>
    </fieldset> : null}
    {busy ? <p role="status" className="text-xs font-semibold">Saving changes…</p> : null}
    {storageUnavailable ? <p role="status" className="text-xs font-semibold">Draft recovery is unavailable on this device. Keep this form open until saved.</p> : null}
  </section>;
}
