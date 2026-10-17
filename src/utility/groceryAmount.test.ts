import { describe, expect, it } from "vitest";
import { formatGroceryAmount, groceryAmountInput, parseGroceryAmount, validGroceryCentavos } from "./groceryAmount";

describe("weekly grocery spending", () => {
  it.each([["", null], ["  ", null], ["0", 0], ["0.01", 1], ["1250.50", 125050], ["001.2", 120], ["90071992547409.91", Number.MAX_SAFE_INTEGER]] as const)("parses %s exactly", (text, centavos) => {
    expect(parseGroceryAmount(text)).toEqual({ valid: true, centavos });
  });
  it.each(["-1", "1.234", "1e3", "NaN", "Infinity", "1,250", "₱12", ".50", "90071992547409.92"])("rejects invalid input %s", text => {
    expect(parseGroceryAmount(text)).toEqual({ valid: false });
  });
  it("distinguishes unset from zero and formats exact centavos", () => {
    expect(formatGroceryAmount(null)).toBe("₱—");
    expect(formatGroceryAmount(undefined)).toBe("₱—");
    expect(formatGroceryAmount(0)).toBe("₱0.00");
    expect(formatGroceryAmount(125050)).toBe("₱1,250.50");
    for (const centavos of [0, 1, 12345, Number.MAX_SAFE_INTEGER]) expect(parseGroceryAmount(groceryAmountInput(centavos))).toEqual({ valid: true, centavos });
    for (const value of [-1, .1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined, "1"]) expect(validGroceryCentavos(value)).toBe(false);
  });
});
