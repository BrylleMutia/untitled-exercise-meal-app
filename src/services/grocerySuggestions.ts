import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { GroceryNameHistoryCandidate } from "@/types/grocerySuggestions";
import { canSuggestGroceryName } from "@/utility/grocerySuggestions";

export async function loadGroceryNameSuggestions(client: SupabaseClient<Database>, query: string, groupId?: string): Promise<GroceryNameHistoryCandidate[]> {
  if (!canSuggestGroceryName(query)) return [];
  const { data, error } = await client.rpc("get_grocery_name_suggestions", { p_query: query, p_group_id: groupId });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length > 12) throw new Error("Past grocery names could not be read.");
  return data.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.name !== "string" || value.name.length > 256 || !value.name.trim() || typeof value.occurrences !== "number" || !Number.isSafeInteger(value.occurrences) || value.occurrences < 1 || typeof value.lastSeenWeek !== "string" || !Number.isFinite(Date.parse(value.lastSeenWeek))) throw new Error("Past grocery names could not be read.");
    return value as GroceryNameHistoryCandidate;
  });
}
