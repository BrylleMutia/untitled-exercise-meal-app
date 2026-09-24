const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const schema = {
  type: "object",
  properties: {
    suggestedMealName: { type: "string", minLength: 1, maxLength: 160 },
    candidates: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          quantity: { type: "number", exclusiveMinimum: 0 },
          unit: { type: "string", minLength: 1 },
          preparation: { type: "string", minLength: 1, maxLength: 80 },
          assumptions: { type: "array", maxItems: 5, items: { type: "string" } },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          presence: { type: "string", enum: ["stated", "possible_hidden"] },
        },
        required: ["name", "quantity", "unit", "preparation", "assumptions", "confidence", "presence"],
        additionalProperties: false,
      },
    },
    questions: { type: "array", maxItems: 8, items: { type: "string", maxLength: 240 } },
  },
  required: ["suggestedMealName", "candidates", "questions"],
  additionalProperties: false,
};

type Dependencies = {
  apiKey: () => string | undefined;
  model?: () => string;
  authenticate: (authorization: string) => Promise<boolean>;
  consumeQuota: (authorization: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
};

function validCandidates(value: unknown): value is { suggestedMealName: string; candidates: Array<Record<string, unknown>>; questions: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || typeof record.suggestedMealName !== "string" || record.suggestedMealName.trim().length === 0 || record.suggestedMealName.length > 160 || !Array.isArray(record.candidates) || record.candidates.length > 10 || !Array.isArray(record.questions) || record.questions.length > 8) return false;
  if (!record.questions.every((question: unknown) => typeof question === "string" && question.trim().length > 0 && question.length <= 240)) return false;
  return record.candidates.every((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const candidate = item as Record<string, unknown>;
    return Object.keys(candidate).length === 7
      && typeof candidate.name === "string" && candidate.name.trim().length > 0 && candidate.name.length <= 160
      && typeof candidate.quantity === "number" && Number.isFinite(candidate.quantity) && candidate.quantity > 0 && candidate.quantity <= 1000
      && typeof candidate.unit === "string" && candidate.unit.trim().length > 0 && candidate.unit.length <= 40
      && typeof candidate.preparation === "string" && candidate.preparation.trim().length > 0 && candidate.preparation.length <= 80
      && Array.isArray(candidate.assumptions) && candidate.assumptions.length <= 5
      && candidate.assumptions.every((note: unknown) => typeof note === "string" && note.length <= 240)
      && ["high", "medium", "low"].includes(String(candidate.confidence))
      && ["stated", "possible_hidden"].includes(String(candidate.presence));
  });
}

function extractOutputText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  if (response.status !== "completed" || !Array.isArray(response.output)) return null;
  const messages = response.output.filter((item: unknown) =>
    item && typeof item === "object" && (item as Record<string, unknown>).type === "message"
      && (item as Record<string, unknown>).role === "assistant"
      && (item as Record<string, unknown>).status === "completed"
  ) as Array<Record<string, unknown>>;
  if (messages.length !== 1 || !Array.isArray(messages[0].content)) return null;
  const parts = messages[0].content as unknown[];
  if (parts.length !== 1 || !parts[0] || typeof parts[0] !== "object") return null;
  const part = parts[0] as Record<string, unknown>;
  return part.type === "output_text" && typeof part.text === "string" && part.text.trim() ? part.text : null;
}

export function createNutritionTextHandler(deps: Dependencies) {
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

    const body = await request.json().catch(() => null) as { text?: unknown; locale?: unknown; requestId?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (text.length < 2 || text.length > 1000) return json({ error: "validation_failed", message: "text must contain 2–1000 characters" }, 400);
    const requestedLocale = typeof body?.locale === "string" ? body.locale.trim() : "";
    const locale = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(requestedLocale) && requestedLocale.length <= 32
      ? requestedLocale : "en-US";
    const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId || requestId.length > 128) return json({ error: "validation_failed", message: "requestId is required" }, 400);
    const apiKey = deps.apiKey();
    if (!apiKey) return json({ error: "provider_unconfigured" }, 503);
    let allowed: boolean;
    try {
      allowed = await deps.consumeQuota(authorization);
    } catch {
      return json({ error: "provider_unavailable" }, 503);
    }
    if (!allowed) return json({ error: "rate_limited" }, 429);

    let upstream: Response;
    try {
      upstream = await (deps.fetchImpl ?? fetch)("https://api.deepseek.com/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: deps.model?.() ?? "deepseek-flash",
          reasoning: { effort: "none" },
          max_output_tokens: 2500,
          input: [
            { role: "system", content: `Extract a reviewable meal decomposition for locale ${locale}. Return JSON matching the schema. Do not calculate calories or macros and do not add calorie or macro fields. Include only explicitly stated ingredients by default; possible oils, sauces, condiments, fillings, and other hidden ingredients may be listed with presence possible_hidden and must be excluded by the app until the user confirms them. Ask concise questions for unknown portions and preparation. Return candidates for review; never claim certainty.` },
            { role: "user", content: text },
          ],
          text: { format: { type: "json_schema", name: "nutrition_candidates", schema } },
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return json({ error: "provider_unavailable" }, 502);
    }
    if (!upstream.ok) return json({ error: "provider_unavailable" }, 502);
    let raw: unknown;
    try { raw = await upstream.json(); } catch { return json({ error: "provider_invalid_response" }, 502); }
    const outputText = extractOutputText(raw);
    if (!outputText) return json({ error: "provider_invalid_response" }, 502);
    let parsed: unknown;
    try { parsed = JSON.parse(outputText); } catch { return json({ error: "provider_invalid_response" }, 502); }
    if (!validCandidates(parsed)) return json({ error: "provider_invalid_response" }, 502);
    return json(parsed);
  };
}
