import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { RecipeCardReadModel, SetRecipeFavoriteInput } from "@/types/backend";
import { z } from "zod";

const dateKey = z.iso.date();
const model = z.object({ asOfDate: dateKey, recipes: z.array(z.object({
  mealId: z.string().min(1), favorite: z.boolean(), favoriteRevision: z.number().int().nonnegative(),
  popularRank: z.number().int().min(1).max(5).optional(), usageCount: z.number().int().nonnegative(),
})) });
const favoriteInput = z.object({ mealId: z.string().min(1).max(128), favorite: z.boolean(),
  expectedRevision: z.number().int().nonnegative(), asOfDate: dateKey, idempotencyKey: z.string().min(1).max(128) });

function failure(error: { code?: string; message: string }): Error {
  if (error.code === "PGRST202" || error.code === "42883") return new Error("Favorites and Popular need the database update. Your saved meals remain available.");
  if (error.message.startsWith("stale_version")) return new Error("Favorites changed elsewhere. Refresh the cards before trying again.");
  if (error.message.startsWith("not_authenticated")) return new Error("Sign in again to load or change favorites.");
  return new Error("Recipe preferences could not be loaded or saved. Your previous favorite state is retained; retry when connected.");
}
export async function loadRecipeCardMetadata(client: SupabaseClient<Database>, asOfDate: string): Promise<RecipeCardReadModel> {
  const { data, error } = await client.rpc("get_recipe_card_metadata", { p_payload: { asOfDate: dateKey.parse(asOfDate) } });
  if (error) throw failure(error);
  return model.parse(data);
}
export async function setRecipeFavorite(client: SupabaseClient<Database>, input: SetRecipeFavoriteInput): Promise<RecipeCardReadModel> {
  const payload = favoriteInput.parse(input);
  const { data, error } = await client.rpc("set_recipe_favorite", { p_payload: payload });
  if (error) throw failure(error);
  return model.parse(data);
}
