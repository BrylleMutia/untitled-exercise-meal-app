export const MAX_GROCERY_QUANTITY = 1_000_000;

export function parseGroceryQuantity(value: string, minimum = 0): number | null {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity >= minimum && quantity <= MAX_GROCERY_QUANTITY ? quantity : null;
}

export function stepGroceryQuantity(value: string, direction: -1 | 1, minimum = 0): string | null {
  const quantity = parseGroceryQuantity(value, minimum);
  if (quantity === null) return null;
  return Math.min(MAX_GROCERY_QUANTITY, Math.max(minimum, quantity + direction)).toFixed(12).replace(/\.?0+$/, "");
}
