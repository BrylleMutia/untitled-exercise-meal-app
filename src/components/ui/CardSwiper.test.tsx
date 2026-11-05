import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CardSwiper } from "./CardSwiper";

const items = [{ id: "a", label: "Recipe A", selected: false, value: false }, { id: "b", label: "Recipe B", selected: false, value: false }];
const props = { items, basisKey: "one", active: true, disabled: false, renderCard: () => <p>Active recipe content</p>, renderThumbnail: () => <span />, onDecision: () => {}, onUndo: () => {}, onSelectAll: () => {}, onClear: () => {} };

describe("accessible controlled card swiper presentation", () => {
  it("provides correctly ordered alternatives to gestures without selecting during render", () => {
    const html = renderToStaticMarkup(<CardSwiper {...props} />);
    expect(html.indexOf('aria-label="Skip recipe"')).toBeLessThan(html.indexOf('aria-label="Add recipe"'));
    expect(html).toContain("Swipe left to skip · Swipe right to add");
    expect(html).toContain("Recipe 1 of 2"); expect(html).toContain("0 added");
    expect(html).toContain("Review choices (2)"); expect(html).toContain('role="status"');
    expect(html).not.toContain('data-hint="skip"');
  });
  it("starts restored selections at the first unselected recipe", () => {
    const html = renderToStaticMarkup(<CardSwiper {...props} items={[{ ...items[0], selected: true, value: true }, items[1]]} />);
    expect(html).toContain('aria-label="Recipe card: Recipe B"'); expect(html).toContain("1 added");
  });
  it("keeps all-selected and empty decks reviewable without a fake active card", () => {
    const selected = renderToStaticMarkup(<CardSwiper {...props} items={items.map(item => ({ ...item, selected: true }))} />);
    expect(selected).toContain("end of the deck"); expect(selected).not.toContain("data-swiper-card");
    const empty = renderToStaticMarkup(<CardSwiper {...props} items={[]} />);
    expect(empty).toContain("No recipes are available"); expect(empty).not.toContain("data-swiper-card");
  });
});
