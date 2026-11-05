import type { ResultingPlannedMeal } from "./planningPreview";
import type { GroceryCategoryChoice } from "@/utility/groceryCategory";
import type { PreferenceReview } from "./planningPreferences";
import type { Food, GroceryList, Meal, MealSlot, Weekday } from "./domain";
export type GroupRecipeDetails = { meal: Meal; foods: Food[] };

export type GroupMember = { id: string; name: string; joinedAt: string };
export type CookingGroup = { id: string; revision: number; weekStartsOn: Weekday; members: GroupMember[]; proposal: { id: string; day: Weekday; approvals: string[] } | null };
export type GroupRecipe = Meal & { ownerName: string; ownerId: string | null; canonicalDefaultId?: string; caloriesPerServing?: number; isEditedDefault?: boolean };
export type GroupAssignment = { id: string; memberId: string; recipeId: string; recipeRevision?: number; label?: string; date: string; slot: MealSlot; servings: number; skipped?: boolean; protected?: boolean };
export type CookingBatch = { recipeId: string; recipeRevision?: number; name: string; yield: number; portions: number; batches: number; leftovers: number; image?: Meal["image"] };
export type GroupGeneration = { id: string; weekOf: string; createdAt: string; generatedBy: string; memberIds: string[]; batches: CookingBatch[]; acknowledged: boolean; superseded: boolean; personalReview?: PreferenceReview; assignmentCounts?: Array<{ memberId: string; count: number }> };
export type RecipeOrigin = { snapshotId: string; recipeId: string; canonicalDefaultId?: string };
export type CurrentCooking = CookingBatch & { assignmentIds: string[]; caloriesPerServing?: number };
export type GroceryTransferWeek = { sourceListId: number; sourceRevision: number; sourceWeek: string; targetWeek: string; targetRevision: number };
export type GrocerySharingStatus = { status: "disconnected" | "not-enabled" | "transferring" | "enabled"; promptDismissed?: boolean; remaining: number; completed: number; next?: GroceryTransferWeek | null; draftWeeks?: Array<{ sourceWeek: string; targetWeek: string }> };
export type GroupWeek = { group: CookingGroup | null; grocerySharing?: GrocerySharingStatus; recipeOrigins?: RecipeOrigin[]; cooking?: CurrentCooking[]; weekOf: string; recipes: GroupRecipe[]; assignments: GroupAssignment[]; grocery: GroceryList | null; generation: GroupGeneration | null; notices: GroupGeneration[]; revision: number };
export type GroupPlanningInput = { reviewPolicyVersion?: "advisory_v1"; groupId: string; weekOf: string; memberIds: string[]; selectedDates: string[]; mode: "fill" | "replace"; recipes: Array<{ id: string; revision: number; maxBatches: number }>; seed: string; overrides: Record<string, number> };
export type GroupPreview = { id: string; expiresAt: string; assignments: GroupAssignment[]; batches: CookingBatch[]; resultingMeals: ResultingPlannedMeal[]; replacements: Array<{ id: string; memberId: string; date: string; slot: MealSlot; name: string }>; warnings: string[]; preferenceReview?: PreferenceReview; basis: string };
export type GroupCommand =
  | { action: "share-groceries"; groupId: string; groupRevision: number; acknowledged: boolean; idempotencyKey: string }
  | { action: "dismiss-grocery-sharing"; groupId: string; groupRevision: number; idempotencyKey: string }
  | ({ action: "transfer-grocery-week"; groupId: string; idempotencyKey: string } & GroceryTransferWeek)
  | { action: "copy-recipe"; recipeId: string; idempotencyKey: string }
  | { action: "invite"; grocerySharingAcknowledgment: "all-weeks-v1"; idempotencyKey: string }
  | { action: "inspect-pin"; pin: string }
  | { action: "join"; pin: string; groupRevision: number; grocerySharingAcknowledgment: "all-weeks-v1"; idempotencyKey: string }
  | { action: "leave"; groupId: string; groupRevision: number; idempotencyKey: string }
  | { action: "acknowledge"; generationId: string; idempotencyKey: string }
  | { action: "propose-week"; day: Weekday; groupRevision: number; idempotencyKey: string }
  | { action: "vote-week"; proposalId: string; approve: boolean; groupRevision: number; idempotencyKey: string }
  | { action: "commit"; previewId: string; acknowledged: boolean; idempotencyKey: string }
  | { action: "grocery"; groupId: string; weekOf: string; revision: number; categoryChoice?: GroceryCategoryChoice; operation: "refresh" | "add" | "quantity" | "toggle" | "remove" | "amount"; itemId?: string; name?: string; unit?: string; quantity?: number; amount?: number | null; idempotencyKey: string }
  | { action: "edit-assignment"; groupId: string; weekOf: string; revision: number; assignmentId: string; recipeId?: string; servings: number; skipped: boolean; idempotencyKey: string };
export type GroupCommandResult = { groceryItem?: import("./domain").GroceryItem; previousCategory?: string; sharing?: GrocerySharingStatus; group?: CookingGroup; pin?: string; expiresAt?: string; inviter?: string; success?: boolean; generationId?: string; recipeId?: string };
