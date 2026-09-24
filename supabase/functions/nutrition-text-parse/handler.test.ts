import { describe, expect, it, vi } from "vitest";
import { createNutritionTextHandler } from "./handler";

const candidate = {
  name: "cooked rice",
  quantity: 1,
  unit: "cup",
  preparation: "cooked",
  assumptions: ["Portion size should be confirmed."],
  confidence: "medium",
  presence: "stated",
};

function deepSeekResponse(content: unknown, status = "completed") {
  return new Response(JSON.stringify({
    status,
    output: [{
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: content }],
    }],
  }), { status: 200 });
}

function request(authorization = "Bearer user-token", text = "one cup of cooked rice") {
  return new Request("https://example.test/functions/v1/nutrition-text-parse", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ text, locale: "en-US", requestId: "test-request" }),
  });
}

function setup(options: {
  authenticated?: boolean;
  allowed?: boolean;
  apiKey?: string;
  fetchImpl?: typeof fetch;
} = {}) {
  const authenticate = vi.fn(async () => options.authenticated ?? true);
  const consumeQuota = vi.fn(async () => options.allowed ?? true);
  const fetchImpl = options.fetchImpl ?? vi.fn(async () => deepSeekResponse(JSON.stringify({ suggestedMealName: "Rice", candidates: [candidate], questions: ["How much oil was used?"] })));
  const handler = createNutritionTextHandler({
    apiKey: () => options.apiKey === undefined ? "private-deepseek-key" : options.apiKey,
    authenticate,
    consumeQuota,
    fetchImpl,
  });
  return { handler, authenticate, consumeQuota, fetchImpl };
}

describe("nutrition-text-parse DeepSeek boundary", () => {
  it("rejects anonymous and invalid sessions before quota or provider calls", async () => {
    const { handler, authenticate, consumeQuota, fetchImpl } = setup({ authenticated: false });
    expect((await handler(request(""))).status).toBe(401);
    expect((await handler(request())).status).toBe(401);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends bounded text to DeepSeek without macros and returns only candidate data", async () => {
    const { handler, fetchImpl } = setup();
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestedMealName: "Rice", candidates: [candidate], questions: ["How much oil was used?"] });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/responses");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer private-deepseek-key" });
    const payload = JSON.parse(String(init?.body));
    expect(payload.model).toBe("deepseek-flash");
    expect(payload.reasoning).toEqual({ effort: "none" });
    expect(payload.text.format.type).toBe("json_schema");
    expect(payload.input[1]).toEqual({ role: "user", content: "one cup of cooked rice" });
    expect(payload.text.format.schema.properties.candidates.items.properties.calories).toBeUndefined();
    expect(JSON.stringify(payload)).not.toMatch(/service_role|proteinG/);
  });

  it("rejects malformed, empty, incomplete, or untrusted nutrition output", async () => {
    const outputs = [
      deepSeekResponse(""),
      deepSeekResponse("not json"),
      deepSeekResponse(JSON.stringify({ suggestedMealName: "Rice", candidates: [candidate], questions: [] }), "incomplete"),
      deepSeekResponse(JSON.stringify({ suggestedMealName: "Rice", candidates: [{ ...candidate, calories: 300 }], questions: [] })),
      deepSeekResponse(JSON.stringify({ suggestedMealName: "Rice", candidates: [{ ...candidate, quantity: -1 }], questions: [] })),
    ];
    for (const output of outputs) {
      const { handler } = setup({ fetchImpl: vi.fn(async () => output) });
      const response = await handler(request());
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "provider_invalid_response" });
    }
  });

  it("handles provider errors and timeouts without leaking provider details", async () => {
    for (const fetchImpl of [
      vi.fn(async () => new Response("secret upstream details", { status: 500 })),
      vi.fn(async () => { throw new DOMException("timed out with secret details", "AbortError"); }),
    ]) {
      const { handler } = setup({ fetchImpl });
      const response = await handler(request());
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "provider_unavailable" });
    }
  });

  it("honors quota and missing secret without calling the provider", async () => {
    const limited = setup({ allowed: false });
    expect((await limited.handler(request())).status).toBe(429);
    expect(limited.fetchImpl).not.toHaveBeenCalled();
    const unconfigured = setup({ apiKey: "" });
    expect((await unconfigured.handler(request())).status).toBe(503);
    expect(unconfigured.fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects invalid inputs before charging quota", async () => {
    const { handler, consumeQuota } = setup();
    expect((await handler(request("Bearer user-token", "x"))).status).toBe(400);
    expect((await handler(request("Bearer user-token", "x".repeat(1001)))).status).toBe(400);
    expect(consumeQuota).not.toHaveBeenCalled();
  });
});
