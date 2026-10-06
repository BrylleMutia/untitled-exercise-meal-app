import { addDays, dateKey, fromKey, todayKey } from "./dates";

export function validateDailyStepTarget(target: number | null | undefined): string | null {
  if (target === null || target === undefined) return null;
  return Number.isInteger(target) && target >= 1 && target <= 200000
    ? null : "Daily step target must be a whole number from 1 to 200,000, or left blank.";
}

export function validateDailySteps(date: string, steps: number, walkingMinutes?: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || dateKey(fromKey(date)) !== date || date > todayKey() || date < addDays(todayKey(), -365)) return "Choose a valid date within the past year, today or earlier.";
  if (!Number.isInteger(steps) || steps < 0 || steps > 200000) return "Steps must be a whole number from 0 to 200,000.";
  if (walkingMinutes !== undefined && (!Number.isInteger(walkingMinutes) || walkingMinutes < 0 || walkingMinutes > 1440)) return "Walking minutes must be a whole number from 0 to 1,440, or left blank.";
  return null;
}
