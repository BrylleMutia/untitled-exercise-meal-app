import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CookingGroupSurface, CookingOverviewButton } from "./CookingGroupSurface";
import type { GroupWeek } from "@/types/cookingGroup";

let data: GroupWeek | undefined;
let error: string | undefined;
let loading = false;
vi.mock("./useCookingGroup", () => ({ useCookingGroup: () => ({ data, error, loading, refresh: vi.fn() }) }));
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ snapshot: { userId: "alice", profile: { weekStartsOn: 0 } }, actions: {}, pendingMutation: null }) }));
beforeEach(() => {
  error = undefined; loading = false;
  data = { weekOf: "2026-11-01", group: { id: "group", weekStartsOn: 0, revision: 1, proposal: null, members: [{ id: "alice", name: "Alice", joinedAt: "2026-10-01T00:00:00Z" }, { id: "bea", name: "Bea", joinedAt: "2026-10-01T00:00:00Z" }] }, recipes: [], assignments: [], grocery: null, generation: null, notices: [], revision: 0 };
});
function render(kind: "nutrition" | "grocery") {
  return renderToStaticMarkup(<CookingGroupSurface weekOf="2026-11-01" kind={kind} onWeekChange={vi.fn()}>{state => <><p>{state.connected ? "Private daily content" : "Individual daily content"}</p>{kind === "nutrition" ? <CookingOverviewButton /> : null}</>}</CookingGroupSurface>);
}
describe("unified cooking surfaces", () => {
  it("keeps daily Nutrition with Overview and no extra recipe section or Generate", () => {
    const html = render("nutrition");
    expect(html).toContain("Private daily content");
    expect(html).toContain('aria-label="Overview"');
    expect(html).toContain("lucide-calendar-days");
    expect(html).not.toContain(">Overview</button>");
    expect(html).not.toContain("Cooking this week");
    expect(html).not.toContain("Shared recipes");
    expect(html).not.toContain("Nutrition view");
    expect(html).not.toContain(">Generate</button>");
  });
  it("shows one Grocery navigator, shared spending/list, then the private content", () => {
    const html = render("grocery");
    expect(html.match(/Choose a grocery week/g)).toHaveLength(1);
    expect(html).toContain("Shared grocery spending");
    expect(html).toContain("Shared grocery list");
    expect(html.indexOf("Shared grocery list")).toBeLessThan(html.indexOf("Private daily content"));
    expect(html).not.toContain("Grocery view");
    expect(html).not.toContain("Shared recipes");
  });
  it("keeps owner content available through a shared read failure", () => {
    data = undefined; error = "Offline";
    const html = render("nutrition");
    expect(html).toContain("Individual daily content");
    expect(html).toContain("Retry shared week");
    expect(html).not.toContain("Nothing planned for the group");
  });
  it("retains the individual page when disconnected without inventing group emptiness", () => {
    data = { ...data!, group: null };
    const html = render("nutrition");
    expect(html).toContain("Individual daily content");
    expect(html).not.toContain("Cooking this week");
  });
});
