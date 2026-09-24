import { describe, expect, it, vi } from "vitest";
import { createNutritionMacroEstimateHandler } from "./handler";

function response(content: unknown, status = "completed") { return new Response(JSON.stringify({ status, output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(content) }] }] }), { status: 200 }); }
const estimate = { ingredientIndex: 0, name: "fried rice", range: { calories: { low: 300, base: 450, high: 650 }, proteinG: { low: 8, base: 12, high: 20 }, carbsG: { low: 40, base: 60, high: 85 }, fatG: { low: 8, base: 15, high: 25 } }, assumptions: ["Oil amount was not provided."], modelRevision: "deepseek-flash", schemaRevision: "macro-v1", valueSource: "ai_estimate", estimated: true, confidence: "low" };
function request(body: unknown, authorization = "Bearer token") { return new Request("https://example.test", { method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
function setup(options: { authenticated?: boolean; allowed?: boolean; fetchImpl?: typeof fetch } = {}) {
  const fetchImpl = options.fetchImpl ?? vi.fn(async () => response({ estimates: [estimate] }));
  const handler = createNutritionMacroEstimateHandler({ apiKey: () => "deepseek-secret", authenticate: vi.fn(async () => options.authenticated ?? true), consumeQuota: vi.fn(async () => options.allowed ?? true), fetchImpl });
  return { handler, fetchImpl };
}
const input = { ingredients: [{ name: "fried rice", quantity: 1, unit: "bowl", preparation: "fried" }] };

describe("nutrition-macro-estimate boundary", () => {
  it("requires explicit reviewed inputs and returns low-confidence ranges", async () => {
    const { handler, fetchImpl } = setup();
    const result = await handler(request(input));
    expect(result.status).toBe(200);
    expect((await result.json()).estimates[0]).toMatchObject({ valueSource: "ai_estimate", estimated: true, confidence: "low" });
    expect(JSON.stringify(vi.mocked(fetchImpl).mock.calls[0][1]?.body)).not.toMatch(/DEEPSEEK_API_KEY|deepseek-secret/);
  });

  it("rejects invalid ranges, empty output, timeout, anonymous, and quota failures", async () => {
    expect((await setup({ authenticated: false }).handler(request(input))).status).toBe(401);
    expect((await setup({ allowed: false }).handler(request(input))).status).toBe(429);
    expect((await setup({ fetchImpl: vi.fn(async () => response({ estimates: [{ ...estimate, range: { ...estimate.range, calories: { low: 500, base: 300, high: 200 } } }] })) }).handler(request(input))).status).toBe(502);
    expect((await setup({ fetchImpl: vi.fn(async () => response({ estimates: [] })) }).handler(request(input))).status).toBe(502);
    expect((await setup({ fetchImpl: vi.fn(async () => { throw new DOMException("timeout", "AbortError"); }) }).handler(request(input))).status).toBe(502);
  });

  it("rejects unknown range fields instead of accepting an ambiguous estimate", async () => {
    const malformed = { ...estimate, range: { ...estimate.range, sodiumMg: { low: 0, base: 0, high: 0 } } };
    const result = await setup({ fetchImpl: vi.fn(async () => response({ estimates: [malformed] })) }).handler(request(input));
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: "provider_invalid_response" });
  });
});
