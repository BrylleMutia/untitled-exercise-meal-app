"use client";

import { useState } from "react";
import { Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/EmptyState";
import type { GroceryCategory } from "@/types/domain";

const categories: GroceryCategory[] = ["Produce", "Protein", "Dairy", "Grains", "Pantry", "Other"];

export default function GroceryPage() {
  const { snapshot, actions } = useApp();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pcs");

  const list = snapshot.grocery;

  if (!list || list.items.length === 0) {
    return (
      <EmptyState
        title="No grocery list yet"
        message="A meal plan creates one automatically. Generate a plan first, then tweak here — your checks and edits stay put on regenerations."
      />
    );
  }

  const visible = list.items.filter((item) => !item.removed);

  return (
    <div className="grid gap-4 pb-4">
      <Card tone="mint">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-extrabold">This week&apos;s list</h2>
            <p className="text-xs font-semibold text-ink-soft">
              From {snapshot.plan?.workouts.length ?? 0} workouts and one week of
              planned meals · generated vs. adjusted quantities are kept separate.
            </p>
          </div>
          <Button variant="soft" className="!min-h-11 !px-3 text-xs" onClick={actions.regenerateGrocery}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Regenerate
          </Button>
        </div>

        {/* Add custom item */}
        <div className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Custom item (e.g. dish soap)"
            className="input flex-1"
            aria-label="Custom item name"
          />
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="input w-16"
            inputMode="numeric"
            aria-label="Quantity"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="input w-20"
            aria-label="Unit"
          >
            <option value="pcs">pcs</option>
            <option value="g">g</option>
            <option value="ml">ml</option>
          </select>
          <Button
            className="!min-h-12 !px-4"
            disabled={!name.trim()}
            onClick={() => {
              actions.addCustomGrocery(name.trim(), Math.max(1, Number(quantity) || 1), unit);
              setName("");
              setQuantity("1");
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
        </div>
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
                      className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${
                        item.checked ? "bg-mint-50" : "bg-cream"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => actions.toggleGrocery(item.id)}
                        aria-label={`Mark ${item.name} as done`}
                        className="h-5 w-5 accent-lav-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-bold ${item.checked ? "line-through opacity-60" : ""}`}>
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
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => actions.setGroceryQuantity(item.id, Math.max(0, item.quantity - 1))}
                          aria-label={`Decrease ${item.name}`}
                          className="grid h-11 w-11 place-items-center rounded-full bg-white"
                        >
                          <Minus className="h-3 w-3" aria-hidden />
                        </button>
                        <span className="w-10 text-center text-sm font-extrabold tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => actions.setGroceryQuantity(item.id, item.quantity + 1)}
                          aria-label={`Increase ${item.name}`}
                          className="grid h-11 w-11 place-items-center rounded-full bg-white"
                        >
                          <Plus className="h-3 w-3" aria-hidden />
                        </button>
                      </div>
                      <span className="w-8 text-xs font-bold text-muted">{item.unit}</span>
                      <button
                        type="button"
                        onClick={() => actions.removeGroceryItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="grid h-11 w-11 place-items-center rounded-full bg-white"
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

      <p className="text-center text-[11px] font-semibold text-muted">
        Checked items, your quantity edits, removals, and custom items survive
        regeneration — changed generated amounts are shown, never silently
        overwritten.
      </p>
    </div>
  );
}
