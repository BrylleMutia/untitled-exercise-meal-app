import type { Food, MacroEstimateRange, MealSlot } from "@/types/domain";
import type { ReviewedMealIngredientInput } from "@/types/backend";
import type { PhotoPortion } from "../../supabase/functions/_shared/photoContract";
import { servingPlanForCandidate } from "./textMeal";
import { foodMacros } from "./nutrition";
import { searchNamedItems } from "./foodSearch";

export type GuidedIngredient = {
  photo?: { portion: PhotoPortion | null; reviewed: boolean };
  id: string;
  name: string;
  quantity: number;
  unit: string;
  preparation: string;
  assumptions: string[];
  presence: "stated" | "possible_hidden";
  included: boolean;
  food: Food | null;
  estimate?: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG?: number;
    estimateRange: import("@/types/domain").MacroEstimateRange;
    assumptions: string[];
  };
  custom?: {
    calories: string;
    proteinG: string;
    carbsG: string;
    fatG: string;
    fiberG: string;
  };
};

export function guidedMacros(ingredient: GuidedIngredient) {
  if (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0 || !ingredient.unit.trim()) return null;
  if (ingredient.food) {
    const portion = servingPlanForCandidate(ingredient.food, ingredient.quantity, ingredient.unit);
    return portion ? foodMacros(ingredient.food, portion.servings) : null;
  }
  if (ingredient.custom) {
    const c = ingredient.custom;
    if (![c.calories, c.proteinG, c.carbsG, c.fatG].every(v => v.trim() && Number.isFinite(Number(v)) && Number(v) >= 0)) return null;
    return { calories: Number(c.calories), proteinG: Number(c.proteinG), carbsG: Number(c.carbsG), fatG: Number(c.fatG) };
  }
  return ingredient.estimate ?? null;
}

/** Provider search rankings alone are not enough to assign nutrition to a photo label. */
export function photoFoodMatch(name: string, candidates: Food[]): Food | null {
  return searchNamedItems(candidates, name).find(match => match.kind === "exact" || match.kind === "tokens")?.item ?? null;
}

/** Portion uncertainty scales catalog nutrients; recognition confidence never changes source facts. */
export function photoRange(item: GuidedIngredient): MacroEstimateRange | null {
  const base = guidedMacros(item);
  if (!base) return null;
  if (item.estimate && !item.food && !item.custom) return item.estimate.estimateRange;
  const p = item.photo?.portion;
  const useRange = p && p.unit === item.unit && p.base === item.quantity;
  const low = useRange ? p.low / p.base : 1;
  const high = useRange ? p.high / p.base : 1;
  const triple = (n: number) => ({ low: n * low, base: n, high: n * high });
  return { calories: triple(base.calories), proteinG: triple(base.proteinG), carbsG: triple(base.carbsG), fatG: triple(base.fatG) };
}

export function photoEstimateFood(item: GuidedIngredient, id: string): Food | null {
  if (!item.photo || !item.food) return null;
  const range = photoRange(item);
  const portion = servingPlanForCandidate(item.food, item.quantity, item.unit);
  if (!range || !portion) return null;
  return {
    id, name: item.name, category: "Other", unit: "g",
    servingLabel: `${item.quantity} ${item.unit} photo-reviewed portion`,
    servingGrams: portion.servings * item.food.servingGrams,
    calories: range.calories.base, proteinG: range.proteinG.base, carbsG: range.carbsG.base, fatG: range.fatG.base,
    source: "Photo portion estimate calculated from catalog", sourceVersion: `photo-v1:${item.food.sourceVersion}`,
    valueSource: "ai_estimate", estimated: true, confidence: "low", estimateRange: range,
    preparationBasis: item.food.preparationBasis ?? "as_labeled",
  };
}

export function photoSourceNote(item: GuidedIngredient): string {
  return [...item.assumptions, item.food ? `Calculated from ${item.food.name}; ${item.food.source} ${item.food.sourceVersion}; record ${item.food.fdcId ?? item.food.id}.` : "", `Reviewed portion: ${item.quantity} ${item.unit}.`].filter(Boolean).join(" ");
}

export function photoReviewedEntry(item: GuidedIngredient, date: string, slot: MealSlot): ReviewedMealIngredientInput | null {
  const food = photoEstimateFood(item, "draft");
  if (!food) return null;
  return { date, slot, customName: item.name, servings: 1,
    servingQuantity: food.servingGrams, servingUnit: "g", servingGrams: food.servingGrams,
    servingLabel: food.servingLabel, calories: food.calories, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG,
    estimated: true, confidence: "low", valueSource: "ai_estimate", source: food.source, sourceVersion: food.sourceVersion,
    preparationBasis: food.preparationBasis ?? "as_labeled", estimateRange: food.estimateRange, assumptions: photoSourceNote(item),
  };
}

export function reviewReady(items: GuidedIngredient[]): boolean {
  const included = items.filter(item => item.included);
  return included.length > 0 && included.length <= 10 && included.every(item => item.name.trim() && item.preparation.trim()
    && (!item.photo || item.photo.reviewed) && guidedMacros(item) !== null);
}

export function photoPreview(items: GuidedIngredient[]) {
  const included = items.filter(item => item.included);
  const missing = included.filter(item => !photoRange(item)).map(item => item.name);
  const total: MacroEstimateRange = { calories: { low: 0, base: 0, high: 0 }, proteinG: { low: 0, base: 0, high: 0 }, carbsG: { low: 0, base: 0, high: 0 }, fatG: { low: 0, base: 0, high: 0 } };
  for (const item of included) {
    const range = photoRange(item);
    if (!range) continue;
    for (const metric of ["calories", "proteinG", "carbsG", "fatG"] as const) {
      for (const point of ["low", "base", "high"] as const) total[metric][point] += range[metric][point];
    }
  }
  return { total, missing, known: included.length - missing.length, partial: missing.length > 0 };
}
