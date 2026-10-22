import type { Food } from "@/types/domain";
import { cookingGramsPerUnit } from "@/utility/cookingMeasurement";
import { ingredientDraftServing, type RecipeIngredientDraft } from "@/utility/recipeEditor";
import { Button } from "@/components/ui/Button";

export function RecipeNutritionBasis({ ingredients, review = [], foods, notes, hasUnmeasured, onIngredient, onReviewIngredient, onReview, onNotes, onIngredients }: {
  ingredients: RecipeIngredientDraft[]; foods: Food[]; notes: string; hasUnmeasured: boolean;
  review?: RecipeIngredientDraft[];
  onReviewIngredient?: (id: string, patch: Partial<RecipeIngredientDraft>) => void;
  onReview?: () => void;
  onIngredient: (id: string, patch: Partial<RecipeIngredientDraft>) => void;
  onNotes: (value: string) => void; onIngredients: () => void;
}) {
  return <section className="grid min-w-0 gap-3 [overflow-wrap:anywhere]" aria-label="Nutrition basis">
    <h3 className="text-sm font-extrabold">Nutrition basis</h3>
    <p className="text-xs text-ink-soft">Ranges use the upper amount. Cooking units require a known or confirmed conversion; no volume or piece weight is guessed.</p>
    {hasUnmeasured ? <p className="text-xs text-ink-soft">Unmeasured seasonings are excluded from nutrition and generated grocery quantities.</p> : null}
    {([{ label: "Recipe ingredients", items: ingredients, onChange: onIngredient, reviewing: false }, { label: "Ingredients awaiting addition", items: review, onChange: onReviewIngredient, reviewing: true }]).map(group => group.items.length || !group.reviewing ? <section key={group.label} className="grid min-w-0 gap-3" aria-label={group.label}>
    <h4 className="text-sm font-bold">{group.label}</h4>
    {group.reviewing ? <p className="text-xs text-ink-soft">Confirming a nutrition source does not establish a cooking weight or add an ingredient. Return to ingredient review and choose Add selected ingredients when ready.</p> : null}
    {!group.items.length ? <p className="text-xs text-ink-soft">No ingredients added yet.</p> : null}
    <ul className="grid min-w-0 gap-3">{group.items.map(item => {
      const food = foods.find(food => food.id === item.food?.id) ?? item.food;
      const portion = food ? ingredientDraftServing(item, food) : null;
      const known = food ? cookingGramsPerUnit(item.unit, food) : null;
      const needsConversion = item.measurementKind !== "unmeasured" && !["g", "kg", "mg", "oz", "lb", "serving"].includes(item.unit) && !(item.unit === "piece" && food?.unit === "piece");
      const invalidFactor = Boolean(item.gramsPerUnit?.trim()) && (!Number.isFinite(Number(item.gramsPerUnit)) || Number(item.gramsPerUnit) <= 0 || Number(item.gramsPerUnit) > 1000000);
      return <li key={item.id} data-nutrition-basis-id={item.id} tabIndex={-1} className="grid min-w-0 grid-cols-1 gap-2 rounded-xl bg-cream p-3 outline-offset-4">
        <p className="break-words text-xs font-bold">{item.name}</p>
        {group.reviewing ? <p className="text-xs font-semibold">{item.included ? "Selected for addition" : "Not selected for addition"}</p> : null}
        <p className="break-words text-xs text-ink-soft">{food ? `${food.name} · ${food.preparationBasis ?? "basis unknown"} · ${food.source}` : "Nutrition source unresolved. Match the ingredient in Ingredients."}</p>
        <p className="text-xs text-ink-soft">{portion && food ? `${Number((portion.servings * food.servingGrams).toPrecision(12))} g used for nutrition` : "Nutrition quantity unresolved."}{item.measurementKind === "range" ? " Upper range amount used." : ""}{item.optional ? " Optional ingredient included in this calculation." : ""}</p>
        {needsConversion ? <label className="grid min-w-0 grid-cols-1 gap-1 text-xs font-bold">Confirmed grams per {item.unit}
          <input className="input min-w-0 !px-2" type="number" min="0.000001" max="1000000" step="any" aria-label={`${item.name} grams per ${item.unit}`} aria-invalid={invalidFactor} aria-describedby={invalidFactor ? `${item.id}-factor-error` : undefined} value={item.gramsPerUnit ?? (known === null ? "" : String(known))} onChange={event => group.onChange?.(item.id, { gramsPerUnit: event.target.value })} />
          <span className="font-normal text-ink-soft">Use a measured weight or a reliable ingredient-specific conversion.</span>
          {invalidFactor ? <span id={`${item.id}-factor-error`} role="alert" className="text-danger-900">Enter a positive finite weight up to 1,000,000 g.</span> : null}
        </label> : null}
        {item.measurementKind === "unmeasured" && food ? <label className="grid min-w-0 grid-cols-1 gap-1 text-xs font-bold">Assumed nutrition amount (g)
          <input className="input min-w-0 !px-2" type="number" min="0.0001" step="any" aria-label={`${item.name} assumed nutrition grams`} value={item.nutritionServings === undefined ? "" : String(Number((item.nutritionServings * food.servingGrams).toPrecision(12)))} onChange={event => group.onChange?.(item.id, { nutritionServings: event.target.value.trim() ? Number(event.target.value) / food.servingGrams : undefined })} />
          <span className="font-normal text-ink-soft">The cooking source did not quantify this item; this explicit assumption supports nutrition or groceries.</span>
        </label> : null}
        {item.assumptions.length ? <p className="text-xs text-ink-soft">{item.assumptions.join(" ")}</p> : null}
      </li>;
    })}</ul>
    {group.reviewing ? <Button variant="ghost" className="w-fit !px-2 text-xs underline" onClick={onReview}>Return to ingredient review</Button> : null}
    </section> : null)}
    <Button variant="ghost" className="w-fit !px-2 text-xs underline" onClick={onIngredients}>Edit cooking ingredients</Button>
    <label className="grid min-w-0 grid-cols-1 gap-1 text-xs font-bold">Nutrition notes
      <textarea className="input min-h-24 min-w-0 resize-y !py-3" maxLength={10000} value={notes} onChange={event => onNotes(event.target.value)} placeholder="Calculation assumptions, exclusions, and sources" />
    </label>
  </section>;
}
