import { describe, expect, it } from "vitest";
import { combinedRecipeLibrary, editedDefaultRecipeIds, recipeDisplayName, uniqueGroupRecipes } from "./recipeLibrary";
import type { Meal } from "@/types/domain";
import type { GroupRecipe } from "@/types/cookingGroup";
const recipe = (id: string, overrides: Partial<Meal> = {}): Meal => ({ id, name: "Same recipe name", servings: 4, ingredients: [], ...overrides });
const shared = (id: string, overrides: Partial<GroupRecipe> = {}): GroupRecipe => ({ ...recipe(id), ownerId: "bea", ownerName: "Bea", ...overrides });
describe("edited default display names", () => {
  it("uses explicit owned links even when the original default is hidden", () => {
    const own = [recipe("default", { isSystem: true, archivedAt: "hidden", catalogReplacementId: "custom" }), recipe("custom", { name: "Renamed supper" })];
    const ids = editedDefaultRecipeIds(own);
    expect(recipeDisplayName(own[1], ids)).toBe("Renamed supper (edited)");
    expect(recipeDisplayName(own[0], ids)).toBe("Same recipe name");
    expect(own[1].name).toBe("Renamed supper");
  });
  it("uses shared metadata without guessing from names, owners or revision numbers", () => {
    const recipes = [shared("edited", { isEditedDefault: true }), shared("plain", { revision: 99 }), shared("default", { isSystem: true }), shared("group-copy-legacy")];
    const ids = editedDefaultRecipeIds([], recipes);
    expect(recipes.map(recipe => recipeDisplayName(recipe, ids))).toEqual(["Same recipe name (edited)", "Same recipe name", "Same recipe name", "Same recipe name"]);
  });
  it("does not append the suffix twice", () => {
    expect(recipeDisplayName(recipe("custom", { name: "Supper (edited)" }), new Set(["custom"]))).toBe("Supper (edited)");
    expect(recipeDisplayName(recipe("plain", { name: "Supper (edited)" }), new Set())).toBe("Supper (edited)");
  });
});
describe("combined recipe identities", () => {
  it("shows a default once across owned, shared, and retained plan copies without changing records", () => {
    const owned = [recipe("default", { isSystem: true }), recipe("saved-snapshot")];
    expect(combinedRecipeLibrary(owned, [shared("default", { isSystem: true, ownerId: null, canonicalDefaultId: "default" })], [{ snapshotId: "saved-snapshot", recipeId: "default", canonicalDefaultId: "default" }]).map(r => r.id)).toEqual(["default"]);
    expect(owned).toHaveLength(2);
  });
  it("keeps customized defaults and unrelated recipes with the same name distinct", () => {
    expect(combinedRecipeLibrary([recipe("default", { isSystem: true }), recipe("my-version")], [shared("bea-version"), shared("default")]).map(r => r.id)).toEqual(["default", "my-version", "bea-version"]);
  });
  it("honors a viewer's archived default rather than reintroducing it from sharing", () => {
    expect(combinedRecipeLibrary([recipe("default", { archivedAt: "hidden" }), recipe("snapshot")], [shared("default", { isSystem: true })], [{ snapshotId: "snapshot", recipeId: "default", canonicalDefaultId: "default" }])).toEqual([]);
  });
  it("hides a retained snapshot only while its source is represented", () => {
    const owned = [recipe("snapshot")], origins = [{ snapshotId: "snapshot", recipeId: "source" }];
    expect(combinedRecipeLibrary(owned, [shared("source")], origins).map(r => r.id)).toEqual(["source"]);
    expect(combinedRecipeLibrary(owned, [], origins).map(r => r.id)).toEqual(["snapshot"]);
  });
  it("preserves owned action metadata when the same recipe is shared", () => {
    const own = recipe("mine", { notes: "Owned metadata" });
    expect(combinedRecipeLibrary([own], [shared("mine")])[0]).toBe(own);
  });
  it("offers one canonical default in generation and keeps custom variants", () => {
    expect(uniqueGroupRecipes([shared("default", { canonicalDefaultId: "default" }), shared("default", { canonicalDefaultId: "default" }), shared("variant")]).map(r => r.id)).toEqual(["default", "variant"]);
  });
});
