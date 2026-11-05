import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingIndicator } from "./LoadingIndicator";

describe("shared loading feedback", () => {
  it("provides an immediately visible, atomic status without inventing progress", () => {
    const html = renderToStaticMarkup(<LoadingIndicator label="Loading your account…" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain("Loading your account…");
    expect(html).not.toContain("aria-valuenow");
    expect(html).not.toContain("canvas");
  });
  it("supports compact contexts with the incumbent visual and a separate status label", () => {
    const html = renderToStaticMarkup(<LoadingIndicator mode="compact" label="Saving…" fallback={<span>Existing icon</span>} />);
    expect(html).toContain('data-loading-layout="compact"');
    expect(html).toContain("Existing icon");
    expect(html).toContain("Saving…");
    expect(html).not.toContain("/animations/");
  });
});
