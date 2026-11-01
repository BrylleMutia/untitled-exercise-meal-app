import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GroupGrocery } from "./GroupGrocery";
import type { GroupWeek } from "@/types/cookingGroup";

vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ snapshot: { userId: "alice" }, actions: {}, pendingMutation: null }) }));
afterEach(() => vi.unstubAllGlobals());

describe("shared groceries on an HTTP LAN preview", () => {
  it("resolves original adders and transferred owners only from current group members", () => {
    const base = { name: "Extra", category: "Other" as const, unit: "pcs", quantity: 2, generatedQuantity: 0, checked: false, custom: true };
    const week: GroupWeek = {
      weekOf: "2026-10-25", revision: 0,
      group: { id: "group", revision: 1, weekStartsOn: 0, proposal: null, members: [{ id: "alice", name: "Alice", joinedAt: "2026-10-01" }] },
      recipes: [], assignments: [], generation: null, notices: [],
      grocery: { id: "list", weekOf: "2026-10-25", items: [
        { ...base, id: "authored", addedByUserId: "alice" },
        { ...base, id: "transferred", sourceOwner: "alice", personalGenerated: false },
        { ...base, id: "departed", addedByUserId: "departed" },
        { ...base, id: "unknown" },
        { ...base, id: "generated", sourceOwner: "alice", personalGenerated: true },
      ] },
    };
    const html = renderToStaticMarkup(<GroupGrocery week={week} refresh={vi.fn()} onSavingChange={vi.fn()} />);
    expect(html.match(/Added by Alice/g)).toHaveLength(2);
    expect(html).not.toContain("Added by departed");
    expect(html).not.toContain("Added by undefined");
  });
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
