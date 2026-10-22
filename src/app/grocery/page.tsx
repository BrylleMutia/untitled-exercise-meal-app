"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Plus, RefreshCw } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { HelpPopover } from "@/components/ui/HelpPopover";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/EmptyState";
import { GroceryItemRow } from "@/components/GroceryItemRow";
import { GroceryTotalAmount } from "@/components/GroceryTotalAmount";
import { useNutritionWeek } from "@/components/nutrition/useNutritionWeek";
import { startOfWeek, todayKey } from "@/utility/dates";
import type { NutritionWeekReadModel } from "@/types/backend";
import type { GroceryCategory } from "@/types/domain";
import { clearDraft, createDraftEnvelope, draftTtlMs, listDrafts, readDraft, writeDraft } from "@/services/draftStore";

const categories: GroceryCategory[] = ["Produce", "Protein", "Dairy", "Grains", "Pantry", "Other"];

import { CookingGroupSurface } from "@/components/cooking/CookingGroupSurface";

export default function GroceryPage() {
  const { snapshot, pendingMutation } = useApp();
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [amountSaving, setAmountSaving] = useState(false);
  const [itemSaving, setItemSaving] = useState(false);
  const weekOf = startOfWeek(selectedDate, snapshot.profile?.weekStartsOn ?? 0);
  const week = useNutritionWeek(weekOf);
  const busy = amountSaving || itemSaving;
  return <CookingGroupSurface weekOf={weekOf} onWeekChange={setSelectedDate} kind="grocery" busy={busy}>
    {({ connected, connectionKnown, sharedSaving }) => <PrivateGroceries key={`${snapshot.userId}:${weekOf}`} week={week} privateSection={connected || !connectionKnown}
      disabled={Boolean(pendingMutation) || busy || sharedSaving || week.loading || Boolean(week.error)} onAmountSaving={setAmountSaving} onItemSaving={setItemSaving} />}
  </CookingGroupSurface>;
}

function PrivateGroceries({ week, privateSection, disabled, onAmountSaving, onItemSaving }: {
  week: ReturnType<typeof useNutritionWeek>; privateSection: boolean; disabled: boolean;
  onAmountSaving: (saving: boolean) => void; onItemSaving: (saving: boolean) => void;
}) {
  const { snapshot } = useApp();
  const contentId = useId();
  const [hasDraft, setHasDraft] = useState(false);
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const weekOf = week.data?.weekOf;
  useEffect(() => {
    if (!weekOf) return;
    let active = true;
    void listDrafts(snapshot.userId).then(drafts => {
      if (!active) return;
      setHasDraft(drafts.some(draft => draft.draftType === `grocery-custom:${weekOf}`
        || draft.draftType === `grocery-total:${weekOf}` || draft.draftType.startsWith(`grocery-quantity:${weekOf}:`)
        || draft.draftType === "grocery-custom" && weekOf === startOfWeek(todayKey(), snapshot.profile?.weekStartsOn ?? 0)));
    });
    return () => { active = false; };
  }, [snapshot.userId, snapshot.profile?.weekStartsOn, weekOf]);
  const hasContent = Boolean(week.data?.grocery?.items.some(item => !item.removed)) || week.data?.grocery?.totalAmountCentavos != null;
  const content = <div data-grocery-section className="grid min-w-0 gap-4 pb-4">
    {week.loading ? <p role="status">Loading this week&apos;s groceries…</p> : null}
    {week.error ? <div role="alert" className="grid gap-2 rounded-2xl bg-danger-100 p-4 text-danger-900"><p>This week&apos;s groceries could not be refreshed. Your saved list and drafts are retained.</p><Button variant="soft" onClick={week.refresh}>Retry grocery week</Button></div> : null}
    {week.data ? <Card tone="mint">{privateSection ? <h3 className="font-extrabold">Private spending</h3> : null}<GroceryTotalAmount key={`${snapshot.userId}:${weekOf}`} week={week.data} disabled={disabled} onRefresh={week.refresh} onSavingChange={onAmountSaving} /></Card> : null}
    {week.data?.grocery?.calendarReviewRequired ? <p role="status" className="rounded-2xl bg-peach-100 p-4 text-sm font-semibold">This list was regrouped after your start of week changed. Review ingredients and carried grocery edits.</p> : null}
    {week.data ? <GroceryWeek key={`${snapshot.userId}:${weekOf}`} week={week.data} disabled={disabled} onRefresh={week.refresh} onSavingChange={onItemSaving} /> : null}
  </div>;
  if (!privateSection) return content;
  const open = expanded ?? (hasContent || hasDraft || week.loading || Boolean(week.error));
  return <section data-grocery-section aria-label="Private extras — only you" className="grid min-w-0 gap-3">
    <h2><button type="button" disabled={week.loading} aria-expanded={open} aria-controls={contentId} className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 text-left font-extrabold shadow-chip disabled:opacity-50" onClick={() => setExpanded(!open)}>
      <span className="min-w-0 break-words">{hasContent || hasDraft || week.loading || week.error ? "Private extras — only you" : "Add private extras"}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 ${open ? "rotate-180" : ""}`} aria-hidden />
    </button></h2>
    <div id={contentId} hidden={!open}>
      <p className="mb-4 mt-2 text-xs text-ink-soft">Only you can see these additional groceries and spending. Shared cooking requirements are already covered in the shared list above.</p>
      {content}
    </div>
  </section>;
}

function GroceryWeek({ week, disabled, onRefresh, onSavingChange }: { week: NutritionWeekReadModel; disabled: boolean; onRefresh: () => void; onSavingChange: (saving: boolean) => void }) {
  const { snapshot, actions } = useApp();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [draftReady, setDraftReady] = useState(false);
  const [draftWasRestored, setDraftWasRestored] = useState(false);
  const [draftWriteUnavailable, setDraftWriteUnavailable] = useState(false);
  const suppressDraftWriteRef = useRef(false);

  const list = week.grocery;
  const userId = snapshot.userId;
  const draftType = `grocery-custom:${week.weekOf}`;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => await readDraft<{ name: string; quantity: string; unit: string }>(userId, draftType)
      ?? (week.weekOf === startOfWeek(todayKey(), snapshot.profile?.weekStartsOn ?? 0) ? await readDraft<{ name: string; quantity: string; unit: string }>(userId, "grocery-custom") : null))().then((saved) => {
      if (!active) return;
      if (saved) {
        setName(saved.payload.name);
        setQuantity(saved.payload.quantity);
        setUnit(saved.payload.unit);
        setDraftWasRestored(true);
      }
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [draftType, userId, week.weekOf, snapshot.profile?.weekStartsOn]);

  useEffect(() => {
    if (!draftReady || !userId) return;
    if (suppressDraftWriteRef.current) {
      suppressDraftWriteRef.current = false;
      return;
    }
    if (!name.trim() && quantity === "1" && unit === "pcs") {
      void clearDraft(userId, draftType);
      return;
    }
    void writeDraft(createDraftEnvelope({
      userId,
      draftType,
      payload: { name, quantity, unit },
      baseVersions: { groceryRevision: list?.revision },
      ttlMs: draftTtlMs(draftType),
    })).then((saved) => setDraftWriteUnavailable(!saved));
  }, [draftReady, draftType, list?.revision, name, quantity, unit, userId]);

  const customItemEditor = (
    <fieldset disabled={disabled || !draftReady} className="min-w-0" aria-label="Extra grocery item">
      {!draftReady ? <p className="text-xs text-ink-soft" role="status">Restoring this week&apos;s item draft…</p> : null}
      {draftWasRestored ? (
        <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-mint-100 px-3 py-2 text-xs font-bold" role="status">
          <span>Custom-item draft restored from this device.</span>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => {
              if (userId) void clearDraft(userId, draftType);
              if (userId && week.weekOf === startOfWeek(todayKey(), snapshot.profile?.weekStartsOn ?? 0)) void clearDraft(userId, "grocery-custom");
              suppressDraftWriteRef.current = true;
              setName("");
              setQuantity("1");
              setUnit("pcs");
              setDraftWasRestored(false);
            }}
          >
            Discard draft
          </button>
        </div>
      ) : null}

      {draftWriteUnavailable ? (
        <p className="mt-3 rounded-xl bg-peach-100 px-3 py-2 text-[11px] font-bold text-ink-soft" role="status">
          Draft recovery is unavailable on this device right now. Keep this form open until the item is confirmed.
        </p>
      ) : null}


      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => {
            suppressDraftWriteRef.current = false;
            setName(e.target.value);
          }}
          placeholder="Item"
          className="input min-w-0 basis-full md:basis-40 md:flex-1"
          aria-label="Extra grocery item name"
        />
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
        <input
          value={quantity}
          onChange={(e) => {
            suppressDraftWriteRef.current = false;
            setQuantity(e.target.value);
          }}
          className="input !w-16 shrink-0"
          inputMode="numeric"
          aria-label="Quantity"
        />
        <select
          value={unit}
          onChange={(e) => {
            suppressDraftWriteRef.current = false;
            setUnit(e.target.value);
          }}
          className="input !w-20 shrink-0"
          aria-label="Unit"
        >
          <option value="pcs">pcs</option>
          <option value="g">g</option>
          <option value="ml">ml</option>
        </select>
        <Button
          className="!min-h-12 !px-4"
          aria-label="Add custom grocery item"
          disabled={disabled || !draftReady || !name.trim()}
          onClick={async () => {
            const saved = await actions.addCustomGrocery(
              name.trim(),
              Math.max(1, Number(quantity) || 1),
              unit,
              week,
            );
            if (!saved) return;
            if (userId) void clearDraft(userId, draftType);
            if (userId && week.weekOf === startOfWeek(todayKey(), snapshot.profile?.weekStartsOn ?? 0)) void clearDraft(userId, "grocery-custom");
            suppressDraftWriteRef.current = true;
            setName("");
            setQuantity("1");
            setUnit("pcs");
            setDraftWasRestored(false);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </Button>
        </div>
      </div>
    </fieldset>
  );

  if (!list || list.items.length === 0) {
    return (
      <div className="grid gap-4 pb-4">
        <EmptyState
          title="No groceries for this week"
          message="Plan meals for this week in Nutrition, or add an extra item below."
        />
        <Card tone="mint">
          <div className="flex items-center justify-between gap-2"><h2 className="font-extrabold">Add an extra item</h2><HelpPopover title="Extra grocery items"><p>Add items outside your meal plan, such as household supplies. Your recoverable draft stays available while the latest list is unavailable.</p></HelpPopover></div>
          {customItemEditor}
        </Card>
      </div>
    );
  }

  const visible = list.items.filter((item) => !item.removed);

  return (
    <div className="grid gap-4 pb-4">
      <Card tone="mint">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1"><h2 data-grocery-heading tabIndex={-1} className="font-extrabold">Grocery list</h2><HelpPopover title="Grocery list"><p>This list comes from the selected week&apos;s planned meals, with recipe quantities scaled by planned servings divided by recipe yield. Skipped meals and unmeasured garnishes are excluded.</p><p>Checked items, quantity edits, removals, extra items, and recorded spending stay with this week. Refresh recalculates the plan quantities while preserving your adjustments.</p></HelpPopover></div>
          </div>
          <Button variant="soft" className="!min-h-11 !px-3 text-xs" disabled={disabled} onClick={() => actions.regenerateGrocery(week)}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
          </Button>
        </div>

        {customItemEditor}
      </Card>

      <div className="grid min-w-0 grid-cols-1 gap-3">
        {categories.map((category) => {
          const items = visible.filter((i) => i.category === category);
          if (items.length === 0) return null;
          return (
            <Card key={category} className="!p-[16px]">
              <h3 className="font-extrabold">{category}</h3>
              <ul className="mt-2 grid gap-1">
                {items.map(item => <GroceryItemRow key={item.id} item={item} week={week} disabled={disabled} onRefresh={onRefresh} onSavingChange={onSavingChange} />)}
              </ul>
            </Card>
          );
        })}
      </div>

    </div>
  );
}
