import type { AppSnapshot } from "@/types/domain";
import type {
  AbandonSessionInput,
  AddCustomGroceryInput,
  DeleteAccountInput,
  DeleteNutritionInput,
  ExportInput,
  ExportOutcome,
  FinishSessionInput,
  GroceryMutationInput,
  MutationOutcome,
  NutritionInput,
  OnboardingInput,
  RegenerateGroceryInput,
  RepositoryError,
  ResetPlanInput,
  SaveMealInput,
  SaveSessionInput,
  SkipPlannedMealInput,
  StartSessionInput,
  UpdateUnitsInput,
  WeightInput,
} from "@/types/backend";

export interface SnapshotRepository {
  load(): Promise<AppSnapshot | null>;
  completeOnboarding(input: OnboardingInput): Promise<MutationOutcome>;
  updateProfile(input: OnboardingInput): Promise<MutationOutcome>;
  updateUnits(input: UpdateUnitsInput): Promise<MutationOutcome>;
  startSession(input: StartSessionInput): Promise<MutationOutcome>;
  saveSession(input: SaveSessionInput): Promise<MutationOutcome>;
  finishSession(input: FinishSessionInput): Promise<MutationOutcome>;
  abandonSession(input: AbandonSessionInput): Promise<MutationOutcome>;
  saveNutrition(input: NutritionInput): Promise<MutationOutcome>;
  deleteNutrition(input: DeleteNutritionInput): Promise<MutationOutcome>;
  saveWeight(input: WeightInput): Promise<MutationOutcome>;
  updateGrocery(input: GroceryMutationInput, currentSnapshot: AppSnapshot): Promise<MutationOutcome>;
  addCustomGrocery(input: AddCustomGroceryInput): Promise<MutationOutcome>;
  regenerateGrocery(input: RegenerateGroceryInput): Promise<MutationOutcome>;
  skipPlannedMeal(input: SkipPlannedMealInput): Promise<MutationOutcome>;
  resetPlan(input: ResetPlanInput): Promise<MutationOutcome>;
  saveMeal(input: SaveMealInput): Promise<MutationOutcome>;
  exportData(input?: ExportInput): Promise<ExportOutcome>;
  deleteAccount(input: DeleteAccountInput): Promise<MutationOutcome>;
}

export type { RepositoryError };
