import type { MealSlot } from "@/types/domain";

export const recipeMealSlots: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
export const mealSlotLabels: Record<MealSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
export function parseMealSlots(value: unknown): MealSlot[] {
  return Array.isArray(value) ? recipeMealSlots.filter(slot => value.includes(slot)) : [];
}
export function validRecipeYield(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 10000;
}
