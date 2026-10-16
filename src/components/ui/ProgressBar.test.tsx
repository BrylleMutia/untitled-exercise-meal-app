import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProgressBar } from "./ProgressBar";

it("keeps fractional macros in visible and accessible values without changing the default", () => {
  const props = { label: "Protein", value: 22.5, target: 120, unit: " g" };
  const fractional = renderToStaticMarkup(<ProgressBar {...props} precision={1} inlineHeader />);
  expect(fractional).toContain("22.5");
  expect(fractional).toContain('aria-valuenow="22.5"');
  expect(renderToStaticMarkup(<ProgressBar {...props} />)).toContain('aria-valuenow="23"');
});

it("labels partial and unavailable values without announcing complete progress or an invented target", () => {
  const partial = renderToStaticMarkup(<ProgressBar label="Protein" value={22.5} target={120} unit=" g" precision={1} valueNote="Partial total" showProgress={false} />);
  expect(partial).toContain("22.5");
  expect(partial).toContain("Partial total");
  expect(partial).not.toContain('role="progressbar"');
  const unavailable = renderToStaticMarkup(<ProgressBar label="Protein" value={null} target={null} unit=" g" unavailableLabel="Unavailable" />);
  expect(unavailable).toContain("Unavailable");
  expect(unavailable).not.toContain(" / 0");
  expect(unavailable).not.toContain('role="progressbar"');
});
