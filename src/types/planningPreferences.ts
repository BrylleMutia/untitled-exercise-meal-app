export const PLANNING_REVIEW_POLICY = "advisory_v1" as const;
export type RecipePreferenceWarning = {
  code: "cooking-time" | "cooking-time-unknown" | "diet" | "avoided-food" | "source-nutrition" | "ingredient-nutrition";
  recipeId: string; recipeRevision: number; recipeName: string; message: string;
};
export type DailyPreferenceWarning = { code: "daily-carbohydrate"; date: string; totalCarbs: number | null; limit: number; recipeIds: string[]; recipeNames?: Record<string, string>; message: string };
export type PreferenceReview = { policyVersion: typeof PLANNING_REVIEW_POLICY; recipeWarnings: RecipePreferenceWarning[]; dailyWarnings: DailyPreferenceWarning[] };
