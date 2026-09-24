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

export type FoodRecord = Record<string, unknown>;

export const USDA_DATA_TYPES = ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"] as const;

type Dependencies = {
  apiKey: () => string | undefined;
  release: () => string | undefined;
  authenticate: (authorization: string) => Promise<boolean>;
  consumeQuota: (authorization: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function numeric(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function nutrient(food: FoodRecord, nutrientId: number): number {
  if (!Array.isArray(food.foodNutrients)) return 0;
  const item = food.foodNutrients.find((candidate) =>
    Boolean(candidate && typeof candidate === "object" && Number((candidate as FoodRecord).nutrientId) === nutrientId),
  );
  return numeric(item && typeof item === "object" ? (item as FoodRecord).value : 0);
}

function servingOptions(food: FoodRecord) {
  if (!Array.isArray(food.foodMeasures)) return [];
  return food.foodMeasures
    .filter((measure): measure is FoodRecord => Boolean(measure && typeof measure === "object"))
    .map((measure) => ({
      label: String(measure.disseminationText ?? measure.modifier ?? measure.measureUnitName ?? "").trim(),
      unit: String(measure.measureUnitAbbreviation ?? measure.measureUnitName ?? "serving").trim(),
      grams: Number(measure.gramWeight),
    }))
    .filter((option) =>
      option.label.length > 0
      && option.unit.length > 0
      && Number.isFinite(option.grams)
      && option.grams > 0,
    )
    .slice(0, 20);
}

function preparationBasis(food: FoodRecord): "raw" | "cooked" | "prepared" | "as_labeled" {
  const explicit = String(food.preparationState ?? food.preparationBasis ?? "").toLowerCase();
  if (explicit.includes("raw")) return "raw";
  if (explicit.includes("cook")) return "cooked";
  if (explicit.includes("prepar")) return "prepared";

  const description = String(food.description ?? "").toLowerCase();
  if (/\braw\b/u.test(description)) return "raw";
  if (/\bcooked\b/u.test(description)) return "cooked";
  if (/\b(prepared|baked|boiled|roasted|grilled|steamed|fried)\b/u.test(description)) return "prepared";
  return "as_labeled";
}

export function mapFood(food: FoodRecord, release: string) {
  const fdcId = String(food.fdcId ?? "").trim();
  const name = String(food.description ?? "").trim();
  if (!/^[1-9][0-9]*$/u.test(fdcId) || !name) return null;

  const calories = nutrient(food, 1008);
  const proteinG = nutrient(food, 1003);
  const carbsG = nutrient(food, 1005);
  const fatG = nutrient(food, 1004);
  const fiberG = nutrient(food, 1079);
  const options = servingOptions(food);
  const declaredServingGrams = numeric(food.servingSize);
  const servingGrams = declaredServingGrams > 0 ? declaredServingGrams : 100;
  const recordType = String(food.dataType ?? "Unknown").trim() || "Unknown";
  const nutrientsPer100g = { calories, proteinG, carbsG, fatG, fiberG };
  const scale = servingGrams / 100;

  return {
    fdcId,
    recordType,
    name,
    servingLabel: `${servingGrams} g serving`,
    servingGrams,
    unit: "g" as const,
    calories: Math.round(calories * scale * 100) / 100,
    proteinG: Math.round(proteinG * scale * 100) / 100,
    carbsG: Math.round(carbsG * scale * 100) / 100,
    fatG: Math.round(fatG * scale * 100) / 100,
    fiberG: Math.round(fiberG * scale * 100) / 100,
    nutrientsPer100g,
    ...(options.length > 0 ? { servingOptions: options } : {}),
    source: "USDA FoodData Central",
    sourceVersion: release,
    estimated: false as const,
    confidence: "high" as const,
    preparationBasis: preparationBasis(food),
    providerRevision: `${recordType}:${fdcId}`,
  };
}

function decodePage(cursor: unknown): number | null {
  if (typeof cursor !== "string" || cursor.length === 0) return 1;
  try {
    const decoded = JSON.parse(atob(cursor)) as { pageNumber?: unknown };
    const pageNumber = Number(decoded.pageNumber);
    return Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 100 ? pageNumber : null;
  } catch {
    return null;
  }
}

export function createNutritionSearchHandler(deps: Dependencies) {
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

    const body = await request.json().catch(() => null) as { query?: unknown; pageSize?: unknown; cursor?: unknown } | null;
    const query = typeof body?.query === "string" ? body.query.trim().slice(0, 120) : "";
    if (query.length < 2) return json({ error: "validation_failed", message: "query must contain at least two characters" }, 400);
    const pageSize = Math.min(10, Math.max(1, Number(body?.pageSize ?? 8) || 8));
    const pageNumber = decodePage(body?.cursor);
    if (pageNumber === null) return json({ error: "validation_failed", message: "cursor is invalid" }, 400);

    const apiKey = deps.apiKey()?.trim();
    const release = deps.release()?.trim();
    if (!apiKey || !release) return json({ error: "provider_unconfigured" }, 503);

    let allowed: boolean;
    try {
      allowed = await deps.consumeQuota(authorization);
    } catch {
      return json({ error: "provider_unavailable" }, 503);
    }
    if (!allowed) return json({ error: "rate_limited" }, 429);

    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.searchParams.set("api_key", apiKey);

    let upstream: Response;
    try {
      upstream = await (deps.fetchImpl ?? fetch)(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, pageSize, pageNumber, dataType: USDA_DATA_TYPES }),
        signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
      });
    } catch {
      return json({ error: "provider_unavailable" }, 502);
    }
    if (!upstream.ok) return json({ error: "provider_unavailable" }, 502);

    let payload: unknown;
    try {
      payload = await upstream.json();
    } catch {
      return json({ error: "provider_invalid_response" }, 502);
    }
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as FoodRecord).foods)) {
      return json({ error: "provider_invalid_response" }, 502);
    }

    const candidates = (payload as FoodRecord).foods
      .filter((candidate): candidate is FoodRecord => Boolean(candidate && typeof candidate === "object"))
      .map((candidate) => mapFood(candidate, release))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    return json({
      candidates,
      ...(candidates.length === pageSize ? { nextCursor: btoa(JSON.stringify({ pageNumber: pageNumber + 1 })) } : {}),
    });
  };
}
