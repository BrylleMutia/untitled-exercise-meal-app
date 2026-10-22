import type { PreferenceReview as Review } from "@/types/planningPreferences";
import { formatFullDate } from "@/utility/dates";
import { Button } from "@/components/ui/Button";

export const planningAcknowledgment = "I reviewed the assignments, recipe warnings (including allergy and dietary conflicts), portions, replacements, leftovers, unused servings, and unfilled meals, and want to save this plan.";

export function RecipeWarningReview({ review, disabled = false, onRemove, title = "Recipe warnings" }: { review: Review; disabled?: boolean; onRemove?: (id: string) => void; title?: string }) {
  const groups = new Map<string, Review["recipeWarnings"]>();
  for (const warning of review.recipeWarnings) groups.set(warning.recipeId, [...(groups.get(warning.recipeId) ?? []), warning]);
  if (!groups.size) return null;
  return <section className="grid min-w-0 gap-3" aria-label={title}><h3 className="font-extrabold">{title}</h3><p className="text-xs text-ink-soft">{onRemove ? "Warnings do not exclude these recipes. Review ingredients and preferences, remove recipes you do not want, or keep them in your selection." : "These warnings were recorded when this plan was generated. Review ingredients before preparing or eating; your current settings may differ."}</p><ul className="grid min-w-0 gap-2">{[...groups].map(([id, warnings]) => <li key={id} className={`grid min-w-0 gap-2 rounded-xl p-3 ${warnings.some(w => w.code === "avoided-food") ? "bg-danger-100 text-danger-900" : "bg-peach-50"}`}><p className="break-words font-bold">{warnings[0].recipeName}</p><ul className="grid gap-1 text-xs">{warnings.map(w => <li key={`${w.code}:${w.message}`} className="break-words">{w.message}</li>)}</ul>{onRemove ? <Button variant="soft" className="justify-self-start" disabled={disabled} onClick={() => onRemove(id)} aria-label={`Remove recipe: ${warnings[0].recipeName}`}>Remove recipe</Button> : null}</li>)}</ul></section>;
}

export function DailyWarningReview({ review }: { review: Review }) {
  if (!review.dailyWarnings.length) return null;
  return <section className="grid min-w-0 gap-2" aria-label="Daily preference warnings"><h3 className="font-extrabold">Daily preference warnings</h3>{review.dailyWarnings.map(w => <div key={w.date} className="rounded-xl bg-peach-50 p-3 text-xs"><p className="font-bold">{formatFullDate(w.date)}</p><p className="mt-1 break-words">{w.message}</p><p className="mt-1 break-words">Recipes: {w.recipeIds.map(id => w.recipeNames?.[id] ?? review.recipeWarnings.find(r => r.recipeId === id)?.recipeName ?? "Saved recipe").join(", ") || "No recipe assignments"}</p></div>)}</section>;
}
