import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerationRecipeCard } from "./GenerationRecipeCard";
import type { WeeklyRecipeOption } from "@/utility/weeklyMealGeneration";
import type { RecipeImage } from "@/types/domain";

function option(image?: RecipeImage): WeeklyRecipeOption {
  return { recipe: { id: "recipe", name: "Chicken, vegetables and rice", servings: 4, mealSlots: ["lunch", "dinner"], image, ingredients: [] }, used: 1, remaining: 3, capacity: 3 };
}
const render = (value = option(), selected = true, disabled = false) => renderToStaticMarkup(<GenerationRecipeCard option={value} selected={selected} disabled={disabled} onChange={() => {}} />);

describe("generation recipe cards", () => {
  it("uses a display annotation without changing the recipe identity or stored name", () => {
    const value = option();
    const html = renderToStaticMarkup(<GenerationRecipeCard option={value} displayName={`${value.recipe.name} (edited)`} selected disabled={false} onChange={() => {}} />);
    expect(html).toContain("Chicken, vegetables and rice (edited)");
    expect(value.recipe.name).toBe("Chicken, vegetables and rice");
    expect(value.recipe.id).toBe("recipe");
  });
  it("labels the checkbox with its recipe name and describes planning essentials", () => {
    const html = render();
    const nameId = html.match(/aria-labelledby="([^"]+)"/)![1];
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)![1];
    expect(html).toContain(`id="${nameId}"`);
    expect(html).toContain(`id="${descriptionId}"`);
    for (const text of ["Chicken, vegetables and rice", "Lunch, Dinner", "4 servings", "1 serving", "3 servings", "Yield:", "Planned:", "Remaining:"]) expect(html).toContain(text);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
    expect(html).not.toContain("1 servings");
    expect(html).not.toContain("Calories");
    expect(html).not.toContain("Complexity");
    expect(html).not.toContain("<button");
  });
  it("ends card descriptions at Remaining for every exclusion without preventing selection", () => {
    const value = option(); value.recipe.mealSlots = []; value.used = 3.5; value.remaining = 0.5; value.capacity = 0;
    for (const [reasonCode, reason] of [["exhausted", "No whole servings remain in this week’s allowance."], ["unassigned", "Edit this recipe to assign its meals."], ["dietary", "Does not meet dietary requirements."], ["time-budget", "Exceeds cooking time or budget."], ["invalid-yield", "Invalid yield."]] as const) {
      value.reasonCode = reasonCode; value.reason = reason;
      const html = render(value, true);
      for (const text of ["No meals assigned", "3.5 servings", "0.5 servings"]) expect(html).toContain(text);
      expect(html).not.toContain(reason);
      expect(html).not.toContain('disabled=""');
      expect(html).toContain('checked=""');
      expect(html).toMatch(/Remaining: <span[^>]*>0\.5 servings<\/span><\/span><\/span><\/span><\/label>$/);
    }
    expect(render(value, true, true)).toContain('disabled=""');
  });
  it("uses the shared image path for default, predefined, external and uploaded covers", () => {
    for (const image of [undefined, { kind: "asset", id: "creamy-lemon-chicken" }, { kind: "url", url: "https://example.com/cover.png" }, { kind: "upload", path: "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.webp" }] as Array<RecipeImage | undefined>) {
      const html = render(option(image));
      expect(html).toContain("<img");
      expect(html).toContain('referrerPolicy="no-referrer"');
      expect(html).not.toContain("<figcaption");
    }
  });
});
