"use client";

import { createUuid } from "@/utility/uuid";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { clearDraft, createDraftEnvelope, draftTtlMs, listDrafts, writeDraft } from "@/services/draftStore";
import { parseGroceryAmount } from "@/utility/groceryAmount";
import { parseGroceryQuantity } from "@/utility/groceryQuantity";
import { startOfWeek, todayKey } from "@/utility/dates";
import type { DraftEnvelope } from "@/types/backend";
import type { GroupCommand, GroupWeek } from "@/types/cookingGroup";

type Payload = { name?: string; quantity?: string; unit?: string; value?: string };
type Recovered = DraftEnvelope<Payload>;
export function GroceryDraftRecovery({ week, locked, refresh, onSavingChange }: { week: GroupWeek; locked: boolean; refresh: () => void; onSavingChange: (saving: boolean) => void }) {
  const { snapshot, actions } = useApp();
  const [drafts, setDrafts] = useState<Recovered[]>([]);
  const [editing, setEditing] = useState<Recovered | null>(null);
  const [revision, setRevision] = useState(week.revision);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const request = useRef<GroupCommand | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    void listDrafts(snapshot.userId).then(all => {
      if (!active) return;
      const matching = all.filter(draft => {
        if (draft.draftType.includes(":group:") || draft.draftType.startsWith("grocery-group-")) return false;
        if (draft.draftType === "grocery-custom") return week.weekOf === startOfWeek(todayKey(),week.group!.weekStartsOn);
        const match = /^grocery-(?:custom|quantity|total):(\d{4}-\d{2}-\d{2})(?::|$)/.exec(draft.draftType);
        return match && startOfWeek(match[1],week.group!.weekStartsOn) === week.weekOf;
      });
      setDrafts(matching as Recovered[]);
    });
    return () => { active = false; };
  }, [snapshot.userId,week.weekOf,week.group]);
  if (!drafts.length || week.grocerySharing?.status !== "enabled") return null;
  const amount = editing?.draftType.startsWith("grocery-total:");
  const quantity = editing?.draftType.startsWith("grocery-quantity:");
  const item = quantity ? week.grocery?.items.find(row => row.sourceOwner === snapshot.userId && editing?.draftType === `grocery-quantity:${row.sourceWeek}:${row.sourceItemId}`) : undefined;
  const value = editing?.payload.value ?? editing?.payload.quantity ?? "";
  const parsedAmount = parseGroceryAmount(value), parsedQuantity = parseGroceryQuantity(value);
  const valid = amount ? parsedAmount.valid : parsedQuantity !== null && (quantity ? Boolean(item && !item.removed) : Boolean(editing?.payload.name?.trim() && editing.payload.unit?.trim()));
  const stale = revision !== week.revision;
  const change = (payload: Payload) => { if (editing) setEditing({ ...editing,payload: { ...editing.payload,...payload } }); request.current = null; };
  async function save() {
    if (!editing || !valid || locked || submitting.current || stale) return;
    submitting.current = true; setSaving(true); onSavingChange(true); setError("");
    try {
      const stored = await writeDraft(createDraftEnvelope({ userId:snapshot.userId,draftType:editing.draftType,payload:editing.payload,baseVersions:editing.baseVersions,ttlMs:draftTtlMs(editing.draftType) }));
      if (!stored) throw new Error("Draft recovery is unavailable. Keep this editor open and retry.");
      const common = { action:"grocery" as const,groupId:week.group!.id,weekOf:week.weekOf,revision,idempotencyKey:createUuid() };
      request.current ??= amount && parsedAmount.valid ? { ...common,operation:"amount",amount:parsedAmount.centavos }
        : quantity && item && parsedQuantity !== null ? { ...common,operation:"quantity",itemId:item.id,quantity:parsedQuantity }
          : { ...common,operation:"add",name:editing.payload.name!,unit:editing.payload.unit ?? "pcs",quantity:Number(value) };
      await actions.cookingGroupCommand(request.current);
      await clearDraft(snapshot.userId,editing.draftType);
      setDrafts(current => current.filter(draft => draft.draftType !== editing.draftType)); setEditing(null); request.current = null;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Save failed. Draft retained."); }
    finally { submitting.current = false; setSaving(false); onSavingChange(false); refresh(); }
  }
  return <Card role="region" aria-label="Recovered grocery drafts">
    <h2 className="font-extrabold">Recovered grocery drafts</h2>
    <p className="mt-2 text-sm">These unsaved entries are still only on this device. Review before saving to the group. A recovered spending value replaces the shared total you confirm; it is not added automatically.</p>
    {!editing ? <ul className="mt-2 grid gap-2">{drafts.map(draft => <li key={draft.draftType}><Button variant="soft" disabled={locked} onClick={() => { setEditing(draft); setRevision(week.revision); setError(""); request.current = null; }}>Review {draft.draftType.startsWith("grocery-total:") ? "spending" : draft.draftType.startsWith("grocery-quantity:") ? "quantity" : "extra item"} draft</Button></li>)}</ul> : <div className="mt-3 grid min-w-0 gap-3">
      {!amount && !quantity ? <><label className="grid gap-1 text-sm">Item<input className="input w-full" value={editing.payload.name ?? ""} disabled={saving || locked} onChange={event => change({ name:event.target.value })} /></label><label className="grid gap-1 text-sm">Unit<input className="input w-full" value={editing.payload.unit ?? "pcs"} disabled={saving || locked} onChange={event => change({ unit:event.target.value })} /></label></> : null}
      <label className="grid gap-1 text-sm">{amount ? "Final shared total (PHP)" : quantity ? `Quantity for ${item?.name ?? "unavailable item"}` : "Quantity"}<input className="input w-full" inputMode="decimal" value={value} disabled={saving || locked} onChange={event => change(amount || quantity ? { value:event.target.value } : { quantity:event.target.value })} /></label>
      {quantity && (!item || item.removed) ? <p role="status" className="text-sm">The original item is no longer available. Your draft is retained; add an extra item to record a replacement.</p> : null}
      {stale ? <div role="status" className="text-sm">The list changed. Review the latest shared values before saving.<Button variant="soft" disabled={saving || locked} onClick={() => { setRevision(week.revision); request.current = null; }}>Use reviewed list version</Button></div> : null}
      {error ? <p role="alert" className="break-words text-sm text-danger-900">{error}</p> : null}
      <div className="flex flex-wrap gap-2"><Button variant="soft" disabled={saving} onClick={() => setEditing(null)}>Keep draft</Button><Button disabled={locked || saving || !valid || stale} onClick={() => void save()}>Save to shared list</Button></div>
    </div>}
  </Card>;
}
