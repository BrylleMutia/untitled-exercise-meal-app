import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.generated";
import type { IngredientConversionCandidate } from "@/types/backend";

const foodIdsSchema = z.array(z.string().min(1).max(256)).max(100);
const candidateSchema = z.array(z.object({
  foodId: z.string().min(1), unit: z.string().min(1).max(40), gramsPerUnit: z.number().positive().max(1000000),
  source: z.object({ kind: z.enum(["personal", "default", "group"]), recipeName: z.string().min(1) }),
}));

export async function loadIngredientConversions(client: SupabaseClient<Database>, foodIds: string[]): Promise<IngredientConversionCandidate[]> {
  const ids = foodIdsSchema.parse([...new Set(foodIds)]);
  if (!ids.length) return [];
  const { data, error } = await client.rpc("get_ingredient_conversions", { p_food_ids: ids }).abortSignal(AbortSignal.timeout(10000));
  if (error) throw new Error("Saved conversions could not be loaded. You can still confirm a conversion manually.");
  const candidates = candidateSchema.parse(data);
  if (candidates.some(candidate => !ids.includes(candidate.foodId))) throw new Error("Saved conversions returned a different food. Confirm this conversion manually.");
  return candidates;
}
