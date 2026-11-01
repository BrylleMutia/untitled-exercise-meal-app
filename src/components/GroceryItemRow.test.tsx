import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GroceryItemRow } from "./GroceryItemRow";
import type { GroceryItem } from "@/types/domain";
import type { NutritionWeekReadModel } from "@/types/backend";

vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ snapshot: { userId: "owner" }, actions: {}, error: null }) }));

const base: GroceryItem = { id: "garlic", name: "Garlic", category: "Produce", unit: "g", quantity: 8, generatedQuantity: 8, checked: false };
function render(item: GroceryItem, groupId?: string, addedByName?: string) {
  const week: NutritionWeekReadModel = { weekOf: "2026-10-24", mealPlan: null, targets: [], nutritionLogs: [], loggedMeals: [], recipes: [], foods: [], grocery: { id: "list", weekOf: "2026-10-24", items: [item] } };
  return renderToStaticMarkup(<GroceryItemRow item={item} week={week} disabled={false} groupId={groupId} addedByName={addedByName} onRefresh={vi.fn()} onSavingChange={vi.fn()} />);
}

describe("grocery item origin and quantity copy", () => {
  it("attributes manual shared rows without calling their quantity an adjustment by the viewer", () => {
    const item = { ...base, custom: true, generatedQuantity: 0, addedByUserId: "alice", carriedFromWeek: "2026-10-18" };
    expect(render(item, "group", "Alice")).toContain("Carried from 2026-10-18 · Added by Alice");
    expect(render(item, "group", "Alice")).not.toContain("adjusted by you");
    const unknown = render({ ...item, carriedFromWeek: undefined }, "group");
    expect(unknown).not.toContain("Added by");
    expect(unknown).not.toContain("adjusted by you");
    expect(unknown.match(/<p\b/g)).toHaveLength(1);
    expect(render(item, undefined, "Alice")).not.toContain("Added by");
    expect(render({ ...item, personalGenerated: true }, "group", "Alice")).not.toContain("Added by");
  });
  it.each([
    { scenario: "personal generated ingredient", fields: {}, groupId: undefined, label: "Generated" },
    { scenario: "personal manual extra", fields: { custom: true }, groupId: undefined, label: null },
    { scenario: "shared generated ingredient", fields: {}, groupId: "group", label: "Generated" },
    { scenario: "shared manual extra", fields: { custom: true }, groupId: "group", label: null },
    { scenario: "transferred generated ingredient", fields: { custom: true, personalGenerated: true }, groupId: "group", label: "Generated" },
    { scenario: "transferred manual extra", fields: { custom: true, personalGenerated: false }, groupId: "group", label: null },
    { scenario: "explicit manual provenance without preservation flag", fields: { personalGenerated: false }, groupId: "group", label: null },
  ])("labels a $scenario accurately", ({ fields, groupId, label }) => {
    const html = render({ ...base, ...fields }, groupId);
    if (label) expect(html).toContain(`>${label}</span>`);
    else expect(html).not.toContain(">Generated</span>");
    expect(html).not.toContain(">Manual</span>");
    expect(html).not.toContain(">custom</span>");
    expect(html).not.toContain("uppercase");
    expect(html).not.toContain("generated 8 g");
    expect(html).not.toContain("Plan quantity:");
  });

  it("keeps generated origin after quantity adjustment and preserves carried provenance", () => {
    const item = Object.freeze({ ...base, custom: true, personalGenerated: true, quantity: 12, carriedFromWeek: "2026-10-18" });
    const html = render(item, "group");
    expect(html).toContain(">Generated</span>");
    expect(html).toContain("Carried from 2026-10-18 · adjusted by you");
    expect(html).not.toContain("generated 8 g");
    expect(html).not.toContain("Plan quantity:");
    expect(item.generatedQuantity).toBe(8);
    expect(item.custom).toBe(true);
  });

  it("omits an empty helper paragraph for an unchanged row", () => {
    const html = render(base);
    expect(html.match(/<p\b/g)).toHaveLength(1);
    expect(html).not.toContain("adjusted by you");
  });

  it("retains checked state and accessible item controls with a long name", () => {
    const name = "Extraordinarily long ingredient name for a recipe with optional seasoning";
    const html = render({ ...base, name, checked: true });
    expect(html).toContain(name);
    expect(html).toContain("line-through");
    expect(html).toContain('checked=""');
    expect(html).toContain(`aria-label="Edit quantity for ${name}"`);
    expect(html).toContain(`aria-label="Mark ${name} as done"`);
  });
});
