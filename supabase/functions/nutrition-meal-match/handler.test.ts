import { describe, expect, it, vi } from "vitest";
import { createNutritionMealMatchHandler } from "./handler";

const food = { fdcId: 123, dataType: "Foundation", description: "Cooked white rice", foodNutrients: [{ nutrientId: 1008, value: 130 }, { nutrientId: 1003, value: 2.7 }, { nutrientId: 1005, value: 28 }, { nutrientId: 1004, value: 0.3 }], foodMeasures: [{ disseminationText: "1 cup", measureUnitAbbreviation: "cup", gramWeight: 158 }] };
function request(body: unknown, authorization = "Bearer token") { return new Request("https://example.test", { method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
function setup(options: { authenticated?: boolean; allowed?: boolean; fetchImpl?: typeof fetch } = {}) {
  const fetchImpl = options.fetchImpl ?? vi.fn(async () => new Response(JSON.stringify({ foods: [food] }), { status: 200 }));
  const handler = createNutritionMealMatchHandler({ apiKey: () => "usda-secret", release: () => "FDC-2025-01", authenticate: vi.fn(async () => options.authenticated ?? true), consumeQuota: vi.fn(async () => options.allowed ?? true), fetchImpl });
  return { handler, fetchImpl };
}

describe("nutrition-meal-match boundary", () => {
  it("normalizes a bounded batch and keeps valid serving weights", async () => {
    const { handler, fetchImpl } = setup();
    const response = await handler(request({ ingredients: [{ name: "rice", preparation: "cooked" }] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.matches[0].candidates[0]).toMatchObject({ fdcId: "123", recordType: "Foundation", sourceVersion: "FDC-2025-01", providerRevision: "Foundation:123", servingOptions: [{ grams: 158 }] });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(String(url)).toContain("api_key=usda-secret");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      query: "rice cooked",
      pageSize: 3,
      pageNumber: 1,
      dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
    });
  });

  it("denies anonymous, invalid, rate-limited, and upstream failures", async () => {
    expect((await setup({ authenticated: false }).handler(request({ ingredients: [{ name: "egg" }] }))).status).toBe(401);
    expect((await setup().handler(request({ ingredients: [] }))).status).toBe(400);
    expect((await setup({ allowed: false }).handler(request({ ingredients: [{ name: "egg" }] }))).status).toBe(429);
    expect((await setup({ fetchImpl: vi.fn(async () => new Response("failure", { status: 500 })) }).handler(request({ ingredients: [{ name: "egg" }] }))).status).toBe(502);
  });
});
