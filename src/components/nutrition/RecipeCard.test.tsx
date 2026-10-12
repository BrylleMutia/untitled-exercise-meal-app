import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeCard } from "./RecipeCard";

describe("recipe card", () => {
  it("prioritizes Popular while retaining a separate pressed favorite control", () => {
    const html = renderToStaticMarkup(<RecipeCard name="Dinner" calories={123.5} recipeServings={4} complexity="medium" totalTimeMinutes={0}
      metadata={{ mealId: "meal", favorite: true, favoriteRevision: 1, popularRank: 2, usageCount: 4 }}
      onOpen={() => {}} onFavorite={() => {}} favoriteAvailable actions={<button>Log</button>} />);
    expect(html).toContain("Popular");
    expect(html).not.toContain(">Favorite<");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Remove from favorites: Dinner");
    expect(html).toContain("≈124 kcal");
    expect(html).not.toContain("kcal / serving");
    expect(html).toContain("Approximately 124 calories per serving");
    expect(html).toContain("Recipe yields 4 servings");
    expect(html).toContain("0 mins total");
    expect(html).toContain("Medium");
    expect(html.indexOf("Recipe details")).toBeLessThan(html.indexOf(">Log<"));
  });
  it("uses truthful unknown fields and omits recipe controls for food-only cards", () => {
    const html = renderToStaticMarkup(<RecipeCard name="Unresolved meal" planned context="Lunch · 1 serving" actions={<button>Edit</button>} />);
    expect(html).toContain("Calories unavailable"); expect(html).toContain("Recipe time not set"); expect(html).toContain(">Not set<");
    expect(html).not.toContain("Recipe yields"); expect(html).not.toContain("Recipe complexity");
    expect(html).not.toContain("favorites:"); expect(html).not.toContain("View recipe:");
    expect(html).toContain("recipe-default.png");
  });
  it("shows a default Medium and fractional recipe yield without changing planned context", () => {
    const html = renderToStaticMarkup(<RecipeCard name="Legacy recipe" planned recipeServings={2.5} calories={560} context="Planned · Lunch · 1 serving" actions={<button>Log</button>} />);
    expect(html).toContain("Recipe yields 2.5 servings");
    expect(html).toContain("Recipe complexity: Medium");
    expect(html).toContain("Planned · Lunch · 1 serving");
    expect(html).toContain("≈560 kcal");
    expect(html.indexOf("≈560 kcal")).toBeLessThan(html.indexOf("Recipe yields"));
    expect(html.indexOf("Recipe yields")).toBeLessThan(html.indexOf("Recipe time not set"));
  });
  it("places expanded content above its action footer and keeps image and name triggers separate", () => {
    const html = renderToStaticMarkup(<RecipeCard name="Recipe" onOpen={() => {}} actions={<button>Log</button>}><label>Actual servings<input /></label></RecipeCard>);
    expect(html.indexOf("Actual servings")).toBeLessThan(html.indexOf(">Log<"));
    expect(html).toContain("View recipe image: Recipe"); expect(html).toContain("View recipe: Recipe");
  });
});
