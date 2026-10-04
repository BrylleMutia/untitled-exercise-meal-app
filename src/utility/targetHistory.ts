import { startOfWeek, weekDates } from "./dates";

type DatedTarget = { id: string; version: number; effectiveDate: string };

export function targetForDate<T extends DatedTarget>(targets: T[], date: string): T | null {
  return targets.filter((target) => target.effectiveDate <= date).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.version - a.version)[0] ?? null;
}

/** The week selector needs at most seven distinct versions, not the full target history. */
export function targetsForNutritionWeek<T extends DatedTarget>(targets: T[], today: string): T[] {
  const selected = new Map<string, T>();
  for (const date of weekDates(startOfWeek(today))) {
    const target = targetForDate(targets, date);
    if (target) selected.set(`${target.id}:${target.version}`, target);
  }
  return [...selected.values()];
}
