import { describe, expect, it } from "vitest";
import { canSuggestGroceryName, groceryNameMatchTier, groceryNameSuggestions } from "./grocerySuggestions";

const prior = (name: string, occurrences = 1, lastSeenWeek = "2026-10-31") => ({ name, occurrences, lastSeenWeek });
describe("grocery name suggestions", () => {
  it("requires two non-whitespace characters and bounds the result", () => {
    expect(canSuggestGroceryName(" a \t")).toBe(false);
    expect(canSuggestGroceryName("🧅")).toBe(false);
    expect(groceryNameSuggestions("c")).toEqual([]);
    expect(groceryNameSuggestions("ch")).toHaveLength(6);
    expect(groceryNameSuggestions("x".repeat(257))).toEqual([]);
  });
  it("supports phrase and word prefixes while preserving distinct names", () => {
    expect(groceryNameMatchTier("Chicken breast", "chicken b")).toBe(1);
    expect(groceryNameMatchTier("Coconut milk", "milk")).toBe(2);
    expect(groceryNameMatchTier("Silk", "ilk")).toBe(null);
    const names = groceryNameSuggestions("milk").map(item => item.name);
    expect(names[0]).toBe("Milk"); expect(names).toContain("Coconut milk"); expect(names).toContain("Oat milk");
  });
  it("suggests canonical dictionary spellings and conservative typo matches", () => {
    expect(groceryNameSuggestions("tomatos").map(item => item.name)).toContain("Tomatoes");
    expect(groceryNameSuggestions("tomatos").map(item => item.name)).not.toContain("Tomatos");
    expect(groceryNameSuggestions("tomtaoes")[0].name).toBe("Tomatoes");
    expect(groceryNameSuggestions("ric").some(item => item.name === "Rice")).toBe(true);
    expect(groceryNameSuggestions("silk").some(item => item.name === "Milk")).toBe(false);
  });
  it("ranks stronger matches before historical word matches", () => {
    expect(groceryNameSuggestions("milk", [prior("Coconut milk", 100)])[0]).toEqual({ name: "Milk", source: "dictionary" });
  });
  it("prioritizes history within a tier, then frequency and recency", () => {
    const names = groceryNameSuggestions("ch", [prior("Chicken special", 5), prior("Chicken Brand UHT", 5, "2026-10-30"), prior("Chicken favorite", 10)]).map(item => item.name);
    expect(names.slice(0, 3)).toEqual(["Chicken favorite", "Chicken special", "Chicken Brand UHT"]);
  });
  it("deduplicates using normalization and retains historical spelling and casing", () => {
    const result = groceryNameSuggestions("milk", [prior(" MILK ", 3)]);
    expect(result.filter(item => item.name.toLowerCase() === "milk")).toEqual([{ name: "MILK", source: "history" }]);
    expect(groceryNameSuggestions("brand", [prior("brand UHT milk")])[0].name).toBe("Brand UHT milk");
  });
  it("allows arbitrary saved names without inferring food identity", () => {
    expect(groceryNameSuggestions("sp", [prior("Special dishwasher tablets")])[0]).toEqual({ name: "Special dishwasher tablets", source: "history" });
    expect(groceryNameSuggestions("unlisted mystery item")).toEqual([]);
  });
});
