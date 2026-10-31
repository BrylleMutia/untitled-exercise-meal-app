import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GroupGrocery } from "./GroupGrocery";
import type { GroupWeek } from "@/types/cookingGroup";

vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ snapshot: { userId: "alice" }, actions: {}, pendingMutation: null }) }));
afterEach(() => vi.unstubAllGlobals());

describe("shared groceries on an HTTP LAN preview", () => {
  it("renders the list and extra-item draft without crypto.randomUUID", () => {
    const crypto = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const week: GroupWeek = {
      weekOf: "2026-10-25", revision: 0,
      group: { id: "group", revision: 1, weekStartsOn: 0, proposal: null, members: [{ id: "alice", name: "Alice", joinedAt: "2026-10-01" }] },
      recipes: [], assignments: [], generation: null, notices: [],
      grocery: { id: "groceries", weekOf: "2026-10-25", items: [{ id: "rice", name: "Rice", category: "Grains", unit: "g", quantity: 500, generatedQuantity: 500, checked: false }] },
    };
    const html = renderToStaticMarkup(<GroupGrocery week={week} refresh={vi.fn()} onSavingChange={vi.fn()} />);
    expect(html).toContain("Grocery list");
    expect(html).toContain("Rice");
    expect(html).toContain('aria-label="Add extra item"');
  });
});
