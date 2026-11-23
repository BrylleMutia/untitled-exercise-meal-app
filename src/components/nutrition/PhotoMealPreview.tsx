import { NutritionPills } from "@/components/ui/NutritionPills";
import { Button } from "@/components/ui/Button";
import { photoPreview, type GuidedIngredient } from "@/utility/guidedMealReview";

export function PhotoMealPreview({ items, questions, loading, onReview }: { items: GuidedIngredient[]; questions: string[]; loading: boolean; onReview?: () => void }) {
  const { total, missing, partial, known } = photoPreview(items);
  return <section className="grid gap-3 rounded-2xl bg-lav-50 p-4" aria-label="Photo macro estimate" aria-live="polite">
    <h3 className="text-lg font-extrabold">{loading ? "Matching meal ingredients…" : partial ? "Partial estimate" : "Rough estimate"}</h3>
    <p className="text-sm font-semibold">Low confidence · portions need review</p>
    {known > 0 ? <>
      <NutritionPills label={partial ? "Known foods only" : "Photo meal estimate"} values={{ calories: total.calories.base, proteinG: total.proteinG.base, carbsG: total.carbsG.base, fatG: total.fatG.base }} precision={0} approximate />
      <p className="text-sm">Portion range: {Math.round(total.calories.low)}–{Math.round(total.calories.high)} kcal · Protein {Math.round(total.proteinG.low)}–{Math.round(total.proteinG.high)} g · Carbs {Math.round(total.carbsG.low)}–{Math.round(total.carbsG.high)} g · Fat {Math.round(total.fatG.low)}–{Math.round(total.fatG.high)} g</p>
    </> : <p className="text-sm">No usable nutrition match yet. Review the foods and portions or enter your values.</p>}
    {missing.length ? <p className="text-sm font-semibold">Not included in these totals: {missing.join(", ")}. This is not a complete meal estimate.</p> : null}
    <ul className="grid gap-1 text-sm">{items.map(item => <li key={item.id}>{item.name} · {item.quantity > 0 ? `${item.quantity} ${item.unit} assumed` : "amount unknown"}{!item.included ? " · excluded" : ""}</li>)}</ul>
    <p className="text-xs text-ink-soft">These ranges reflect portion assumptions, not guaranteed bounds. Hidden oils, sauces, and ingredients may change the result.</p>
    {questions.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{questions.map((question, index) => <li key={index}>{question}</li>)}</ul> : null}
    {onReview ? <Button disabled={loading} onClick={onReview}>Review meal</Button> : null}
  </section>;
}
