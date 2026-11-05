import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Stepper, StepperActions } from "./Stepper";

describe("shared onboarding and generation stepper", () => {
  it("connects the focused heading to its readable progress count", () => {
    const html = renderToStaticMarkup(<Stepper label="Generate plan" steps={["Days", "Recipes", "Review"]} step={1} headingRef={createRef()} headingLevel="h3" />);
    expect(html).toContain("Generate plan · step 2 of 3");
    expect(html).toContain("<h3");
    expect(html).toContain('tabindex="-1"');
    const countId = html.match(/<p id="([^"]+)"/)![1];
    expect(html).toContain(`aria-describedby="${countId}"`);
  });
  it("exposes saving only on the last step and locks navigation while busy", () => {
    const props = { total: 3, onBack: () => {}, onContinue: () => {}, finalAction: <button>Save plan</button> };
    const first = renderToStaticMarkup(<StepperActions {...props} step={0} busy={false} onClose={() => {}} />);
    expect(first).toContain("Close"); expect(first).toContain("Continue"); expect(first).not.toContain("Save plan");
    const pending = renderToStaticMarkup(<StepperActions {...props} step={1} busy />);
    expect(pending.match(/disabled=""/g)).toHaveLength(2);
    const last = renderToStaticMarkup(<StepperActions {...props} step={2} busy={false} />);
    expect(last).toContain("Back"); expect(last).toContain("Save plan"); expect(last).not.toContain("Continue");
  });
});
