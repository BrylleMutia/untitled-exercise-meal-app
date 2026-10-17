import type { CookingMeasurement, Food, Meal, RecipeIngredient } from "@/types/domain";
import { cookingGramsPerUnit, cookingVolumeMl, normalizeCookingUnit, parseCookingMeasurement, type CookingConversionBasis } from "./cookingMeasurement";
import type { NutritionProviderCandidate } from "@/services/nutritionProvider";
import { mealNutrition } from "./nutrition";
import { normalizeNutritionUnit, servingPlanForCandidate } from "./textMeal";

export type RecipeIngredientDraft = { id: string; name: string; food: Food | null; quantity: string; unit: string; included: boolean; assumptions: string[]; measurementKind?: CookingMeasurement["kind"]; upperQuantity?: string; cookingText?: string; gramsPerUnit?: string; nutritionServings?: number; optional?: boolean; preparationNote?: string; conversionBases?: CookingConversionBasis[]; pendingConversion?: { unit: string; gramsPerUnit: string; bases?: CookingConversionBasis[] } };

export function ingredientConversionBases(item: RecipeIngredientDraft): CookingConversionBasis[] {
  return [...(item.gramsPerUnit?.trim() ? [{ unit: item.unit, gramsPerUnit: Number(item.gramsPerUnit) }] : []), ...(Array.isArray(item.conversionBases) ? item.conversionBases.filter(basis => basis && typeof basis.unit === "string" && Number.isFinite(basis.gramsPerUnit)) : [])];
}
export const recipeAuthoringUnits = ["g", "kg", "mg", "oz", "ml", "tsp", "tbsp", "cup", "piece"] as const;
export function recipeAuthoringUnit(unit: string, food: Food | null): typeof recipeAuthoringUnits[number] {
  const normalized = normalizeCookingUnit(unit);
  if (recipeAuthoringUnits.includes(normalized as typeof recipeAuthoringUnits[number])) return normalized as typeof recipeAuthoringUnits[number];
  if (normalized === "l") return "ml";
  if (normalized === "lb") return "oz";
  if (["clove", "lemon", "carrot", "cucumber"].includes(normalized) || normalized === "serving" && food?.unit === "piece") return "piece";
  return "g";
}
export function recipeUnitConversion(item: RecipeIngredientDraft, food: Food | null, target: string, extra?: CookingConversionBasis) {
  const unit = normalizeCookingUnit(target);
  const bases = [...(extra ? [extra] : []), ...ingredientConversionBases(item)];
  const sourceFactor = cookingGramsPerUnit(item.unit, food, bases);
  const targetFactor = cookingGramsPerUnit(unit, food, bases);
  const sourceMl = cookingVolumeMl(item.unit), targetMl = cookingVolumeMl(unit);
  const volumeOnly = sourceMl !== null && targetMl !== null && (!sourceFactor || !targetFactor);
  if ((!sourceFactor || !targetFactor) && !volumeOnly) return { status: "confirmation" as const, factorUnit: !sourceFactor ? normalizeCookingUnit(item.unit) : unit };
  // Related volume measures share a density; use their exact volume ratio to
  // avoid displaying binary noise such as 15.000000000000002 ml.
  const ratio = sourceMl && targetMl && (volumeOnly || Math.abs(sourceFactor! * targetMl / sourceMl - targetFactor!) <= targetFactor! * 1e-12) ? sourceMl / targetMl : sourceFactor! / targetFactor!;
  const quantity = item.quantity.trim() ? Number(item.quantity) * ratio : null;
  const upper = item.measurementKind === "range" && item.upperQuantity?.trim() ? Number(item.upperQuantity) * ratio : null;
  if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) || upper !== null && (!Number.isFinite(upper) || upper <= 0 || upper > 1000000) || item.measurementKind === "range" && quantity !== null && upper !== null && upper < quantity) return { status: "invalid" as const };
  const remembered = [...(sourceFactor ? [{ unit: normalizeCookingUnit(item.unit), gramsPerUnit: sourceFactor }] : []), ...(targetFactor ? [{ unit, gramsPerUnit: targetFactor }] : []), ...bases];
  return { status: "converted" as const, patch: { unit, quantity: quantity === null ? item.quantity : String(quantity), ...(upper === null ? {} : { upperQuantity: String(upper) }), gramsPerUnit: targetFactor ? String(targetFactor) : undefined, conversionBases: [...new Map(remembered.reverse().map(basis => [normalizeCookingUnit(basis.unit), basis])).values()], pendingConversion: undefined, cookingText: undefined } };
}

/** Authoring restrictions do not remove the conversion knowledge needed by older recipes and drafts. */
export function prepareRecipeIngredient(item: RecipeIngredientDraft, food: Food | null = item.food, startConfirmation = true): RecipeIngredientDraft {
  let current = { ...item, unit: normalizeCookingUnit(item.unit) };
  const target = recipeAuthoringUnit(current.unit, food);
  if (current.measurementKind !== "unmeasured" && current.unit !== target) {
    const factor = cookingGramsPerUnit(current.unit, food, ingredientConversionBases(current));
    // A clove or a whole vegetable becomes one piece of that same ingredient.
    const countBasis = target === "piece" && factor ? [{ unit: "piece", gramsPerUnit: factor }] : [];
    const result = recipeUnitConversion({ ...current, conversionBases: [...countBasis, ...ingredientConversionBases(current)] }, food, target);
    if (result.status === "converted") current = { ...current, ...result.patch, pendingConversion: item.pendingConversion };
    else if (startConfirmation && !current.pendingConversion) current.pendingConversion = { unit: target, gramsPerUnit: "" };
  }
  const pending = current.pendingConversion;
  if (pending) {
    const unit = recipeAuthoringUnit(pending.unit, food);
    const working = { ...current, conversionBases: [...(pending.bases ?? []), ...ingredientConversionBases(current)] };
    const resolved = recipeUnitConversion(working, food, unit);
    // A refreshed source may already resolve an older pending conversion.
    // Never reinterpret its old factor as a new density for the normalized unit.
    if (resolved.status === "converted") return { ...current, ...resolved.patch };
    let gramsPerUnit = pending.gramsPerUnit;
    if (unit !== normalizeCookingUnit(pending.unit) && gramsPerUnit.trim()) {
      const required = recipeUnitConversion(working, food, pending.unit);
      if (required.status === "confirmation" && required.factorUnit === normalizeCookingUnit(pending.unit)) {
        const entered = Number(gramsPerUnit);
        const converted = cookingGramsPerUnit(unit, food, [{ unit: pending.unit, gramsPerUnit: entered }]);
        if (Number.isFinite(entered) && entered > 0 && converted) gramsPerUnit = String(converted);
        else if (unit === "piece" && ["clove", "lemon", "carrot", "cucumber"].includes(normalizeCookingUnit(pending.unit))) gramsPerUnit = pending.gramsPerUnit;
      }
    }
    current.pendingConversion = { ...pending, unit, gramsPerUnit };
  }
  return current;
}

export function recipeIngredientDraft(item: RecipeIngredient, food: Food | null, id: string): RecipeIngredientDraft {
  const measurement = parseCookingMeasurement(item.cookingMeasurement);
  return {
    id, name: measurement?.name ?? food?.name ?? item.foodId, food,
    quantity: measurement?.kind === "unmeasured" ? "" : measurement ? String(measurement.quantity) : String(Number((food?.unit === "piece" ? item.servings : item.servings * (food?.servingGrams ?? 1)).toPrecision(12))),
    unit: measurement?.unit ?? (food?.unit === "piece" ? "piece" : "g"), included: true, assumptions: [],
    ...(measurement ? { measurementKind: measurement.kind, upperQuantity: measurement.upperQuantity === undefined ? undefined : String(measurement.upperQuantity), cookingText: measurement.text, gramsPerUnit: measurement.gramsPerUnit === undefined ? undefined : String(measurement.gramsPerUnit), optional: measurement.optional, preparationNote: measurement.note, ...(measurement.kind === "unmeasured" ? { nutritionServings: item.servings } : {}) } : {}),
  };
}

export function ingredientDraftMeasurement(item: RecipeIngredientDraft): CookingMeasurement | null {
  const kind = item.measurementKind ?? "amount";
  const value = { kind, name: item.name.trim(), ...(item.cookingText?.trim() ? { text: item.cookingText.trim() } : {}), ...(item.optional ? { optional: true } : {}), ...(item.preparationNote?.trim() ? { note: item.preparationNote.trim() } : {}),
    ...(kind === "unmeasured" ? {} : { quantity: item.quantity.trim() ? Number(item.quantity) : NaN, unit: normalizeCookingUnit(item.unit), ...(kind === "range" ? { upperQuantity: item.upperQuantity?.trim() ? Number(item.upperQuantity) : NaN } : {}), ...(item.gramsPerUnit?.trim() ? { gramsPerUnit: Number(item.gramsPerUnit) } : {}) }) };
  return parseCookingMeasurement(value);
}
export function ingredientDraftServing(item: RecipeIngredientDraft, food: Food) {
  const measurement = ingredientDraftMeasurement(item);
  if (!measurement) return null;
  if (measurement.kind === "unmeasured") return item.nutritionServings && Number.isFinite(item.nutritionServings) && item.nutritionServings > 0 ? { servings: item.nutritionServings } : null;
  const quantity = measurement.kind === "range" ? measurement.upperQuantity! : measurement.quantity!;
  const factor = cookingGramsPerUnit(measurement.unit!, food, ingredientConversionBases(item));
  return factor && Number.isFinite(factor) && factor > 0 ? { servings: quantity * factor / food.servingGrams } : null;
}

export type RecipeIngredientIssue = "source" | "amount" | "conversion" | "pending-conversion";

export function patchRecipeIngredient(item: RecipeIngredientDraft, patch: Partial<RecipeIngredientDraft>): RecipeIngredientDraft {
  return prepareRecipeIngredient({
    ...item,
    ...(patch.quantity !== undefined || patch.upperQuantity !== undefined || patch.unit !== undefined || patch.measurementKind !== undefined ? { cookingText: undefined } : {}),
    ...(patch.unit !== undefined || patch.food !== undefined ? { gramsPerUnit: undefined } : {}),
    ...(patch.food !== undefined ? { conversionBases: undefined, pendingConversion: undefined, nutritionServings: undefined } : {}),
    ...(patch.measurementKind !== undefined ? { pendingConversion: undefined } : {}),
    ...patch,
  }, patch.food === undefined ? item.food : patch.food, false);
}

/** Explain the same incomplete inputs that prevent a whole ingredient preview. */
export function recipeIngredientIssue(item: RecipeIngredientDraft, foods: Food[]): RecipeIngredientIssue | null {
  if (item.pendingConversion) return "pending-conversion";
  const food = foods.find(candidate => candidate.id === item.food?.id) ?? item.food;
  if (!food || food.valueSource === "ai_estimate") return "source";
  if (item.gramsPerUnit?.trim() && (!Number.isFinite(Number(item.gramsPerUnit)) || Number(item.gramsPerUnit) <= 0 || Number(item.gramsPerUnit) > 1000000)) return "conversion";
  if (!ingredientDraftMeasurement(item)) return "amount";
  const serving = ingredientDraftServing(item, food);
  if (!serving) return "conversion";
  if (!Number.isFinite(serving.servings) || serving.servings < 0.0001 || serving.servings > 10000) return "amount";
  return null;
}

export type RecipeIngredientMethod = "search" | "describe" | "custom";

export function recipeServingsControl(value: string) {
  const blank = !value.trim();
  const count = Number(value);
  const valid = Number.isInteger(count) && count >= 1 && count <= 10000;
  return {
    minusDisabled: blank || !valid || count <= 1,
    plusDisabled: !blank && (!valid || count >= 10000),
    decrement: valid ? String(Number(Math.max(1, count - 1).toFixed(10))) : value,
    increment: blank ? "1" : valid ? String(Number(Math.min(10000, count + 1).toFixed(10))) : value,
  };
}

export function recipeMethodPrefill(
  fields: { query: string; description: string; customName: string },
  from: RecipeIngredientMethod, to: RecipeIngredientMethod,
): { field: "query" | "description" | "customName"; value: string } | null {
  const keys = { search: "query", describe: "description", custom: "customName" } as const;
  const field = keys[to];
  const source = fields[keys[from]];
  if (from === to || fields[field].trim() || !source.trim()) return null;
  return { field, value: source.slice(0, field === "description" ? 4000 : field === "customName" ? 256 : 180) };
}

export function recipeServingPlan(food: Food, quantity: number, requestedUnit: string) {
  const unit = normalizeNutritionUnit(requestedUnit);
  if (!unit) return null;
  const option = food.servingOptions?.find(candidate => normalizeNutritionUnit(candidate.unit) === unit);
  if (option && (!Number.isFinite(option.grams) || option.grams <= 0)) return null;
  // A label containing "ml" or "cup" is not a conversion factor. Only an
  // explicit serving option or the canonical unit can authorize conversion.
  return servingPlanForCandidate({ ...food, servingLabel: "", servingOptions: option ? [option] : [] }, quantity, unit);
}

export function recipePreview(ingredients: RecipeIngredientDraft[], servings: string, foods: Food[]) {
  if (!servings.trim() || !Number.isInteger(Number(servings)) || Number(servings) < 1 || Number(servings) > 10000 || !ingredients.length) return null;
  const refs: Meal["ingredients"] = [];
  const sources = [...foods];
  for (const item of ingredients) {
    const food = foods.find((candidate) => candidate.id === item.food?.id) ?? item.food;
    const serving = food ? ingredientDraftServing(item, food) : null;
    if (!food || !serving || serving.servings < 0.0001 || serving.servings > 10000 || food.valueSource === "ai_estimate") return null;
    sources.push(food);
    const measurement = ingredientDraftMeasurement(item)!;
    const factor = measurement.kind === "unmeasured" ? null : cookingGramsPerUnit(measurement.unit!, food, ingredientConversionBases(item));
    refs.push({ foodId: food.id, servings: serving.servings, cookingMeasurement: { ...measurement, ...(factor ? { gramsPerUnit: factor } : {}) } });
  }
  const meal: Meal = { id: "preview", name: "preview", servings: Number(servings), ingredients: refs };
  return { ingredients: refs, perServing: mealNutrition(meal, sources).perServing };
}

export function providerCandidateFood(candidate: NutritionProviderCandidate): Food {
  return { ...candidate, id: `food-fdc-${candidate.fdcId}`, category: "Other", valueSource: "trusted_catalog" };
}

export function safeRecipeReference(reference?: string): string | null {
  if (!reference?.trim()) return null;
  try { const url = new URL(reference.trim()); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
