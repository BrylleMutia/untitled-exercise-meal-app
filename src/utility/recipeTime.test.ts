import { describe, expect, it } from "vitest";
import { maximumRecipeTimeMinutes, parseRecipeTime, validRecipeTimeMinutes } from "./recipeTime";

describe("optional whole-recipe time", () => {
  it("keeps unknown time separate from a confirmed zero", () => {
    for (const value of ["", " "]) expect(parseRecipeTime(value)).toEqual({ valid: true });
    expect(parseRecipeTime("0")).toEqual({ valid: true, minutes: 0 });
  });
  it.each(["30", " 45 ", "1.0", String(maximumRecipeTimeMinutes)])("accepts whole minutes %s", value => {
    expect(parseRecipeTime(value)).toEqual({ valid: true, minutes: Number(value) });
  });
  it.each(["-1", "1.5", "NaN", "Infinity", "e", "2147483648"])("rejects invalid minutes %s", value => {
    expect(parseRecipeTime(value)).toEqual({ valid: false });
  });
  it.each([null, undefined, "30", true, {}, [], NaN, Infinity, -1, .5])("rejects nonnumeric or invalid durable input %s", value => {
    expect(validRecipeTimeMinutes(value)).toBe(false);
  });
});
