import type { Confidence, Food } from "@/types/domain";

export interface ParsedCandidate {
  id: string;
  raw: string;
  name: string;
  quantity: number;
  matched: Food | null;
  confidence: Confidence;
  assumptions: string[];
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
  egg: "piece",
  eggs: "piece",
  gram: "g",
  grams: "g",
  g: "g",
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

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
      const match = raw.match(/^(\d+(?:\.\d+)?|one|two|three|four|five)?\s*(slice|slices|piece|pieces|cups?|bowls?|eggs?|grams?|g)?\s*(.+)$/i);
      const quantityToken = match?.[1]?.toLowerCase();
      const quantity = quantityToken
        ? NUMBER_WORDS[quantityToken] ?? Number(quantityToken)
        : 1;
      const unitWord = match?.[2]?.toLowerCase();
      const name = (match?.[3] ?? raw).replace(/^(of|some|a|an)\s+/i, "").trim();

      const normalized = name.toLowerCase();
      const food =
        catalog.find((f) => normalized.includes(f.name.toLowerCase())) ??
        catalog.find((f) => f.name.toLowerCase().split(" ").some((w) => w.length > 3 && normalized.includes(w))) ??
        null;

      const assumptions: string[] = [];
      let confidence: Confidence = food ? "medium" : "low";
      if (food && unitWord) {
        const expected = UNIT_WORDS[unitWord];
        if (expected && food.servingLabel.toLowerCase().includes(expected)) {
          confidence = "high";
        } else {
          assumptions.push(`Assumed "${unitWord}" ≈ one serving (${food.servingLabel}).`);
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

      return {
        id: `pc-${index}`,
        raw,
        name,
        quantity,
        matched: food,
        confidence,
        assumptions,
      };
    });
}
