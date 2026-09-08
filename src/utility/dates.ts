const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date key; daily logs are keyed by this, never UTC. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/** Week starts on Monday to match the weekly plan model. */
export function startOfWeek(key: string): string {
  const d = fromKey(key);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return dateKey(d);
}

export function weekDates(weekOf: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));
}

export function weekdayShort(key: string): string {
  return fromKey(key).toLocaleDateString("en-US", { weekday: "short" });
}

export function formatDay(key: string): string {
  return fromKey(key).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatLong(key: string): string {
  return fromKey(key).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function monthMatrix(key: string): string[][] {
  const d = fromKey(key);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = dateKey(first);
  const lead = (first.getDay() + 6) % 7;
  const gridStart = addDays(start, -lead);
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i)),
  );
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function secondsToClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad(m)}:${pad(s)}`;
}
