export interface NutrientsPer100g {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
}

export interface ServingQuantity {
  quantity: number;
  gramsPerUnit: number;
}

export interface CalculatedNutrients extends NutrientsPer100g {
  grams: number;
}

function assertFiniteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
}

/**
 * Calculates nutrients only from a trusted gram equivalent and canonical
 * per-100-g values. Raw/cooked records must be passed as separate sources;
 * this utility intentionally performs no preparation-state conversion.
 */
export function calculateNutrients(
  quantity: ServingQuantity,
  nutrients: NutrientsPer100g,
): CalculatedNutrients {
  if (!Number.isFinite(quantity.quantity) || quantity.quantity <= 0) {
    throw new Error("quantity must be a finite positive number.");
  }
  if (!Number.isFinite(quantity.gramsPerUnit) || quantity.gramsPerUnit <= 0) {
    throw new Error("gramsPerUnit must be a finite positive number.");
  }
  for (const [label, value] of Object.entries(nutrients)) {
    if (value !== undefined) assertFiniteNonNegative(value, label);
  }
  const grams = quantity.quantity * quantity.gramsPerUnit;
  const scale = grams / 100;
  const round = (value: number) => Math.round(value * scale * 100) / 100;
  return {
    grams,
    calories: round(nutrients.calories),
    proteinG: round(nutrients.proteinG),
    carbsG: round(nutrients.carbsG),
    fatG: round(nutrients.fatG),
    ...(nutrients.fiberG === undefined ? {} : { fiberG: round(nutrients.fiberG) }),
  };
}

/** Convert the existing labeled-serving fixture into a canonical read model. */
export function canonicalFromLabeledServing(
  servingGrams: number,
  servingNutrients: Omit<NutrientsPer100g, never>,
): NutrientsPer100g {
  if (!Number.isFinite(servingGrams) || servingGrams <= 0) {
    throw new Error("servingGrams must be a finite positive number.");
  }
  const scale = 100 / servingGrams;
  const round = (value: number) => Math.round(value * scale * 100) / 100;
  return {
    calories: round(servingNutrients.calories),
    proteinG: round(servingNutrients.proteinG),
    carbsG: round(servingNutrients.carbsG),
    fatG: round(servingNutrients.fatG),
    ...(servingNutrients.fiberG === undefined ? {} : { fiberG: round(servingNutrients.fiberG) }),
  };
}
