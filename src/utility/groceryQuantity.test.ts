import { describe, expect, it } from "vitest";
import { parseGroceryQuantity } from "./groceryQuantity";

describe("grocery quantity entry", () => {
  it.each(["0", "0.25", "42", "999999.5", "1000000", " 12.5 "])("accepts supported quantity %s", value => {
    expect(parseGroceryQuantity(value)).toBe(Number(value));
  });
  it.each(["", " ", "-1", "NaN", "Infinity", "1e3", "1,000", "12g", "1000000.01", ".", "1..2"])("rejects invalid quantity %s", value => {
    expect(parseGroceryQuantity(value)).toBeNull();
  });
});
