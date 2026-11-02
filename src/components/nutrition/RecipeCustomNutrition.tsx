import type { RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { NutritionFieldLabel } from "@/components/ui/NutritionPills";
import type { GroceryCategory, PreparationBasis } from "@/types/domain";

export type CustomNutritionDraft = { name: string; servingLabel: string; grams: string; unit: "g" | "piece"; preparation: PreparationBasis; category: GroceryCategory; calories: string; proteinG: string; carbsG: string; fatG: string; fiberG: string };
export const blankCustomNutrition = (): CustomNutritionDraft => ({ name: "", servingLabel: "", grams: "", unit: "g", preparation: "unknown", category: "Other", calories: "", proteinG: "", carbsG: "", fatG: "", fiberG: "" });
const metrics = ["calories", "proteinG", "carbsG", "fatG", "fiberG"] as const;
const categories: GroceryCategory[] = ["Produce", "Protein", "Dairy", "Grains", "Pantry", "Other"];

interface Props {
  value: CustomNutritionDraft;
  valid: boolean;
  optional: boolean;
  nameRef: RefObject<HTMLInputElement | null>;
  onChange: (patch: Partial<CustomNutritionDraft>) => void;
  onUse: () => void;
  onBack?: () => void;
}

export function RecipeCustomNutrition({ value, valid, optional, nameRef, onChange, onUse, onBack }: Props) {
  return <div className="grid min-w-0 gap-2 sm:col-span-2" role="group" aria-label={optional ? "Optional ingredient nutrition" : "Custom ingredient"}>
    <h4 className="text-sm font-bold">{optional ? "Ingredient nutrition (optional)" : "Custom ingredient"}</h4>
    <p className="text-xs text-ink-soft">{optional
      ? "To use this optional nutrition record, enter a serving label, grams per serving, and all four macro values. Your cooking measurement and recipe-wide macros stay as entered."
      : "Enter nutrition for one labeled serving. This ingredient is saved with your recipe."}</p>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      {([['name', 'Ingredient name'], ['servingLabel', 'Serving label'], ['grams', 'Grams per serving']] as const).map(([key, label]) => <label key={key} className="grid min-w-0 gap-1 text-xs font-bold">{label}
        <input ref={key === "name" ? nameRef : undefined} className="input" aria-label={`Custom ${label.toLowerCase()}`} type={key === "grams" ? "number" : "text"} step="any" min={key === "grams" ? "0.1" : undefined} maxLength={256} value={value[key]} placeholder={key === "servingLabel" ? "e.g. 1 scoop (30 g)" : label} onChange={event => onChange({ [key]: event.target.value })} />
      </label>)}
      <label className="grid min-w-0 gap-1 text-xs font-bold">Serving type<select className="input" value={value.unit} onChange={event => onChange({ unit: event.target.value as CustomNutritionDraft["unit"] })}><option value="g">By weight</option><option value="piece">One piece per serving</option></select></label>
      <label className="grid min-w-0 gap-1 text-xs font-bold">Preparation<select className="input" value={value.preparation} onChange={event => onChange({ preparation: event.target.value as PreparationBasis })}>{["unknown", "raw", "cooked", "baked", "dry", "prepared", "as_labeled"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
      <label className="grid min-w-0 gap-1 text-xs font-bold">Grocery category<select className="input" value={value.category} onChange={event => onChange({ category: event.target.value as GroceryCategory })}>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">{metrics.map(metric => <NutritionFieldLabel key={metric} metric={metric}>
      <input className="input" type="number" min="0" max="10000" step="any" aria-label={`Custom ${metric === "calories" ? "calories" : metric === "fiberG" ? "fiber (optional)" : metric.replace("G", "")}`} placeholder={metric === "fiberG" ? "Optional" : optional ? "Required to use nutrition" : "Required"} value={value[metric]} onChange={event => onChange({ [metric]: event.target.value })} />
    </NutritionFieldLabel>)}</div>
    <div className="flex flex-wrap gap-2">
      <Button variant="soft" className="w-fit !px-3 text-xs" disabled={!valid} onClick={onUse}>{onBack ? "Use ingredient nutrition" : "Add custom ingredient to recipe"}</Button>
      {onBack ? <Button variant="ghost" className="w-fit !px-3 text-xs" onClick={onBack}>Back to ingredient</Button> : null}
    </div>
    {optional ? <p className="text-xs text-ink-soft">Until you choose Use ingredient nutrition, these values are a draft and will not be applied when saving the recipe.</p> : null}
  </div>;
}
