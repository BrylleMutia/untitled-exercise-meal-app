import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Sparkline } from "./progressShared";

describe("weight sparkline", () => {
  it("keeps endpoints inside the chart and centers an unchanged trend", () => {
    const html = renderToStaticMarkup(<Sparkline points={[83, 83]} ariaLabel="Weight trend" />);
    expect(html).toContain('cx="12"');
    expect(html).toContain('cx="268"');
    expect(html).toContain('cy="40"');
    expect(html).not.toContain('cx="0"');
  });
});
