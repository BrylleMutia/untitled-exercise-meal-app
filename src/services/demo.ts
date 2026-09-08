import type { AppSnapshot, NutritionLog, WeightEntry, WorkoutSession } from "@/types/domain";
import { SAVED_MEALS } from "@/constants/meals";
import { foodById } from "@/constants/foods";
import { buildDailyTarget } from "@/utility/health";
import { generateWorkoutPlan } from "@/utility/plan";
import { generateMealPlan } from "@/utility/mealPlan";
import { generateGroceryList } from "@/utility/grocery";
import { FOODS } from "@/constants/foods";
import { addDays, startOfWeek, todayKey } from "@/utility/dates";

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

function foodLog(date: string, slot: NutritionLog["slot"], foodId: string, servings: number): NutritionLog {
  const food = foodById(foodId);
  if (!food) throw new Error(`Unknown demo food ${foodId}`);
  const r = (n: number) => Math.round(n * servings * 10) / 10;
  return {
    id: nextId("nl"),
    date,
    slot,
    foodId,
    servings,
    calories: r(food.calories),
    proteinG: r(food.proteinG),
    carbsG: r(food.carbsG),
    fatG: r(food.fatG),
    estimated: food.estimated,
    confidence: food.confidence,
    source: `${food.source} ${food.sourceVersion}`,
    createdAt: new Date().toISOString(),
  };
}

/** Deterministic demo snapshot so first paint and hydration match. */
export function buildDemoSnapshot(todayOverride?: string): AppSnapshot {
  const today = todayOverride ?? todayKey();
  const weekOf = startOfWeek(today);

  const profile: AppSnapshot["profile"] = {
    id: "demo-user",
    name: "Alex",
    age: 29,
    sex: "male",
    heightCm: 178,
    weightKg: 76.4,
    units: "metric",
    experience: "intermediate",
    equipment: ["none", "pullup_bar"],
    daysPerWeek: 3,
    sessionMinutes: 45,
    goal: "strength",
    dietaryPattern: "no restrictions",
    allergies: [],
    createdAt: new Date().toISOString(),
  };

  const target = buildDailyTarget(profile, today);
  const plan = generateWorkoutPlan(profile, target.id, today);
  const mealPlan = generateMealPlan(target.id, weekOf);
  const grocery = generateGroceryList(mealPlan, SAVED_MEALS, FOODS, weekOf);
  grocery.items = grocery.items.map((item, i) =>
    i === 1 ? { ...item, checked: true } : i === 3 ? { ...item, quantity: Math.round(item.quantity * 1.5) } : item,
  );

  const yesterday = addDays(today, -1);
  const twoDaysAgo = addDays(today, -2);
  const fourDaysAgo = addDays(today, -4);

  const firstWorkout = plan.workouts[0];
  const sessions: WorkoutSession[] = [twoDaysAgo, fourDaysAgo].map((date, si) => ({
    id: nextId("ws"),
    plannedWorkoutId: firstWorkout.id,
    plannedPlanVersion: plan.version,
    date,
    startedAt: `${date}T07:10:00.000Z`,
    finishedAt: `${date}T07:52:00.000Z`,
    status: "completed",
    logs: firstWorkout.exercises.map((pe) => ({
      exerciseId: pe.exerciseId,
      planned: { sets: pe.sets, reps: pe.reps, holdSeconds: pe.holdSeconds },
      actual: { sets: pe.sets, reps: pe.reps, holdSeconds: pe.holdSeconds },
      status: "completed",
      rpe: si === 0 ? 6 : 7,
    })),
  }));

  const nutritionLogs: NutritionLog[] = [
    foodLog(today, "breakfast", "food-egg", 2),
    foodLog(today, "breakfast", "food-bread", 2),
    foodLog(today, "breakfast", "food-banana", 1),
    foodLog(today, "lunch", "food-chicken", 1),
    foodLog(today, "lunch", "food-rice", 1),
    foodLog(today, "lunch", "food-broccoli", 2),
    foodLog(yesterday, "breakfast", "food-oats", 1),
    foodLog(yesterday, "breakfast", "food-milk", 1),
    foodLog(yesterday, "lunch", "food-salmon", 1),
    foodLog(yesterday, "lunch", "food-sweet-potato", 1),
    foodLog(yesterday, "dinner", "food-tofu", 1),
    foodLog(yesterday, "dinner", "food-pasta", 1),
  ];

  const weights: WeightEntry[] = [42, 35, 28, 21, 14, 7, 0].map((daysAgo, i) => ({
    id: nextId("we"),
    date: addDays(today, -daysAgo),
    weightKg: Math.round((77.8 - i * 0.24) * 10) / 10,
  }));

  return {
    schemaVersion: 1,
    userId: "demo-user",
    onboarded: true,
    profile,
    target,
    plan,
    mealPlan,
    sessions,
    nutritionLogs,
    weights,
    grocery,
    savedMeals: SAVED_MEALS,
  };
}
