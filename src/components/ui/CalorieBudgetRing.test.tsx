import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CalorieBudgetRing } from "./CalorieBudgetRing";
import type { CalorieBudgetInput } from "@/utility/calorieBudget";

const cases: Array<{ input: CalorieBudgetInput; caption: string; summary: string; value: string }> = [
  { input: { target: 2000, logged: 0, status: "unlogged" }, caption: "Not logged", summary: "No meals logged; intake is unknown", value: "—" },
  { input: { target: 2000, logged: 0, status: "partial" }, caption: "Still logging", summary: "2000 kcal remaining from the estimated target", value: "2000" },
  { input: { target: 2000, logged: 500, status: "partial", estimated: true }, caption: "Still logging", summary: "Approximately 1500 kcal remaining from the estimated target", value: "≈1500" },
  { input: { target: 2000, logged: 1000, status: "complete" }, caption: "Daily estimate", summary: "1000 kcal remaining from the estimated target", value: "1000" },
  { input: { target: 2000, logged: 2400, status: "complete" }, caption: "≈400 kcal above estimate", summary: "About 400 kcal above the estimated target", value: "0" },
  { input: { target: null, logged: 0, status: "unlogged" }, caption: "Not logged", summary: "No calorie target set", value: "—" },
  { input: { target: 2000, logged: 500, status: "partial", mode: "planned" }, caption: "Partial total", summary: "Planned calorie total is incomplete", value: "—" },
  { input: { target: 2000, logged: 2400, status: "complete", mode: "planned" }, caption: "≈400 kcal above target", summary: "About 400 planned calories above the estimated target", value: "0" },
];

describe("calorie ring captions", () => {
  it.each(cases)("preserves the default caption and accessible description for $summary", ({ input, caption, summary, value }) => {
    const html = renderToStaticMarkup(<CalorieBudgetRing {...input} />);
    expect(html).toContain(`>${caption}</span>`);
    expect(html).toContain(`aria-label="${summary}"`);
    expect(html).toContain(`>${value}</strong>`);
  });
  it.each(cases)("hides only the caption for $summary", ({ input, caption, summary, value }) => {
    const visible = renderToStaticMarkup(<CalorieBudgetRing {...input} />);
    const hidden = renderToStaticMarkup(<CalorieBudgetRing {...input} showCaption={false} />);
    expect(hidden).not.toContain(`>${caption}</span>`);
    expect(hidden).toContain(`aria-label="${summary}"`);
    expect(hidden).toContain(`>${value}</strong>`);
    expect(hidden.match(/<svg[^]*?<\/svg>/)?.[0]).toBe(visible.match(/<svg[^]*?<\/svg>/)?.[0]);
    expect(hidden).toContain(input.target ? input.mode === "planned" ? "kcal to target" : "kcal left" : "no target");
  });
});
