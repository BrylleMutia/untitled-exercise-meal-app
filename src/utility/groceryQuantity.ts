export const MAX_GROCERY_QUANTITY = 1_000_000;

export function parseGroceryQuantity(value: string): number | null {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity >= 0 && quantity <= MAX_GROCERY_QUANTITY ? quantity : null;
}
