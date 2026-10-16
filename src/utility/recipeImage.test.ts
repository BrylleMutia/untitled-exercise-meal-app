import { describe, expect, it } from "vitest";
import { parseRecipeImage, recipeImagePresets, restoredRecipeImage, safeRecipeImageUrl } from "./recipeImage";

describe("recipe image boundary", () => {
  it("registers the four presets while retaining Lunch as the default", () => {
    expect(recipeImagePresets.map(preset => preset.label)).toEqual(["Lunch", "Breakfast", "Snack", "Dinner"]);
    expect(recipeImagePresets[0].image).toBeNull();
    for (const preset of recipeImagePresets) {
      expect(parseRecipeImage(preset.image)).toEqual(preset.image);
      expect(restoredRecipeImage(preset.image, null)).toEqual(preset.image);
    }
    expect(parseRecipeImage({ kind: "asset", id: "__proto__" })).toBeNull();
    expect(parseRecipeImage({ kind: "asset", id: "toString" })).toBeNull();
  });
  it("accepts only registered catalog assets and preserves them in recovered drafts", () => {
    const cover = { kind: "asset" as const, id: "creamy-lemon-chicken" as const };
    expect(parseRecipeImage(cover)).toEqual(cover);
    expect(restoredRecipeImage(cover, null)).toEqual(cover);
    for (const id of ["unknown", "../creamy-lemon-chicken", "https://example.com/a", null]) expect(parseRecipeImage({ kind: "asset", id })).toBeNull();
  });
  it("recovers an intentional default reset while preserving older drafts without an image field", () => {
    const current = { kind: "url" as const, url: "https://example.com/current.webp" };
    expect(restoredRecipeImage(JSON.parse('{"image":null}').image, current)).toBeNull();
    expect(restoredRecipeImage(JSON.parse('{}').image, current)).toEqual(current);
  });
  it("accepts HTTPS image links and normalizes them", () => {
    expect(safeRecipeImageUrl(" https://example.com/cover.webp ")).toBe("https://example.com/cover.webp");
    expect(parseRecipeImage({ kind: "url", url: "https://example.com/cover.webp", extra: "ignored" })).toEqual({ kind: "url", url: "https://example.com/cover.webp" });
  });
  it.each(["http://example.com/a.png", "javascript:alert(1)", "data:image/png;base64,AA", "blob:https://example.com/a", "https://name:secret@example.com/a", "https://name@example.com/a", "invalid", "https://example.com/" + "a".repeat(2048)])("rejects unsafe or invalid image URL %s", value => {
    expect(safeRecipeImageUrl(value)).toBeNull();
    expect(parseRecipeImage({ kind: "url", url: value })).toBeNull();
  });
  it("keeps a stable private path rather than an expiring URL", () => {
    const path = "00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp";
    expect(parseRecipeImage({ kind: "upload", path })).toEqual({ kind: "upload", path });
    expect(parseRecipeImage({ kind: "upload", path: `${path}/../other.webp` })).toBeNull();
  });
  it.each([null, undefined, [], "image", { kind: "default" }, { kind: "url", url: 123 }, { kind: "upload", path: "other-user/image.png" }])("rejects malformed or unspecified image %j", image => {
    expect(parseRecipeImage(image)).toBeNull();
  });
});
