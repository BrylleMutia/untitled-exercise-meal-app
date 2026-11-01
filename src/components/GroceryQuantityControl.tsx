"use client";
import { cookingUnitLabel } from "@/utility/cookingUnits";

import { useId, type ReactNode, type Ref } from "react";
import { Minus, Plus } from "lucide-react";
import { MAX_GROCERY_QUANTITY, parseGroceryQuantity, stepGroceryQuantity } from "@/utility/groceryQuantity";

type GroceryQuantityControlProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  unit: string;
  unitControl?: ReactNode;
  minimum?: number;
  disabled?: boolean;
  inputId?: string;
  inputRef?: Ref<HTMLInputElement>;
  describedBy?: string;
  className?: string;
  size?: "default" | "large";
};

export function GroceryQuantityControl({ value, onChange, label, decreaseLabel, increaseLabel, unit, unitControl, minimum = 0, disabled = false, inputId, inputRef, describedBy, className = "", size = "default" }: GroceryQuantityControlProps) {
  const generatedId = useId();
  const id = inputId ?? generatedId;
  const unitId = `${id}-unit`;
  const errorId = `${id}-validation`;
  const quantity = parseGroceryQuantity(value, minimum);
  const invalid = quantity === null;
  const heightClass = size === "large" ? "min-h-[48px]" : "min-h-[44px]";
  const buttonClass = `grid ${size === "large" ? "h-[48px] w-[48px]" : "h-[44px] w-[44px]"} place-items-center rounded-xl text-ink hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lav-500`;
  function step(direction: -1 | 1) {
    const next = stepGroceryQuantity(value, direction, minimum);
    if (!disabled && next !== null) onChange(next);
  }
  return <div className={`min-w-0 ${className}`}>
    <div role="group" aria-label={`${label} controls`} className="grid min-w-0 grid-cols-[minmax(44px,1fr)_auto] items-start gap-1">
      <div className={`@container min-w-0 rounded-xl bg-white ${invalid ? "ring-1 ring-inset ring-danger-600" : ""}`}>
        <div className={`grid min-w-0 grid-cols-1 items-center @[88px]:grid-cols-2 ${size === "large" ? "@[160px]:grid-cols-[48px_minmax(44px,1fr)_48px]" : "@[160px]:grid-cols-[44px_minmax(44px,1fr)_44px]"}`}>
          <button type="button" disabled={disabled || invalid || quantity <= minimum} onClick={() => step(-1)} aria-label={decreaseLabel} className={`${buttonClass} col-start-1 row-start-2 justify-self-start @[160px]:row-start-1`}><Minus className="h-4 w-4" aria-hidden /></button>
          <label htmlFor={id} className="col-start-1 row-start-1 grid min-w-0 @[88px]:col-span-2 @[160px]:col-span-1 @[160px]:col-start-2">
            <span className="sr-only">{label}</span>
            <input ref={inputRef} id={id} inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} aria-label={label} aria-invalid={invalid} aria-describedby={[unitId, describedBy, invalid && !describedBy ? errorId : undefined].filter(Boolean).join(" ")} className={`${heightClass} w-full min-w-0 bg-transparent px-[2px] text-center text-sm font-extrabold tabular-nums outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-lav-500 ${invalid ? "text-danger-900" : ""}`} />
          </label>
          <button type="button" disabled={disabled || invalid || quantity >= MAX_GROCERY_QUANTITY} onClick={() => step(1)} aria-label={increaseLabel} className={`${buttonClass} col-start-1 row-start-3 justify-self-end @[88px]:col-start-2 @[88px]:row-start-2 @[160px]:col-start-3 @[160px]:row-start-1`}><Plus className="h-4 w-4" aria-hidden /></button>
        </div>
      </div>
      {unitControl ? <><span id={unitId} className="sr-only">{cookingUnitLabel(unit, quantity ?? undefined)}</span>{unitControl}</> : <span id={unitId} className={`flex ${heightClass} items-center text-xs font-bold text-muted`}>{cookingUnitLabel(unit, quantity ?? undefined)}</span>}
    </div>
    {invalid && !describedBy ? <p id={errorId} role="alert" className="mt-1 break-words text-xs text-danger-900">Enter a quantity from {minimum} to 1,000,000 using a decimal point if needed.</p> : null}
  </div>;
}
