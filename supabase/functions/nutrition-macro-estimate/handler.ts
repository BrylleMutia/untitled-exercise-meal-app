const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const schema = {
  type: "object",
  properties: {
    estimates: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          ingredientIndex: { type: "integer", minimum: 0, maximum: 9 },
          name: { type: "string", minLength: 1, maxLength: 160 },
          range: {
            type: "object",
            properties: {
              calories: { type: "object", properties: { low: { type: "number", minimum: 0 }, base: { type: "number", minimum: 0 }, high: { type: "number", minimum: 0 } }, required: ["low", "base", "high"], additionalProperties: false },
              proteinG: { type: "object", properties: { low: { type: "number", minimum: 0 }, base: { type: "number", minimum: 0 }, high: { type: "number", minimum: 0 } }, required: ["low", "base", "high"], additionalProperties: false },
              carbsG: { type: "object", properties: { low: { type: "number", minimum: 0 }, base: { type: "number", minimum: 0 }, high: { type: "number", minimum: 0 } }, required: ["low", "base", "high"], additionalProperties: false },
              fatG: { type: "object", properties: { low: { type: "number", minimum: 0 }, base: { type: "number", minimum: 0 }, high: { type: "number", minimum: 0 } }, required: ["low", "base", "high"], additionalProperties: false },
              fiberG: { type: "object", properties: { low: { type: "number", minimum: 0 }, base: { type: "number", minimum: 0 }, high: { type: "number", minimum: 0 } }, required: ["low", "base", "high"], additionalProperties: false },
            },
            required: ["calories", "proteinG", "carbsG", "fatG"],
            additionalProperties: false,
          },
          assumptions: { type: "array", maxItems: 5, items: { type: "string", maxLength: 240 } },
          modelRevision: { type: "string", minLength: 1, maxLength: 80 },
          schemaRevision: { type: "string", minLength: 1, maxLength: 80 },
          valueSource: { type: "string", enum: ["ai_estimate"] },
          estimated: { type: "boolean", const: true },
          confidence: { type: "string", enum: ["low"] },
        },
        required: ["ingredientIndex", "name", "range", "assumptions", "modelRevision", "schemaRevision", "valueSource", "estimated", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["estimates"],
  additionalProperties: false,
};

type EstimateInput = { name: string; quantity: number; unit: string; preparation: string };
type Dependencies = {
  apiKey: () => string | undefined;
  model?: () => string;
  authenticate: (authorization: string) => Promise<boolean>;
  consumeQuota: (authorization: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function validInput(value: unknown): value is EstimateInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) return false;
  const total = value.reduce((sum, item) => sum + (item && typeof item === "object" ? JSON.stringify(item).length : 0), 0);
  if (total > 1000) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const candidate = item as Record<string, unknown>;
    return typeof candidate.name === "string" && candidate.name.trim().length >= 2 && candidate.name.length <= 160
      && typeof candidate.quantity === "number" && Number.isFinite(candidate.quantity) && candidate.quantity > 0 && candidate.quantity <= 1000
      && typeof candidate.unit === "string" && candidate.unit.trim().length > 0 && candidate.unit.length <= 40
      && typeof candidate.preparation === "string" && candidate.preparation.trim().length > 0 && candidate.preparation.length <= 80
      && Object.keys(candidate).length === 4;
  });
}

function validTriple(value: unknown): value is { low: number; base: number; high: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === 3
    && [item.low, item.base, item.high].every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0)
    && (item.low as number) <= (item.base as number) && (item.base as number) <= (item.high as number);
}

function validResponse(value: unknown, inputLength: number): value is { estimates: unknown[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !Array.isArray(record.estimates) || record.estimates.length !== inputLength) return false;
  const indexes = new Set<number>();
  return record.estimates.every((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const candidate = item as Record<string, unknown>;
    const range = candidate.range as Record<string, unknown> | undefined;
    if (Object.keys(candidate).length !== 9 || typeof candidate.ingredientIndex !== "number" || !Number.isInteger(candidate.ingredientIndex) || candidate.ingredientIndex < 0 || candidate.ingredientIndex >= inputLength || indexes.has(candidate.ingredientIndex)) return false;
    indexes.add(candidate.ingredientIndex);
    const rangeKeys = Object.keys(range ?? {}).sort();
    const requiredRangeKeys = ["calories", "carbsG", "fatG", "proteinG"];
    const completeRangeKeys = [...requiredRangeKeys, "fiberG"].sort();
    const hasValidRangeShape = rangeKeys.join("|") === requiredRangeKeys.sort().join("|") || rangeKeys.join("|") === completeRangeKeys.join("|");
    return typeof candidate.name === "string" && candidate.name.trim().length > 0 && candidate.name.length <= 160
      && range !== undefined && hasValidRangeShape
      && validTriple(range.calories) && validTriple(range.proteinG) && validTriple(range.carbsG) && validTriple(range.fatG)
      && (range.fiberG === undefined || validTriple(range.fiberG))
      && Array.isArray(candidate.assumptions) && candidate.assumptions.length <= 5 && candidate.assumptions.every((note) => typeof note === "string" && note.length <= 240)
      && typeof candidate.modelRevision === "string" && candidate.modelRevision.length > 0
      && typeof candidate.schemaRevision === "string" && candidate.schemaRevision.length > 0
      && candidate.valueSource === "ai_estimate" && candidate.estimated === true && candidate.confidence === "low";
  });
}

function extractOutputText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  if (response.status !== "completed" || !Array.isArray(response.output)) return null;
  const messages = response.output.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "message" && (item as Record<string, unknown>).role === "assistant" && (item as Record<string, unknown>).status === "completed") as Array<Record<string, unknown>>;
  if (messages.length !== 1 || !Array.isArray(messages[0].content) || messages[0].content.length !== 1) return null;
  const part = messages[0].content[0];
  if (!part || typeof part !== "object") return null;
  const content = part as Record<string, unknown>;
  return content.type === "output_text" && typeof content.text === "string" && content.text.trim() ? content.text : null;
}

export function createNutritionMacroEstimateHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "not_authenticated" }, 401);
    try {
      if (!await deps.authenticate(authorization)) return json({ error: "not_authenticated" }, 401);
    } catch {
      return json({ error: "provider_unavailable" }, 503);
    }
    const body = await request.json().catch(() => null) as { ingredients?: unknown } | null;
    if (!validInput(body?.ingredients)) return json({ error: "validation_failed" }, 400);
    const apiKey = deps.apiKey()?.trim();
    if (!apiKey) return json({ error: "provider_unconfigured" }, 503);
    try {
      if (!await deps.consumeQuota(authorization)) return json({ error: "rate_limited" }, 429);
    } catch {
      return json({ error: "provider_unavailable" }, 503);
    }
    const input = body.ingredients;
    let upstream: Response;
    try {
      upstream = await (deps.fetchImpl ?? fetch)("https://api.deepseek.com/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: deps.model?.() ?? "deepseek-flash",
          reasoning: { effort: "none" },
          max_output_tokens: 3500,
          input: [
            { role: "system", content: "Estimate approximate nutrition only for the reviewed unresolved ingredients. Return exactly one low/base/high range per input ingredient in index order. Never present estimates as authoritative. Keep values finite, non-negative, monotonic, and conservative. Include assumptions. Do not add fields outside the schema." },
            { role: "user", content: JSON.stringify({ ingredients: input }) },
          ],
          text: { format: { type: "json_schema", name: "nutrition_macro_estimates", schema } },
        }),
        signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000),
      });
    } catch {
      return json({ error: "provider_unavailable" }, 502);
    }
    if (!upstream.ok) return json({ error: "provider_unavailable" }, 502);
    const raw = await upstream.json().catch(() => null);
    const outputText = extractOutputText(raw);
    if (!outputText) return json({ error: "provider_invalid_response" }, 502);
    let parsed: unknown;
    try { parsed = JSON.parse(outputText); } catch { return json({ error: "provider_invalid_response" }, 502); }
    if (!validResponse(parsed, input.length)) return json({ error: "provider_invalid_response" }, 502);
    return json(parsed);
  };
}
