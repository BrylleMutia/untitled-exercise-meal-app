import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewDisclosure } from "./ReviewDisclosure";

describe("generation review disclosure", () => {
  it("provides a native closed summary, section count and contextual bottom action", () => {
    const html = renderToStaticMarkup(<ReviewDisclosure title="Review unfilled meals" count="2 meal times"><p>Thursday: lunch and dinner</p></ReviewDisclosure>);
    expect(html).toContain('aria-label="Review unfilled meals"');
    expect(html).toContain("(2 meal times)");
    expect(html).toContain("Thursday: lunch and dinner");
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
    expect(html).toContain('aria-label="Collapse all review unfilled meals"');
    const contentId = html.match(/<div id="([^"]+)"/)?.[1];
    expect(contentId).toBeTruthy();
    expect(html.match(new RegExp(`aria-controls="${contentId}"`, "g"))).toHaveLength(2);
    expect(html).toContain("min-h-11");
    expect(html.indexOf("Thursday")).toBeLessThan(html.indexOf("Collapse all</button>"));
  });
});
