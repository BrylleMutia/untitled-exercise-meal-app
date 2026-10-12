import type { RecipeImage } from "@/types/domain";
import { maxRecipeImageBytes, parseRecipeImage, recipeImageTypes } from "@/utility/recipeImage";

export async function uploadRecipeImage(file: File, uploadId: string): Promise<RecipeImage> {
  if (!recipeImageTypes.includes(file.type) || !file.size || file.size > maxRecipeImageBytes) {
    throw new Error("Choose a JPEG, PNG, or WebP image up to 5 MB.");
  }
  const body = new FormData(); body.set("image", file); body.set("uploadId", uploadId);
  const response = await fetch("/api/recipe-images", { method: "POST", body });
  const result = await response.json().catch(() => null);
  const image = parseRecipeImage(result?.image);
  if (!response.ok || !image) throw new Error(result?.message ?? "Image upload failed. Your recipe draft is retained; retry or use the default image.");
  return image;
}

export async function recipeImageDisplayUrl(path: string): Promise<string> {
  const response = await fetch(`/api/recipe-images?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.url !== "string") throw new Error("This image is unavailable.");
  return result.url;
}
