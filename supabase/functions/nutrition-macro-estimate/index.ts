import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createNutritionMacroEstimateHandler } from "./handler.ts";

function clientFor(authorization: string) {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authorization } } });
}

Deno.serve(createNutritionMacroEstimateHandler({
  apiKey: () => Deno.env.get("DEEPSEEK_API_KEY"),
  model: () => Deno.env.get("DEEPSEEK_NUTRITION_MODEL") ?? "deepseek-flash",
  authenticate: async (authorization) => {
    const supabase = clientFor(authorization);
    const { data, error } = await supabase.auth.getUser(authorization.slice("Bearer ".length));
    return !error && Boolean(data.user);
  },
  consumeQuota: async (authorization) => {
    const supabase = clientFor(authorization);
    const { data, error } = await supabase.rpc("consume_nutrition_provider_quota", { p_kind: "ai_estimate" });
    if (error) throw error;
    if (typeof (data as { allowed?: unknown } | null)?.allowed !== "boolean") throw new Error("invalid quota response");
    return (data as { allowed: boolean }).allowed;
  },
}));
