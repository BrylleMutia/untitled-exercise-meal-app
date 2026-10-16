import { describe, expect, it } from "vitest";
import { CREAMY_LEMON_CHICKEN } from "@/constants/creamyLemonChicken";
import { KOREAN_BEEF_BOWL } from "@/constants/koreanBeefBowl";
import { FOODS } from "@/constants/foods";
import { cookingGramsPerUnit, formatCookingMeasurement, parseCookingMeasurement, parseUnmeasuredIngredients } from "./cookingMeasurement";
import { recipeIngredientDraft, recipePreview } from "./recipeEditor";

describe("original cooking measurements", () => {
  it("preserves the whole original chicken list and the same calculation quantities", () => {
    expect(CREAMY_LEMON_CHICKEN.ingredients.map(item => formatCookingMeasurement(item))).toEqual(["400 g", "25–30 g", "1 tbsp", "300 ml", "Juice of 1 lemon", "1 tbsp"]);
    const drafts = CREAMY_LEMON_CHICKEN.ingredients.map((item, index) => recipeIngredientDraft(item, FOODS.find(food => food.id === item.foodId)!, String(index)));
    expect(recipePreview(drafts, "2", FOODS)?.ingredients.map(({ foodId, servings }) => ({ foodId, servings }))).toEqual(CREAMY_LEMON_CHICKEN.ingredients.map(({ foodId, servings }) => ({ foodId, servings })));
    expect(CREAMY_LEMON_CHICKEN.unmeasuredIngredients).toHaveLength(4);
  });
  it("retains household counts, optional ginger and source-unmeasured garnishes", () => {
    expect(KOREAN_BEEF_BOWL.ingredients.map(item => formatCookingMeasurement(item))).toEqual(["600 g", "250 g", "2 tbsp", "1 tbsp", "1 tsp", "2 cloves", "1 tsp", "1 carrot", "½ cucumber", "For garnish", "For garnish"]);
    expect(KOREAN_BEEF_BOWL.ingredients[6].cookingMeasurement?.optional).toBe(true);
  });
  it("uses upper range values and confirmed ingredient conversions without guessing", () => {
    const butter = recipeIngredientDraft(CREAMY_LEMON_CHICKEN.ingredients[1], FOODS.find(food => food.id === CREAMY_LEMON_CHICKEN.ingredients[1].foodId)!, "butter");
    expect(recipePreview([{ ...butter, upperQuantity: "40" }], "2", FOODS)?.ingredients[0].servings).toBe(0.4);
    const unknown = { ...butter, measurementKind: "amount" as const, quantity: "1", upperQuantity: undefined, unit: "cup", gramsPerUnit: undefined };
    expect(recipePreview([unknown], "2", FOODS)).toBeNull();
    expect(recipePreview([{ ...unknown, gramsPerUnit: "100" }], "2", FOODS)?.ingredients[0].servings).toBe(1);
    expect(recipePreview([{ ...butter, upperQuantity: "24" }], "2", FOODS)).toBeNull();
  });
  it("uses the explicit milk conversion instead of treating a 100-ml option as one ml", () => {
    const milk = recipeIngredientDraft(CREAMY_LEMON_CHICKEN.ingredients[3], FOODS.find(food => food.id === CREAMY_LEMON_CHICKEN.ingredients[3].foodId)!, "milk");
    expect(recipePreview([milk], "2", FOODS)?.ingredients[0].servings).toBe(3.09);
    const food = FOODS.find(food => food.id === CREAMY_LEMON_CHICKEN.ingredients[3].foodId)!;
    for (const label of ["100 ml", "a cup", "about 2 cups"]) expect(cookingGramsPerUnit("cup", { ...food, servingOptions: [{ unit: "cup", label, grams: 100 }] })).toBeNull();
    for (const label of ["0.5 cup", "½ cup"]) expect(cookingGramsPerUnit("cup", { ...food, servingOptions: [{ unit: "cup", label, grams: 100 }] })).toBe(200);
    expect(cookingGramsPerUnit("cup", { ...food, servingOptions: [{ unit: "cup", label: "2 cups", grams: 100 }] })).toBe(50);
    expect(cookingGramsPerUnit("cup", { ...food, servingOptions: [{ unit: "cup", label: "1 cup", grams: 100 }] })).toBe(100);
  });
  it("falls back to available grams/pieces without inventing legacy source units", () => {
    const food = FOODS.find(food => food.unit === "g")!;
    expect(formatCookingMeasurement({ foodId: food.id, servings: 2 }, food)).toBe(`${food.servingGrams * 2} g`);
    expect(recipeIngredientDraft({ foodId: food.id, servings: 2 }, food, "old").unit).toBe("g");
    expect(formatCookingMeasurement({ foodId: "missing", servings: 1 })).toBe("Measurement unavailable");
  });
  it("rejects invalid metadata and accepts bounded unmeasured items", () => {
    for (const value of [{ kind: "range", quantity: 30, upperQuantity: 25, unit: "g" }, { kind: "amount", quantity: -1, unit: "g" }, { kind: "unmeasured", text: "To taste", gramsPerUnit: 1 }, { kind: "amount", quantity: 1, unit: "cup", gramsPerUnit: Infinity }]) expect(parseCookingMeasurement(value)).toBeNull();
    expect(parseUnmeasuredIngredients([{ name: "Salt", measurement: "To taste" }])).toHaveLength(1);
    expect(parseUnmeasuredIngredients([{ name: "", measurement: "To taste" }])).toBeNull();
  });
});
