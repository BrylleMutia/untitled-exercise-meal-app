import type { SaveReviewedMealInput } from "@/types/backend";

export function reviewedMealValidationError(input: SaveReviewedMealInput): string | null {
  if (!input.name.trim()) return "Enter a meal name before saving.";
  if (input.ingredients.length === 0) return "Add at least one reviewed ingredient before saving the meal.";
  // Saved recipes support the editor's full ingredient count; AI reviews retain
  // their smaller bounded input contract.
  const limit = input.sourceMode === "saved_meal" ? 100 : 10;
  if (input.ingredients.length > limit) return `This meal supports at most ${limit} reviewed ingredients.`;
  if (input.ingredients.some(entry => !Number.isFinite(entry.servings) || entry.servings <= 0
    || [entry.calories, entry.proteinG, entry.carbsG, entry.fatG, ...(entry.fiberG === undefined ? [] : [entry.fiberG])]
      .some(value => !Number.isFinite(value) || value < 0))) {
    return "Review quantities and nutrition values before saving.";
  }
  return null;
}
