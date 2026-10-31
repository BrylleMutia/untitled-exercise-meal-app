import { formatGroceryItemName, groceryDictionaryNames, grocerySpellingDistance, normalizeGroceryName } from "./groceryCategory";
import type { GroceryNameHistoryCandidate, GroceryNameSuggestion } from "@/types/grocerySuggestions";

export function groceryNameMatchTier(name: string, query: string): number | null {
  const key = normalizeGroceryName(name), term = normalizeGroceryName(query);
  if (key === term) return 0;
  if (key.startsWith(term)) return 1;
  const tokens = key.replace(/[^\p{L}\p{N}]+/gu, " ");
  const phrase = term.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return phrase && ` ${tokens}`.includes(` ${phrase}`) ? 2 : null;
}

export const canSuggestGroceryName = (query: string) => [...query.replace(/\s/gu, "")].length >= 2 && query.length <= 256;

export function groceryNameSuggestions(query: string, history: GroceryNameHistoryCandidate[] = []): GroceryNameSuggestion[] {
  if (!canSuggestGroceryName(query)) return [];
  const matches = new Map<string, { name: string; source: "history" | "dictionary"; tier: number; occurrences: number; lastSeenWeek: string }>();
  for (const candidate of [
    ...groceryDictionaryNames.map(name => ({ name, source: "dictionary" as const, occurrences: 0, lastSeenWeek: "" })),
    ...history.map(item => ({ ...item, source: "history" as const })),
  ]) {
    let tier = groceryNameMatchTier(candidate.name, query);
    if (tier === null && candidate.source === "dictionary") {
      const source = normalizeGroceryName(query).split(" "), target = normalizeGroceryName(candidate.name).split(" ");
      if (source.length === target.length && source.every((word, index) => {
        const other = target[index];
        const limit = Math.min(word.length, other.length) >= 10 ? 2 : Math.min(word.length, other.length) >= 5 ? 1 : 0;
        return Math.abs(word.length - other.length) <= limit && grocerySpellingDistance(word, other) <= limit;
      })) tier = 3;
    }
    if (tier === null) continue;
    const name = formatGroceryItemName(candidate.name), key = normalizeGroceryName(name);
    const previous = matches.get(key);
    if (!previous || candidate.source === "history") matches.set(key, { ...candidate, name, tier });
  }
  return [...matches.values()].sort((a, b) => a.tier - b.tier || Number(b.source === "history") - Number(a.source === "history") || b.occurrences - a.occurrences || b.lastSeenWeek.localeCompare(a.lastSeenWeek) || a.name.localeCompare(b.name))
    .slice(0, 6).map(({ name, source }) => ({ name, source }));
}
