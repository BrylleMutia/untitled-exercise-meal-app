"use client";
import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { GroceryItemRow } from "@/components/GroceryItemRow";
import { clearDraft, createDraftEnvelope, readDraft, writeDraft } from "@/services/draftStore";
import type { GroupWeek } from "@/types/cookingGroup";
import type { NutritionWeekReadModel } from "@/types/backend";
import { LastGenerated } from "./GenerationSummary";

export function asNutritionWeek(week: GroupWeek): NutritionWeekReadModel {
  return { weekOf: week.weekOf, grocery: week.grocery, mealPlan: null, recipes: week.recipes, foods: [], targets: [], nutritionLogs: [], loggedMeals: [] };
}
export function GroupGrocery({ week, refresh, onSavingChange, locked = false }: { week: GroupWeek; locked?: boolean; refresh: () => void; onSavingChange: (saving: boolean) => void }) {
  const { snapshot, actions, pendingMutation } = useApp(); const [draft, setDraft] = useState({ name: "", quantity: "1", unit: "pcs", key: crypto.randomUUID() }); const [ready, setReady] = useState(false); const [error, setError] = useState(""); const groupId = week.group!.id; const draftType = `grocery-group-custom:${groupId}:${week.weekOf}`;
  useEffect(() => { let active = true; void readDraft<typeof draft>(snapshot.userId, draftType).then(saved => { if (active) { if (saved) setDraft(saved.payload); setReady(true); } }); return () => { active = false; }; }, [snapshot.userId, draftType]);
  useEffect(() => { if (ready) void writeDraft(createDraftEnvelope({ userId: snapshot.userId, draftType, payload: draft, baseVersions: {}, ttlMs: 7 * 86400000 })); }, [ready, draft, snapshot.userId, draftType]);
  const model = asNutritionWeek(week); const disabled = locked || Boolean(pendingMutation) || !ready;
  return <><Card tone="mint"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 data-grocery-heading tabIndex={-1} className="font-extrabold">Shared grocery list</h2><LastGenerated generation={week.generation} /></div><Button variant="soft" disabled={disabled} onClick={async () => { try { await actions.cookingGroupCommand({ action: "grocery", groupId, weekOf: week.weekOf, revision: week.revision, operation: "refresh", idempotencyKey: crypto.randomUUID() }); refresh(); } catch (r) { setError(r instanceof Error ? r.message : "Refresh failed."); } }}><RefreshCw className="h-4 w-4" aria-hidden />Refresh</Button></div>
      <form className="mt-3 grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto]" onSubmit={async e => { e.preventDefault(); setError(""); try { await actions.cookingGroupCommand({ action: "grocery", groupId, weekOf: week.weekOf, revision: week.revision, operation: "add", name: draft.name, quantity: Number(draft.quantity), unit: draft.unit, idempotencyKey: draft.key }); await clearDraft(snapshot.userId, draftType); setDraft({ name: "", quantity: "1", unit: "pcs", key: crypto.randomUUID() }); refresh(); } catch (r) { setError(r instanceof Error ? r.message : "Save failed; draft retained."); refresh(); } }}>
      <label className="min-w-0"><span className="sr-only">Extra grocery item</span><input className="input w-full" placeholder="Item" value={draft.name} disabled={disabled} onChange={e => setDraft({ ...draft, name: e.target.value, key: crypto.randomUUID() })} /></label><div className="flex min-w-0 justify-end gap-2"><input aria-label="Extra item quantity" className="input !w-20" inputMode="decimal" value={draft.quantity} disabled={disabled} onChange={e => setDraft({ ...draft, quantity: e.target.value, key: crypto.randomUUID() })} /><select aria-label="Extra item unit" className="input !w-20" value={draft.unit} disabled={disabled} onChange={e => setDraft({ ...draft, unit: e.target.value, key: crypto.randomUUID() })}>{["pcs", "g", "kg", "ml", "L"].map(u => <option key={u}>{u}</option>)}</select><Button type="submit" aria-label="Add extra item" disabled={disabled || !draft.name.trim() || !draft.quantity.trim() || !Number.isFinite(Number(draft.quantity)) || Number(draft.quantity) < 0 || Number(draft.quantity) > 1000000} className="!w-12 !px-0"><Plus className="h-5 w-5" aria-hidden /></Button></div></form>
      {error ? <p role="alert" className="mt-2 text-sm text-danger-900">{error}</p> : null}</Card>
      {week.grocery?.calendarReviewRequired ? <p role="status" className="rounded-xl bg-peach-100 p-3 text-sm">This shared list was regrouped. Review carried grocery edits and spending.</p> : null}
      <Card><ul className="grid gap-2">{week.grocery?.items.filter(i => !i.removed).map(item => <GroceryItemRow key={item.id} groupId={groupId} item={item} week={model} disabled={disabled} onRefresh={refresh} onSavingChange={onSavingChange} />)}</ul>{!week.grocery?.items.some(i => !i.removed) ? <p className="text-sm">No group groceries yet. Generate a plan or add an extra item.</p> : null}</Card></>;
}
