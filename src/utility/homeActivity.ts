import type { AppSnapshot } from "@/types/domain";
import { fromKey, startOfWeek, weekDates } from "./dates";
import { estimateWorkoutEnergyKcal } from "./workoutEnergy";
import { estimateWalkingEnergy, supportsWalkingEnergyEstimate } from "./walkingEnergy";
import { suggestProgression } from "./progression";

export function formatWalkingTime(minutes: number): string {
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  const mins = `${remainder} ${remainder === 1 ? "min" : "mins"}`;
  return hours ? `${hours} ${hours === 1 ? "hr" : "hrs"}${remainder ? ` ${mins}` : ""}` : mins;
}

export function homeWorkoutSummary(snapshot: AppSnapshot, today: string) {
  const workout = snapshot.plan?.workouts.find(item => item.dayOfWeek === fromKey(today).getDay());
  const weekOf = startOfWeek(today, snapshot.profile?.weekStartsOn ?? 0);
  const completed = new Set(snapshot.sessions.filter(session => session.status === "completed" && session.date >= weekOf && session.date <= today)
    .map(session => `${session.plannedWorkoutId}:${session.date}`)).size;
  const scheduled = snapshot.plan?.workouts.length ?? 0;
  const energy = snapshot.profile?.targetEligibility === "eligible" ? estimateWorkoutEnergyKcal({
    sessions: snapshot.sessions, fromDate: weekOf, toDate: today, weightKg: snapshot.profile.weightKg,
    plannedWorkoutMinutes: Object.fromEntries((snapshot.plan?.workouts ?? []).map(item => [item.id, item.estimatedMinutes])),
    fallbackWorkoutMinutes: snapshot.profile.sessionMinutes,
  }) : null;
  const energyStatus = snapshot.profile?.targetEligibility !== "eligible" ? "Energy estimate unavailable for this profile."
    : snapshot.plan?.trainingProgram === "pilates" ? "Energy estimate unavailable for this program."
      : energy === null ? "Energy estimate: not logged." : null;
  const active = workout && snapshot.sessions.some(session => session.plannedWorkoutId === workout.id && session.status === "in_progress");
  const finished = workout && snapshot.sessions.some(session => session.plannedWorkoutId === workout.id && session.date === today && session.status === "completed");
  const action = !workout || finished && !active ? "View workouts" : active ? "Resume workout" : "Start workout";
  const href = workout && action !== "View workouts" ? `/workouts/session/${workout.id}` : "/workouts";
  const suggestion = snapshot.plan?.trainingProgram !== "pilates" && snapshot.profile?.targetEligibility !== "unsupported" && workout && snapshot.sessions.length
    ? suggestProgression(workout.exercises[0]?.exerciseId ?? "", snapshot.sessions) : null;
  return { workout, weekOf, completed, scheduled, progress: scheduled ? completed / scheduled : null, energy, energyStatus, action, href, suggestion, finished };
}

export function homeStepSummary(snapshot: AppSnapshot, today: string, selectedDate = today) {
  const upcoming = selectedDate > today;
  const entry = upcoming ? undefined : snapshot.dailySteps.find(item => item.date === selectedDate);
  const target = snapshot.profile?.dailyStepTarget;
  const progress = target !== undefined && entry ? entry.steps / target : null;
  const supported = supportsWalkingEnergyEstimate(snapshot.profile);
  const energy = supported && snapshot.profile && entry ? estimateWalkingEnergy(snapshot.profile.weightKg, entry.walkingMinutes) : null;
  const energyLabel = upcoming ? "Upcoming" : !entry ? "Not logged" : !supported ? "Energy unavailable for this profile"
    : energy ? `≈${energy.lowKcal}–${energy.highKcal} kcal` : entry.walkingMinutes === 0 ? "Energy unavailable for 0 minutes" : "Add walking minutes for an estimate";
  const dates = weekDates(startOfWeek(today, snapshot.profile?.weekStartsOn ?? 0));
  return { entry, target, progress, energy, energyLabel, upcoming, days: dates.map(date => ({ date, upcoming: date > today, entry: snapshot.dailySteps.find(item => item.date === date) })) };
}
