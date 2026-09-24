import { createClient } from "@supabase/supabase-js";

process.loadEnvFile?.(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const accountAlias = process.env.SUPABASE_PROVIDER_SMOKE_USER === "B" ? "B" : "A";
const email = process.env[`SUPABASE_RPC_REMOTE_USER_${accountAlias}_EMAIL`];
const password = process.env[`SUPABASE_RPC_REMOTE_USER_${accountAlias}_PASSWORD`];

if (!url || !publishableKey || !email || !password) {
  throw new Error("provider smoke requires the existing Supabase URL, publishable key, and confirmed retained User A/B variables");
}

const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function invoke(name, body) {
  const response = await client.functions.invoke(name, { body });
  if (response.error) {
    if (response.error.context instanceof Response) {
      const status = response.error.context.status;
      const payload = await response.error.context.clone().json().catch(() => null);
      const knownError = payload && typeof payload.error === "string" && [
        "not_authenticated",
        "validation_failed",
        "rate_limited",
        "provider_unavailable",
        "provider_invalid_response",
        "provider_unconfigured",
      ].includes(payload.error) ? payload.error : null;
      return { ok: false, error: knownError ?? `provider_http_error_${status}` };
    }
    return { ok: false, error: "provider_invoke_error" };
  }
  return { ok: true, data: response.data };
}

const providerFunctions = ["nutrition-search", "nutrition-text-parse", "nutrition-meal-match", "nutrition-macro-estimate"];
const anonymousStatuses = Object.fromEntries(await Promise.all(providerFunctions.map(async (name) => {
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: "{}",
  });
  return [name, response.status];
})));

if (process.env.SUPABASE_PROVIDER_SMOKE_ANONYMOUS_ONLY === "1") {
  console.log(JSON.stringify({ project: new URL(url).hostname.split(".")[0], anonymousStatuses }, null, 2));
  if (Object.values(anonymousStatuses).some((status) => status !== 401)) process.exitCode = 1;
  process.exit();
}

const signIn = await client.auth.signInWithPassword({ email, password });
if (signIn.error || !signIn.data.user) throw new Error("confirmed User A sign-in failed");

const search = await invoke("nutrition-search", { query: "egg" });
const searchCandidate = search.ok && Array.isArray(search.data?.candidates) ? search.data.candidates[0] : undefined;
const extraction = await invoke("nutrition-text-parse", {
  text: "2 cups fried rice with 2 eggs",
  locale: "en-US",
  requestId: `release-provider-${Date.now()}`,
});
const extractedCandidates = extraction.ok && Array.isArray(extraction.data?.candidates) ? extraction.data.candidates : [];
const stated = extractedCandidates.filter((candidate) => candidate?.presence === "stated");
const matching = await invoke("nutrition-meal-match", {
  ingredients: (stated.length > 0 ? stated : [{ name: "white rice", preparation: "cooked" }, { name: "egg", preparation: "as_labeled" }])
    .slice(0, 10)
    .map((candidate) => ({ name: candidate.name, preparation: candidate.preparation })),
});
const matchedCandidate = matching.ok && Array.isArray(matching.data?.matches)
  ? matching.data.matches.flatMap((match) => match.candidates ?? []).find((candidate) => Number(candidate?.servingGrams) > 0)
  : undefined;
const reviewedCandidate = [matchedCandidate, searchCandidate].find((candidate) => Number(candidate?.servingGrams) > 0);
const saveReviewedFood = reviewedCandidate
  ? await client.rpc("save_food", {
    p_payload: {
      idempotencyKey: `release-usda-food-${reviewedCandidate.fdcId}`,
      food: {
        ...reviewedCandidate,
        id: `release-usda-${reviewedCandidate.fdcId}`,
        category: "Other",
        valueSource: "trusted_catalog",
      },
    },
  })
  : { error: new Error("no weighted USDA candidate available") };
const estimate = await invoke("nutrition-macro-estimate", {
  ingredients: [{ name: "cooking oil", quantity: 1, unit: "tbsp", preparation: "prepared" }],
});

const exportResponse = await client.rpc("export_account_data", {
  p_payload: { idempotencyKey: `release-provider-export-${Date.now()}` },
});
const exported = exportResponse.error ? undefined : exportResponse.data?.data;
const exportedFoods = Array.isArray(exported?.foods) ? exported.foods : [];
const exportedNutritionLogs = Array.isArray(exported?.nutritionLogs) ? exported.nutritionLogs : [];
const persistedProviderRecords = exportedFoods.filter((food) => food?.fdc_id || food?.fdcId);

const result = {
  project: new URL(url).hostname.split(".")[0],
  account: accountAlias,
  authenticated: true,
  anonymousStatuses,
  search: {
    ok: search.ok,
    candidate: searchCandidate ? {
      fdcId: searchCandidate.fdcId,
      recordType: searchCandidate.recordType,
      sourceVersion: searchCandidate.sourceVersion,
      providerRevision: searchCandidate.providerRevision,
      preparationBasis: searchCandidate.preparationBasis,
      servingOptions: searchCandidate.servingOptions ?? [],
    } : null,
  },
  extraction: {
    ok: extraction.ok,
    error: extraction.ok ? null : extraction.error,
    suggestedMealName: extraction.ok ? extraction.data?.suggestedMealName : null,
    candidateCount: extractedCandidates.length,
    hasMacroFields: extractedCandidates.some((candidate) => ["calories", "proteinG", "carbsG", "fatG"].some((key) => key in (candidate ?? {}))),
  },
  matching: {
    ok: matching.ok,
    error: matching.ok ? null : matching.error,
    ingredientCount: matching.ok && Array.isArray(matching.data?.matches) ? matching.data.matches.length : 0,
    candidateMetadata: matching.ok
      ? (matching.data?.matches ?? []).flatMap((match) => (match.candidates ?? []).slice(0, 3).map((candidate) => ({
        ingredientIndex: match.ingredientIndex,
        fdcId: candidate.fdcId,
        recordType: candidate.recordType,
        sourceVersion: candidate.sourceVersion,
        providerRevision: candidate.providerRevision,
        preparationBasis: candidate.preparationBasis,
        servingOptions: candidate.servingOptions ?? [],
      })))
      : [],
  },
  estimate: {
    ok: estimate.ok,
    error: estimate.ok ? null : estimate.error,
    estimateCount: estimate.ok && Array.isArray(estimate.data?.estimates) ? estimate.data.estimates.length : 0,
    lowConfidence: estimate.ok && (estimate.data?.estimates ?? []).every((item) => item?.confidence === "low" && item?.estimated === true && item?.valueSource === "ai_estimate"),
  },
  persistedAccountEvidence: {
    exportOk: !exportResponse.error,
    reviewedFoodSaveOk: !saveReviewedFood.error,
    reviewedFoodSaveErrorCode: saveReviewedFood.error?.code ?? null,
    reviewedFood: reviewedCandidate ? {
      fdcId: reviewedCandidate.fdcId,
      recordType: reviewedCandidate.recordType,
      sourceVersion: reviewedCandidate.sourceVersion,
      providerRevision: reviewedCandidate.providerRevision,
      preparationBasis: reviewedCandidate.preparationBasis,
      servingGrams: reviewedCandidate.servingGrams,
    } : null,
    persistedProviderRecordCount: persistedProviderRecords.length,
    persistedNutritionLogCount: exportedNutritionLogs.length,
    reviewedFdcRecords: persistedProviderRecords.slice(0, 10).map((food) => ({
      fdcId: food.fdc_id ?? food.fdcId,
      recordType: food.record_type ?? food.recordType,
      sourceVersion: food.source_version ?? food.sourceVersion,
      providerRevision: food.provider_revision ?? food.providerRevision,
    })),
  },
};

console.log(JSON.stringify(result, null, 2));

if (Object.values(anonymousStatuses).some((status) => status !== 401)
  || !search.ok || !extraction.ok || !matching.ok || !estimate.ok || saveReviewedFood.error || exportResponse.error) {
  process.exitCode = 1;
}
