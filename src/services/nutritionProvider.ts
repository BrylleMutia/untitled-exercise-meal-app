import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.generated";
import type { MacroEstimateRange, PreparationBasis } from "@/types/domain";

export type NutritionProviderCandidate = {
  fdcId: string;
  recordType: string;
  name: string;
  servingLabel: string;
  servingGrams: number;
  unit: "g" | "piece";
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  nutrientsPer100g: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG?: number;
  };
  servingOptions?: Array<{ label: string; unit: string; grams: number }>;
  source: string;
  sourceVersion: string;
  estimated: false;
  confidence: "high";
  preparationBasis: "raw" | "cooked" | "prepared" | "as_labeled";
  providerRevision?: string;
};

export type FoodSearchPage = {
  candidates: NutritionProviderCandidate[];
  nextCursor?: string;
};

export type MealIngredientCandidate = {
  name: string;
  quantity: number;
  unit: string;
  preparation: string;
  assumptions: string[];
  confidence: "high" | "medium" | "low";
  presence: "stated" | "possible_hidden";
};

export type MealExtraction = {
  suggestedMealName: string;
  candidates: MealIngredientCandidate[];
  questions: string[];
};

export type MealMatch = {
  ingredientIndex: number;
  query: string;
  candidates: NutritionProviderCandidate[];
};

export type MacroEstimate = {
  ingredientIndex: number;
  name: string;
  range: MacroEstimateRange;
  assumptions: string[];
  modelRevision: string;
  schemaRevision: string;
  valueSource: "ai_estimate";
  estimated: true;
  confidence: "low";
};

const candidateSchema = z.object({
  fdcId: z.string().min(1),
  recordType: z.string().min(1),
  name: z.string().min(1),
  servingLabel: z.string().min(1),
  servingGrams: z.number().positive(),
  unit: z.enum(["g", "piece"]),
  calories: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative().optional(),
  nutrientsPer100g: z.object({
    calories: z.number().nonnegative(),
    proteinG: z.number().nonnegative(),
    carbsG: z.number().nonnegative(),
    fatG: z.number().nonnegative(),
    fiberG: z.number().nonnegative().optional(),
  }),
  servingOptions: z.array(z.object({ label: z.string(), unit: z.string(), grams: z.number().positive() })).optional(),
  source: z.string().min(1),
  sourceVersion: z.string().min(1),
  estimated: z.literal(false),
  confidence: z.literal("high"),
  preparationBasis: z.enum(["raw", "cooked", "prepared", "as_labeled"]),
  providerRevision: z.string().optional(),
});

const responseSchema = z.object({ candidates: z.array(candidateSchema).max(20), nextCursor: z.string().min(1).optional() });

type ProviderClient = SupabaseClient<Database>;

async function invoke<T>(client: ProviderClient, functionName: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  // SSR can prove the user is signed in while a newly-created browser client
  // is still initializing its cookie-backed session. Resolve the session
  // before invoking protected functions and refresh it once when necessary;
  // the access token is passed only as an in-memory request header and is
  // never included in the provider payload or application logs.
  let session = (await client.auth.getSession()).data.session;
  let accessToken = session?.access_token;
  if (accessToken && typeof client.auth.getClaims === "function") {
    const claims = await client.auth.getClaims(accessToken);
    if (claims.error || !claims.data?.claims?.sub) accessToken = undefined;
  }
  if (!accessToken) {
    session = (await client.auth.refreshSession()).data.session;
    accessToken = session?.access_token;
  }
  if (!accessToken) throw new Error("not_authenticated: nutrition provider requires an authenticated session");

  const invokeWithToken = (token: string) => client.functions.invoke(functionName, {
    body: body as Record<string, unknown>,
    headers: { Authorization: `Bearer ${token}` },
  });
  let response = await invokeWithToken(accessToken);
  if (response.error) {
    const providerError = response.error as { message?: string; context?: unknown };
    let code = "provider_unavailable";
    if (providerError.context instanceof Response) {
      try {
        const responseBody = await providerError.context.clone().json() as { error?: unknown };
        if (typeof responseBody.error === "string") code = responseBody.error;
      } catch {
        // Keep the stable provider_unavailable fallback when the response is not JSON.
      }
    }
    if (code === "not_authenticated") {
      const refreshed = (await client.auth.refreshSession()).data.session;
      if (refreshed?.access_token) {
        response = await invokeWithToken(refreshed.access_token);
      }
    }
  }
  const { data, error } = response;
  if (error) {
    const providerError = error as { message?: string; context?: unknown };
    let code = "provider_unavailable";
    if (providerError.context instanceof Response) {
      try {
        const responseBody = await providerError.context.clone().json() as { error?: unknown };
        if (typeof responseBody.error === "string") code = responseBody.error;
      } catch {
        // Keep the stable provider_unavailable fallback when the response is not JSON.
      }
    }
    throw new Error(`${code}: ${providerError.message ?? "nutrition provider request failed"}`);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("provider_invalid_response: nutrition provider returned an unexpected shape");
  return parsed.data;
}

export async function searchNutritionProvider(client: ProviderClient, query: string, cursor?: string): Promise<FoodSearchPage> {
  if (!query.trim()) return { candidates: [] };
  const response = await invoke(client, "nutrition-search", { query: query.trim(), ...(cursor ? { cursor } : {}) }, responseSchema);
  return response;
}

const textCandidateSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  preparation: z.string().min(1),
  assumptions: z.array(z.string()).max(5),
  confidence: z.enum(["high", "medium", "low"]),
  presence: z.enum(["stated", "possible_hidden"]),
}).strict();

const textResponseSchema = z.object({
  suggestedMealName: z.string().min(1),
  candidates: z.array(textCandidateSchema).max(10),
  questions: z.array(z.string()).max(8),
}).strict();

export async function parseNutritionTextWithProvider(client: ProviderClient, text: string, locale = "en-US"): Promise<MealExtraction> {
  if (!text.trim()) return { suggestedMealName: "Meal", candidates: [], questions: [] };
  const requestId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await invoke(client, "nutrition-text-parse", {
    text: text.trim().slice(0, 1000),
    locale,
    requestId,
  }, textResponseSchema);
  return response;
}

const matchResponseSchema = z.object({
  matches: z.array(z.object({
    ingredientIndex: z.number().int().min(0).max(9),
    query: z.string().min(1),
    candidates: z.array(candidateSchema).max(3),
  }).strict()).max(10),
}).strict();

export async function matchNutritionMeal(client: ProviderClient, ingredients: Array<{ name: string; preparation?: PreparationBasis | string }>): Promise<MealMatch[]> {
  if (ingredients.length === 0) return [];
  const response = await invoke(client, "nutrition-meal-match", { ingredients }, matchResponseSchema);
  return response.matches;
}

const tripleSchema = z.object({
  low: z.number().finite().nonnegative(),
  base: z.number().finite().nonnegative(),
  high: z.number().finite().nonnegative(),
}).strict().refine((value) => value.low <= value.base && value.base <= value.high);
const rangeSchema = z.object({
  calories: tripleSchema,
  proteinG: tripleSchema,
  carbsG: tripleSchema,
  fatG: tripleSchema,
  fiberG: tripleSchema.optional(),
}).strict();
const estimateResponseSchema = z.object({
  estimates: z.array(z.object({
    ingredientIndex: z.number().int().min(0).max(9),
    name: z.string().min(1),
    range: rangeSchema,
    assumptions: z.array(z.string()).max(5),
    modelRevision: z.string().min(1),
    schemaRevision: z.string().min(1),
    valueSource: z.literal("ai_estimate"),
    estimated: z.literal(true),
    confidence: z.literal("low"),
  }).strict()).max(10),
}).strict();

export async function estimateNutritionMacros(client: ProviderClient, ingredients: Array<{
  name: string;
  quantity: number;
  unit: string;
  preparation: string;
}>): Promise<MacroEstimate[]> {
  if (ingredients.length === 0) return [];
  const response = await invoke(client, "nutrition-macro-estimate", { ingredients }, estimateResponseSchema);
  return response.estimates;
}
