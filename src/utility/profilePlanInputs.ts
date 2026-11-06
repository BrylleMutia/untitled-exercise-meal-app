import type { UserProfile } from "@/types/domain";

/** An unchanged birthday's annual rollover alone must not regenerate saved plans. */
export function hasSamePlanInputs(current: UserProfile, next: UserProfile) {
  const comparable = (profile: UserProfile) => ({
    age: profile.age,
    sex: profile.sex,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    experience: profile.experience,
    trainingProgram: profile.trainingProgram ?? "calisthenics",
    equipment: profile.equipment,
    daysPerWeek: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes,
    goal: profile.goal,
    dietaryPattern: profile.dietaryPattern,
    allergies: profile.allergies,
    foodPreferences: profile.foodPreferences,
    cookingTimeMinutes: profile.cookingTimeMinutes,
    mealBudget: profile.mealBudget,
    targetEligibility: profile.targetEligibility ?? "eligible",
    eligibilityVersion: profile.eligibilityVersion ?? "calicoach-eligibility-v1",
  });
  const nextInputs = comparable(next);
  if (current.birthDate && current.birthDate === next.birthDate) nextInputs.age = current.age;
  return JSON.stringify(comparable(current)) === JSON.stringify(nextInputs);
}
