import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecipeImageDatabase } from "@/types/recipeImageDatabase";
import { recipeImageBucket } from "@/utility/recipeImage";

export async function cleanupRecipeImages(client: SupabaseClient<RecipeImageDatabase>) {
    const claim = await client.rpc("claim_recipe_image_cleanup", { p_payload: { mode: "expired" } });
    if (claim.error) return;
    const paths = Array.isArray(claim.data) ? claim.data.filter((path): path is string => typeof path === "string") : [];
    if (!paths.length) return;
    const removed = await client.storage.from(recipeImageBucket).remove(paths);
    if (removed.error) return;
    await client.rpc("complete_recipe_image_cleanup", { p_payload: { paths } });
}
