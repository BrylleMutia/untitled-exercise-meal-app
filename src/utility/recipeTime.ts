export const maximumRecipeTimeMinutes = 2147483647;

export function validRecipeTimeMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= 0 && value <= maximumRecipeTimeMinutes;
}

export function parseRecipeTime(value: string): { valid: true; minutes?: number } | { valid: false } {
  if (!value.trim()) return { valid: true };
  const minutes = Number(value);
  return validRecipeTimeMinutes(minutes) ? { valid: true, minutes } : { valid: false };
}
