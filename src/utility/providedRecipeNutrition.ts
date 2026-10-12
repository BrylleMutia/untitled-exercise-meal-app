import type { Meal, ProvidedRecipeNutrition } from "@/types/domain";

export const providedNutritionKeys = ["calories", "proteinG", "carbsG", "fatG"] as const;
export function parseProvidedRecipeNutrition(value: unknown): ProvidedRecipeNutrition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!providedNutritionKeys.every(key => typeof candidate[key] === "number" && Number.isFinite(candidate[key]) && candidate[key] >= 0 && candidate[key] <= 10000)) return null;
  return { calories: candidate.calories as number, proteinG: candidate.proteinG as number, carbsG: candidate.carbsG as number, fatG: candidate.fatG as number };
}

export function providedRecipeLogEntry(meal: Meal, servings: number, date: string, slot: import("@/types/domain").MealSlot) {
  if (!meal.providedNutrition) return null;
  return {
    date, slot, customName: `${meal.name} · provided recipe macros`, servings,
    servingQuantity: servings, servingUnit: "serving" as const,
    servingLabel: "1 recipe serving", servingGrams: 1,
    ...meal.providedNutrition, estimated: true, confidence: "medium" as const,
    source: "Source-provided recipe macros", sourceVersion: `recipe:${meal.id}:revision:${meal.revision ?? 1}`,
    preparationBasis: "as_labeled" as const, valueSource: "user_provided" as const,
    assumptions: `Provided nutrition per serving; not recalculated from ingredients. Reference: ${meal.reference ?? "user provided"}`,
  };
}
