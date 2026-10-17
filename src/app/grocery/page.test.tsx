import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppSnapshot } from "@/types/domain";
import type { NutritionWeekReadModel } from "@/types/backend";
import GroceryPage from "./page";
import { WeekNavigator } from "@/components/WeekNavigator";

let data: NutritionWeekReadModel | undefined;
let loading = false, error: string | undefined, pendingMutation: string | null = null;
const snapshot = { userId: "grocery-test", grocery: { id: "wrong-list", weekOf: "2026-10-26", items: [{ id: "wrong", name: "Wrong week", quantity: 99 }] } } as AppSnapshot;
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ snapshot, pendingMutation, actions: {} }) }));
vi.mock("@/components/nutrition/useNutritionWeek", () => ({ useNutritionWeek: () => ({ data, loading, error, refresh: vi.fn() }) }));
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 16, 12));
  loading = false; error = undefined; pendingMutation = null;
  data = { weekOf: "2026-10-12", mealPlan: null, targets: [], nutritionLogs: [], loggedMeals: [], recipes: [], foods: [], grocery: null };
});
afterEach(() => vi.useRealTimers());
describe("week-specific Grocery", () => {
  it("provides past/current/future controls beside complete accessible dates", () => {
    const html = renderToStaticMarkup(<WeekNavigator weekOf="2026-12-28" onChange={vi.fn()} />);
    for (const label of ["Previous grocery week", "Next grocery week", "This week", "Mon, Dec 28 - Sun, Jan 3", "Monday, December 28, 2026 through Sunday, January 3, 2027"]) expect(html).toContain(label);
    expect(html).not.toContain('type="date"'); expect(html).not.toContain("Jump to week");
  });
  it("shows the selected week's list rather than the global current snapshot", () => {
    data!.grocery = { id: "selected", weekOf: data!.weekOf, items: [{ id: "rice", name: "Uncooked rice", category: "Grains", unit: "g", quantity: 550, generatedQuantity: 500, checked: true }] };
    const html = renderToStaticMarkup(<GroceryPage />);
    expect(html).toContain("Uncooked rice"); expect(html).toContain("generated 500 g"); expect(html).toContain("adjusted by you");
    expect(html).not.toContain("Wrong week"); expect(html).toContain('aria-label="Mark Uncooked rice as done"');
  });
  it("distinguishes loading and failed reads from an empty week", () => {
    data = undefined; loading = true;
    expect(renderToStaticMarkup(<GroceryPage />)).toContain("Loading this week&#x27;s groceries");
    expect(renderToStaticMarkup(<GroceryPage />)).not.toContain("No groceries for this week");
    loading = false; error = "Offline";
    const html = renderToStaticMarkup(<GroceryPage />);
    expect(html).toContain('role="alert"'); expect(html).toContain("Retry grocery week"); expect(html).not.toContain("No groceries for this week");
  });
  it("keeps an empty selected week explicit and disables mutations during saves", () => {
    expect(renderToStaticMarkup(<GroceryPage />)).toContain("No groceries for this week");
    pendingMutation = "add_custom_grocery_item";
    const html = renderToStaticMarkup(<GroceryPage />);
    expect(html).toContain('<fieldset disabled=""'); expect(html).toContain('aria-label="Previous grocery week" disabled=""');
  });
  it("shows saved spending independently of item quantities and flags carried values", () => {
    data!.grocery = { id: "amount", weekOf: data!.weekOf, items: [], totalAmountCentavos: 125050, totalAmountCarriedFromWeek: "2026-10-11" };
    const html = renderToStaticMarkup(<GroceryPage />);
    expect(html).toContain("₱1,250.50"); expect(html).toContain("Edit total amount");
    expect(html).toContain("Review this amount for the regrouped list.");
    data!.grocery.totalAmountCentavos = 0;
    expect(renderToStaticMarkup(<GroceryPage />)).toContain("₱0.00");
    data!.grocery.totalAmountCentavos = null;
    expect(renderToStaticMarkup(<GroceryPage />)).toContain("Not recorded");
  });
});
