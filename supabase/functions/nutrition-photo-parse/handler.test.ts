import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createNutritionPhotoHandler } from "./handler";
import { isPhotoExtraction } from "../_shared/photoContract";
import { validPhotoDataUrl } from "../_shared/photoImage";

let image: string;
const candidate = { name: "rice", preparation: "cooked", presence: "visible", confidence: "medium", portion: { low: 100, base: 150, high: 200, unit: "g" }, assumptions: ["Size estimated from the photo."] };
const output = { status: "ok", suggestedMealName: "Rice", candidates: [candidate], questions: ["Any oil or sauce?"] };
beforeAll(async () => { image = `data:image/jpeg;base64,${(await sharp({ create: { width: 16, height: 12, channels: 3, background: "white" } }).jpeg().toBuffer()).toString("base64")}`; });
function request(body = {}, auth = "Bearer test") {
  return new Request("https://example.test/photo", { method: "POST", headers: { Authorization: auth }, body: JSON.stringify({ image, note: "rice", locale: "en-US", requestId: "photo-1", ...body }) });
}
function setup(options: { authenticated?: boolean; enabled?: boolean; quota?: boolean; output?: unknown; fetchImpl?: typeof fetch } = {}) {
  const authenticate = vi.fn(async () => options.authenticated ?? true);
  const consumeQuota = vi.fn(async () => options.quota ?? true);
  const fetchImpl = options.fetchImpl ?? vi.fn(async () => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(options.output ?? output) }] }] })));
  return { authenticate, consumeQuota, fetchImpl, handler: createNutritionPhotoHandler({ enabled: () => options.enabled ?? true, apiKey: () => "test-key", authenticate, consumeQuota, fetchImpl }) };
}
describe("photo analysis boundary", () => {
  it("validates actual JPEG dimensions and signature", async () => {
    expect(validPhotoDataUrl(image)).toBe(true);
    expect(validPhotoDataUrl("data:image/jpeg;base64,aGVsbG8=")).toBe(false);
    expect(validPhotoDataUrl("https://example.test/private.jpg")).toBe(false);
    const large = await sharp({ create: { width: 1601, height: 10, channels: 3, background: "white" } }).jpeg().toBuffer();
    expect(validPhotoDataUrl(`data:image/jpeg;base64,${large.toString("base64")}`)).toBe(false);
  });
  it("rejects anonymous sessions, disabled release gates and exhausted quotas without provider calls", async () => {
    for (const [options, expected] of [[{ authenticated: false }, 401], [{ enabled: false }, 503], [{ quota: false }, 429]] as const) {
      const { handler, fetchImpl } = setup(options);
      expect((await handler(request())).status).toBe(expected); expect(fetchImpl).not.toHaveBeenCalled();
    }
    const { handler, authenticate } = setup();
    expect((await handler(request({}, ""))).status).toBe(401); expect(authenticate).not.toHaveBeenCalled();
  });
  it("rejects invalid payloads before consuming quota", async () => {
    for (const body of [{ image: "bad" }, { image: "https://localhost/private" }, { note: "x".repeat(1001) }, { requestId: "" }, { userId: "other-user" }]) {
      const { handler, consumeQuota } = setup();
      expect((await handler(request(body))).status).toBe(400); expect(consumeQuota).not.toHaveBeenCalled();
    }
    expect((await setup().handler(request({ image: "x".repeat(3_000_000) }))).status).toBe(413);
  });
  it("sends only inline photo and notes, returns candidates, and never requests macros or persistent files", async () => {
    const { handler, fetchImpl } = setup();
    const response = await handler(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual(output);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/responses");
    const payload = JSON.parse(String(init?.body));
    expect(payload.input[1].content[1]).toEqual({ type: "input_image", image_url: image });
    expect(payload.model).toBe("deepseek-flash");
    expect(payload.text.format.schema.properties.candidates.items.properties.calories).toBeUndefined();
    expect(payload).not.toHaveProperty("file_id"); expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it("rejects macro fields, nonfinite values, inverted bounds and excessive candidates", async () => {
    for (const bad of [
      { ...output, calories: 500 },
      { ...output, candidates: [{ ...candidate, calories: 500 }] },
      { ...output, candidates: [{ ...candidate, portion: { ...candidate.portion, low: 500 } }] },
      { ...output, candidates: Array(11).fill(candidate) },
      { ...output, status: "no_food" },
    ]) {
      expect(isPhotoExtraction(bad)).toBe(false);
      expect((await setup({ output: bad }).handler(request())).status).toBe(502);
    }
    expect(isPhotoExtraction({ ...output, candidates: [{ ...candidate, portion: null }] })).toBe(true);
    expect(isPhotoExtraction({ ...output, candidates: [{ ...candidate, portion: { ...candidate.portion, base: Infinity } }] })).toBe(false);
  });
  it("handles no food and provider failure without fabricated nutrition", async () => {
    const empty = { ...output, status: "no_food", candidates: [] };
    expect(await (await setup({ output: empty }).handler(request())).json()).toEqual(empty);
    const { handler } = setup({ fetchImpl: vi.fn(async () => { throw new Error("private upstream details"); }) });
    const response = await handler(request());
    expect(response.status).toBe(502); expect(await response.text()).not.toContain("private upstream");
  });
});
