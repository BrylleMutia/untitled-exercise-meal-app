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
  it("exposes pending review conversions separately from added ingredients", () => {
    const food = { ...FOODS[0], unit: "g" as const, servingOptions: [] };
    const review = [{ id: "salt", name: "Salt", food, quantity: "1", unit: "tsp", included: true, assumptions: [] }, { id: "oil", name: "Oil", food, quantity: "1.5", unit: "tbsp", included: false, assumptions: [], gramsPerUnit: "14" }];
    const html = renderToStaticMarkup(<RecipeNutritionBasis ingredients={[]} review={review} foods={[]} notes="" hasUnmeasured={false} onIngredient={() => {}} onReviewIngredient={() => {}} onReview={() => {}} onNotes={() => {}} onIngredients={() => {}} />);
    expect(html).toContain('aria-label="Recipe ingredients"');
    expect(html).toContain('aria-label="Ingredients awaiting addition"');
    expect(html).toContain('aria-label="Salt grams per tsp"');
    expect(html).toContain('aria-label="Oil grams per tbsp"');
    expect(html).toContain("Selected for addition");
    expect(html).toContain("Not selected for addition");
    expect(html).toContain("Return to ingredient review");
    expect(html).toContain("21 g used for nutrition");
  });
});
