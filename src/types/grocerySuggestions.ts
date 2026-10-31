export type GroceryNameHistoryCandidate = { name: string; occurrences: number; lastSeenWeek: string };
export type GroceryNameSuggestion = { name: string; source: "history" | "dictionary" };
