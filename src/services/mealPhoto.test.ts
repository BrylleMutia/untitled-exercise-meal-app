import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeMealPhoto } from "./mealPhoto";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("meal photo normalization", () => {
  it("rejects unsupported and oversized files before decoding", async () => {
    await expect(normalizeMealPhoto(new Blob(["image"], { type: "image/heic" }))).rejects.toThrow("JPEG");
    await expect(normalizeMealPhoto(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/jpeg" }))).rejects.toThrow("10 MB");
  });
  it("re-encodes at bounded dimensions and releases the input URL", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const drawImage = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage }), toDataURL: vi.fn(() => "data:image/jpeg;base64,normalized") };
    vi.stubGlobal("Image", class { naturalWidth = 4000; naturalHeight = 3000; decode() { return Promise.resolve(); } });
    vi.stubGlobal("document", { createElement: () => canvas });
    expect(await normalizeMealPhoto(new Blob(["original EXIF GPS"], { type: "image/jpeg" }))).toBe("data:image/jpeg;base64,normalized");
    expect(canvas.width).toBe(1600); expect(canvas.height).toBe(1200);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.85); expect(revoke).toHaveBeenCalledTimes(1);
  });
  it("releases image resources on decode failure", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    vi.stubGlobal("Image", class { decode() { return Promise.reject(new Error("bad image")); } });
    await expect(normalizeMealPhoto(new Blob(["bad"], { type: "image/png" }))).rejects.toThrow("could not be opened");
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});
