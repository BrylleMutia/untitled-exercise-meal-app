import type { PlannedMeal } from "@/types/domain";
import { plannedDayNutrition } from "@/utility/plannedDayNutrition";
import { NutritionPills } from "@/components/ui/NutritionPills";

export function PlannedMealSummary({ meal, onOpen, showServing = true }: {
  meal: PlannedMeal;
  onOpen?: (button: HTMLButtonElement) => void;
  showServing?: boolean;
}) {
  const saved = plannedDayNutrition([meal], meal.date);
  const nutrition = Object.fromEntries(Object.entries(saved.metrics).map(([key, metric]) => [key, metric.value]));
  const serving = Number.isFinite(meal.servings) && meal.servings > 0 ? `${meal.servings} ${meal.servings === 1 ? "serving" : "servings"}` : "Servings not recorded";
  const title = <><span className="block text-sm font-extrabold">{meal.label}</span>{showServing ? <span data-meal-serving className="block text-[11px] font-semibold text-ink-soft">{serving}</span> : null}</>;
  return <>
    {onOpen ? <button type="button" className="min-h-11 w-full min-w-0 rounded-lg text-left [overflow-wrap:anywhere]" aria-label={`View recipe: ${meal.label}`} onClick={event => onOpen(event.currentTarget)}>{title}</button> : <div className="min-w-0 [overflow-wrap:anywhere]">{title}</div>}
    {Object.values(nutrition).some(value => value !== null) ? <><NutritionPills scrollable abbreviateOnMobile compactOnMobile className="mt-1" values={nutrition} nullLabel="unavailable" precision={0} label="Planned portion nutrition" />{saved.affectedMeals ? <span className="mt-1 block text-xs font-semibold text-ink-soft">Partial total</span> : null}</> : <span className="mt-1 block text-xs font-semibold text-ink-soft">Nutrition unavailable</span>}
  </>;
}
