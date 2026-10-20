import type { Food, GroceryList, Meal, MealSlot, Weekday } from "./domain";
export type GroupRecipeDetails = { meal: Meal; foods: Food[] };

export type GroupMember = { id: string; name: string; joinedAt: string };
export type CookingGroup = { id: string; revision: number; weekStartsOn: Weekday; members: GroupMember[]; proposal: { id: string; day: Weekday; approvals: string[] } | null };
export type GroupRecipe = Meal & { ownerName: string; ownerId: string | null };
export type GroupAssignment = { id: string; memberId: string; recipeId: string; recipeRevision?: number; label?: string; date: string; slot: MealSlot; servings: number; skipped?: boolean; protected?: boolean };
export type CookingBatch = { recipeId: string; recipeRevision?: number; name: string; yield: number; portions: number; batches: number; leftovers: number; image?: Meal["image"] };
export type GroupGeneration = { id: string; weekOf: string; createdAt: string; generatedBy: string; memberIds: string[]; batches: CookingBatch[]; acknowledged: boolean; superseded: boolean };
export type GroupWeek = { group: CookingGroup | null; weekOf: string; recipes: GroupRecipe[]; assignments: GroupAssignment[]; grocery: GroceryList | null; generation: GroupGeneration | null; notices: GroupGeneration[]; revision: number };
export type GroupPlanningInput = { groupId: string; weekOf: string; memberIds: string[]; selectedDates: string[]; mode: "fill" | "replace"; recipes: Array<{ id: string; revision: number; maxBatches: number }>; seed: string; overrides: Record<string, number> };
export type GroupPreview = { id: string; expiresAt: string; assignments: GroupAssignment[]; batches: CookingBatch[]; replacements: Array<{ memberId: string; date: string; slot: MealSlot; name: string }>; warnings: string[]; basis: string };
export type GroupCommand =
  | { action: "copy-recipe"; recipeId: string; idempotencyKey: string }
  | { action: "invite"; idempotencyKey: string }
  | { action: "inspect-pin"; pin: string }
  | { action: "join"; pin: string; groupRevision: number; idempotencyKey: string }
  | { action: "leave"; groupId: string; groupRevision: number; idempotencyKey: string }
  | { action: "acknowledge"; generationId: string; idempotencyKey: string }
  | { action: "propose-week"; day: Weekday; groupRevision: number; idempotencyKey: string }
  | { action: "vote-week"; proposalId: string; approve: boolean; groupRevision: number; idempotencyKey: string }
  | { action: "commit"; previewId: string; acknowledged: boolean; idempotencyKey: string }
  | { action: "grocery"; groupId: string; weekOf: string; revision: number; operation: "refresh" | "add" | "quantity" | "toggle" | "remove" | "amount"; itemId?: string; name?: string; unit?: string; quantity?: number; amount?: number | null; idempotencyKey: string }
  | { action: "edit-assignment"; groupId: string; weekOf: string; revision: number; assignmentId: string; recipeId?: string; servings: number; skipped: boolean; idempotencyKey: string };
export type GroupCommandResult = { group?: CookingGroup; pin?: string; expiresAt?: string; inviter?: string; success?: boolean; generationId?: string; recipeId?: string };
