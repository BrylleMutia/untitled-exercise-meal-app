import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeOverview } from "./RecipeOverview";
import { FOODS } from "@/constants/foods";
import type { Meal } from "@/types/domain";

vi.mock("@/components/ui/Modal", () => ({ Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <div>{children}<footer>{footer}</footer></div> }));

const meal: Meal = { id: "saved-recipe", name: "Saved dinner", servings: 2, ingredients: [{ foodId: FOODS[0].id, servings: 2 }], notes: "Cook and serve.", providedNutrition: { calories: 300, proteinG: 20, carbsG: 30, fatG: 10 } };
const props = { meal, foods: FOODS, returnFocus: { current: null }, onClose: () => {} };

describe("Recipe overview entry points", () => {
  it("shows read-only details without an editing action", () => {
    const html = renderToStaticMarkup(<RecipeOverview {...props} />);
    expect(html).toContain("Read-only recipe details"); expect(html).toContain("Your logged values remain as recorded");
    expect(html).toContain("Ingredients"); expect(html).toContain("Instructions"); expect(html).toContain("Cook and serve.");
    expect(html).toContain(">Close</button>"); expect(html).not.toContain(">Edit</button>");
    expect(html).not.toContain("edit to include in weekly generation");
  });
  it("keeps an editable recipe-library entry point opt-in", () => {
    const html = renderToStaticMarkup(<RecipeOverview {...props} onEdit={() => {}} editLabel="Save personal copy" />);
    expect(html).toContain("Save personal copy</button>"); expect(html).not.toContain("Read-only recipe details");
    expect(html).toContain("edit to include in weekly generation");
  });
});
