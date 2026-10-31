import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GroceryQuantityControl } from "./GroceryQuantityControl";

function render(value: string, minimum = 0, disabled = false) {
  return renderToStaticMarkup(<GroceryQuantityControl inputId="egg-quantity" value={value} onChange={vi.fn()} label="Quantity for Egg" decreaseLabel="Decrease Egg" increaseLabel="Increase Egg" unit="pcs" minimum={minimum} disabled={disabled} />);
}
describe("grocery quantity control", () => {
  it("keeps separate non-submitting actions and describes the unit", () => {
    const html = render("2.5");
    expect(html.match(/type="button"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Decrease Egg"');
    expect(html).toContain('aria-label="Increase Egg"');
    expect(html).toContain('aria-describedby="egg-quantity-unit"');
    expect(html).toContain('id="egg-quantity-unit"');
    expect(html).toContain('inputMode="decimal"');
  });
  it("locks the appropriate boundary button", () => {
    expect(render("0")).toMatch(/disabled=""[^>]*aria-label="Decrease Egg"/);
    expect(render("1000000")).toMatch(/disabled=""[^>]*aria-label="Increase Egg"/);
    expect(render("1", 1)).toMatch(/disabled=""[^>]*aria-label="Decrease Egg"/);
  });
  it("retains invalid text, labels the error and locks stepping", () => {
    const html = render("");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('value=""');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
  it("disables input and both buttons together", () => {
    expect(render("2", 0, true).match(/disabled=""/g)).toHaveLength(3);
  });
});
