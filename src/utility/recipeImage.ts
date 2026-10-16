import type { RecipeImage } from "@/types/domain";

export const defaultRecipeImage = "/images/recipe-default.png";
export const recipeCatalogImages = {
  "creamy-lemon-chicken": "/images/recipes/creamy-lemon-chicken.png",
  "korean-beef-bowl": "/images/recipes/korean-beef-bowl.png",
  "sticky-teriyaki-chicken": "/images/recipes/sticky-teriyaki-chicken.png",
  "chicken-burrito-protein-boxes": "/images/recipes/chicken-burrito-protein-boxes.png",
  "breakfast-egg-salad": "/images/recipes/breakfast-egg-salad.png",
  "snack-sandwich": "/images/recipes/snack-sandwich.png",
  "dinner-curry-omelette": "/images/recipes/dinner-curry-omelette.png",
} as const;
export const recipeImagePresets = [
  { id: "lunch", label: "Lunch", description: "Chicken, vegetables and rice", src: defaultRecipeImage, image: null },
  { id: "breakfast", label: "Breakfast", description: "Egg salad", src: recipeCatalogImages["breakfast-egg-salad"], image: { kind: "asset", id: "breakfast-egg-salad" } },
  { id: "snack", label: "Snack", description: "Sandwich", src: recipeCatalogImages["snack-sandwich"], image: { kind: "asset", id: "snack-sandwich" } },
  { id: "dinner", label: "Dinner", description: "Curry with omelette", src: recipeCatalogImages["dinner-curry-omelette"], image: { kind: "asset", id: "dinner-curry-omelette" } },
] as const satisfies ReadonlyArray<{ id: string; label: string; description: string; src: string; image: RecipeImage | null }>;
export const recipeImageBucket = "recipe-covers";
export const maxRecipeImageBytes = 5 * 1024 * 1024;
export const recipeImageTypes = ["image/jpeg", "image/png", "image/webp"];

export function safeRecipeImageUrl(value: string): string | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password && url.href.length <= 2048 ? url.href : null;
  } catch { return null; }
}

export function parseRecipeImage(value: unknown): RecipeImage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const image = value as Record<string, unknown>;
  if (image.kind === "asset" && typeof image.id === "string" && Object.hasOwn(recipeCatalogImages, image.id)) return { kind: "asset", id: image.id as keyof typeof recipeCatalogImages };
  if (image.kind === "url" && typeof image.url === "string") {
    const url = safeRecipeImageUrl(image.url);
    return url ? { kind: "url", url } : null;
  }
  if (image.kind === "upload" && typeof image.path === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(image.path)) {
    return { kind: "upload", path: image.path };
  }
  return null;
}

export function restoredRecipeImage(savedDraftImage: unknown, currentImage: RecipeImage | null): RecipeImage | null {
  return savedDraftImage === undefined ? currentImage : parseRecipeImage(savedDraftImage);
}
