"use client";
import { GroceryNameInput } from "@/components/GroceryNameInput";
import { createUuid } from "@/utility/uuid";
import { GroceryCategoryField, categoryChoice } from "@/components/GroceryCategoryField";
import { classifyGroceryName, normalizeGroceryName, type GroceryCategoryDraft, type GroceryExtraSubmission } from "@/utility/groceryCategory";
import { cookingUnits, cookingUnitLabel } from "@/utility/cookingUnits";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { HelpPopover } from "@/components/ui/HelpPopover";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/EmptyState";
import { GroceryQuantityControl } from "@/components/GroceryQuantityControl";
import { parseGroceryQuantity } from "@/utility/groceryQuantity";
import { GroceryItemRow } from "@/components/GroceryItemRow";
import { GroceryTotalAmount } from "@/components/GroceryTotalAmount";
import { useNutritionWeek } from "@/components/nutrition/useNutritionWeek";
import { startOfWeek, todayKey } from "@/utility/dates";
import type { NutritionWeekReadModel } from "@/types/backend";
import type { GroceryCategory } from "@/types/domain";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";

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
    {({ connectionKnown, sharedSaving }) => connectionKnown ? <PersonalGroceries key={`${snapshot.userId}:${weekOf}`} week={week}
      disabled={Boolean(pendingMutation) || busy || sharedSaving || week.loading || Boolean(week.error)} onAmountSaving={setAmountSaving} onItemSaving={setItemSaving} /> : null}
  </CookingGroupSurface>;
}

function PersonalGroceries({ week, disabled, onAmountSaving, onItemSaving }: {
  week: ReturnType<typeof useNutritionWeek>; disabled: boolean;
  onAmountSaving: (saving: boolean) => void; onItemSaving: (saving: boolean) => void;
}) {
  const { snapshot } = useApp();
  const weekOf = week.data?.weekOf;
  return <div data-grocery-section className="grid min-w-0 gap-4 pb-4">
    {week.loading ? <p role="status">Loading this week&apos;s groceriesâ€¦</p> : null}
    {week.error ? <div role="alert" className="grid gap-2 rounded-2xl bg-danger-100 p-4 text-danger-900"><p>This week&apos;s groceries could not be refreshed. Your saved list and drafts are retained.</p><Button variant="soft" onClick={week.refresh}>Retry grocery week</Button></div> : null}
    {week.data ? <Card tone="mint"><GroceryTotalAmount key={`${snapshot.userId}:${weekOf}`} week={week.data} disabled={disabled} onRefresh={week.refresh} onSavingChange={onAmountSaving} /></Card> : null}
    {week.data?.grocery?.calendarReviewRequired ? <p role="status" className="rounded-2xl bg-peach-100 p-4 text-sm font-semibold">This list was regrouped after your start of week changed. Review ingredients and carried grocery edits.</p> : null}
    {week.data ? <GroceryWeek key={`${snapshot.userId}:${weekOf}`} week={week.data} disabled={disabled} onRefresh={week.refresh} onSavingChange={onItemSaving} /> : null}
  </div>;
}

function GroceryWeek({ week, disabled, onRefresh, onSavingChange }: { week: NutritionWeekReadModel; disabled: boolean; onRefresh: () => void; onSavingChange: (saving: boolean) => void }) {
  const { snapshot, actions, error } = useApp();
  const [name, setName] = useState("");
  const extraName = useRef<HTMLInputElement>(null);
  const extraSubmitting = useRef(false);
  const [extraSaving, setExtraSaving] = useState(false);
  const [submission, setSubmission] = useState<GroceryExtraSubmission>();
  const [categoryDraft, setCategoryDraft] = useState<GroceryCategoryDraft>();
  const [resolvedCategory, setResolvedCategory] = useState<{ category: GroceryCategory; nameKey: string }>();
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const parsedQuantity = parseGroceryQuantity(quantity, 1);
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
    void (async () => await readDraft<{ name: string; quantity: string; unit: string; categoryDraft?: GroceryCategoryDraft; submission?: GroceryExtraSubmission }>(userId, draftType)
      ?? (week.weekOf === startOfWeek(todayKey(), snapshot.profile?.weekStartsOn ?? 0) ? await readDraft<{ name: string; quantity: string; unit: string; categoryDraft?: GroceryCategoryDraft; submission?: GroceryExtraSubmission }>(userId, "grocery-custom") : null))().then((saved) => {
      if (!active) return;
      if (saved) {
        setName(saved.payload.name);
        setCategoryDraft(saved.payload.categoryDraft);
        setSubmission(saved.payload.submission);
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
      payload: { name, quantity, unit, categoryDraft, submission },
      baseVersions: { groceryRevision: list?.revision },
      ttlMs: draftTtlMs(draftType),
    })).then((saved) => setDraftWriteUnavailable(!saved));
  }, [draftReady, draftType, list?.revision, name, quantity, unit, categoryDraft, submission, userId]);

  const customItemEditor = (
    <fieldset disabled={disabled || !draftReady} className="min-w-0" aria-label="Extra grocery item">
      {!draftReady ? <p className="text-xs text-ink-soft" role="status">Restoring this week&apos;s item draftâ€¦</p> : null}
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
              setName(""); setCategoryDraft(undefined); setSubmission(undefined);
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
        <GroceryNameInput inputRef={extraName} value={name} label="Extra grocery item name" disabled={disabled || !draftReady} className="basis-full md:basis-40 md:flex-1" onChange={next => {
          suppressDraftWriteRef.current = false;
          if (normalizeGroceryName(next) !== normalizeGroceryName(name)) setCategoryDraft(undefined);
          setSubmission(undefined); setName(next);
        }} />
        <div className="ml-auto flex min-w-0 max-w-full flex-1 basis-full flex-wrap items-start justify-end gap-2 md:basis-auto md:max-w-[26rem]">
        <GroceryQuantityControl size="large" value={quantity} onChange={value => { suppressDraftWriteRef.current = false; setQuantity(value); setSubmission(undefined); }} label="Quantity" decreaseLabel="Decrease extra item quantity" increaseLabel="Increase extra item quantity" minimum={1} unit={unit} disabled={disabled || !draftReady} className="min-w-0 flex-1 basis-56" unitControl={<select value={unit === "L" ? "l" : unit} onChange={event => { suppressDraftWriteRef.current = false; setUnit(event.target.value); setSubmission(undefined); }} className="input !h-[48px] !min-h-[48px] !w-[76px] !px-[4px] !text-sm leading-none" aria-label="Unit">
          {["pcs", ...cookingUnits.filter(u => u !== "piece")].map(u => <option key={u} value={u}>{cookingUnitLabel(u)}</option>)}
        </select>} />
        <Button
          className="!min-h-12 !px-4"
          aria-label="Add custom grocery item"
          aria-busy={extraSaving}
          disabled={disabled || extraSaving || !draftReady || !name.trim() || parsedQuantity === null}
          onClick={async () => {
            if (parsedQuantity === null || extraSubmitting.current) return;
            extraSubmitting.current = true; setExtraSaving(true); onSavingChange(true);
            try {
              const intent = submission ?? { idempotencyKey: createUuid(), groceryRevision: list?.revision ?? 0, calendarRevision: snapshot.profile?.calendarRevision, choice: categoryChoice(name, categoryDraft) ?? { category: resolvedCategory?.nameKey === normalizeGroceryName(name) ? resolvedCategory.category : classifyGroceryName(name) } };
              setSubmission(intent);
              await writeDraft(createDraftEnvelope({ userId, draftType, payload: { name, quantity, unit, categoryDraft, submission: intent }, baseVersions: { groceryRevision: intent.groceryRevision }, ttlMs: draftTtlMs(draftType) }));
              const saved = await actions.addCustomGrocery(name.trim(), parsedQuantity, unit, week, intent.choice, intent);
              if (!saved) { onRefresh(); return; }
              if (userId) await clearDraft(userId, draftType);
              if (userId && week.weekOf === startOfWeek(todayKey(), snapshot.profile?.weekStartsOn ?? 0)) await clearDraft(userId, "grocery-custom");
              suppressDraftWriteRef.current = true;
              setName(""); setCategoryDraft(undefined); setSubmission(undefined);
              setQuantity("1"); setUnit("pcs"); setDraftWasRestored(false);
              requestAnimationFrame(() => extraName.current?.focus());
            } finally { extraSubmitting.current = false; setExtraSaving(false); onSavingChange(false); }

          }}
        >
          {extraSaving ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
        </Button>
        </div>
      </div>
      {submission && error?.code === "stale_version" ? <button type="button" disabled={disabled} className="min-h-[44px] text-sm font-bold underline" onClick={() => { setSubmission(undefined); actions.clearError(); }}>Review latest list before adding</button> : null}
      <div className="mt-2"><GroceryCategoryField initialCategory={submission?.choice.category} refreshKey={list?.revision} name={name} value={categoryDraft} onChange={value => { setCategoryDraft(value); setSubmission(undefined); }} disabled={disabled || !draftReady} onResolve={(category, nameKey) => setResolvedCategory({ category, nameKey })} /></div>
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
