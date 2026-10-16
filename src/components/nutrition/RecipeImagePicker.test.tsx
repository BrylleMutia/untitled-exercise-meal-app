import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeImagePicker } from "./RecipeImagePicker";
import type { RecipeImage } from "@/types/domain";

const render = (image: RecipeImage | null, disabled = false) => renderToStaticMarkup(<RecipeImagePicker image={image} disabled={disabled} onChange={() => {}} onBusy={() => {}} />);
describe("recipe image controls", () => {
  it("retains image actions without the retired preset gallery", () => {
    const html = render(null);
    expect(html).not.toContain('role="radiogroup"');
    for (const label of ["Upload image", "Use image URL", "Reset to default"]) expect(html).toContain(label);
  });
  it("keeps existing asset covers compatible and disables controls while saving", () => {
    expect(render({ kind: "asset", id: "snack-sandwich" })).toContain('Change image');
    for (const image of [{ kind: "url", url: "https://example.com/cover.png" }, { kind: "asset", id: "creamy-lemon-chicken" }] as RecipeImage[]) expect(render(image)).not.toContain('checked=""');
    expect(render(null, true)).toMatch(/<button[^>]*disabled=""/);
  });
});
