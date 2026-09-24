import { describe, expect, it, vi } from "vitest";
import { parseNutritionTextWithProvider } from "./nutritionProvider";

describe("text extraction client boundary", () => {
  it("invokes only the candidate endpoint and leaves saving to explicit confirmation", async () => {
    const invoke = vi.fn(async () => ({
      data: { candidates: [{
        name: "egg",
        quantity: 2,
        unit: "piece",
        preparation: "cooked",
        assumptions: [],
        confidence: "medium",
        presence: "stated",
      }], suggestedMealName: "Eggs", questions: [] },
      error: null,
    }));
    const auth = {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } }, error: null })),
    };
    const rpc = vi.fn();
    const from = vi.fn();
    const client = { auth, functions: { invoke }, rpc, from } as unknown as Parameters<typeof parseNutritionTextWithProvider>[0];

    const candidates = await parseNutritionTextWithProvider(client, "two eggs");

    expect(candidates.candidates).toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith("nutrition-text-parse", expect.objectContaining({
      body: expect.objectContaining({ text: "two eggs", locale: "en-US", requestId: expect.any(String) }),
      headers: { Authorization: "Bearer test-token" },
    }));
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("refreshes a browser session whose cached token no longer validates", async () => {
    const invoke = vi.fn(async () => ({
      data: { candidates: [], suggestedMealName: "Meal", questions: [] },
      error: null,
    }));
    const auth = {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "stale-token" } }, error: null })),
      getClaims: vi.fn(async () => ({ data: { claims: null }, error: new Error("stale token") })),
      refreshSession: vi.fn(async () => ({ data: { session: { access_token: "fresh-token" } }, error: null })),
    };
    const client = {
      auth,
      functions: { invoke },
      rpc: vi.fn(),
      from: vi.fn(),
    } as unknown as Parameters<typeof parseNutritionTextWithProvider>[0];

    await parseNutritionTextWithProvider(client, "two eggs");

    expect(auth.getClaims).toHaveBeenCalledWith("stale-token");
    expect(auth.refreshSession).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("nutrition-text-parse", expect.objectContaining({
      headers: { Authorization: "Bearer fresh-token" },
    }));
  });
});
