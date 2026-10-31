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

it("supports transparent ghost actions while preserving their names, targets and disabled explanations", () => {
  const html = renderToStaticMarkup(<IconButton variant="ghost" size="compact" label="Add meal" tooltip="Add meal to Lunch" disabled><svg aria-hidden="true" /></IconButton>);
  expect(html).toContain('aria-label="Add meal"');
  expect(html).toContain('title="Add meal to Lunch"');
  expect(html).toContain('disabled=""');
  expect(html).toContain("bg-transparent text-ink-soft hover:bg-black/5");
  expect(html).toContain("!min-h-[44px] !h-[44px] !w-[44px]");
  expect(html).not.toContain("bg-cream");
  expect(html).not.toContain("bg-white/70");
});

it("isolates circular white image actions and retains disabled explanations", () => {
  const html = renderToStaticMarkup(<IconButton variant="image" size="compact" label="Archive retained recipe" tooltip="Retained in saved plans" disabled><svg aria-hidden="true" /></IconButton>);
  expect(html).toContain("!rounded-full !bg-white");
  expect(html).toContain("shadow-[0_2px_6px_");
  expect(html).toContain('title="Retained in saved plans"');
});

it("supports a circular mint icon action without changing its accessible target", () => {
  const html = renderToStaticMarkup(<IconButton variant="mint" size="compact" label="Undo logged meal" tooltip="Undo meal log" disabled><svg aria-hidden="true" /></IconButton>);
  expect(html).toContain('aria-label="Undo logged meal"');
  expect(html).toContain('title="Undo meal log"'); expect(html).toContain('disabled=""');
  expect(html).toContain("!rounded-full !bg-mint-100"); expect(html).toContain("!h-[44px] !w-[44px]");
  expect(html).not.toContain("bg-cream");
});
