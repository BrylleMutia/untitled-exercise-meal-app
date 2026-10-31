import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeCover } from "./RecipeCover";

describe("Recipe cover presentation", () => {
  it.each([false, true])("retains the saved cover and accessible name with fill=%s", fill => {
    const html = renderToStaticMarkup(<RecipeCover name="Korean Beef Bowl" image={{ kind: "asset", id: "korean-beef-bowl" }} fill={fill} />);
    expect(html).toContain('src="/images/recipes/korean-beef-bowl.png"');
    expect(html).toContain('alt="Cover for Korean Beef Bowl"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).not.toContain("recipe-default.png");
  });

  it("uses the decorative fallback without adding controls to the full-height strip", () => {
    const html = renderToStaticMarkup(<RecipeCover name="Saved food" fill />);
    expect(html).toContain('src="/images/recipe-default.png"');
    expect(html).toContain('alt=""');
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<figcaption");
    expect(html).not.toContain("aspect-square");
  });
});
