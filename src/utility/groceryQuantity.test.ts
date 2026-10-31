import { describe, expect, it } from "vitest";
import { parseGroceryQuantity, stepGroceryQuantity } from "./groceryQuantity";

describe("grocery quantity entry", () => {
  it.each(["0", "0.25", "42", "999999.5", "1000000", " 12.5 "])("accepts supported quantity %s", value => {
    expect(parseGroceryQuantity(value)).toBe(Number(value));
  });
  it.each(["", " ", "-1", "NaN", "Infinity", "1e3", "1,000", "12g", "1000000.01", ".", "1..2"])("rejects invalid quantity %s", value => {
    expect(parseGroceryQuantity(value)).toBeNull();
  });
  it("retains the personal extra-item minimum", () => {
    expect(parseGroceryQuantity("0.5", 1)).toBeNull();
    expect(parseGroceryQuantity("1.25", 1)).toBe(1.25);
  });
  it.each([
    ["0.25", 1, 0, "1.25"], ["1.1", 1, 0, "2.1"],
    ["0.25", -1, 0, "0"], ["999999.75", 1, 0, "1000000"],
    ["1.25", -1, 1, "1"], ["100", 1, 0, "101"],
    ["1.000000000001", -1, 0, "0.000000000001"],
  ] as const)("steps %s safely", (value, direction, minimum, expected) => {
    expect(stepGroceryQuantity(value, direction, minimum)).toBe(expected);
  });
  it.each(["", "-1", "1e3", "1000001"])("does not step invalid input %s", value => {
    expect(stepGroceryQuantity(value, 1)).toBeNull();
  });
});
