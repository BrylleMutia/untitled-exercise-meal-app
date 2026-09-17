import type { DailyTarget, PrimaryGoal, SexForBmr, TargetEligibility, UserProfile } from "@/types/domain";

export const HEALTH_DISCLAIMER =
  "Estimates for healthy adults only. This app is not medical, dietary, or exercise care.";

export const BMR_FORMULA = "mifflin-st-jeor";
export const HEALTH_POLICY_VERSION = "calicoach-health-v1";
export const ELIGIBILITY_SCREENING_VERSION = "calicoach-eligibility-v1";
export const MIN_AUTOMATED_CALORIES = 1200;

/** Documented activity-factor table keyed by weekly training days. */
export const ACTIVITY_TABLE: ReadonlyArray<{ maxDays: number; factor: number; label: string }> = [
  { maxDays: 1, factor: 1.35, label: "Lightly active" },
  { maxDays: 3, factor: 1.45, label: "Moderately active" },
  { maxDays: 5, factor: 1.55, label: "Active" },
  { maxDays: 7, factor: 1.65, label: "Very active" },
];

export const kgToLb = (kg: number) => kg * 2.2046226218;
export const lbToKg = (lb: number) => lb / 2.2046226218;
export const cmToIn = (cm: number) => cm / 2.54;
export const inToCm = (inch: number) => inch * 2.54;

/** Mifflin-St Jeor. */
export function calculateBmr(input: {
  sex: SexForBmr;
  age: number;
  weightKg: number;
  heightCm: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  return Math.round(input.sex === "male" ? base + 5 : base - 161);
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function activityFactorFor(daysPerWeek: number): number {
  const row = ACTIVITY_TABLE.find((r) => daysPerWeek <= r.maxDays);
  return row ? row.factor : ACTIVITY_TABLE[ACTIVITY_TABLE.length - 1].factor;
}

export function calculateTdee(bmr: number, activityFactor: number): number {
  return Math.round(bmr * activityFactor);
}

const GOAL_ADJUSTMENT: Record<PrimaryGoal, number> = {
  lose: -0.15,
  gain: 0.12,
  strength: 0.05,
  maintain: 0,
  consistency: 0,
};

export function calorieTargetForGoal(tdee: number, goal: PrimaryGoal): number {
  return Math.round((tdee * (1 + GOAL_ADJUSTMENT[goal])) / 25) * 25;
}

export function goalAdjustmentFor(goal: PrimaryGoal): number {
  return GOAL_ADJUSTMENT[goal];
}

export class UnsupportedTargetError extends Error {
  readonly code = "unsupported_target" as const;
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedTargetError";
  }
}

export function targetEligibilityFor(profile: Pick<UserProfile, "targetEligibility">): TargetEligibility {
  return profile.targetEligibility ?? "eligible";
}

export function macroTargets(
  calories: number,
  weightKg: number,
  goal: PrimaryGoal,
): { proteinG: number; carbsG: number; fatG: number } {
  const proteinG = Math.round(weightKg * (goal === "strength" ? 1.8 : 1.6));
  const fatG = Math.round((calories * 0.25) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
  return { proteinG, carbsG, fatG };
}

export interface ProfileInput {
  age: number;
  sex: SexForBmr;
  heightCm: number;
  weightKg: number;
  daysPerWeek: number;
  sessionMinutes: number;
}

/** Input-boundary validation. Unsupported values are rejected, never clamped. */
export function validateProfileInput(input: ProfileInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.age) || !Number.isInteger(input.age) || input.age < 18 || input.age > 100) {
    errors.push("Age must be a whole number between 18 and 100. Automated targets are adults-only.");
  }
  if (!Number.isFinite(input.heightCm) || input.heightCm < 120 || input.heightCm > 230) {
    errors.push("Height must be between 120 and 230 cm (47–91 in).");
  }
  if (!Number.isFinite(input.weightKg) || input.weightKg < 35 || input.weightKg > 300) {
    errors.push("Weight must be between 35 and 300 kg (77–661 lb).");
  }
  if (!Number.isFinite(input.daysPerWeek) || !Number.isInteger(input.daysPerWeek) || input.daysPerWeek < 1 || input.daysPerWeek > 7) {
    errors.push("Training days must be a whole number between 1 and 7.");
  }
  if (!Number.isFinite(input.sessionMinutes) || input.sessionMinutes < 15 || input.sessionMinutes > 120) {
    errors.push("Workout duration must be between 15 and 120 minutes.");
  }
  return errors;
}

/** >1% bodyweight change per week is flagged as aggressive and needs confirmation. */
export function isAggressiveRate(
  currentKg: number,
  targetKg: number,
  weeks: number,
): boolean {
  if (![currentKg, targetKg, weeks].every(Number.isFinite) || weeks <= 0 || currentKg <= 0) return true;
  return Math.abs(targetKg - currentKg) / weeks / currentKg > 0.01;
}

let targetSeq = 0;

export function buildDailyTarget(profile: UserProfile, effectiveDate: string): DailyTarget {
  const eligibility = targetEligibilityFor(profile);
  if (eligibility !== "eligible") {
    throw new UnsupportedTargetError(
      eligibility === "not_answered"
        ? "Complete the health screening before previewing automated targets."
        : "Automated targets are not available for this health situation. You can still log food and workouts manually.",
    );
  }
  const bmr = calculateBmr(profile);
  const factor = activityFactorFor(profile.daysPerWeek);
  const tdee = calculateTdee(bmr, factor);
  const calories = calorieTargetForGoal(tdee, profile.goal);
  if (calories < MIN_AUTOMATED_CALORIES) {
    throw new UnsupportedTargetError(
      "This estimate is below the supported safety floor, so an automated target was not created.",
    );
  }
  const macros = macroTargets(calories, profile.weightKg, profile.goal);
  targetSeq += 1;
  return {
    id: `target-${targetSeq}`,
    version: 1,
    effectiveDate,
    calories,
    ...macros,
    bmr,
    bmi: calculateBmi(profile.weightKg, profile.heightCm),
    tdee,
    formula: BMR_FORMULA,
    activityFactor: factor,
    disclaimer: HEALTH_DISCLAIMER,
    calculationAssumptions: `Policy ${HEALTH_POLICY_VERSION}; Mifflin–St Jeor; activity factor ${factor}; goal adjustment ${GOAL_ADJUSTMENT[profile.goal]}.`,
    calculationVersion: HEALTH_POLICY_VERSION,
    rawCalories: calories,
    goalAdjustment: GOAL_ADJUSTMENT[profile.goal],
    safetyOutcome: "supported",
  };
}
