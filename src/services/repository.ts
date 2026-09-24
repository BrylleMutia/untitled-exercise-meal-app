import type { AppSnapshot } from "@/types/domain";
import type {
  AbandonSessionInput,
  AddCustomGroceryInput,
  ArchiveMealInput,
  DeleteAccountInput,
  DeleteNutritionInput,
  EditMealPlanInput,
  ExportInput,
  ExportOutcome,
  FinishSessionInput,
  GroceryMutationInput,
  MutationOutcome,
  NotificationPreferenceInput,
  NutritionInput,
  UpdateNutritionInput,
  SaveFoodInput,
  OnboardingInput,
  ProfileUpdateInput,
  RegenerateGroceryInput,
  RepositoryError,
  ResetPlanInput,
  SaveMealInput,
  SaveSessionInput,
  SavedMealLogInput,
  SaveReviewedMealInput,
  UpdateLoggedMealInput,
  DeleteLoggedMealInput,
  SkipPlannedMealInput,
  StartSessionInput,
  UpdateUnitsInput,
  WorkoutPlanOverrideInput,
  RemoveWorkoutOverrideInput,
  ProgressionDecisionInput,
  HistoryQuery,
  HistoryReadModel,
  WeightInput,
} from "@/types/backend";

export interface SnapshotRepository {
  load(): Promise<AppSnapshot | null>;
  loadHistory(query?: HistoryQuery): Promise<HistoryReadModel>;
  completeOnboarding(input: OnboardingInput): Promise<MutationOutcome>;
  updateProfile(input: ProfileUpdateInput): Promise<MutationOutcome>;
  updateUnits(input: UpdateUnitsInput): Promise<MutationOutcome>;
  updateNotificationPreference(input: NotificationPreferenceInput): Promise<MutationOutcome>;
  startSession(input: StartSessionInput): Promise<MutationOutcome>;
  saveSession(input: SaveSessionInput): Promise<MutationOutcome>;
  finishSession(input: FinishSessionInput): Promise<MutationOutcome>;
  abandonSession(input: AbandonSessionInput): Promise<MutationOutcome>;
  saveNutrition(input: NutritionInput): Promise<MutationOutcome>;
  updateNutrition(input: UpdateNutritionInput): Promise<MutationOutcome>;
  saveFood(input: SaveFoodInput): Promise<MutationOutcome>;
  saveSavedMealLog(input: SavedMealLogInput): Promise<MutationOutcome>;
  saveReviewedMeal(input: SaveReviewedMealInput): Promise<MutationOutcome>;
  updateLoggedMeal(input: UpdateLoggedMealInput): Promise<MutationOutcome>;
  deleteLoggedMeal(input: DeleteLoggedMealInput): Promise<MutationOutcome>;
  deleteNutrition(input: DeleteNutritionInput): Promise<MutationOutcome>;
  saveWeight(input: WeightInput): Promise<MutationOutcome>;
  updateGrocery(input: GroceryMutationInput, currentSnapshot: AppSnapshot): Promise<MutationOutcome>;
  addCustomGrocery(input: AddCustomGroceryInput): Promise<MutationOutcome>;
  regenerateGrocery(input: RegenerateGroceryInput): Promise<MutationOutcome>;
  skipPlannedMeal(input: SkipPlannedMealInput): Promise<MutationOutcome>;
  editMealPlan(input: EditMealPlanInput): Promise<MutationOutcome>;
  resetPlan(input: ResetPlanInput): Promise<MutationOutcome>;
  applyWorkoutOverride(input: WorkoutPlanOverrideInput): Promise<MutationOutcome>;
  removeWorkoutOverride(input: RemoveWorkoutOverrideInput): Promise<MutationOutcome>;
  applyProgressionDecision(input: ProgressionDecisionInput): Promise<MutationOutcome>;
  saveMeal(input: SaveMealInput): Promise<MutationOutcome>;
  archiveMeal(input: ArchiveMealInput): Promise<MutationOutcome>;
  exportData(input?: ExportInput): Promise<ExportOutcome>;
  deleteAccount(input: DeleteAccountInput): Promise<MutationOutcome>;
}

export type { RepositoryError };
