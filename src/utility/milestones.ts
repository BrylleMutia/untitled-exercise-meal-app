import type { AppSnapshot } from "@/types/domain";
import { addDays } from "./dates";

/** Participation is based on saved observations, never calories or missed days. */
export function participationMilestones(snapshot: Pick<AppSnapshot, "sessions" | "customSessions" | "nutritionLogs" | "dailySteps">, today: string): string[] {
  const milestones: string[] = [];
  if ([...snapshot.sessions, ...snapshot.customSessions].some((session) => session.status === "completed")) milestones.push("First workout saved");
  if (snapshot.nutritionLogs.length > 0) milestones.push("First food entry saved");
  if (snapshot.dailySteps.length > 0) milestones.push("First step entry saved");
  const from = addDays(today, -6);
  const dates = new Set([
    ...snapshot.sessions.filter((session) => session.status === "completed" || (session.status === "partial" && session.logs.length > 0)).map((session) => session.date),
    ...snapshot.customSessions.filter((session) => session.status === "completed" || (session.status === "partial" && session.actual.length > 0)).map((session) => session.date),
    ...snapshot.nutritionLogs.map((entry) => entry.date),
    ...snapshot.dailySteps.map((entry) => entry.date),
  ].filter((date) => date >= from && date <= today));
  if (dates.size >= 3) milestones.push(`You checked in on ${dates.size} days this week`);
  return milestones;
}
