import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeCover } from "./RecipeCover";
import { RecipeTabs } from "./RecipeTabs";
import { RecipeNutritionBasis } from "./RecipeNutritionBasis";
import { CREAMY_LEMON_CHICKEN } from "@/constants/creamyLemonChicken";
import { FOODS } from "@/constants/foods";
import { recipeIngredientDraft } from "@/utility/recipeEditor";
describe("recipe presentation", () => {
  it("does not caption a successful/default cover", () => {
    for (const image of [undefined, CREAMY_LEMON_CHICKEN.image]) {
      const html = renderToStaticMarkup(<RecipeCover name="Chicken" image={image} />);
      expect(html).not.toContain("<figcaption");
      expect(html).toContain("<img");
    }
  });
  it("makes Details the selected tab while keeping other panels hidden", () => {
    const html = renderToStaticMarkup(<RecipeTabs active="details" onChange={() => {}} panels={{ details: "Recipe metadata and nutrition", ingredients: "Cooking ingredients", instructions: "Method" }} />);
    expect(html).toMatch(/aria-selected="true"[^>]*>Details/);
    expect(html.match(/hidden=""/g)).toHaveLength(2);
  });
  it("keeps nutrition sources and confirmed cooking conversions together in Details", () => {
    const ingredients = CREAMY_LEMON_CHICKEN.ingredients.map((item, i) => recipeIngredientDraft(item, FOODS.find(food => food.id === item.foodId)!, String(i)));
    const html = renderToStaticMarkup(<RecipeNutritionBasis ingredients={ingredients} foods={FOODS} notes="Upper range used" hasUnmeasured onIngredient={() => {}} onNotes={() => {}} onIngredients={() => {}} />);
    expect(html).toContain('aria-label="Milk grams per ml"');
    expect(html).toContain('value="1.03"');
    expect(html).toContain("USDA");
    expect(html).toContain("excluded from nutrition");
    expect(html).toContain("309 g used for nutrition");
  });
});
