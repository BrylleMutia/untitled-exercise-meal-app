import type { Confidence, Food } from "@/types/domain";

export interface ParsedCandidate {
  id: string;
  raw: string;
  name: string;
  quantity: number;
  unit: string;
  matched: Food | null;
  servingPlan: CandidateServingPlan | null;
  confidence: Confidence;
  assumptions: string[];
}

export interface CandidateServingPlan {
  servings: number;
  servingQuantity: number;
  servingUnit: "g" | "piece";
  note?: string;
}

const UNCERTAIN_WORDS = ["restaurant", "sauce", "dressing", "fried", "oil", "takeout", "mixed"];

const UNIT_WORDS: Record<string, string> = {
  slice: "slice",
  slices: "slice",
  piece: "piece",
  pieces: "piece",
  cup: "cup",
  cups: "cup",
  bowl: "bowl",
  bowls: "bowl",
  tbsp: "tbsp",
  tbsps: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  tsps: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  egg: "piece",
  eggs: "piece",
  gram: "g",
  grams: "g",
  g: "g",
  milliliter: "ml",
  milliliters: "ml",
  ml: "ml",
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

function normalizedUnit(value: string): string {
  const key = value.trim().toLowerCase().replace(/[^a-z]/g, "");
  return UNIT_WORDS[key] ?? key;
}

function labelContainsUnit(label: string, unit: string): boolean {
  const normalizedLabel = label.toLowerCase().replace(/[^a-z]/g, "");
  return normalizedLabel.includes(unit);
}

/**
 * Converts a model quantity into the trusted food's canonical serving basis.
 * A conversion is allowed only when the food record explicitly supports it;
 * otherwise the candidate must remain in review for manual correction.
 */
export function servingPlanForCandidate(
  food: Food,
  quantity: number,
  requestedUnit: string,
): CandidateServingPlan | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || !food.servingGrams || food.servingGrams <= 0) return null;
  const unit = normalizedUnit(requestedUnit || "serving");
  const option = food.servingOptions?.find((candidate) =>
    normalizedUnit(candidate.unit) === unit || labelContainsUnit(candidate.label, unit),
  );

  if (option) {
    const grams = quantity * option.grams;
    return {
      servings: grams / food.servingGrams,
      servingQuantity: grams,
      servingUnit: "g",
      note: `Converted ${quantity} ${requestedUnit} to ${Math.round(grams * 10) / 10} g using the trusted ${option.label} serving option.`,
    };
  }

  if (unit === "g" && food.unit === "g") {
    return {
      servings: quantity / food.servingGrams,
      servingQuantity: quantity,
      servingUnit: "g",
    };
  }

  if (unit === "piece" && food.unit === "piece") {
    return { servings: quantity, servingQuantity: quantity, servingUnit: "piece" };
  }

  if (unit === "serving" || unit === "portion" || labelContainsUnit(food.servingLabel, unit)) {
    return {
      servings: quantity,
      servingQuantity: food.unit === "piece" ? quantity : food.servingGrams * quantity,
      servingUnit: food.unit,
    };
  }

  return null;
}

/**
 * Temporary client-side stand-in for the server-side AI extraction endpoint. It runs entirely
 * on structured pattern matching, never invents nutrition numbers, and marks
 * unmatched or ambiguous items as low confidence for user correction. The real
 * flow sends text to a protected Edge Function and validates the JSON schema.
 */
export function parseMealText(text: string, catalog: Food[]): ParsedCandidate[] {
  return text
    .split(/,| and | with /i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((raw, index) => {
      const match = raw.match(/^(\d+(?:\.\d+)?|one|two|three|four|five)?\s*(slice|slices|piece|pieces|cups?|bowls?|tbsp|tbsps|tablespoons?|tsp|tsps|teaspoons?|eggs?|grams?|g|milliliters?|ml)?\s*(.+)$/i);
      const quantityToken = match?.[1]?.toLowerCase();
      const quantity = quantityToken
        ? NUMBER_WORDS[quantityToken] ?? Number(quantityToken)
        : 1;
      const unitWord = match?.[2]?.toLowerCase();
      const unit = unitWord ? UNIT_WORDS[unitWord] ?? unitWord : "serving";
      const name = (match?.[3] ?? raw).replace(/^(of|some|a|an)\s+/i, "").trim();

      const normalized = name.toLowerCase();
      const food =
        catalog.find((f) => normalized.includes(f.name.toLowerCase())) ??
        catalog.find((f) => f.name.toLowerCase().split(" ").some((w) => w.length > 3 && normalized.includes(w))) ??
        null;

      const servingPlan = food ? servingPlanForCandidate(food, quantity, unit) : null;
      const assumptions: string[] = [];
      let confidence: Confidence = food ? "medium" : "low";
      if (food && unitWord) {
        if (servingPlan) {
          confidence = "high";
        } else {
          assumptions.push(`The requested unit "${unit}" does not match the trusted serving basis (${food.servingLabel}). Correct the quantity or add a custom food before saving.`);
        }
      }
      if (food && !unitWord && quantity === 1) {
        assumptions.push(`Assumed one serving (${food.servingLabel}).`);
      }
      if (UNCERTAIN_WORDS.some((w) => normalized.includes(w))) {
        confidence = "low";
        assumptions.push("Hidden ingredients (sauces, oils, restaurant prep) make this uncertain.");
      }
      if (!food) {
        assumptions.push("No catalog match — confirm or correct before saving.");
      }

      if (food && !servingPlan) {
        confidence = "low";
      } else if (servingPlan?.note) {
        assumptions.push(servingPlan.note);
      }

      return {
        id: `pc-${index}`,
        raw,
        name,
        quantity,
        unit,
        matched: food,
        servingPlan,
        confidence,
        assumptions,
      };
    });
}
