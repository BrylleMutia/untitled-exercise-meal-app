import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps, ReactNode } from "react";
import type { AppSnapshot } from "@/types/domain";
import { ConnectedGenerateDialog } from "./ConnectedGenerateDialog";

let state: { data?: { group: object | null }; loading: boolean; error?: string };
vi.mock("./useCookingGroup", () => ({ useCookingGroup: () => ({ ...state, refresh: vi.fn() }) }));
vi.mock("./GroupGenerateDialog", () => ({ GroupGenerateDialog: () => <p>People planner</p> }));
vi.mock("@/components/nutrition/GenerateWeekDialog", () => ({ GenerateWeekDialog: () => <p>Individual planner</p> }));
vi.mock("@/components/ui/Modal", () => ({ Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <div>{children}{footer}</div> }));
beforeEach(() => { state = { data: { group: {} }, loading: false }; });
const snapshot: AppSnapshot = {
  schemaVersion: 1, userId: "alice", onboarded: true, profile: null, foods: [], goal: null, target: null,
  nutritionWeekTargets: [], plan: null, workoutOverrides: [], mealPlan: null, sessions: [], nutritionLogs: [],
  loggedMeals: [], weights: [], grocery: null, savedMeals: [], progressionDecisions: [], dailySteps: [], customWorkouts: [], customSessions: [],
};
const props: ComponentProps<typeof ConnectedGenerateDialog> = {
  snapshot, weekOf: "2026-11-01", onClose: vi.fn(), returnFocus: { current: null }, pending: false,
  unavailable: false, onSave: vi.fn(async () => true), onRefresh: vi.fn(),
};
describe("one connected generation path", () => {
  it("uses People for connected accounts without an individual bypass", () => {
    const html = renderToStaticMarkup(<ConnectedGenerateDialog {...props} />);
    expect(html).toContain("People planner");
    expect(html).not.toContain("Individual planner");
    expect(html).not.toContain("Plan for my account only");
  });
  it("blocks an unknown membership and offers Retry on failure", () => {
    state = { loading: true };
    expect(renderToStaticMarkup(<ConnectedGenerateDialog {...props} />)).toContain("Checking cooking group");
    state = { data: { group: null }, loading: false, error: "Offline" };
    const html = renderToStaticMarkup(<ConnectedGenerateDialog {...props} />);
    expect(html).toContain("Retry connection");
    expect(html).not.toContain("Individual planner");
    expect(html).not.toContain("Plan for my account only");
  });
  it("preserves individual generation after confirming there is no group", () => {
    state = { data: { group: null }, loading: false };
    expect(renderToStaticMarkup(<ConnectedGenerateDialog {...props} />)).toContain("Individual planner");
  });
});
