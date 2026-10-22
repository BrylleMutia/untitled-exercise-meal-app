import type { MealSlot } from "@/types/domain";
import { dateKey, fromKey } from "./dates";

const slots: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const unfilledWarning = /^(\d{4}-\d{2}-\d{2}) · (breakfast|lunch|dinner|snack): some members have no eligible assignment within their available portions and planning limits\.$/;

export function groupPlanningWarnings(warnings: readonly string[]): {
  unfilled: Array<{ date: string; slots: MealSlot[] }>;
  mealTimes: number;
  notes: string[];
} {
  const byDate = new Map<string, Set<MealSlot>>();
  const notes: string[] = [];
  for (const warning of warnings) {
    const match = unfilledWarning.exec(warning);
    // Only condense the known server message; new messages must remain visible.
    if (!match || dateKey(fromKey(match[1])) !== match[1]) {
      notes.push(warning);
      continue;
    }
    const dateSlots = byDate.get(match[1]) ?? new Set<MealSlot>();
    dateSlots.add(match[2] as MealSlot);
    byDate.set(match[1], dateSlots);
  }
  const unfilled = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, dateSlots]) => ({
    date, slots: slots.filter(slot => dateSlots.has(slot)),
  }));
  return { unfilled, mealTimes: unfilled.reduce((count, day) => count + day.slots.length, 0), notes };
}
