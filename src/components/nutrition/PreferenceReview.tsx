"use client";

import type { PreferenceReview as Review } from "@/types/planningPreferences";
import { formatFullDate } from "@/utility/dates";
import { Button } from "@/components/ui/Button";
import { ReviewDisclosure } from "./ReviewDisclosure";

export const planningAcknowledgment = "I reviewed the assignments, recipe warnings (including allergy and dietary conflicts), portions, replacements, leftovers, unused servings, and unfilled meals, and want to save this plan.";

export function PlanningAcknowledgment({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label className={`flex min-h-11 min-w-0 items-start gap-3 rounded-xl bg-lav-50 p-3 text-sm ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
    <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-lav-500" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{planningAcknowledgment}</span>
  </label>;
}

export function RecipeWarningReview({ review, disabled = false, onRemove, title = "Recipe warnings", collapsible = false, hideTitle = false }: { review: Review; disabled?: boolean; onRemove?: (id: string) => void; title?: string; collapsible?: boolean; hideTitle?: boolean }) {
  const groups = new Map<string, Review["recipeWarnings"]>();
  for (const warning of review.recipeWarnings) groups.set(warning.recipeId, [...(groups.get(warning.recipeId) ?? []), warning]);
  if (!groups.size) return null;
  const content = <>
    <p className="text-xs text-ink-soft">{onRemove ? "Warnings do not exclude these recipes. Review ingredients and preferences, remove recipes you do not want, or keep them in your selection." : "These warnings were recorded when this plan was generated. Review ingredients before preparing or eating; your current settings may differ."}</p>
    <ul className="grid min-w-0 gap-2">{[...groups].map(([id, warnings]) => <li key={id} className={`grid min-w-0 gap-2 rounded-xl p-3 ${warnings.some(w => w.code === "avoided-food") ? "bg-danger-100 text-danger-900" : "bg-peach-50"}`}>
      <p className="break-words font-bold">{warnings[0].recipeName}</p>
      <ul className="grid gap-1 text-xs">{warnings.map(w => <li key={`${w.code}:${w.message}`} className="break-words">{w.message}</li>)}</ul>
      {onRemove ? <Button variant="soft" className="max-w-full min-w-0 justify-self-start [overflow-wrap:anywhere]" disabled={disabled} onClick={() => onRemove(id)} aria-label={`Remove recipe: ${warnings[0].recipeName}`}>Remove recipe</Button> : null}
    </li>)}</ul>
  </>;
  return collapsible ? <ReviewDisclosure title={title} count={`${groups.size} ${groups.size === 1 ? "recipe" : "recipes"}`}>{content}</ReviewDisclosure>
    : <section className="grid min-w-0 gap-3" aria-label={title}>{!hideTitle ? <h3 className="font-extrabold">{title}</h3> : null}{content}</section>;
}

export function DailyWarningReview({ review, collapsible = false }: { review: Review; collapsible?: boolean }) {
  if (!review.dailyWarnings.length) return null;
  const days = new Set(review.dailyWarnings.map(w => w.date)).size;
  const content = review.dailyWarnings.map(w => <div key={`${w.date}:${w.code}:${w.message}`} className="rounded-xl bg-peach-50 p-3 text-xs"><p className="font-bold">{formatFullDate(w.date)}</p><p className="mt-1 break-words">{w.message}</p><p className="mt-1 break-words">Recipes: {w.recipeIds.map(id => w.recipeNames?.[id] ?? review.recipeWarnings.find(r => r.recipeId === id)?.recipeName ?? "Saved recipe").join(", ") || "No recipe assignments"}</p></div>);
  return collapsible ? <ReviewDisclosure title="Daily preference warnings" count={`${days} ${days === 1 ? "day" : "days"}`}>{content}</ReviewDisclosure>
    : <section className="grid min-w-0 gap-2" aria-label="Daily preference warnings"><h3 className="font-extrabold">Daily preference warnings</h3>{content}</section>;
}
