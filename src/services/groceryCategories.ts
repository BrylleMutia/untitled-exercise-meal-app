import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { isGroceryCategory, type GroceryCategoryPreference } from "@/utility/groceryCategory";

export async function loadGroceryCategoryPreferences(client: SupabaseClient<Database>, groupId?: string): Promise<GroceryCategoryPreference[]> {
  const { data, error } = await client.rpc("get_grocery_category_preferences", { p_group_id: groupId ?? undefined });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error("Saved categories could not be read.");
  return data.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.nameKey !== "string" || !Number.isInteger(value.revision) || Number(value.revision) < 1 || value.category !== null && !isGroceryCategory(value.category)) throw new Error("Saved categories could not be read.");
    return value as GroceryCategoryPreference;
  });
}
