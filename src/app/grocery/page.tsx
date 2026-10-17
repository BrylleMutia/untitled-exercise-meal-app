"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { HelpPopover } from "@/components/ui/HelpPopover";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/EmptyState";
import { WeekNavigator } from "@/components/WeekNavigator";
import { useNutritionWeek } from "@/components/nutrition/useNutritionWeek";
import { startOfWeek, todayKey } from "@/utility/dates";
import type { NutritionWeekReadModel } from "@/types/backend";
import type { GroceryCategory } from "@/types/domain";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";

const categories: GroceryCategory[] = ["Produce", "Protein", "Dairy", "Grains", "Pantry", "Other"];

export default function GroceryPage() {
  const { snapshot, pendingMutation } = useApp();
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const weekOf = startOfWeek(selectedDate, snapshot.profile?.weekStartsOn ?? 0);
  const week = useNutritionWeek(weekOf);
  const disabled = Boolean(pendingMutation) || week.loading || Boolean(week.error);
  return <div className="grid min-w-0 gap-4 pb-4">
    <Card tone="mint"><WeekNavigator weekOf={weekOf} onChange={setSelectedDate} weekStartsOn={snapshot.profile?.weekStartsOn ?? 0} disabled={Boolean(pendingMutation)} /></Card>
    {week.loading ? <p role="status">Loading this week&apos;s groceries…</p> : null}
    {week.error ? <div role="alert" className="grid gap-2 rounded-2xl bg-peach-100 p-4"><p>This week&apos;s groceries could not be refreshed. Your saved list and drafts are retained.</p><Button variant="soft" onClick={week.refresh}>Retry grocery week</Button></div> : null}
    {week.data?.grocery?.calendarReviewRequired ? <p role="status" className="rounded-2xl bg-peach-100 p-4 text-sm font-semibold">This list was regrouped after your start of week changed. Review ingredients and carried grocery edits.</p> : null}
    {week.data ? <GroceryWeek key={`${snapshot.userId}:${weekOf}`} week={week.data} disabled={disabled} /> : null}
  </div>;
}

function GroceryWeek({ week, disabled }: { week: NutritionWeekReadModel; disabled: boolean }) {
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


      <div className="mt-3 flex flex-wrap gap-2 sm:flex-nowrap">
        <input
          value={name}
          onChange={(e) => {
            suppressDraftWriteRef.current = false;
            setName(e.target.value);
          }}
          placeholder="Item"
          className="input min-w-0 basis-full sm:basis-0 sm:flex-1"
          aria-label="Extra grocery item name"
        />
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
            <div className="flex items-center gap-1"><h2 className="font-extrabold">Grocery list</h2><HelpPopover title="Grocery list"><p>This list comes from the selected week&apos;s planned meals, with recipe quantities scaled by planned servings divided by recipe yield. Skipped meals and unmeasured garnishes are excluded.</p><p>Checked items, quantity edits, removals, and extra items stay with this week. Regenerate recalculates the plan quantities while preserving your adjustments.</p></HelpPopover></div>
          </div>
          <Button variant="soft" className="!min-h-11 !px-3 text-xs" disabled={disabled} onClick={() => actions.regenerateGrocery(week)}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Regenerate
          </Button>
        </div>

        {customItemEditor}
      </Card>

      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,28rem),1fr))] gap-3">
        {categories.map((category) => {
          const items = visible.filter((i) => i.category === category);
          if (items.length === 0) return null;
          return (
            <Card key={category} className="!p-[16px]">
              <h3 className="font-extrabold">{category}</h3>
              <ul className="mt-2 grid gap-1">
                {items.map((item) => {
                  const adjusted = item.quantity !== item.generatedQuantity;
                  return (
                    <li
                      key={item.id}
                      className={`grid min-w-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-x-[8px] gap-y-[4px] rounded-xl px-[8px] py-[6px] ${
                        item.checked ? "bg-mint-50" : "bg-cream"
                      }`}
                    >
                      <label className="col-start-1 row-start-1 grid h-[44px] w-[44px] place-items-center">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          disabled={disabled}
                          onChange={() => actions.toggleGrocery(item.id, week)}
                          aria-label={`Mark ${item.name} as done`}
                          className="h-5 w-5 accent-lav-500"
                        />
                      </label>
                      <div className="col-span-2 col-start-2 row-start-1 min-w-0">
                        <p className={`break-words text-sm font-bold [overflow-wrap:anywhere] ${item.checked ? "line-through opacity-60" : ""}`}>
                          {item.name}
                          {item.custom ? (
                            <span className="ml-1 rounded-full bg-lav-100 px-1.5 text-[9px] uppercase">custom</span>
                          ) : null}
                        </p>
                        <p className="text-[10px] font-semibold text-muted">
                          generated {item.generatedQuantity} {item.unit}
                          {item.carriedFromWeek ? ` | Carried from ${item.carriedFromWeek}` : ""}
                          {adjusted ? " · adjusted by you" : ""}
                        </p>
                      </div>
                      <span className="col-span-3 col-start-1 row-start-2 min-w-0 break-words text-center text-sm font-extrabold tabular-nums">
                        {item.quantity} <span className="text-xs font-bold text-muted">{item.unit}</span>
                      </span>
                      <div className="col-span-2 col-start-1 row-start-3 flex min-w-0 items-center justify-center gap-[8px]">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => actions.setGroceryQuantity(item.id, Math.max(0, item.quantity - 1), week)}
                          aria-label={`Decrease ${item.name}`}
                          className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full bg-white"
                        >
                          <Minus className="h-3 w-3" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => actions.setGroceryQuantity(item.id, item.quantity + 1, week)}
                          aria-label={`Increase ${item.name}`}
                          className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full bg-white"
                        >
                          <Plus className="h-3 w-3" aria-hidden />
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => actions.removeGroceryItem(item.id, week)}
                        aria-label={`Remove ${item.name}`}
                        className="col-start-3 row-start-3 grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full bg-white"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>

    </div>
  );
}
