export const maximumGroceryCentavos = Number.MAX_SAFE_INTEGER;

export function validGroceryCentavos(value: unknown): value is number | null {
  return value === null || typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function parseGroceryAmount(value: string): { valid: true; centavos: number | null } | { valid: false } {
  const text = value.trim();
  if (!text) return { valid: true, centavos: null };
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return { valid: false };
  const [pesos, fraction = ""] = text.split(".");
  const centavos = BigInt(pesos) * 100n + BigInt(fraction.padEnd(2, "0"));
  return centavos <= BigInt(maximumGroceryCentavos) ? { valid: true, centavos: Number(centavos) } : { valid: false };
}

export function groceryAmountInput(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "";
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, "0")}`;
}

export function formatGroceryAmount(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "₱—";
  const [pesos, fraction] = groceryAmountInput(centavos).split(".");
  return `₱${BigInt(pesos).toLocaleString("en-PH")}.${fraction}`;
}
