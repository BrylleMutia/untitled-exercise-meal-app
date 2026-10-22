import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IconButton } from "./IconButton";

it("supports primary icon actions without overriding their colors or changing the default", () => {
  const primary = renderToStaticMarkup(<IconButton label="Select all" tooltip="Select all" variant="primary" size="compact"><svg aria-hidden="true" /></IconButton>);
  expect(primary).toContain('aria-label="Select all"');
  expect(primary).toContain("bg-ink text-white hover:bg-ink-soft");
  expect(primary).not.toContain("bg-cream");
  expect(primary).not.toContain("hover:bg-lav-100");
  expect(primary).toContain("!h-[44px] !w-[44px]");
  const defaultButton = renderToStaticMarkup(<IconButton label="Clear" tooltip="Clear" disabled><svg aria-hidden="true" /></IconButton>);
  expect(defaultButton).toContain("bg-cream text-ink-soft hover:bg-lav-100");
  expect(defaultButton).toContain('disabled=""');
  expect(defaultButton).not.toContain("aria-describedby");
});

it("keeps danger icons semantic and portaled tooltips opt-in", () => {
  const html = renderToStaticMarkup(<IconButton label="Archive recipe" tooltip="Archive recipe" variant="danger" size="compact" portalTooltip><svg aria-hidden="true" /></IconButton>);
  expect(html).toContain('aria-label="Archive recipe"');
  expect(html).toContain("bg-danger-200 text-danger-900 hover:bg-danger-300");
  expect(html).not.toContain("bg-cream"); expect(html).not.toContain("portalTooltip=");
  expect(html).not.toContain('role="tooltip"');
});

it("isolates circular white image actions and retains disabled explanations", () => {
  const html = renderToStaticMarkup(<IconButton variant="image" size="compact" label="Archive retained recipe" tooltip="Retained in saved plans" disabled><svg aria-hidden="true" /></IconButton>);
  expect(html).toContain("!rounded-full !bg-white");
  expect(html).toContain("shadow-[0_2px_6px_");
  expect(html).toContain('title="Retained in saved plans"');
});
