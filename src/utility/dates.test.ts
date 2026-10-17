import { describe, expect, it } from "vitest";
import type { Weekday } from "@/types/domain";
import { addDays, fromKey, isWeekday, formatCompactWeekRange, monthMatrix, startOfWeek, weekDates } from "./dates";

describe("account calendar boundaries", () => {
  it("supports every first weekday without changing local dates", () => {
    for (let start = 0; start < 7; start++) {
      for (const date of ["2026-10-17", "2027-01-01", "2024-02-29", "2026-03-08", "2026-11-01"]) {
        const first = startOfWeek(date, start as Weekday);
        expect(fromKey(first).getDay()).toBe(start);
        expect(weekDates(first)).toContain(date);
        expect(startOfWeek(first, start as Weekday)).toBe(first);
        expect(monthMatrix(date, start as Weekday).every(row => fromKey(row[0]).getDay() === start)).toBe(true);
      }
    }
  });
  it("defaults to Sunday and handles Saturday and year transitions", () => {
    expect(startOfWeek("2026-10-17")).toBe("2026-10-11");
    expect(startOfWeek("2026-10-17", 6)).toBe("2026-10-17");
    expect(startOfWeek("2027-01-01", 0)).toBe("2026-12-27");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
  });
  it("rejects invalid preference values", () => {
    for (const value of [-1, 7, 0.5, "0", null, undefined, NaN]) expect(isWeekday(value)).toBe(false);
    expect(isWeekday(0)).toBe(true);
    expect(isWeekday(6)).toBe(true);
  });
});

describe("compact local week ranges", () => {
  it.each([
    ["2026-10-12", "Mon, Oct 12 - Sun, Oct 18"],
    ["2026-12-28", "Mon, Dec 28 - Sun, Jan 3"],
    ["2024-02-26", "Mon, Feb 26 - Sun, Mar 3"],
    ["2026-03-02", "Mon, Mar 2 - Sun, Mar 8"],
  ])("formats both endpoints independently for %s", (date, expected) => {
    expect(formatCompactWeekRange(date)).toBe(expected);
  });
});
