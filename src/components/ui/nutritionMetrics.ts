export type NutritionMetric = "calories" | "proteinG" | "carbsG" | "fatG";

/** Presentation roles shared by intake, targets, and activity energy. */
export const nutritionMetricStyles = {
  calories: { label: "Calories", unit: "kcal", pill: "bg-nutrition-calories", surface: "bg-nutrition-calories-soft", bar: "bg-nutrition-calories", ring: "text-nutrition-calories-strong", tone: "coral" },
  proteinG: { label: "Protein", unit: "g protein", pill: "bg-nutrition-protein", surface: "bg-nutrition-protein-soft", bar: "bg-nutrition-protein", tone: "lavender" },
  carbsG: { label: "Carbs", unit: "g carbs", pill: "bg-nutrition-carbs", surface: "bg-nutrition-carbs-soft", bar: "bg-nutrition-carbs", tone: "peach" },
  fatG: { label: "Fat", unit: "g fat", pill: "bg-nutrition-fat", surface: "bg-nutrition-fat-soft", bar: "bg-nutrition-fat", tone: "mint" },
} as const;

export const nutritionMetricOrder: NutritionMetric[] = ["calories", "proteinG", "carbsG", "fatG"];
