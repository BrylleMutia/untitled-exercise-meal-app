import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IconButton } from "./IconButton";

it("supports primary icon actions without overriding their colors or changing the default", () => {
  const primary = renderToStaticMarkup(<IconButton label="Select all" tooltip="Select all" variant="primary" size="compact"><svg aria-hidden="true" /></IconButton>);
  expect(primary).toContain('aria-label="Select all"');
  expect(primary).toContain("bg-ink text-white hover:bg-ink-soft");
  expect(primary).not.toContain("bg-cream");
  expect(primary).not.toContain("hover:bg-lav-100");
  expect(primary).toContain("!h-11 !w-11");
  const defaultButton = renderToStaticMarkup(<IconButton label="Clear" tooltip="Clear" disabled><svg aria-hidden="true" /></IconButton>);
  expect(defaultButton).toContain("bg-cream text-ink-soft hover:bg-lav-100");
  expect(defaultButton).toContain('disabled=""');
  expect(defaultButton).not.toContain("aria-describedby");
});
