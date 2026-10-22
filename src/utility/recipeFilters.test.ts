import { describe, expect, it } from "vitest";
import type { Meal } from "@/types/domain";
import type { GroupRecipe } from "@/types/cookingGroup";
import { combinedRecipeLibrary } from "./recipeLibrary";
import { activeRecipeFilterCount, emptyRecipeFilters, filterRecipeLibrary, recipeSource } from "./recipeFilters";

const meal = (id: string, fields: Partial<Meal> = {}): Meal => ({ id, name: id, servings: 4, ingredients: [], ...fields });
const shared: GroupRecipe = { ...meal("bea", { name: "Bea lunch", mealSlots: ["lunch"], totalTimeMinutes: 30, complexity: "easy" }), ownerId: "bea", ownerName: "Bea" };
const context = { shared: new Map([[shared.id, shared]]), userId: "alice", editedIds: new Set(["custom"]), favoriteIds: new Set(["custom", "bea"]) };
const recipes = [meal("default", { isSystem: true, mealSlots: ["breakfast"], totalTimeMinutes: 15 }), meal("custom", { name: "Renamed supper", mealSlots: ["lunch", "dinner"], totalTimeMinutes: 60, complexity: "hard" }), shared, meal("legacy"), meal("zero", { totalTimeMinutes: 0 })];

describe("recipe library filters", () => {
  it("preserves library order and original objects with unrestricted filters", () => {
    expect(filterRecipeLibrary(recipes, emptyRecipeFilters(), context)).toEqual(recipes);
    expect(filterRecipeLibrary(recipes, emptyRecipeFilters(), context)[0]).toBe(recipes[0]);
  });
  it("matches stored and edited display names with trimmed case-insensitive substrings", () => {
    for (const query of [" SUPPER ", "(EDITED)", "renamed"]) expect(filterRecipeLibrary(recipes, { ...emptyRecipeFilters(), query }, context).map(r => r.id)).toEqual(["custom"]);
  });
  it("uses OR inside a group and AND across groups", () => {
    const filters = { ...emptyRecipeFilters(), sources: ["mine", "shared"] as const, mealSlots: ["dinner", "lunch"] as const };
    expect(filterRecipeLibrary(recipes, { ...filters, sources: [...filters.sources], mealSlots: [...filters.mealSlots], favoritesOnly: true, maxMinutes: "30", difficulties: ["easy", "medium"] }, context).map(r => r.id)).toEqual(["bea"]);
  });
  it("classifies defaults, personal customizations, retained copies and shared ownership by identity", () => {
    expect(recipes.slice(0, 3).map(r => recipeSource(r, context.shared, "alice"))).toEqual(["default", "mine", "shared"]);
    expect(recipeSource(meal("group-copy-old"), context.shared, "alice")).toBe("mine");
    expect(recipeSource(shared, context.shared, "bea")).toBe("mine");
    expect(recipeSource({ ...shared, isSystem: true }, context.shared, "alice")).toBe("default");
  });
  it("never guesses missing meal times and accepts any matching declared time", () => {
    expect(filterRecipeLibrary(recipes, { ...emptyRecipeFilters(), mealSlots: ["dinner", "breakfast"] }, context).map(r => r.id)).toEqual(["default", "custom"]);
  });
  it("excludes unknown times from time limits and retains zero and inclusive boundaries", () => {
    expect(filterRecipeLibrary(recipes, { ...emptyRecipeFilters(), maxMinutes: "15" }, context).map(r => r.id)).toEqual(["default", "zero"]);
    expect(filterRecipeLibrary(recipes, { ...emptyRecipeFilters(), maxMinutes: "30" }, context).map(r => r.id)).toEqual(["default", "bea", "zero"]);
  });
  it("uses Medium for missing difficulty and supports no matches", () => {
    expect(filterRecipeLibrary(recipes, { ...emptyRecipeFilters(), difficulties: ["medium"] }, context).map(r => r.id)).toEqual(["default", "legacy", "zero"]);
    expect(filterRecipeLibrary(recipes, { ...emptyRecipeFilters(), query: "unfindable" }, context)).toEqual([]);
  });
  it("respects archive reconciliation before filters and never revives archived rows", () => {
    const archived = meal("bea", { archivedAt: "hidden" });
    expect(filterRecipeLibrary(combinedRecipeLibrary([archived], [shared]), emptyRecipeFilters(), context)).toEqual([]);
    expect(filterRecipeLibrary([archived], emptyRecipeFilters(), context)).toEqual([]);
  });
  it("counts active categories rather than selected values", () => {
    expect(activeRecipeFilterCount(emptyRecipeFilters())).toBe(0);
    expect(activeRecipeFilterCount({ ...emptyRecipeFilters(), query: "  " })).toBe(0);
    expect(activeRecipeFilterCount({ ...emptyRecipeFilters(), sources: ["mine", "shared"], mealSlots: ["lunch", "dinner"], favoritesOnly: true })).toBe(3);
  });
});
