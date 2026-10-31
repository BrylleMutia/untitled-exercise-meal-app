"use client";
import { GroceryNameInput } from "@/components/GroceryNameInput";
import { GroceryCategoryField, categoryChoice } from "@/components/GroceryCategoryField";
import { classifyGroceryName, normalizeGroceryName, type GroceryCategoryDraft, type GroceryExtraSubmission } from "@/utility/groceryCategory";
import { cookingUnits, cookingUnitLabel } from "@/utility/cookingUnits";

import { createUuid } from "@/utility/uuid";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { GroceryQuantityControl } from "@/components/GroceryQuantityControl";
import { parseGroceryQuantity } from "@/utility/groceryQuantity";
import { GroceryItemRow } from "@/components/GroceryItemRow";
import { clearDraft, createDraftEnvelope, readDraft, writeDraft } from "@/services/draftStore";
import type { GroupWeek } from "@/types/cookingGroup";
import type { NutritionWeekReadModel } from "@/types/backend";
import { LastGenerated } from "./GenerationSummary";
import { GroceryDraftRecovery } from "./GroceryDraftRecovery";

export function asNutritionWeek(week: GroupWeek): NutritionWeekReadModel {
  return { weekOf: week.weekOf, grocery: week.grocery, mealPlan: null, recipes: week.recipes, foods: [], targets: [], nutritionLogs: [], loggedMeals: [] };
}
export function GroupGrocery({ week, refresh, onSavingChange, locked = false, sharing }: { week: GroupWeek; locked?: boolean; refresh: () => void; onSavingChange: (saving: boolean) => void; sharing?: ReactNode }) {
  const { snapshot, actions, pendingMutation } = useApp(); const [draft, setDraft] = useState<{ name: string; quantity: string; unit: string; key: string; categoryDraft?: GroceryCategoryDraft; submission?: GroceryExtraSubmission }>(() => ({ name: "", quantity: "1", unit: "pcs", key: createUuid() })); const [ready, setReady] = useState(false); const [error, setError] = useState(""); const groupId = week.group!.id; const draftType = `grocery-group-custom:${groupId}:${week.weekOf}`;
  useEffect(() => { let active = true; void readDraft<typeof draft>(snapshot.userId, draftType).then(saved => { if (active) { if (saved) setDraft(saved.payload); setReady(true); } }); return () => { active = false; }; }, [snapshot.userId, draftType]);
  useEffect(() => { if (ready) void writeDraft(createDraftEnvelope({ userId: snapshot.userId, draftType, payload: draft, baseVersions: {}, ttlMs: 7 * 86400000 })); }, [ready, draft, snapshot.userId, draftType]);
  const [resolvedCategory, setResolvedCategory] = useState<{ category: import("@/types/domain").GroceryCategory; nameKey: string }>();
  const extraName = useRef<HTMLInputElement>(null);
  const extraSubmitting = useRef(false);
  const [extraSaving, setExtraSaving] = useState(false);
  const quantity = parseGroceryQuantity(draft.quantity);
  const model = asNutritionWeek(week); const disabled = locked || extraSaving || Boolean(pendingMutation) || !ready;
  return <><Card tone="mint"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 data-grocery-heading tabIndex={-1} className="font-extrabold">Grocery list</h2><LastGenerated generation={week.generation} /></div><Button variant="soft" disabled={disabled} onClick={async () => { try { await actions.cookingGroupCommand({ action: "grocery", groupId, weekOf: week.weekOf, revision: week.revision, operation: "refresh", idempotencyKey: createUuid() }); refresh(); } catch (r) { setError(r instanceof Error ? r.message : "Refresh failed."); } }}><RefreshCw className="h-4 w-4" aria-hidden />Refresh</Button></div>
      {sharing}
      <form className="mt-3 grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto]" onSubmit={async e => {
        e.preventDefault(); if (disabled || extraSubmitting.current || !draft.name.trim() || quantity === null) return;
        extraSubmitting.current = true; setExtraSaving(true); onSavingChange(true); setError("");
        try {
          const submission = draft.submission ?? { idempotencyKey: draft.key, groceryRevision: week.revision, choice: categoryChoice(draft.name, draft.categoryDraft) ?? { category: resolvedCategory?.nameKey === normalizeGroceryName(draft.name) ? resolvedCategory.category : classifyGroceryName(draft.name) } };
          const captured = { ...draft, submission }; setDraft(captured);
          await writeDraft(createDraftEnvelope({ userId: snapshot.userId, draftType, payload: captured, baseVersions: {}, ttlMs: 7 * 86400000 }));
          await actions.cookingGroupCommand({ action: "grocery", groupId, weekOf: week.weekOf, revision: submission.groceryRevision, operation: "add", name: draft.name, quantity, unit: draft.unit, categoryChoice: submission.choice, idempotencyKey: submission.idempotencyKey });
          await clearDraft(snapshot.userId, draftType); setDraft({ name: "", quantity: "1", unit: "pcs", key: createUuid() }); refresh(); requestAnimationFrame(() => extraName.current?.focus());
        } catch (r) { setError(r instanceof Error ? r.message : "Save failed; draft retained."); refresh(); }
        finally { extraSubmitting.current = false; setExtraSaving(false); onSavingChange(false); }
      }}>
      <GroceryNameInput inputRef={extraName} label="Extra grocery item" value={draft.name} disabled={disabled} groupId={groupId} onChange={name => setDraft({ ...draft, submission: undefined, name, categoryDraft: normalizeGroceryName(name) === normalizeGroceryName(draft.name) ? draft.categoryDraft : undefined, key: createUuid() })} /><div className="flex min-w-0 flex-wrap items-start justify-end gap-2"><GroceryQuantityControl value={draft.quantity} onChange={value => setDraft({ ...draft, submission: undefined, quantity: value, key: createUuid() })} label="Extra item quantity" decreaseLabel="Decrease extra item quantity" increaseLabel="Increase extra item quantity" unit={draft.unit} disabled={disabled} className="min-w-0 flex-1 basis-56" unitControl={<select aria-label="Extra item unit" className="input !h-[44px] !min-h-[44px] !w-[76px] !px-[4px] !text-sm leading-none" value={draft.unit === "L" ? "l" : draft.unit} disabled={disabled} onChange={e => setDraft({ ...draft, submission: undefined, unit: e.target.value, key: createUuid() })}>{["pcs", ...cookingUnits.filter(u => u !== "piece")].map(u => <option key={u} value={u}>{cookingUnitLabel(u)}</option>)}</select>} /><Button type="submit" aria-label="Add extra item" disabled={disabled || !draft.name.trim() || quantity === null} className="!w-12 !px-0"><Plus className="h-5 w-5" aria-hidden /></Button></div><div className="md:col-span-full"><GroceryCategoryField initialCategory={draft.submission?.choice.category} refreshKey={week.revision} groupId={groupId} name={draft.name} value={draft.categoryDraft} onChange={categoryDraft => setDraft({ ...draft, submission: undefined, categoryDraft, key: createUuid() })} disabled={disabled} onResolve={(category, nameKey) => setResolvedCategory({ category, nameKey })} /></div></form>
      {error ? <div className="mt-2 text-sm text-danger-900"><p role="alert">{error}</p>{draft.submission && /changed|stale|review/i.test(error) ? <button type="button" disabled={disabled} className="min-h-[44px] font-bold underline" onClick={() => { setDraft({ ...draft, submission: undefined, key: createUuid() }); setError(""); actions.clearError(); }}>Review latest list before adding</button> : null}</div> : null}</Card>
      <GroceryDraftRecovery week={week} locked={disabled} refresh={refresh} onSavingChange={onSavingChange} />
      {week.grocery?.calendarReviewRequired ? <p role="status" className="rounded-xl bg-peach-100 p-3 text-sm">This shared list was regrouped. Review carried grocery edits and spending.</p> : null}
      {(["Produce", "Protein", "Dairy", "Grains", "Pantry", "Other"] as const).map(category => {
        const items = week.grocery?.items.filter(item => !item.removed && item.category === category) ?? [];
        return items.length ? <Card key={category}><h3 className="font-extrabold">{category}</h3><ul className="mt-2 grid gap-2">{items.map(item => <GroceryItemRow key={item.id} groupId={groupId} item={item} week={model} disabled={disabled} onRefresh={refresh} onSavingChange={onSavingChange} />)}</ul></Card> : null;
      })}
      {!week.grocery?.items.some(i => !i.removed) ? <Card><p className="text-sm">No groceries for this week. Plan meals or add an extra item.</p></Card> : null}</>;
}
