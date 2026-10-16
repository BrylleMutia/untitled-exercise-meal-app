import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LoggedMeal, NutritionLog } from "@/types/domain";
import { LoggedRecipeServingsEditor } from "./LoggedRecipeServingsEditor";
const meal = { id: "log", date: "2026-10-14", slot: "snack", name: "Creamy Lemon Chicken", sourceMode: "saved_meal", recipeServings: 3 } as LoggedMeal;
const entries = [{ calories: 2086.5, proteinG: 115.8, carbsG: 63.9, fatG: 151.5, estimated: true }] as NutritionLog[];
const props = { meal, entries, foods: [], onSave: async () => true, onCancel: () => {} };
describe("logged recipe serving editor", () => {
  it("shows one whole-meal portion instead of ingredient controls", () => {
    const html = renderToStaticMarkup(<LoggedRecipeServingsEditor {...props} />);
    expect(html).toContain("Edit logged meal servings");
    expect(html).toContain('value="3"');
    expect(html.match(/type="number"/g)).toHaveLength(1);
    expect(html).toContain("Save correction");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Historical ingredient");
    expect(html).toContain("Scales this entry");
  });
  it("requires an explicit previous portion for unrecoverable legacy history", () => {
    const html = renderToStaticMarkup(<LoggedRecipeServingsEditor {...props} meal={{ ...meal, recipeServings: undefined }} />);
    expect(html).toContain("Previously logged recipe servings");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("Portion nutrition is unavailable");
  });
});
