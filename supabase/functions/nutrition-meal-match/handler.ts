import { mapFood, USDA_DATA_TYPES, type FoodRecord } from "../nutrition-search/handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

type Dependencies = {
  apiKey: () => string | undefined;
  release: () => string | undefined;
  authenticate: (authorization: string) => Promise<boolean>;
  consumeQuota: (authorization: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function validIngredients(value: unknown): value is Array<{ name: string; preparation?: string }> {
  return Array.isArray(value) && value.length > 0 && value.length <= 10 && value.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return typeof record.name === "string" && record.name.trim().length >= 2 && record.name.length <= 160
      && (record.preparation === undefined || (typeof record.preparation === "string" && record.preparation.length <= 80));
  });
}

export function createNutritionMealMatchHandler(deps: Dependencies) {
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
    if (!validIngredients(body?.ingredients)) return json({ error: "validation_failed" }, 400);
    const apiKey = deps.apiKey()?.trim();
    const release = deps.release()?.trim();
    if (!apiKey || !release) return json({ error: "provider_unconfigured" }, 503);
    try {
      if (!await deps.consumeQuota(authorization)) return json({ error: "rate_limited" }, 429);
    } catch {
      return json({ error: "provider_unavailable" }, 503);
    }
    const fetcher = deps.fetchImpl ?? fetch;
    const matches = [] as Array<{ ingredientIndex: number; query: string; candidates: unknown[] }>;
    try {
      for (const [ingredientIndex, ingredient] of body.ingredients.entries()) {
        const query = `${ingredient.name}${ingredient.preparation ? ` ${ingredient.preparation}` : ""}`.trim().slice(0, 180);
        const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
        url.searchParams.set("api_key", apiKey);
        const upstream = await fetcher(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, pageSize: 3, pageNumber: 1, dataType: USDA_DATA_TYPES }),
          signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
        });
        if (!upstream.ok) return json({ error: "provider_unavailable" }, 502);
        const payload = await upstream.json().catch(() => null) as { foods?: unknown } | null;
        if (!payload || !Array.isArray(payload.foods)) return json({ error: "provider_invalid_response" }, 502);
        const candidates = payload.foods
          .filter((candidate): candidate is FoodRecord => Boolean(candidate && typeof candidate === "object"))
          .map((candidate) => mapFood(candidate, release))
          .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
        matches.push({ ingredientIndex, query, candidates });
      }
    } catch {
      return json({ error: "provider_unavailable" }, 502);
    }
    return json({ matches });
  };
}
