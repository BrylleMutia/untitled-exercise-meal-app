import { classifyGroceryName, formatGroceryItemName } from "@/utility/groceryCategory";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.generated";
import type { GrocerySharingStatus, GroupCommand, GroupCommandResult, GroupPlanningInput, GroupPreview, GroupWeek } from "@/types/cookingGroup";
import { mapNutritionWeek } from "./supabaseSnapshot";

export function cookingGroupRepository(client: SupabaseClient<Database>) {
  return {
    async recipe(id: string) {
      const { data, error } = await client.rpc("get_cooking_recipe", { p_recipe_id: id });
      if (error) throw new Error(error.message);
      const mapped = mapNutritionWeek(data, "2000-01-02");
      if (!mapped.recipes[0]) throw new Error("Recipe unavailable.");
      return { meal: mapped.recipes[0], foods: mapped.foods };
    },
    async load(weekOf: string): Promise<GroupWeek> {
      const { data, error } = await client.rpc("get_cooking_group_week", { p_week_of: weekOf });
      if (error) throw new Error(error.message);
      if (!data || typeof data !== "object" || !("weekOf" in data) || data.weekOf !== weekOf) throw new Error("The shared week could not be read.");
      const week = data as unknown as GroupWeek;
      if (week.group) {
        const sharing = await client.rpc("get_grocery_sharing_status");
        if (sharing.error) throw new Error(sharing.error.message);
        week.grocerySharing = sharing.data as unknown as GrocerySharingStatus;
      }
      return week;
    },
    async command(input: GroupCommand): Promise<GroupCommandResult> {
      if (input.action === "grocery" && input.operation === "add" && input.name) input = { ...input, name: formatGroceryItemName(input.name) };
      const rpc = ["share-groceries", "transfer-grocery-week", "dismiss-grocery-sharing"].includes(input.action) ? "share_cooking_groceries" : input.action === "commit" ? "commit_cooking_group_plan" : input.action === "copy-recipe" ? "copy_cooking_recipe" : ["grocery", "edit-assignment"].includes(input.action) ? "mutate_cooking_group_week" : "cooking_group_command";
      const { data, error } = await client.rpc(rpc, { p_payload: (input.action === "grocery" ? { ...input, ...(input.operation === "add" || input.categoryChoice ? { category: input.categoryChoice?.category ?? classifyGroceryName(input.name ?? "") } : {}), ...(input.categoryChoice?.preference ? { categoryPreference: input.categoryChoice.preference } : {}) } : input) as unknown as Json });
      if (error) throw new Error(error.message);
      if (data && typeof data === "object" && "error" in data) throw new Error(String(data.error));
      return data as unknown as GroupCommandResult;
    },
    async preview(input: GroupPlanningInput): Promise<GroupPreview> {
      const { data, error } = await client.functions.invoke("cooking-group-preview", { body: input });
      if (error) {
        let message = "Preview unavailable. Your choices are retained; retry when connected.";
        if ("context" in error && error.context instanceof Response) { try { message = (await error.context.json()).message ?? message; } catch { /* Retain the actionable fallback. */ } }
        throw new Error(message);
      }
      return data as GroupPreview;
    },
  };
}
