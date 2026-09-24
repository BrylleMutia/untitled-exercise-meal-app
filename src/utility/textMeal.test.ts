import { describe, expect, it } from "vitest";
import { FOODS } from "@/constants/foods";
import { parseMealText, servingPlanForCandidate } from "./textMeal";

describe("text meal serving reconciliation", () => {
  it("converts a supported tablespoon option into the trusted gram basis", () => {
    const butter = FOODS.find((food) => food.id === "food-butter");
    expect(butter).toBeDefined();

    const plan = servingPlanForCandidate(butter!, 2, "tbsp");

    expect(plan).toMatchObject({
      servings: 6,
      servingQuantity: 30,
      servingUnit: "g",
    });
  });

  it("keeps an unsupported unit in review instead of guessing", () => {
    const butter = FOODS.find((food) => food.id === "food-butter");
    expect(butter).toBeDefined();

    expect(servingPlanForCandidate(butter!, 2, "cup")).toBeNull();
  });

  it("preserves units and uses the converted plan for local fallback candidates", () => {
    const candidates = parseMealText("2 tbsp butter", FOODS);

    expect(candidates[0]).toMatchObject({
      name: "butter",
      quantity: 2,
      unit: "tbsp",
      matched: { id: "food-butter" },
      servingPlan: { servingQuantity: 30, servingUnit: "g" },
    });
  });
});
