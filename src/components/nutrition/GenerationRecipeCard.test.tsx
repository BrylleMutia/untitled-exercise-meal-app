import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerationRecipeCard } from "./GenerationRecipeCard";
import type { WeeklyRecipeOption } from "@/utility/weeklyMealGeneration";
import type { RecipeImage } from "@/types/domain";

function option(image?: RecipeImage): WeeklyRecipeOption {
  return { recipe: { id: "recipe", name: "Chicken, vegetables and rice", servings: 4, mealSlots: ["lunch", "dinner"], image, ingredients: [] }, used: 1, remaining: 3, capacity: 3 };
}
const render = (value = option()) => renderToStaticMarkup(<GenerationRecipeCard option={value} foods={[]} />);

describe("generation recipe presentation", () => {
  it("uses the display name without changing identity and leaves selection to swiper controls", () => {
    const value = option();
    const html = renderToStaticMarkup(<GenerationRecipeCard option={value} displayName={`${value.recipe.name} (edited)`} foods={[]} />);
    expect(html).toContain("Chicken, vegetables and rice (edited)");
    expect(value.recipe.name).toBe("Chicken, vegetables and rice");
    expect(value.recipe.id).toBe("recipe");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("<button");
  });
  it("retains serving basis, slots and explicit missing nutrition", () => {
    const html = render();
    for (const text of ["Lunch, Dinner", "4 servings", "1 serving", "3 servings", "Yield", "Planned", "Remaining", "Calories unavailable", "one serving per entry"]) expect(html).toContain(text);
    expect(html).not.toContain("1 servings");
    expect(html).not.toContain("≈0 kcal");
  });
  it("does not reclassify structural exclusions as dietary restrictions", () => {
    const value = option(); value.recipe.mealSlots = []; value.used = 3.5; value.remaining = .5;
    value.reason = "No whole servings remain in this week’s allowance.";
    const html = render(value);
    for (const text of ["No meals assigned", "3.5 servings", "0.5 servings"]) expect(html).toContain(text);
    expect(html).not.toContain(value.reason);
  });
  it("uses authorized shared covers and their standard placeholder", () => {
    for (const image of [undefined, { kind: "asset", id: "creamy-lemon-chicken" }, { kind: "url", url: "https://example.com/cover.png" }, { kind: "upload", path: "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.webp" }] as Array<RecipeImage | undefined>) {
      const html = render(option(image)); expect(html).toContain("<img"); expect(html).toContain('referrerPolicy="no-referrer"'); expect(html).not.toContain("<figcaption");
    }
  });
});
