import type { IngredientConversionCandidate } from "@/types/backend";
import { cookingVolumeMl, normalizeCookingUnit, type CookingConversionBasis } from "./cookingMeasurement";
import { cookingGramsPerUnit } from "./cookingMeasurement";
import { ingredientConversionBases, recipeUnitConversion, type RecipeIngredientDraft } from "./recipeEditor";
import type { Food } from "@/types/domain";

export type SavedConversionChoice = CookingConversionBasis & { sources: string[] };
export function savedConversionChoices(candidates: IngredientConversionCandidate[], foodId: string, unit: string): SavedConversionChoice[] {
  const target = normalizeCookingUnit(unit);
  const choices: SavedConversionChoice[] = [];
  for (const candidate of candidates) {
    if (candidate.foodId !== foodId) continue;
    const sourceUnit = normalizeCookingUnit(candidate.unit);
    const targetMl = cookingVolumeMl(target), sourceMl = cookingVolumeMl(sourceUnit);
    const factor = sourceUnit === target ? candidate.gramsPerUnit : targetMl && sourceMl ? candidate.gramsPerUnit * targetMl / sourceMl : null;
    if (!factor || !Number.isFinite(factor) || factor <= 0 || factor > 1000000) continue;
    const description = `${candidate.source.kind === "personal" ? "Your saved conversion" : candidate.source.kind === "default" ? "Default recipe" : "Shared recipe"}: ${candidate.source.recipeName}`;
    const previous = choices.find(choice => Math.abs(choice.gramsPerUnit - factor) <= Math.max(choice.gramsPerUnit, factor) * 1e-6);
    if (previous) { if (!previous.sources.includes(description)) previous.sources.push(description); }
    else choices.push({ unit: target, gramsPerUnit: factor, sources: [description] });
  }
  return choices.sort((a, b) => a.gramsPerUnit - b.gramsPerUnit);
}

export function savedRecipeUnitConversion(item: RecipeIngredientDraft, food: Food, target: string, candidates: IngredientConversionCandidate[]) {
  const explicitBases = ingredientConversionBases(item);
  const sourceFactor = cookingGramsPerUnit(item.unit, food, explicitBases);
  // Freeze the already-known source weight before consulting alternate target measures.
  const bases = sourceFactor && !cookingGramsPerUnit(item.unit, null, explicitBases)
    ? [{ unit: normalizeCookingUnit(item.unit), gramsPerUnit: sourceFactor }, ...explicitBases] : explicitBases;
  const added: CookingConversionBasis[] = [];
  const sources: string[] = [];
  for (const unit of [...new Set([normalizeCookingUnit(item.unit), normalizeCookingUnit(target)])]) {
    if (unit === normalizeCookingUnit(item.unit) && sourceFactor || cookingGramsPerUnit(unit, null, [...explicitBases, ...added])) continue;
    const choices = savedConversionChoices(candidates, food.id, unit);
    if (choices.length > 1) return { status: "conflict" as const, factorUnit: unit, choices, bases: added };
    if (choices.length === 1) { added.push({ unit: choices[0].unit, gramsPerUnit: choices[0].gramsPerUnit }); sources.push(...choices[0].sources); }
  }
  return { ...recipeUnitConversion({ ...item, conversionBases: [...bases, ...added] }, food, target), usedSaved: added.length > 0, sources, bases: added };
}
