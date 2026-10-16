import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyNutritionSummary } from "./DailyNutritionSummary";
import type { DailyTarget } from "@/types/domain";

it("shows empty macro tracks without turning missing intake into recorded zero", () => {
  const html = renderToStaticMarkup(<DailyNutritionSummary heading="Today" context="No meals eaten"
    ring={{ target: 2000, logged: 0, status: "unlogged" }}
    metrics={{ proteinG: { value: null }, carbsG: { value: null }, fatG: { value: null } }}
    target={{ calories: 2000, proteinG: 120, carbsG: 220, fatG: 65 } as DailyTarget} />);
  expect(html.match(/role="progressbar"/g)).toHaveLength(3);
  expect(html.match(/width:0%/g)).toHaveLength(3);
  expect(html.match(/No entry logged/g)).toHaveLength(3);
  expect(html).not.toContain("aria-valuenow");
  expect(html).toContain("Not logged");
  expect(html).toContain("No meals eaten");
});
