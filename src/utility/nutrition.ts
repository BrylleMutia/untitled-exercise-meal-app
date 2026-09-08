import type { Food, Meal, MealSlot, NutritionLog } from "@/types/domain";

export interface DayTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function totalsForDate(logs: NutritionLog[], date: string): DayTotals {
  return logs
    .filter((l) => l.date === date)
    .reduce<DayTotals>(
      (acc, l) => ({
        calories: acc.calories + l.calories,
        proteinG: acc.proteinG + l.proteinG,
        carbsG: acc.carbsG + l.carbsG,
        fatG: acc.fatG + l.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );
}

export type DayStatus = "complete" | "partial" | "unlogged";

/** A day with no saved meals is "unlogged" — never treated as zero intake. */
export function dayStatus(logs: NutritionLog[], date: string): DayStatus {
  const slots = new Set(logs.filter((l) => l.date === date).map((l) => l.slot));
  if (slots.size >= 4) return "complete";
  if (slots.size >= 1) return "partial";
  return "unlogged";
}

export interface NutritionAverages {
  avgCalories: number;
  avgProteinG: number;
  loggedDays: number;
}

/** Averages are computed over logged days only and must be labeled with that count. */
export function averages(logs: NutritionLog[]): NutritionAverages {
  const dates = [...new Set(logs.map((l) => l.date))];
  if (dates.length === 0) return { avgCalories: 0, avgProteinG: 0, loggedDays: 0 };
  const sum = dates.reduce(
    (acc, d) => {
      const t = totalsForDate(logs, d);
      return { calories: acc.calories + t.calories, protein: acc.protein + t.proteinG };
    },
    { calories: 0, protein: 0 },
  );
  return {
    avgCalories: Math.round(sum.calories / dates.length),
    avgProteinG: Math.round(sum.protein / dates.length),
    loggedDays: dates.length,
  };
}

export function entriesForDate(
  logs: NutritionLog[],
  date: string,
): Record<MealSlot, NutritionLog[]> {
  const by: Record<MealSlot, NutritionLog[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const l of logs.filter((l) => l.date === date)) by[l.slot].push(l);
  return by;
}

export function foodMacros(food: Food, servings: number): DayTotals {
  const r = (n: number) => Math.round(n * servings * 10) / 10;
  return {
    calories: r(food.calories),
    proteinG: r(food.proteinG),
    carbsG: r(food.carbsG),
    fatG: r(food.fatG),
  };
}

export function mealNutrition(meal: Meal, foods: Food[]): DayTotals & { perServing: DayTotals } {
  const total = meal.ingredients.reduce<DayTotals>(
    (acc, ing) => {
      const food = foods.find((f) => f.id === ing.foodId);
      if (!food) return acc;
      const m = foodMacros(food, ing.servings);
      return {
        calories: acc.calories + m.calories,
        proteinG: acc.proteinG + m.proteinG,
        carbsG: acc.carbsG + m.carbsG,
        fatG: acc.fatG + m.fatG,
      };
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  const per = (n: number) => Math.round(n / meal.servings);
  return {
    ...total,
    perServing: {
      calories: per(total.calories),
      proteinG: per(total.proteinG),
      carbsG: per(total.carbsG),
      fatG: per(total.fatG),
    },
  };
}
