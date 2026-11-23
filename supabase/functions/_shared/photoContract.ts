// Shared by the browser and Edge Function. No image bytes belong in this result.
export type PhotoPortion = { low: number; base: number; high: number; unit: "g" | "piece" };
export type PhotoCandidate = {
  name: string;
  preparation: string;
  presence: "visible" | "possible_hidden";
  confidence: "high" | "medium" | "low";
  portion: PhotoPortion | null;
  assumptions: string[];
};
export type PhotoExtraction = {
  status: "ok" | "unclear" | "no_food";
  suggestedMealName: string;
  candidates: PhotoCandidate[];
  questions: string[];
};
const text = (max: number) => ({ type: "string", minLength: 1, maxLength: max });
export const photoResponseSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "suggestedMealName", "candidates", "questions"],
  properties: {
    status: { type: "string", enum: ["ok", "unclear", "no_food"] },
    suggestedMealName: text(160),
    questions: { type: "array", maxItems: 8, items: text(240) },
    candidates: { type: "array", maxItems: 10, items: {
      type: "object", additionalProperties: false,
      required: ["name", "preparation", "presence", "confidence", "portion", "assumptions"],
      properties: {
        name: text(160), preparation: text(80),
        presence: { type: "string", enum: ["visible", "possible_hidden"] },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        assumptions: { type: "array", maxItems: 5, items: text(240) },
        portion: { anyOf: [{ type: "null" }, {
          type: "object", additionalProperties: false, required: ["low", "base", "high", "unit"],
          properties: {
            low: { type: "number", exclusiveMinimum: 0, maximum: 10000 },
            base: { type: "number", exclusiveMinimum: 0, maximum: 10000 },
            high: { type: "number", exclusiveMinimum: 0, maximum: 10000 },
            unit: { type: "string", enum: ["g", "piece"] },
          },
        }] },
      },
    } },
  },
};
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function texts(value: unknown, max: number): boolean {
  return Array.isArray(value) && value.length <= max && value.every(item => boundedText(item, 240));
}
export function isPhotoExtraction(value: unknown): value is PhotoExtraction {
  if (!record(value) || Object.keys(value).length !== 4 || !["ok", "unclear", "no_food"].includes(String(value.status))
    || !boundedText(value.suggestedMealName, 160) || !texts(value.questions, 8)
    || !Array.isArray(value.candidates) || value.candidates.length > 10) return false;
  if (value.status === "no_food" && value.candidates.length !== 0) return false;
  if (value.status === "ok" && value.candidates.length === 0) return false;
  return value.candidates.every(item => {
    if (!record(item) || Object.keys(item).length !== 6 || !boundedText(item.name, 160) || !boundedText(item.preparation, 80)
      || !["visible", "possible_hidden"].includes(String(item.presence))
      || !["high", "medium", "low"].includes(String(item.confidence)) || !texts(item.assumptions, 5)) return false;
    if (item.portion === null) return true;
    const p = item.portion;
    return record(p) && Object.keys(p).length === 4 && ["g", "piece"].includes(String(p.unit))
      && [p.low, p.base, p.high].every(n => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 10000)
      && Number(p.low) <= Number(p.base) && Number(p.base) <= Number(p.high);
  });
}
