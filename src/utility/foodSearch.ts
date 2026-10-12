import type { Food } from "@/types/domain";

export type FoodSearchMatchKind = "exact" | "tokens" | "prefix" | "close";
export interface FoodSearchMatch { food: Food; kind: FoodSearchMatchKind }

const preparationWords = new Set(["raw", "cooked", "baked", "dry", "prepared"]);
const singularExceptions: Record<string, string> = {
  potatoes: "potato", tomatoes: "tomato", leaves: "leaf", loaves: "loaf",
};

export function normalizeFoodSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function singular(token: string): string {
  if (singularExceptions[token]) return singularExceptions[token];
  if (["series", "species"].includes(token) || /(?:ss|us|is)$/.test(token)) return token;
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (/(?:ches|shes|xes|zes|sses)$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

// Restricted Damerau-Levenshtein counts adjacent transpositions as one edit.
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

function tokenRank(query: string, candidate: string): number {
  if (query === candidate || singular(query) === singular(candidate)) return 1;
  if (preparationWords.has(query) || preparationWords.has(candidate)) return Infinity;
  const a = singular(query), b = singular(candidate);
  if (candidate.startsWith(query)) return 2;
  const limit = query.length >= 8 ? 2 : query.length >= 4 ? 1 : 0;
  return limit && Math.min(distance(query, candidate, limit), distance(a, b, limit)) <= limit ? 3 : Infinity;
}

function allTokensMatch(ranks: number[][], maximum: number): boolean {
  const assigned = new Map<number, number>();
  function assign(query: number, seen: Set<number>): boolean {
    for (const [candidate, rank] of ranks[query].entries()) {
      if (rank > maximum || seen.has(candidate)) continue;
      seen.add(candidate);
      const previous = assigned.get(candidate);
      if (previous === undefined || assign(previous, seen)) {
        assigned.set(candidate, query);
        return true;
      }
    }
    return false;
  }
  return ranks.every((_, index) => assign(index, new Set()));
}

/** Suggestions only: callers retain eligibility checks and explicit selection. */
export function searchFoods(foods: readonly Food[], query: string, limit = 6): FoodSearchMatch[] {
  const normalizedQuery = normalizeFoodSearch(query);
  if (!normalizedQuery || limit <= 0) return [];
  const queryTokens = normalizedQuery.split(" ");
  const matches: Array<FoodSearchMatch & { rank: number; name: string }> = [];
  for (const food of new Map(foods.map(food => [food.id, food])).values()) {
    const name = normalizeFoodSearch(food.name);
    const tokens = [...new Set(`${name} ${normalizeFoodSearch(food.preparationBasis ?? "")}`.trim().split(" "))];
    if (queryTokens.length > tokens.length) continue;
    const ranks = queryTokens.map(token => tokens.map(candidate => tokenRank(token, candidate)));
    let rank = [1, 2, 3].find(maximum => allTokensMatch(ranks, maximum));
    if (rank === undefined) continue;
    if (` ${name} `.includes(` ${normalizedQuery} `)) rank = name === normalizedQuery ? -1 : 0;
    const kind: FoodSearchMatchKind = rank <= 0 ? "exact" : rank === 1 ? "tokens" : rank === 2 ? "prefix" : "close";
    matches.push({ food, kind, rank, name });
  }
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return matches.sort((a, b) => a.rank - b.rank || compare(a.name, b.name) || compare(a.food.id, b.food.id))
    .slice(0, limit).map(({ food, kind }) => ({ food, kind }));
}
