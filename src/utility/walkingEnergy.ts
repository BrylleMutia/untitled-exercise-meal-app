import type { UserProfile } from "@/types/domain";

/** 2024 Adult Compendium walking codes 17152 and 17190, level ground.
 * https://pacompendium.com/walking/ */
const SLOW_WALK_MET = 2.8;
const MODERATE_WALK_MET = 3.8;

export interface WalkingEnergyEstimate {
  lowKcal: number;
  highKcal: number;
  assumption: string;
}

export function supportsWalkingEnergyEstimate(
  profile: Pick<UserProfile, "age" | "weightKg" | "targetEligibility"> | null | undefined,
): boolean {
  return profile?.targetEligibility === "eligible" &&
    profile.age >= 19 && profile.age <= 59 &&
    Number.isFinite(profile.weightKg) && profile.weightKg > 0;
}

/**
 * A broad population-level estimate based on entered walking minutes and
 * current weight. Steps alone cannot establish duration or intensity.
 */
export function estimateWalkingEnergy(weightKg: number, walkingMinutes?: number): WalkingEnergyEstimate | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || walkingMinutes === undefined ||
      !Number.isFinite(walkingMinutes) || walkingMinutes <= 0 || walkingMinutes > 1440) return null;
  const hours = walkingMinutes / 60;
  return {
    lowKcal: Math.floor(SLOW_WALK_MET * weightKg * hours / 10) * 10,
    highKcal: Math.ceil(MODERATE_WALK_MET * weightKg * hours / 10) * 10,
    assumption: "Level walking from slow to moderate pace (2.8–3.8 MET); uses current body weight. A rough estimate, not calories earned toward your food target.",
  };
}
