export type UnitSystem = "metric" | "imperial";
export type SexForBmr = "female" | "male";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type EquipmentId = "none" | "pullup_bar" | "bands" | "dumbbells" | "bench";
export type PrimaryGoal = "lose" | "maintain" | "gain" | "strength" | "consistency";
export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export type Confidence = "high" | "medium" | "low";
export type MovementCategory = "push" | "pull" | "squat" | "hinge" | "core" | "mobility";
export type GroceryCategory = "Produce" | "Protein" | "Dairy" | "Grains" | "Pantry" | "Other";

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
  createdAt: string;
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
  safety: string;
}

export interface PlannedExercise {
  id: string;
  exerciseId: string;
  sets: number;
  reps?: number;
  holdSeconds?: number;
  restSeconds: number;
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
  workouts: PlannedWorkout[];
}

export interface ExerciseLog {
  exerciseId: string;
  planned: { sets: number; reps?: number; holdSeconds?: number };
  actual: { sets: number; reps?: number; holdSeconds?: number };
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
  assumptions?: string;
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
  notes?: string;
  ingredients: RecipeIngredient[];
}

export interface PlannedMeal {
  id: string;
  date: string; // YYYY-MM-DD
  slot: MealSlot;
  mealId?: string;
  foodId?: string;
  label: string;
  servings: number;
  skipped?: boolean;
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
}

export interface AppSnapshot {
  schemaVersion: 1;
  userId: string;
  onboarded: boolean;
  profile: UserProfile | null;
  target: DailyTarget | null;
  plan: WorkoutPlan | null;
  mealPlan: MealPlan | null;
  sessions: WorkoutSession[];
  nutritionLogs: NutritionLog[];
  weights: WeightEntry[];
  grocery: GroceryList | null;
  savedMeals: Meal[];
}

export type SemanticEvent =
  | { type: "profile-updated" }
  | { type: "target-updated"; targetId: string }
  | { type: "plan-generated"; planId: string }
  | { type: "workout-completed"; sessionId: string }
  | { type: "workout-partially-logged"; sessionId: string }
  | { type: "nutrition-entry-saved"; entryId: string }
  | { type: "weight-entry-added"; entryId: string }
  | { type: "grocery-list-updated"; listId: string }
  | { type: "data-exported" }
  | { type: "data-erased" };

export interface Toast {
  id: number;
  message: string;
  tone: "ok" | "info" | "warn";
}
