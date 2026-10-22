import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeResourcePills } from "./RecipeResourcePills";

describe.each([false, true])("recipe resource pills (compact=%s)", compact => {
  it("keeps the four resource meanings, order and accessible units", () => {
    const html = renderToStaticMarkup(<RecipeResourcePills compact={compact} calories={123.5} recipeServings={2.5} totalTimeMinutes={0} complexity="easy" />);
    const labels = ["Approximately 124 calories per serving", "Recipe yields 2.5 servings", "Total recipe time: 0 minutes", "Recipe complexity: Easy"];
    for (const label of labels) expect(html).toContain(label);
    expect(labels.map(label => html.indexOf(label))).toEqual(labels.map(label => html.indexOf(label)).sort((a, b) => a - b));
    for (const text of [">≈124 kcal<", ">2.5<", ">0 mins<", ">Easy<", "flex-wrap", "text-xs"]) expect(html).toContain(text);
    expect(html).not.toContain("lucide-flame");
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("<button");
  });
  it("keeps unknowns explicit, defaults missing complexity and preserves a singular yield", () => {
    const html = renderToStaticMarkup(<RecipeResourcePills compact={compact} recipeServings={1} />);
    for (const text of ["Calories unavailable", "Recipe time not set", ">Not set<", "Recipe yields 1 serving", "Recipe complexity: Medium"]) expect(html).toContain(text);
    expect(html).not.toContain("1 servings");
  });
  it("does not manufacture recipe yield or complexity for food-only cards", () => {
    const html = renderToStaticMarkup(<RecipeResourcePills compact={compact} calories={Number.NaN} />);
    expect(html).toContain("Calories unavailable");
    expect(html).not.toContain("Recipe yields"); expect(html).not.toContain("Recipe complexity");
  });
  it("keeps zero distinct from missing, negative or infinite calories", () => {
    const zero = renderToStaticMarkup(<RecipeResourcePills compact={compact} calories={0} />);
    expect(zero).toContain(">≈0 kcal<"); expect(zero).toContain("Approximately 0 calories per serving");
    for (const calories of [undefined, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      const html = renderToStaticMarkup(<RecipeResourcePills compact={compact} calories={calories} />);
      expect(html).toContain("Calories unavailable"); expect(html).not.toContain(">≈0 kcal<");
    }
  });
});

it("opts into responsive scrolling without dropping any resource meanings", () => {
  const html = renderToStaticMarkup(<RecipeResourcePills mobileScrollable recipeServings={2.5} complexity="hard" />);
  for (const text of ["overflow-x-auto", "[scrollbar-width:none]", "[&amp;::-webkit-scrollbar]:hidden", "sm:overflow-visible", "flex-nowrap", "sm:flex-wrap", "whitespace-nowrap", "Calories unavailable", "Recipe yields 2.5 servings", "Recipe time not set", "Recipe complexity: Hard"]) expect(html).toContain(text);
  expect(html).not.toContain('tabindex="0"');
  expect(html).not.toContain("lucide-flame");
});
