import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./Button";
import { ToastHost } from "./Toast";

vi.mock("@/contexts/AppContext", () => ({ useAppOptional: () => ({ toasts: [
  { id: 1, tone: "error", message: "Same notice" }, { id: 2, tone: "warn", message: "Same notice" },
] }) }));
const css = readFileSync("src/app/globals.css", "utf8");
const color = (name: string) => { const match = css.match(new RegExp(`--color-${name}: (#[a-f0-9]+);`)); expect(match).not.toBeNull(); return match![1]; };
function luminance(hex: string) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels.reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
}
const contrast = (first: string, second: string) => { const [low, high] = [luminance(first), luminance(second)].sort((a, b) => a - b); return (high + .05) / (low + .05); };

describe("semantic danger theme", () => {
  it("keeps error text readable on white, error panels and both danger-button states", () => {
    for (const background of ["#ffffff", ...[50, 100, 200, 300].map(shade => color(`danger-${shade}`))]) expect(contrast(color("danger-900"), background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color("danger-600"), color("danger-50"))).toBeGreaterThanOrEqual(3);
  });
  it("uses semantic button and invalid-field colors while keeping calorie colors neutral", () => {
    const html = renderToStaticMarkup(<Button variant="danger">Archive</Button>);
    expect(html).toContain("bg-danger-200 text-danger-900 hover:bg-danger-300");
    expect(css).toMatch(/\.input\[aria-invalid="true"\]\s*\{\s*border-color: var\(--color-danger-600\)/);
    expect(css).toContain("--color-nutrition-calories: var(--color-coral-200)");
    expect(color("coral-200")).toBe("#ffabb3");
  });
  it("styles errors by explicit severity without recoloring an ordinary warning with identical text", () => {
    const html = renderToStaticMarkup(<ToastHost />);
    expect(html.match(/bg-danger-100 text-danger-900/g)).toHaveLength(1);
    expect(html.match(/bg-ink text-white/g)).toHaveLength(1);
    expect(html.match(/Same notice/g)).toHaveLength(2);
  });
});
