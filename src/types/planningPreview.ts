import type { PlannedMeal, RecipeImage } from "./domain";

/** Presentation-only planned facts; never contains actual intake or private target inputs. */
export type ResultingPlannedMeal = PlannedMeal & {
  memberId?: string;
  status: "new" | "kept";
  image?: RecipeImage | null;
};
