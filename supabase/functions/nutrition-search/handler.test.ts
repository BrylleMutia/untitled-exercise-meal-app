import { describe, expect, it, vi } from "vitest";
import { createNutritionSearchHandler } from "./handler";

const food = {
  fdcId: 123,
  dataType: "Foundation",
  description: "Rice, white, long-grain, cooked",
  servingSize: 100,
  foodNutrients: [
    { nutrientId: 1008, value: 130 },
    { nutrientId: 1003, value: 2.7 },
    { nutrientId: 1005, value: 28.2 },
    { nutrientId: 1004, value: 0.3 },
    { nutrientId: 1079, value: 0 },
  ],
  foodMeasures: [
    { disseminationText: "1 cup", measureUnitAbbreviation: "cup", gramWeight: 158 },
    { disseminationText: "unknown", measureUnitAbbreviation: "tbsp", gramWeight: 0 },
  ],
};

function request(body: unknown, authorization = "Bearer user-token") {
  return new Request("https://example.test/functions/v1/nutrition-search", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setup(options: {
  authenticated?: boolean;
  allowed?: boolean;
  apiKey?: string;
  release?: string;
  fetchImpl?: typeof fetch;
} = {}) {
  const authenticate = vi.fn(async () => options.authenticated ?? true);
  const consumeQuota = vi.fn(async () => options.allowed ?? true);
  const fetchImpl = options.fetchImpl ?? vi.fn(async () => new Response(JSON.stringify({ foods: [food] }), { status: 200 }));
  const handler = createNutritionSearchHandler({
    apiKey: () => options.apiKey === undefined ? "private-usda-key" : options.apiKey,
    release: () => options.release === undefined ? "FoodData Central API verified 2026-09-22" : options.release,
    authenticate,
    consumeQuota,
    fetchImpl,
  });
  return { handler, authenticate, consumeQuota, fetchImpl };
}

describe("nutrition-search USDA boundary", () => {
  it("rejects anonymous and invalid input before quota or provider calls", async () => {
    const anonymous = setup({ authenticated: false });
    expect((await anonymous.handler(request({ query: "rice" }))).status).toBe(401);
    expect(anonymous.consumeQuota).not.toHaveBeenCalled();
    expect(anonymous.fetchImpl).not.toHaveBeenCalled();

    const invalid = setup();
    expect((await invalid.handler(request({ query: "x" }))).status).toBe(400);
    expect(invalid.consumeQuota).not.toHaveBeenCalled();
  });

  it("normalizes USDA nutrients, preparation basis, release, revision, and valid serving weights", async () => {
    const { handler, fetchImpl } = setup();
    const response = await handler(request({ query: "rice", pageSize: 1 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.candidates).toEqual([expect.objectContaining({
      fdcId: "123",
      recordType: "Foundation",
      sourceVersion: "FoodData Central API verified 2026-09-22",
      preparationBasis: "cooked",
      providerRevision: "Foundation:123",
      nutrientsPer100g: expect.objectContaining({ fiberG: 0 }),
      servingOptions: [{ label: "1 cup", unit: "cup", grams: 158 }],
    })]);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(String(url)).toContain("api_key=private-usda-key");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      query: "rice",
      pageSize: 1,
      pageNumber: 1,
      dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
    });
  });

  it("omits incomplete records and returns no serving options without positive gram weights", async () => {
    const response = await setup({
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ foods: [
        { ...food, fdcId: 0 },
        { ...food, fdcId: 456, description: "Prepared food", foodMeasures: [{ disseminationText: "1 bowl", gramWeight: 0 }] },
      ] }), { status: 200 })),
    }).handler(request({ query: "food" }));
    const body = await response.json();
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].servingOptions).toBeUndefined();
    expect(body.candidates[0].preparationBasis).toBe("prepared");
  });

  it("handles rate limits, missing configuration, timeouts, malformed payloads, and upstream failures safely", async () => {
    expect((await setup({ allowed: false }).handler(request({ query: "rice" }))).status).toBe(429);
    expect((await setup({ apiKey: "" }).handler(request({ query: "rice" }))).status).toBe(503);
    expect((await setup({ release: "" }).handler(request({ query: "rice" }))).status).toBe(503);
    expect((await setup({ fetchImpl: vi.fn(async () => { throw new DOMException("secret timeout", "AbortError"); }) }).handler(request({ query: "rice" }))).status).toBe(502);
    expect((await setup({ fetchImpl: vi.fn(async () => new Response("not-json", { status: 200 })) }).handler(request({ query: "rice" }))).status).toBe(502);
    expect((await setup({ fetchImpl: vi.fn(async () => new Response(JSON.stringify({ foods: {} }), { status: 200 })) }).handler(request({ query: "rice" }))).status).toBe(502);
    const failed = await setup({ fetchImpl: vi.fn(async () => new Response("provider secret", { status: 500 })) }).handler(request({ query: "rice" }));
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "provider_unavailable" });
  });
});
