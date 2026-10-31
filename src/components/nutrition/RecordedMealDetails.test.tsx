import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordedMealDetails } from "./RecordedMealDetails";
import type { NutritionLog } from "@/types/domain";

vi.mock("@/components/ui/Modal", () => ({ Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <div>{children}<footer>{footer}</footer></div> }));

const entry: NutritionLog = { id: "record", date: "2026-10-26", slot: "lunch", customName: "Recorded lunch ingredient", servings: 0.5, calories: 200, proteinG: 12.5, carbsG: 20, fatG: 7, estimated: true, confidence: "low", source: "Saved source", valueSource: "ai_estimate", assumptions: "Oil quantity uncertain", estimateRange: { calories: { low: 180, base: 200, high: 250 }, proteinG: { low: 10, base: 12.5, high: 15 }, carbsG: { low: 15, base: 20, high: 25 }, fatG: { low: 5, base: 7, high: 10 } }, createdAt: "2026-10-26T02:00:00Z" };

it("shows saved portions, sources and uncertainty without creating an editable recipe", () => {
  const html = renderToStaticMarkup(<RecordedMealDetails details={{ name: "Recorded lunch", date: entry.date, slot: entry.slot, entries: [entry] }} foods={[]} returnFocus={{ current: null }} onClose={() => {}} />);
  for (const text of ["No linked saved recipe is available", "Recorded lunch ingredient", "0.5 food servings", "200 kcal", "12.5 g protein", "180–250 kcal", "Saved source", "Oil quantity uncertain", "AI estimate", "low confidence", "preparation basis not recorded"]) expect(html).toContain(text);
  expect(html).not.toContain("Instructions"); expect(html).not.toContain(">Edit</button>"); expect(html).not.toContain("<input");
});

it("labels missing ingredient records without showing an invented zero intake", () => {
  const html = renderToStaticMarkup(<RecordedMealDetails details={{ name: "Legacy meal", date: entry.date, slot: entry.slot, entries: [] }} foods={[]} returnFocus={{ current: null }} onClose={() => {}} />);
  expect(html).toContain("Recorded ingredient nutrition is unavailable"); expect(html).toContain("No ingredient records are available");
  expect(html).not.toContain("0 kcal");
});
