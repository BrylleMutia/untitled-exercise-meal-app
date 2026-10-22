import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { GroupWeek } from "@/types/cookingGroup";
import { CookingOverview } from "./GroupCookingSchedule";

vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ snapshot: { userId: "self" }, actions: {}, pendingMutation: null }) }));
vi.mock("@/components/ui/Modal", () => ({ Modal: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

function render(memberIds: string[]) {
  const week: GroupWeek = {
    weekOf: "2026-10-17", revision: 1, recipes: [], grocery: null, generation: null, notices: [],
    group: { id: "group", revision: 1, weekStartsOn: 6, proposal: null, members: ["self", "other"].map(id => ({ id, name: "Brylle", joinedAt: "2026-10-01T00:00:00Z" })) },
    assignments: memberIds.map(memberId => ({ id: memberId, memberId, recipeId: "recipe", date: "2026-10-22", slot: "breakfast", servings: 1 })),
    cooking: [{ recipeId: "recipe", recipeRevision: 1, name: "Recipe", yield: 4, portions: memberIds.length, batches: 1, leftovers: 4 - memberIds.length, assignmentIds: memberIds }],
  };
  return renderToStaticMarkup(<CookingOverview week={week} loading={false} refresh={vi.fn()} onClose={vi.fn()} onSummary={vi.fn()} disabled={false} returnFocus={{ current: null }} />).replace(/<[^>]+>/g, "");
}

describe("saved cooking assignment identity", () => {
  it("distinguishes the current account from another member with the same name", () => {
    const html = render(["self", "other"]);
    expect(html).toContain("Brylle (you)");
    expect(html).toContain("For: Brylle, Brylle (you)");
    expect(html).toContain("breakfast · Brylle (you)");
  });
  it("does not identify another account's assignments as yours based on a matching name", () => {
    const html = render(["other"]);
    expect(html).not.toContain("(you)");
    expect(html).toContain("For: Brylle");
  });
});
