export interface BirthDateParts { day: number | null; month: number | null; year: number | null }
export const emptyBirthDate: BirthDateParts = { day: null, month: null, year: null };
const pad = (value: number) => String(value).padStart(2, "0");

export function daysInBirthMonth(year: number | null, month: number | null): number {
  if (month === null) return 31;
  if ([4, 6, 9, 11].includes(month)) return 30;
  if (month !== 2) return 31;
  return year === null || year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
}

export function birthDateFromParts(parts: BirthDateParts): string | null {
  const { year, month, day } = parts;
  if (year === null || month === null || day === null || ![year, month, day].every(Number.isInteger)
    || year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInBirthMonth(year, month)) return null;
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

export function birthDateParts(value?: string): BirthDateParts {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ...emptyBirthDate };
  const [year, month, day] = value.split("-").map(Number);
  const parts = { year, month, day };
  return birthDateFromParts(parts) === value ? parts : { ...emptyBirthDate };
}

/** Calendar years, with March 1 as the anniversary of February 29 in non-leap years. */
export function ageOnDate(birthDate: string, referenceDate: string): number | null {
  const birth = birthDateParts(birthDate), reference = birthDateParts(referenceDate);
  if (!birth.year || !reference.year || birthDate > referenceDate) return null;
  return reference.year - birth.year - (referenceDate.slice(5) < birthDate.slice(5) ? 1 : 0);
}

export function profileAgeOnDate(profile: { age: number; birthDate?: string }, referenceDate: string): number {
  return profile.birthDate ? ageOnDate(profile.birthDate, referenceDate) ?? Number.NaN : profile.age;
}

export function validateBirthDate(value: string | null, referenceDate: string): string | null {
  if (!value || birthDateFromParts(birthDateParts(value)) !== value) return "Choose a valid day, month, and year for your birthday.";
  const age = ageOnDate(value, referenceDate);
  if (age === null) return "Your birthday must be today or earlier.";
  return age < 18 || age > 100 ? "Age must be between 18 and 100. This app supports adults only." : null;
}

export function changeBirthDatePart(parts: BirthDateParts, field: keyof BirthDateParts, value: number | null): BirthDateParts {
  const next = { ...parts, [field]: value };
  if (next.day !== null && next.day > daysInBirthMonth(next.year, next.month)) next.day = null;
  return next;
}
