import type { GroceryCategory, GroceryItem } from "@/types/domain";
import { cookingUnitLabel } from "./cookingUnits";

export const groceryCategories: readonly GroceryCategory[] = ["Produce", "Protein", "Dairy", "Grains", "Pantry", "Other"];
export const groceryDictionaryVersion = 1;
export type GroceryCategoryPreference = { nameKey: string; category: GroceryCategory | null; revision: number };
export type GroceryCategoryChoice = { category: GroceryCategory; preference?: { action: "remember" | "reset"; expectedRevision: number } };
export type GroceryExtraSubmission = { idempotencyKey: string; groceryRevision: number; calendarRevision?: number; choice: GroceryCategoryChoice };
export type GroceryCategoryDraft = { nameKey: string; category: GroceryCategory; action: "remember" | "reset"; expectedRevision: number };
export const normalizeGroceryName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
export const formatGroceryItemName = (name: string) => name.trim().replace(/\p{L}/u, letter => letter.toUpperCase());
export const isGroceryCategory = (value: unknown): value is GroceryCategory => groceryCategories.includes(value as GroceryCategory);

const dictionary: Record<GroceryCategory, string[]> = {
  Produce: ["tomato", "tomatoes", "tomatos", "onion", "onions", "garlic", "ginger", "potato", "potatoes", "carrot", "carrots", "broccoli", "spinach", "lettuce", "cabbage", "cucumber", "cucumbers", "bell pepper", "bell peppers", "pepper", "peppers", "mushroom", "mushrooms", "apple", "apples", "banana", "bananas", "orange", "oranges", "lemon", "lemons", "lime", "limes", "avocado", "avocados", "calamansi", "eggplant", "eggplants", "spring onion", "spring onions", "kangkong", "pechay", "sayote", "squash", "green beans", "green onion", "green onions", "fruit", "vegetables"],
  Protein: ["egg", "eggs", "chicken", "chicken breast", "chicken breasts", "chicken thigh", "chicken thighs", "chicken thigh fillet", "chicken thigh fillets", "beef", "ground beef", "pork", "ground pork", "fish", "salmon", "tuna", "shrimp", "shrimps", "prawns", "tofu", "tempeh", "turkey", "bacon", "ham", "sausage", "sausages", "tilapia", "bangus"],
  Dairy: ["milk", "whole milk", "skim milk", "low fat milk", "cheese", "cheddar", "cream cheese", "parmesan", "mozzarella", "yogurt", "yoghurt", "greek yogurt", "butter", "cream", "heavy cream", "sour cream"],
  Grains: ["rice", "white rice", "brown rice", "jasmine rice", "basmati rice", "bread", "whole wheat bread", "oats", "rolled oats", "oatmeal", "pasta", "spaghetti", "noodles", "flour", "all purpose flour", "quinoa", "couscous", "tortilla", "tortillas", "cereal", "cornmeal"],
  Pantry: ["coconut milk", "coconut cream", "oat milk", "almond milk", "soy milk", "soya milk", "rice milk", "chicken seasoning", "chicken stock", "chicken broth", "beef stock", "beef broth", "fish sauce", "oyster sauce", "soy sauce", "soya sauce", "tomato sauce", "tomato paste", "peanut butter", "canned tuna", "canned tomatoes", "olive oil", "vegetable oil", "coconut oil", "sesame oil", "oil", "salt", "black pepper", "ground pepper", "peppercorns", "sugar", "honey", "vinegar", "baking powder", "baking soda", "cornstarch", "ketchup", "mayonnaise", "mustard", "paprika", "cumin", "cinnamon", "seasoning", "chicken seasoning powder", "beef seasoning", "beef seasoning powder", "chicken flavored seasoning", "chicken flavoured seasoning", "beans", "lentils", "chickpeas", "peanuts", "almonds", "cashews", "coffee", "tea"],
  Other: ["dishwashing liquid", "dish soap", "laundry detergent", "detergent", "toilet paper", "paper towels", "tissue", "tissues", "trash bags", "garbage bags", "soap", "shampoo", "toothpaste", "batteries"],
};
const descriptors = new Set(["fresh", "organic", "frozen", "raw", "cooked", "boneless", "skinless", "chopped", "diced", "sliced", "large", "small", "medium", "optional"]);
const words = (name: string) => normalizeGroceryName(name).replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/u).filter(Boolean);
const entries = groceryCategories.flatMap(category => dictionary[category].map(name => ({ category, tokens: words(name) })));

// Recognition aliases remain valid for classification without becoming suggested spellings.
const suggestionAliases: Record<string, string> = { tomatos: "tomatoes", yoghurt: "yogurt", "soya milk": "soy milk", "soya sauce": "soy sauce" };
export const groceryDictionaryNames = [...new Set(Object.values(dictionary).flat().map(name => suggestionAliases[name] ?? name))].map(formatGroceryItemName);

// Adjacent transpositions count as one typo; short words never fuzzy-match.
export function grocerySpellingDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
  }
  return matrix[a.length][b.length];
}

export function classifyGroceryName(name: string): GroceryCategory {
  const input = words(name);
  if (!input.length || input.length > 20 || input.some(word => word.length > 80)) return "Other";
  for (const tokens of [input, input.filter(word => !descriptors.has(word))]) {
    const matches = entries.filter(entry => entry.tokens.join(" ") === tokens.join(" "));
    if (matches.length) return matches.every(match => match.category === matches[0].category) ? matches[0].category : "Other";
  }
  const tokens = input.filter(word => !descriptors.has(word));
  const candidates = entries.filter(entry => entry.tokens.length === tokens.length).flatMap(entry => {
    let score = 0;
    for (let index = 0; index < tokens.length; index++) {
      const source = tokens[index], target = entry.tokens[index];
      const allowed = Math.min(source.length, target.length) >= 10 ? 2 : Math.min(source.length, target.length) >= 5 ? 1 : 0;
      if (Math.abs(source.length - target.length) > allowed) return [];
      const distance = grocerySpellingDistance(source, target);
      if (distance > allowed) return [];
      score += distance;
    }
    return [{ category: entry.category, score }];
  });
  const best = Math.min(...candidates.map(candidate => candidate.score));
  const matches = candidates.filter(candidate => candidate.score === best);
  return matches.length && matches.every(match => match.category === matches[0].category) ? matches[0].category : "Other";
}

export function groceryCategoryMessage(item: Pick<GroceryItem, "quantity" | "unit" | "name" | "category">, action: "added" | "moved") {
  return `${item.quantity} ${cookingUnitLabel(item.unit, item.quantity)} ${item.name} ${action} to ${item.category}.`;
}
