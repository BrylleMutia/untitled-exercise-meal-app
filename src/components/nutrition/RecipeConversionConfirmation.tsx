import type { Food } from "@/types/domain";
import { useEffect, useState } from "react";
import { ingredientConversionBases, recipeUnitConversion, type RecipeIngredientDraft } from "@/utility/recipeEditor";
import { Button } from "@/components/ui/Button";
import { savedConversionChoices } from "@/utility/ingredientConversions";
import type { IngredientConversionCandidate } from "@/types/backend";

export function RecipeConversionConfirmation({ item, food, onChange, savedCandidates, loading = false, lookupError = false, loadCandidates, optional = false }: {
  item: RecipeIngredientDraft; food: Food | null; onChange: (patch: Partial<RecipeIngredientDraft>) => void;
  savedCandidates?: IngredientConversionCandidate[]; loading?: boolean; lookupError?: boolean;
  loadCandidates?: (foodIds: string[]) => Promise<IngredientConversionCandidate[]>;
  optional?: boolean;
}) {
  const [replacement, setReplacement] = useState<{ unit: string; quantity: string; upper: string } | null>(null);
  const pending = item.pendingConversion;
  const foodId = food?.id, pendingUnit = pending?.unit;
  const [restoredLookup, setRestoredLookup] = useState<{ candidates: IngredientConversionCandidate[]; loading: boolean; error: boolean }>({ candidates: [], loading: false, error: false });
  useEffect(() => {
    if (savedCandidates || !loadCandidates || !foodId || !pendingUnit) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setRestoredLookup({ candidates: [], loading: true, error: false });
      try {
        const candidates = await loadCandidates([foodId]);
        if (active) setRestoredLookup({ candidates, loading: false, error: false });
      } catch { if (active) setRestoredLookup({ candidates: [], loading: false, error: true }); }
    });
    return () => { active = false; };
  }, [savedCandidates, loadCandidates, foodId, pendingUnit]);
  if (!pending) return null;
  const working = { ...item, conversionBases: [...(Array.isArray(pending.bases) ? pending.bases : []), ...ingredientConversionBases(item)] };
  const unresolved = recipeUnitConversion(working, food, pending.unit);
  const factorUnit = pending.factorUnit ?? (unresolved.status === "confirmation" ? unresolved.factorUnit : pending.unit);
  const savedChoices = food ? savedConversionChoices(savedCandidates ?? restoredLookup.candidates, food.id, factorUnit) : [];
  const factor = pending.gramsPerUnit.trim() ? Number(pending.gramsPerUnit) : NaN;
  const factorValid = Number.isFinite(factor) && factor > 0 && factor <= 1000000;
  const extra = { unit: factorUnit, gramsPerUnit: factor };
  const preview = factorValid ? recipeUnitConversion(working, food, pending.unit, extra) : null;
  const hasAmount = item.quantity.trim() !== "" && (item.measurementKind !== "range" || Boolean(item.upperQuantity?.trim()));
  const formatted = (value: string) => Number(value).toLocaleString("en", { maximumFractionDigits: 6 });
  return <section data-conversion-confirmation aria-label={`Confirm conversion for ${item.name}`} className="grid min-w-0 gap-2 sm:col-span-2">
    <h4 className="text-sm font-bold">Confirm conversion</h4>
    {optional ? <p className="text-xs text-ink-soft">Conversion is optional. Saving now keeps the original measurement; this unfinished conversion will not be applied.</p> : null}
    <p className="break-words text-xs text-ink-soft">Keep {item.quantity || "the entered amount"}{item.measurementKind === "range" ? `–${item.upperQuantity || "upper amount"}` : ""} {item.unit}. Enter an ingredient-specific weight to convert to {pending.unit}; the original amount stays unchanged until confirmed.</p>
    {loading || !savedCandidates && restoredLookup.loading ? <p role="status" className="text-xs">Checking saved conversions… You can enter a weight manually.</p> : null}
    {lookupError || !savedCandidates && restoredLookup.error ? <p role="status" className="text-xs">Saved conversions are unavailable. Confirm this conversion manually.</p> : null}
    {savedChoices.length ? <fieldset className="grid min-w-0 gap-2"><legend className="text-xs font-bold">{savedChoices.length > 1 ? "Saved weights differ. Choose a value or enter your own." : "Saved conversion"}</legend>
      {savedChoices.map(choice => <label key={`${choice.unit}:${choice.gramsPerUnit}`} className="flex min-h-11 min-w-0 items-start gap-2 rounded-xl bg-white/70 p-2 text-xs">
        <input className="mt-1 shrink-0" type="radio" name={`conversion-${item.id}-${factorUnit}`} checked={pending.gramsPerUnit === String(choice.gramsPerUnit)} onChange={() => onChange({ pendingConversion: { ...pending, gramsPerUnit: String(choice.gramsPerUnit) } })} />
        <span className="min-w-0 break-words"><strong>{choice.gramsPerUnit} g per {factorUnit}</strong><span className="block">{choice.sources.join(" · ")}</span></span>
      </label>)}
    </fieldset> : null}
    <label className="grid min-w-0 grid-cols-1 gap-1 text-xs font-bold">Grams per 1 {factorUnit}
      <input key={factorUnit} autoFocus className="input min-w-0" aria-label={`${item.name} conversion grams per ${factorUnit}`} type="number" min="0.000001" max="1000000" step="any" value={pending.gramsPerUnit} onChange={event => onChange({ pendingConversion: { ...pending, gramsPerUnit: event.target.value } })} />
    </label>
    {pending.gramsPerUnit.trim() && !factorValid ? <p role="alert" className="text-xs font-semibold text-danger-900">Enter a positive finite weight up to 1,000,000 g.</p> : null}
    {preview?.status === "converted" && hasAmount ? <p role="status" className="break-words text-xs font-semibold">Converted quantity: ≈{formatted(preview.patch.quantity)}{item.measurementKind === "range" ? `–${formatted(preview.patch.upperQuantity!)}` : ""} {preview.patch.unit}. Nutrition keeps the same ingredient weight.</p> : null}
    {preview?.status === "confirmation" ? <p className="text-xs text-ink-soft">This confirms {factorUnit}. The next step needs the weight of one {preview.factorUnit}.</p> : null}
    {preview?.status === "invalid" ? <p role="alert" className="text-xs font-semibold text-danger-900">Check the original quantity, range and converted amount.</p> : null}
    <div className="flex min-w-0 flex-wrap gap-2">
      <Button className="!px-3 text-xs" disabled={!factorValid || !hasAmount || !preview || preview.status === "invalid"} onClick={() => {
        if (preview?.status === "converted") onChange(preview.patch);
        else if (preview?.status === "confirmation") onChange({ pendingConversion: { unit: pending.unit, gramsPerUnit: "", bases: [extra, ...(pending.bases ?? [])] } });
      }}>Confirm conversion</Button>
      <Button variant="soft" className="!px-3 text-xs" onClick={() => onChange({ pendingConversion: undefined })}>{optional ? "Keep original" : "Cancel conversion"}</Button>
      {optional ? <Button variant="ghost" className="!px-3 text-xs" onClick={() => setReplacement({ unit: pending.unit, quantity: "", upper: "" })}>Enter a new measurement</Button> : null}
    </div>
    {optional && replacement?.unit === pending.unit ? <fieldset className="grid min-w-0 gap-2"><legend className="text-sm font-bold">New measurement in {pending.unit}</legend><p className="text-xs text-ink-soft">This replaces the cooking amount. It does not establish a weight conversion.</p><label className="grid gap-1 text-xs font-bold">New quantity<input className="input" type="number" min="0.000001" max="1000000" step="any" value={replacement.quantity} onChange={event => setReplacement({ ...replacement, quantity: event.target.value })} /></label>{item.measurementKind === "range" ? <label className="grid gap-1 text-xs font-bold">New upper quantity<input className="input" type="number" min="0.000001" max="1000000" step="any" value={replacement.upper} onChange={event => setReplacement({ ...replacement, upper: event.target.value })} /></label> : null}<Button variant="soft" className="w-fit" disabled={!replacement.quantity.trim() || !Number.isFinite(Number(replacement.quantity)) || Number(replacement.quantity) <= 0 || Number(replacement.quantity) > 1000000 || item.measurementKind === "range" && (!replacement.upper.trim() || !Number.isFinite(Number(replacement.upper)) || Number(replacement.upper) < Number(replacement.quantity) || Number(replacement.upper) > 1000000)} onClick={() => onChange({ unit: pending.unit, quantity: replacement.quantity, ...(item.measurementKind === "range" ? { upperQuantity: replacement.upper } : {}), gramsPerUnit: undefined, nutritionServings: undefined, pendingConversion: undefined, cookingText: undefined })}>Use new measurement</Button></fieldset> : null}
  </section>;
}
