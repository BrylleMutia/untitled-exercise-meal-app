export const cookingUnits = ["g", "kg", "mg", "oz", "lb", "ml", "l", "tsp", "tbsp", "cup", "piece"] as const;
export function cookingUnitLabel(unit: string, quantity?: number): string {
  if (unit === "piece" || unit === "pcs" || unit === "pc") return quantity === 1 ? "pc" : "pcs";
  if (unit === "cup" || unit === "cups") return quantity === 1 ? "cup" : "cups";
  return unit === "l" ? "L" : unit;
}
