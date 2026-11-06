import { describe, expect, it } from "vitest";
import { ageOnDate, birthDateFromParts, birthDateParts, changeBirthDatePart, daysInBirthMonth, profileAgeOnDate, validateBirthDate } from "./birthDate";
import { hasSamePlanInputs } from "./profilePlanInputs";
import { buildDailyTarget } from "./health";
import { dateKey } from "./dates";
import type { UserProfile } from "@/types/domain";

describe("private birthday calendar calculations", () => {
  it.each([
    ["1996-11-05", "2026-11-06", 30], ["1996-11-06", "2026-11-06", 30], ["1996-11-07", "2026-11-06", 29],
    ["2000-02-29", "2025-02-28", 24], ["2000-02-29", "2025-03-01", 25], ["2000-02-29", "2024-02-29", 24],
    ["2000-12-31", "2026-01-01", 25], ["2026-11-07", "2026-11-06", null],
  ])("calculates %s as of %s", (birth, reference, age) => expect(ageOnDate(birth, reference)).toBe(age));
  it.each(["2025-02-29", "2000-02-30", "1996-13-01", "1996-00-01", "1996-01-00", "1996-1-01", "1996-03-20T00:00:00Z", "garbage"])("rejects malformed or impossible date %s", value => {
    expect(birthDateFromParts(birthDateParts(value))).toBeNull();
    expect(validateBirthDate(value, "2026-11-06")).not.toBeNull();
  });
  it("accepts exact supported adult limits and rejects younger/older ages", () => {
    for (const birthday of ["2008-11-06", "1925-11-07", "1926-11-06"]) expect(validateBirthDate(birthday, "2026-11-06")).toBeNull();
    for (const birthday of ["2008-11-07", "1925-11-06", "2027-01-01"]) expect(validateBirthDate(birthday, "2026-11-06")).not.toBeNull();
  });
  it("clears an invalid day when month/year changes, without fabricating a birthday", () => {
    expect(changeBirthDatePart({ year: 2000, month: 1, day: 31 }, "month", 4)).toEqual({ year: 2000, month: 4, day: null });
    expect(changeBirthDatePart({ year: 2000, month: 2, day: 29 }, "year", 2001).day).toBeNull();
    expect(daysInBirthMonth(1900, 2)).toBe(28);
    expect(daysInBirthMonth(2000, 2)).toBe(29);
    expect(birthDateFromParts({ year: 2000, month: null, day: 1 })).toBeNull();
  });
  it("preserves the legacy age snapshot while deriving current birthday-backed age", () => {
    expect(profileAgeOnDate({ age: 27 }, "2026-11-06")).toBe(27);
    const profile = { age: 27, birthDate: "1998-11-06" };
    expect(profileAgeOnDate(profile, "2026-11-06")).toBe(28);
    expect(profile.age).toBe(27);
  });
  it("uses local calendar components instead of parsing a date as a UTC timestamp", () => {
    const localBirthday = new Date(2026, 10, 6, 0, 1);
    expect(dateKey(localBirthday)).toBe("2026-11-06");
    expect(ageOnDate("2008-11-06", dateKey(localBirthday))).toBe(18);
    expect(ageOnDate("1996-11-06", "2026-11-06T00:00:00Z")).toBeNull();
  });
  it("keeps metadata edits separate from age refreshes and records age in new calculation assumptions", () => {
    const saved: UserProfile = { id: "test", name: "Saved", age: 29, birthDate: "1996-11-06", sex: "female", heightCm: 168,
      weightKg: 68, units: "metric", weekStartsOn: 0, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30,
      goal: "maintain", dietaryPattern: "", allergies: [], notificationsEnabled: false, createdAt: "2025-11-06T00:00:00Z" };
    const derived = { ...saved, age: profileAgeOnDate(saved, "2026-11-06") };
    expect(hasSamePlanInputs(saved, { ...derived, name: "New name", units: "imperial" })).toBe(true);
    expect(hasSamePlanInputs(saved, { ...derived, weightKg: 70 })).toBe(false);
    expect(hasSamePlanInputs({ ...saved, birthDate: undefined }, { ...derived, birthDate: undefined })).toBe(false);
    const oldTarget = buildDailyTarget(saved, "2025-11-06");
    const currentTarget = buildDailyTarget(saved, "2026-11-06");
    expect(currentTarget.calculationAssumptions).toContain("age 30 as of 2026-11-06");
    expect(currentTarget.bmr).toBe(oldTarget.bmr - 5);
    expect(oldTarget.calculationAssumptions).toContain("age 29 as of 2025-11-06");
    expect(saved.age).toBe(29);
  });
});
