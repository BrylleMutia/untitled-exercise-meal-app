import type { CookingMeasurement, Food, RecipeIngredient, UnmeasuredIngredient } from "@/types/domain";

const stringFields = { name: 256, text: 256, unit: 40, note: 1000 } as const;
export function parseCookingMeasurement(value: unknown): CookingMeasurement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!["amount", "range", "unmeasured"].includes(String(item.kind))) return null;
  if (Object.keys(item).some(key => !["kind", "quantity", "upperQuantity", "gramsPerUnit", "optional", ...Object.keys(stringFields)].includes(key))) return null;
  for (const [key, max] of Object.entries(stringFields)) if (item[key] !== undefined && (typeof item[key] !== "string" || !(item[key] as string).trim() || (item[key] as string).length > max)) return null;
  if (item.optional !== undefined && typeof item.optional !== "boolean") return null;
  for (const key of ["quantity", "upperQuantity", "gramsPerUnit"]) if (item[key] !== undefined && (typeof item[key] !== "number" || !Number.isFinite(item[key]) || item[key] <= 0 || item[key] > 1000000)) return null;
  if (item.kind === "unmeasured") {
    if (typeof item.text !== "string" || item.quantity !== undefined || item.upperQuantity !== undefined || item.unit !== undefined || item.gramsPerUnit !== undefined) return null;
  } else if (typeof item.quantity !== "number" || typeof item.unit !== "string" || (item.kind === "range" ? typeof item.upperQuantity !== "number" || item.upperQuantity < item.quantity : item.upperQuantity !== undefined)) return null;
  return item as unknown as CookingMeasurement;
}
export function parseUnmeasuredIngredients(value: unknown): UnmeasuredIngredient[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  if (value.some(item => !item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(key => !["name", "measurement", "optional"].includes(key)) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 256 || typeof item.measurement !== "string" || !item.measurement.trim() || item.measurement.length > 256 || (item.optional !== undefined && typeof item.optional !== "boolean"))) return null;
  return value as UnmeasuredIngredient[];
}
export function cookingAmount(measurement: CookingMeasurement): number | null {
  return measurement.kind === "unmeasured" ? null : measurement.kind === "range" ? measurement.upperQuantity ?? null : measurement.quantity ?? null;
}
export function needsRecipeMeasurementRefresh(meal: import("@/types/domain").Meal): boolean {
  return Boolean(meal.isSystem && ["meal-creamy-lemon-chicken", "meal-korean-beef-bowl", "meal-sticky-teriyaki-chicken", "meal-chicken-burrito-protein-boxes"].includes(meal.id)
    && (!meal.ingredients.length || meal.ingredients.some(item => !parseCookingMeasurement(item.cookingMeasurement)) || meal.unmeasuredIngredients === undefined || !meal.nutritionNotes));
}
export function formatCookingMeasurement(item: RecipeIngredient, food?: Food): string {
  const measurement = parseCookingMeasurement(item.cookingMeasurement);
  if (measurement) {
    const amount = measurement.text ?? (measurement.kind === "range" ? `${measurement.quantity}–${measurement.upperQuantity} ${measurement.unit}` : `${measurement.quantity} ${measurement.unit}`);
    return amount;
  }
  if (!food) return "Measurement unavailable";
  const quantity = food.unit === "piece" ? item.servings : item.servings * food.servingGrams;
  return `${Number(quantity.toPrecision(12))} ${food.unit === "piece" ? quantity === 1 ? "piece" : "pieces" : "g"}`;
}
export type CookingConversionBasis = { unit: string; gramsPerUnit: number };
const volumeMl: Record<string, number> = { ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 240 };
export function cookingVolumeMl(unit: string): number | null { return volumeMl[normalizeCookingUnit(unit)] ?? null; }
export function normalizeCookingUnit(unit: string): string {
  const value = unit.trim().toLowerCase().replace(/\.$/, "");
  const aliases: Record<string, string> = { grams: "g", gram: "g", kilograms: "kg", kilogram: "kg", milligrams: "mg", milligram: "mg", ounces: "oz", ounce: "oz", pounds: "lb", pound: "lb", millilitres: "ml", milliliters: "ml", milliliter: "ml", millilitre: "ml", litres: "l", liters: "l", litre: "l", liter: "l", teaspoons: "tsp", teaspoon: "tsp", tsps: "tsp", tablespoons: "tbsp", tablespoon: "tbsp", tbsps: "tbsp", cups: "cup", servings: "serving", pieces: "piece", cloves: "clove", lemons: "lemon", carrots: "carrot", cucumbers: "cucumber" };
  return value === "piece/s" ? "piece" : aliases[value] ?? value;
}
function optionBasis(option: NonNullable<Food["servingOptions"]>[number]): CookingConversionBasis | null {
  const match = option.label.match(/^\s*(\d+\/\d+|\d+(?:\.\d+)?|[¼½¾])\s*([^\s()]+)/);
  if (!match || normalizeCookingUnit(match[2]) !== normalizeCookingUnit(option.unit)) return null;
  const fractions: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75 };
  const amount = fractions[match[1]] ?? (match[1].includes("/") ? Number(match[1].split("/")[0]) / Number(match[1].split("/")[1]) : Number(match[1]));
  const factor = option.grams / amount;
  return Number.isFinite(amount) && amount > 0 && Number.isFinite(factor) && factor > 0 && factor <= 1000000 ? { unit: normalizeCookingUnit(option.unit), gramsPerUnit: factor } : null;
}
export function cookingGramsPerUnit(unit: string, food: Food | null, saved: CookingConversionBasis[] = []): number | null {
  unit = normalizeCookingUnit(unit);
  const weight: Record<string, number> = { g: 1, kg: 1000, mg: 0.001, oz: 28.349523125, lb: 453.59237 };
  if (weight[unit]) return weight[unit];
  if (food && (unit === "serving" || unit === "piece" && food.unit === "piece")) return food.servingGrams;
  const bases = [...saved, ...(food?.servingOptions ?? []).flatMap(option => { const basis = optionBasis(option); return basis ? [basis] : []; })]
    .filter(basis => Number.isFinite(basis.gramsPerUnit) && basis.gramsPerUnit > 0 && basis.gramsPerUnit <= 1000000);
  const exact = bases.find(basis => normalizeCookingUnit(basis.unit) === unit);
  if (exact) return exact.gramsPerUnit;
  if (volumeMl[unit]) {
    const source = bases.find(basis => volumeMl[normalizeCookingUnit(basis.unit)]);
    if (source) return source.gramsPerUnit * volumeMl[unit] / volumeMl[normalizeCookingUnit(source.unit)];
  }
  return null;
}
