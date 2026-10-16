import { describe, expect, it } from "vitest";
import { formatCompactWeekRange } from "./dates";

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
