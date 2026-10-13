import { describe, expect, it } from "vitest";
import type { Meal } from "@/types/domain";
import { searchRecipes } from "./recipeSearch";

const recipe = (name: string, id = name, extra: Partial<Meal> = {}): Meal => ({ id, name, servings: 4, ingredients: [], ...extra });
describe("saved recipe search", () => {
  it("ranks exact, plural-aware, prefix and close matches without food records", () => {
    const recipes = [recipe("Creamy Lemon Chicken"), recipe("Lemon Chicken"), recipe("Chicken Bowls"), recipe("Chiken")];
    expect(searchRecipes(recipes, "  CRÉAMY-lemon chicken! ")[0]).toEqual({ recipe: recipes[0], kind: "exact" });
    expect(searchRecipes(recipes, "chicken bowl")[0]).toEqual({ recipe: recipes[2], kind: "tokens" });
    expect(searchRecipes(recipes, "crea")[0].kind).toBe("prefix");
    expect(searchRecipes(recipes, "chikcen").map(match => match.kind)).toContain("close");
    expect(searchRecipes(recipes, "chicken")[0].recipe.name).toBe("Chicken Bowls");
  });
  it("excludes archived recipes and hidden originals but includes their personal replacements", () => {
    const original = recipe("Korean Beef Bowl", "catalog", { isSystem: true, archivedAt: "2026-10-01", catalogReplacementId: "personal" });
    const replacement = recipe("My Korean Beef Bowl", "personal");
    expect(searchRecipes([original, replacement, recipe("Beef Bowl", "archived", { archivedAt: "2026-10-01" })], "beef bowl")).toEqual([{ recipe: replacement, kind: "exact" }]);
  });
  it("limits results, deduplicates identities, preserves stable ties, and requires all tokens", () => {
    const recipes = Array.from({ length: 8 }, (_, index) => recipe("Chicken Bowl", String(index)));
    expect(searchRecipes([...recipes].reverse(), "chicken")).toEqual(searchRecipes(recipes, "chicken"));
    expect(searchRecipes(recipes, "chicken")).toHaveLength(6);
    expect(searchRecipes([recipes[0], recipes[0]], "chicken")).toHaveLength(1);
    expect(searchRecipes(recipes, "chicken chocolate")).toEqual([]);
    expect(searchRecipes(recipes, " ")).toEqual([]);
    expect(searchRecipes(recipes, "chicken", 0)).toEqual([]);
  });
});
