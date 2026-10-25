import type { MealEntryReview } from "@/utility/mealEntryReview";

export function MealEntryWarnings({ review }: { review: MealEntryReview }) {
  if (!review.warnings.length && !review.dailyWarnings.length) return null;
  return <section className="grid min-w-0 gap-2 text-xs [overflow-wrap:anywhere]" aria-label="Planning assessment">
    <h4 className="font-extrabold">Before you plan</h4>
    <ul className="grid gap-2">
      {review.warnings.map(warning => <li key={`${warning.code}-${warning.message}`} className={warning.code === "avoided-food" ? "rounded-lg bg-danger-100 p-2 font-semibold text-danger-900" : "text-ink-soft"}>{warning.message}</li>)}
      {review.dailyWarnings.map(warning => <li key={warning.date} className="text-ink-soft"><span className="font-bold">{warning.date}: </span>{warning.message}{warning.totalCarbs === null ? <span className="block">Your preference: {warning.limit} g total carbs.</span> : null}{warning.recipeIds.length ? <span className="block">Contributing recipes: {warning.recipeIds.map(id => warning.recipeNames?.[id] ?? "Recipe unavailable").join(", ")}.</span> : null}</li>)}
    </ul>
    <p className="text-ink-soft">Add to plan keeps this portion with the assessment shown here. Preferences do not prevent planning.</p>
  </section>;
}
