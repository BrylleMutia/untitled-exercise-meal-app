import type { Food } from "@/types/domain";
import { ingredientConversionBases, recipeUnitConversion, type RecipeIngredientDraft } from "@/utility/recipeEditor";
import { Button } from "@/components/ui/Button";

export function RecipeConversionConfirmation({ item, food, onChange }: {
  item: RecipeIngredientDraft; food: Food | null; onChange: (patch: Partial<RecipeIngredientDraft>) => void;
}) {
  const pending = item.pendingConversion;
  if (!pending) return null;
  const working = { ...item, conversionBases: [...(Array.isArray(pending.bases) ? pending.bases : []), ...ingredientConversionBases(item)] };
  const unresolved = recipeUnitConversion(working, food, pending.unit);
  const factorUnit = unresolved.status === "confirmation" ? unresolved.factorUnit : pending.unit;
  const factor = pending.gramsPerUnit.trim() ? Number(pending.gramsPerUnit) : NaN;
  const factorValid = Number.isFinite(factor) && factor > 0 && factor <= 1000000;
  const extra = { unit: factorUnit, gramsPerUnit: factor };
  const preview = factorValid ? recipeUnitConversion(working, food, pending.unit, extra) : null;
  const hasAmount = item.quantity.trim() !== "" && (item.measurementKind !== "range" || Boolean(item.upperQuantity?.trim()));
  const formatted = (value: string) => Number(value).toLocaleString("en", { maximumFractionDigits: 6 });
  return <section data-conversion-confirmation aria-label={`Confirm conversion for ${item.name}`} className="grid min-w-0 gap-2 sm:col-span-2">
    <h4 className="text-sm font-bold">Confirm conversion</h4>
    <p className="break-words text-xs text-ink-soft">Keep {item.quantity || "the entered amount"}{item.measurementKind === "range" ? `–${item.upperQuantity || "upper amount"}` : ""} {item.unit}. Enter an ingredient-specific weight to convert to {pending.unit}; the original amount stays unchanged until confirmed.</p>
    <label className="grid min-w-0 grid-cols-1 gap-1 text-xs font-bold">Grams per 1 {factorUnit}
      <input key={factorUnit} autoFocus className="input min-w-0" aria-label={`${item.name} conversion grams per ${factorUnit}`} type="number" min="0.000001" max="1000000" step="any" value={pending.gramsPerUnit} onChange={event => onChange({ pendingConversion: { ...pending, gramsPerUnit: event.target.value } })} />
    </label>
    {pending.gramsPerUnit.trim() && !factorValid ? <p role="alert" className="text-xs font-semibold">Enter a positive finite weight up to 1,000,000 g.</p> : null}
    {preview?.status === "converted" && hasAmount ? <p role="status" className="break-words text-xs font-semibold">Converted quantity: ≈{formatted(preview.patch.quantity)}{item.measurementKind === "range" ? `–${formatted(preview.patch.upperQuantity!)}` : ""} {preview.patch.unit}. Nutrition keeps the same ingredient weight.</p> : null}
    {preview?.status === "confirmation" ? <p className="text-xs text-ink-soft">This confirms {factorUnit}. The next step needs the weight of one {preview.factorUnit}.</p> : null}
    {preview?.status === "invalid" ? <p role="alert" className="text-xs font-semibold">Check the original quantity, range and converted amount.</p> : null}
    <div className="flex min-w-0 flex-wrap gap-2">
      <Button className="!px-3 text-xs" disabled={!factorValid || !hasAmount || !preview || preview.status === "invalid"} onClick={() => {
        if (preview?.status === "converted") onChange(preview.patch);
        else if (preview?.status === "confirmation") onChange({ pendingConversion: { unit: pending.unit, gramsPerUnit: "", bases: [extra, ...(pending.bases ?? [])] } });
      }}>Confirm conversion</Button>
      <Button variant="soft" className="!px-3 text-xs" onClick={() => onChange({ pendingConversion: undefined })}>Cancel conversion</Button>
    </div>
  </section>;
}
