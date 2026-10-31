import { describe, expect, it } from "vitest";
import { classifyGroceryName, groceryCategoryMessage, grocerySpellingDistance, normalizeGroceryName } from "./groceryCategory";

describe("grocery category suggestions", () => {
  it.each([
    ["Tomatoes", "Produce"], ["tomatos", "Produce"], ["tomtaoes", "Produce"], ["bananna", "Produce"],
    ["fresh chicken breast", "Protein"], ["organic frozen chicken breast", "Protein"], ["Eggs", "Protein"],
    ["coconut milk", "Pantry"], ["cocount milk", "Pantry"], ["almond milk", "Pantry"], ["chicken seasoning", "Pantry"],
    ["chicken flavored seasoning", "Pantry"], ["chicken stock", "Pantry"], ["fish sauce", "Pantry"],
    ["Milk", "Dairy"], ["Greek yoghurt", "Dairy"], ["greek yogurt", "Dairy"], ["rice", "Grains"], ["rolled oats", "Grains"],
    ["dishwashing liquid", "Other"], ["chicken dishwashing liquid", "Other"], ["rice milk", "Pantry"],
    ["something for dinner", "Other"], ["chicken mystery sauce", "Other"], ["silk", "Other"], ["ric", "Other"],
    ["", "Other"], ["\uFF2D\uFF29\uFF2C\uFF2B", "Dairy"], ["fresh tomato sauce", "Pantry"],
  ])("categorizes %s as %s", (name, category) => expect(classifyGroceryName(name)).toBe(category));

  it("normalizes remembered names without conflating compound ingredients", () => {
    expect(normalizeGroceryName("  MILK\u00a0 \t ")).toBe("milk");
    expect(normalizeGroceryName("Oat MILK")).toBe("oat milk");
    expect(normalizeGroceryName("tomato")).not.toBe(normalizeGroceryName("tomatoes"));
  });
  it("counts transpositions and preserves unknown input", () => {
    expect(grocerySpellingDistance("tomtaoes", "tomatoes")).toBe(1);
    expect(classifyGroceryName("x".repeat(10000))).toBe("Other");
  });
  it("formats authoritative success messages with quantity, unit and category", () => {
    expect(groceryCategoryMessage({ name: "tomatos", quantity: 2, unit: "piece", category: "Produce" }, "added")).toBe("2 pcs tomatos added to Produce.");
    expect(groceryCategoryMessage({ name: "Onion", quantity: 1, unit: "pcs", category: "Produce" }, "moved")).toBe("1 pc Onion moved to Produce.");
    expect(groceryCategoryMessage({ name: "Rice", quantity: 1.5, unit: "cup", category: "Grains" }, "added")).toBe("1.5 cups Rice added to Grains.");
  });
});
