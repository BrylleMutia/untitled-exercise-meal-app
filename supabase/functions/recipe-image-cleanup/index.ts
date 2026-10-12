import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createRecipeImageCleanupHandler } from "./handler.ts";

const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);
Deno.serve(createRecipeImageCleanupHandler({
  authorized: request => Boolean(serviceKey) && request.headers.get("authorization") === `Bearer ${serviceKey}`,
  claim: async () => {
    const { data, error } = await supabase.rpc("claim_deleted_recipe_images", { p_payload: {} });
    if (error || !data || typeof data.leaseId !== "string" || !Array.isArray(data.paths)
      || data.paths.length > 100 || data.paths.some((path: unknown) => typeof path !== "string")) throw new Error("Invalid cleanup batch");
    return { leaseId: data.leaseId, paths: data.paths };
  },
  remove: async paths => {
    const { error } = await supabase.storage.from("recipe-covers").remove(paths);
    if (error) throw new Error("Storage cleanup failed");
  },
  complete: async batch => {
    const { error } = await supabase.rpc("complete_deleted_recipe_images", { p_payload: batch });
    if (error) throw new Error("Cleanup acknowledgement failed");
  },
}));
