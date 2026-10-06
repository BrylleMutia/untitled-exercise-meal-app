"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { HelpPopover } from "@/components/ui/HelpPopover";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/EmptyState";
import type { GroceryCategory } from "@/types/domain";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";

const categories: GroceryCategory[] = ["Produce", "Protein", "Dairy", "Grains", "Pantry", "Other"];

export default function GroceryPage() {
  const { snapshot, actions } = useApp();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [draftReady, setDraftReady] = useState(false);
  const [draftWasRestored, setDraftWasRestored] = useState(false);
  const [draftWriteUnavailable, setDraftWriteUnavailable] = useState(false);
  const suppressDraftWriteRef = useRef(false);

  const list = snapshot.grocery;
  const userId = snapshot.userId;
  const draftType = "grocery-custom";

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void readDraft<{ name: string; quantity: string; unit: string }>(userId, draftType).then((saved) => {
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
  }, [draftType, userId]);

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
  }, [draftReady, list?.revision, name, quantity, unit, userId]);

  const customItemEditor = (
    <>
      {draftWasRestored ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-mint-100 px-3 py-2 text-xs font-bold" role="status">
          <span>Custom-item draft restored from this device.</span>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => {
              if (userId) void clearDraft(userId, draftType);
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
          placeholder="Item name"
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
          disabled={!name.trim()}
          onClick={async () => {
            const saved = await actions.addCustomGrocery(
              name.trim(),
              Math.max(1, Number(quantity) || 1),
              unit,
            );
            if (!saved) return;
            if (userId) void clearDraft(userId, draftType);
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
    </>
  );

  if (!list || list.items.length === 0) {
    return (
      <div className="grid gap-4 pb-4">
        <EmptyState
          title="No grocery list yet"
          message="Generate a meal plan to create a grocery list."
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
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1"><h2 className="font-extrabold">This week&apos;s list</h2><HelpPopover title="This week's list"><p>The list comes from planned meals. Generated quantities and your adjustments remain separate.</p><p>Checked items, quantity edits, removals, and extra items survive regeneration. Changed generated amounts are shown rather than silently replacing your edits.</p><p>You can also add items outside the meal plan.</p></HelpPopover></div>
          </div>
          <Button variant="soft" className="!min-h-11 !px-3 text-xs" onClick={actions.regenerateGrocery}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Regenerate
          </Button>
        </div>

        {customItemEditor}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {categories.map((category) => {
          const items = visible.filter((i) => i.category === category);
          if (items.length === 0) return null;
          return (
            <Card key={category} className="p-4">
              <h3 className="font-extrabold">{category}</h3>
              <ul className="mt-2 grid gap-1">
                {items.map((item) => {
                  const adjusted = item.quantity !== item.generatedQuantity;
                  return (
                    <li
                      key={item.id}
                      className={`grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-2 gap-y-1 rounded-xl px-2 py-1.5 sm:grid-cols-[2.75rem_minmax(0,1fr)_8.5rem_2rem_2.75rem] ${
                        item.checked ? "bg-mint-50" : "bg-cream"
                      }`}
                    >
                      <label className="grid h-11 w-11 place-items-center">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => actions.toggleGrocery(item.id)}
                          aria-label={`Mark ${item.name} as done`}
                          className="h-5 w-5 accent-lav-500"
                        />
                      </label>
                      <div className="col-start-2 row-start-1 min-w-0 sm:col-auto sm:row-auto">
                        <p className={`break-words text-sm font-bold sm:truncate ${item.checked ? "line-through opacity-60" : ""}`}>
                          {item.name}
                          {item.custom ? (
                            <span className="ml-1 rounded-full bg-lav-100 px-1.5 text-[9px] uppercase">custom</span>
                          ) : null}
                        </p>
                        <p className="text-[10px] font-semibold text-muted">
                          generated {item.generatedQuantity} {item.unit}
                          {adjusted ? " · adjusted by you" : ""}
                        </p>
                      </div>
                      <div className="col-start-2 row-start-2 flex shrink-0 items-center gap-1 sm:col-auto sm:row-auto">
                        <button
                          type="button"
                          onClick={() => actions.setGroceryQuantity(item.id, Math.max(0, item.quantity - 1))}
                          aria-label={`Decrease ${item.name}`}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white"
                        >
                          <Minus className="h-3 w-3" aria-hidden />
                        </button>
                        <span className="w-10 shrink-0 text-center text-sm font-extrabold tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => actions.setGroceryQuantity(item.id, item.quantity + 1)}
                          aria-label={`Increase ${item.name}`}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white"
                        >
                          <Plus className="h-3 w-3" aria-hidden />
                        </button>
                      </div>
                      <span className="col-start-3 row-start-2 w-8 shrink-0 text-xs font-bold text-muted sm:col-auto sm:row-auto">{item.unit}</span>
                      <button
                        type="button"
                        onClick={() => actions.removeGroceryItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="col-start-3 row-start-1 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white sm:col-auto sm:row-auto"
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
