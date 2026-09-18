export type UnitSystem = "metric" | "imperial";
export type SexForBmr = "female" | "male";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type EquipmentId = "none" | "pullup_bar" | "bands" | "dumbbells" | "bench";
export type PrimaryGoal = "lose" | "maintain" | "gain" | "strength" | "consistency";
export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export type Confidence = "high" | "medium" | "low";
export type PreparationBasis =
  | "raw"
  | "cooked"
  | "baked"
  | "dry"
  | "prepared"
  | "as_labeled"
  | "unknown";
export type MovementCategory = "push" | "pull" | "squat" | "hinge" | "core" | "mobility";
export type GroceryCategory = "Produce" | "Protein" | "Dairy" | "Grains" | "Pantry" | "Other";
export type TargetEligibility = "eligible" | "unsupported" | "not_answered";

export interface UserProfile {
  id: string;
  name: string;
  age: number;
  sex: SexForBmr;
  heightCm: number;
  weightKg: number;
  units: UnitSystem;
  experience: ExperienceLevel;
  equipment: EquipmentId[];
  daysPerWeek: number;
  sessionMinutes: number;
  goal: PrimaryGoal;
  dietaryPattern: string;
  allergies: string[];
  foodPreferences?: string[];
  cookingTimeMinutes?: number;
  mealBudget?: number;
  /** Optimistic concurrency revision supplied by the authoritative profile row. */
  revision?: number;
  /** Stored screening outcome; no sensitive screening explanation is retained. */
  targetEligibility?: TargetEligibility;
  eligibilityVersion?: string;
  createdAt: string;
}

export interface Goal {
  id: string;
  type: PrimaryGoal;
  targetWeightKg?: number;
  desiredRateKgPerWeek?: number;
  targetDate?: string;
  weeklyWorkoutTarget?: number;
  skillTargets?: Record<string, number>;
  effectiveDate: string;
  version: number;
  status: "active" | "archived" | "completed";
}

export interface DailyTarget {
  id: string;
  version: number;
  effectiveDate: string; // YYYY-MM-DD
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  bmr: number;
  bmi: number;
  tdee: number;
  formula: string;
  activityFactor: number;
  disclaimer: string;
  calculationAssumptions?: string;
  calculationVersion?: string;
  rawCalories?: number;
  goalAdjustment?: number;
  safetyOutcome?: "supported" | "below_floor" | "unsupported_population";
  goalId?: string;
}

export interface Exercise {
  id: string;
  slug: string; // @bryllim/workout-guide slug; illustration at /exercises/<slug>.png
  name: string;
  description: string;
  category: MovementCategory;
  muscles: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  equipment: EquipmentId[];
  measure: "reps" | "hold";
  illustrationAlt: string;
  regression?: string;
  progression?: string;
  progressionBounds?: {
    minSets: number;
    maxSets: number;
    setStep: number;
    minReps: number;
    maxReps: number;
    repStep: number;
    minHoldSeconds: number;
    maxHoldSeconds: number;
    holdStep: number;
  };
  safety: string;
}

export interface PlannedExercise {
  id: string;
  exerciseId: string;
  sets: number;
  reps?: number;
  holdSeconds?: number;
  restSeconds: number;
  sortOrder?: number;
  slotKey?: string;
}

export interface PlannedWorkout {
  id: string;
  dayOfWeek: number; // 0 = Sunday
  title: string;
  focus: string;
  warmup: string[];
  cooldown: string[];
  exercises: PlannedExercise[];
  estimatedMinutes: number;
}

export interface WorkoutPlan {
  id: string;
  version: number;
  createdAt: string;
  targetId: string;
  effectiveDate?: string;
  workouts: PlannedWorkout[];
}

export interface WorkoutPlanOverride {
  id: string;
  slotKey: string;
  plannedExerciseId?: string;
  replacementExerciseId?: string;
  measure?: "reps" | "hold";
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  restSeconds?: number;
  active: boolean;
  effectiveAt: string;
  endedAt?: string;
}

export interface ExerciseLog {
  exerciseId: string;
  plannedExerciseId?: string;
  planned: { sets: number; reps?: number; holdSeconds?: number };
  actual: {
    sets: number;
    reps?: number;
    holdSeconds?: number;
    load?: number;
    loadUnit?: "kg" | "lb";
  };
  status: "completed" | "skipped" | "modified";
  rpe?: number;
  manageable?: boolean; // explicit "manageable" mark when RPE is not recorded
  pain?: boolean;
  note?: string;
}

export interface WorkoutSession {
  id: string;
  plannedWorkoutId: string;
  plannedPlanVersion?: number;
  date: string; // YYYY-MM-DD
  startedAt: string; // ISO
  finishedAt?: string;
  status: "in_progress" | "completed" | "partial" | "abandoned";
  logs: ExerciseLog[];
}

export interface Food {
  id: string;
  name: string;
  servingLabel: string;
  servingGrams: number;
  unit: "g" | "piece";
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  source: string;
  sourceVersion: string;
  estimated: boolean;
  confidence: Confidence;
  category: GroceryCategory;
  fdcId?: string;
  recordType?: string;
  providerRevision?: string;
  providerImportedAt?: string;
  nutrientsPer100g?: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG?: number;
  };
  servingOptions?: Array<{
    label: string;
    unit: string;
    grams: number;
  }>;
}

export interface NutritionLog {
  id: string;
  date: string; // YYYY-MM-DD
  slot: MealSlot;
  foodId?: string;
  customName?: string;
  servings: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  estimated: boolean;
  confidence: Confidence;
  source: string;
  sourceVersion?: string;
  preparationBasis?: PreparationBasis;
  fiberG?: number;
  assumptions?: string;
  revision?: number;
  createdAt: string;
}

export type ProgressionAction = "progress" | "hold" | "regress";
export type ProgressionDecisionState = "accepted" | "rejected";

export interface ProgressionDecision {
  id: string;
  slotKey: string;
  plannedExerciseId: string;
  action: ProgressionAction;
  decision: ProgressionDecisionState;
  ruleVersion: string;
  sourceSessionIds: string[];
  proposedReplacementExerciseId?: string;
  proposedSets?: number;
  proposedReps?: number;
  proposedHoldSeconds?: number;
  createdAt: string;
}

export interface RecipeIngredient {
  foodId: string;
  servings: number;
}

export interface Meal {
  id: string;
  name: string;
  servings: number;
  isSystem?: boolean;
  notes?: string;
  ingredients: RecipeIngredient[];
  revision?: number;
  archivedAt?: string;
}

export interface PlannedMeal {
  id: string;
  slotKey?: string;
  sortOrder?: number;
  date: string; // YYYY-MM-DD
  slot: MealSlot;
  mealId?: string;
  foodId?: string;
  label: string;
  servings: number;
  skipped?: boolean;
  expectedCalories?: number;
  expectedProteinG?: number;
  expectedCarbsG?: number;
  expectedFatG?: number;
  expectedFiberG?: number;
  source?: string;
  sourceVersion?: string;
  assumptions?: string;
  confidence?: Confidence;
  preparationBasis?: PreparationBasis;
}

export interface MealPlan {
  id: string;
  version: number;
  weekOf: string; // YYYY-MM-DD (Monday)
  targetId: string;
  meals: PlannedMeal[];
}

export interface WeightEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
}

export interface GroceryItem {
  id: string;
  name: string;
  category: GroceryCategory;
  unit: string;
  generatedQuantity: number;
  quantity: number; // user-adjustable; starts at generatedQuantity
  checked: boolean;
  custom?: boolean;
  removed?: boolean;
}

export interface GroceryList {
  id: string;
  weekOf: string;
  items: GroceryItem[];
  revision?: number;
}

export interface AppSnapshot {
  schemaVersion: 1;
  userId: string;
  onboarded: boolean;
  profile: UserProfile | null;
  goal: Goal | null;
  target: DailyTarget | null;
  plan: WorkoutPlan | null;
  workoutOverrides: WorkoutPlanOverride[];
  mealPlan: MealPlan | null;
  sessions: WorkoutSession[];
  nutritionLogs: NutritionLog[];
  weights: WeightEntry[];
  grocery: GroceryList | null;
  savedMeals: Meal[];
  progressionDecisions: ProgressionDecision[];
}

export type SemanticEvent =
  | { type: "profile-updated" }
  | { type: "goal-updated"; goalId: string }
  | { type: "target-updated"; targetId: string }
  | { type: "plan-generated"; planId: string }
  | { type: "plan-edited"; planId: string }
  | { type: "workout-completed"; sessionId: string }
  | { type: "workout-partially-logged"; sessionId: string }
  | { type: "nutrition-entry-saved"; entryId: string }
  | { type: "meal-logged"; entryIds: string[] }
  | { type: "meal-saved"; mealId: string }
  | { type: "meal-archived"; mealId: string }
  | { type: "progression-decision-saved"; decisionId: string }
  | { type: "workout-override-removed"; planId: string }
  | { type: "weight-entry-added"; entryId: string }
  | { type: "grocery-list-updated"; listId: string }
  | { type: "data-exported" }
  | { type: "data-erased" };

export interface Toast {
  id: number;
  message: string;
  tone: "ok" | "info" | "warn";
}
