import type { GroceryItem } from "@/types/domain";

export function groceryItemOrigin(item: GroceryItem): "Generated" | "Manual" {
  // Transferred generated rows use custom for preservation, not manual-item provenance.
  if (typeof item.personalGenerated === "boolean") return item.personalGenerated ? "Generated" : "Manual";
  return item.custom ? "Manual" : "Generated";
}
