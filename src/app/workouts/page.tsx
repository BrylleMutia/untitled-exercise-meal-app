"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Pencil, Play, Timer } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/EmptyState";
import { ExerciseIllustration } from "@/components/ExerciseIllustration";
import { EXERCISES, exerciseById } from "@/constants/exercises";
import { startOfWeek, todayKey, weekDates, formatDay } from "@/utility/dates";

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WorkoutsPage() {
  const { snapshot, actions } = useApp();
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [replacementId, setReplacementId] = useState("");
  const [replacementSets, setReplacementSets] = useState("");
  const [replacementMeasure, setReplacementMeasure] = useState("");
  const plan = snapshot.plan;
  const availableExercises = EXERCISES.filter((candidate) =>
    candidate.equipment.every((equipment) => equipment === "none" || snapshot.profile?.equipment.includes(equipment)),
  );
  const today = todayKey();
  const weekOf = startOfWeek(today);
  const dates = weekDates(weekOf);
  const completedWorkoutIds = new Set(
    snapshot.sessions
      .filter(
        (s) =>
          s.status === "completed" &&
          s.date >= weekOf &&
          s.date <= dates[6],
      )
      .map((s) => s.plannedWorkoutId),
  );

  if (!plan) {
    return (
      <EmptyState
        title="No plan yet"
        message="Finish onboarding to generate a week that respects your equipment, schedule, and experience."
        action={
          <Link href="/onboarding" className="font-extrabold underline underline-offset-4">
            Start onboarding
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-extrabold">This week&apos;s plan</h2>
          <p className="text-xs font-semibold text-muted">
            Version {plan.version} · deterministic from your profile · edits create a
            new version, history stays untouched.
          </p>
        </div>
        <span className="rounded-full bg-lav-100 px-3 py-1 text-xs font-extrabold">
          {plan.workouts.length} sessions
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {plan.workouts.map((workout) => {
          const first = workout.exercises[0];
          const exercise = first ? exerciseById(first.exerciseId) : undefined;
          const date = dates.find((d) => new Date(d.replace(/-/g, "/")).getDay() === workout.dayOfWeek);
          return (
            <Card key={workout.id} tone="peach" className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                    {dayLabels[workout.dayOfWeek]}
                    {date ? ` · ${formatDay(date)}` : ""}
                  </p>
                  <h3 className="mt-0.5 text-lg font-extrabold">{workout.title}</h3>
                  <p className="text-xs font-semibold text-ink-soft">{workout.focus}</p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-xs font-extrabold tabular-nums">
                  <Timer className="h-3.5 w-3.5" aria-hidden />~{workout.estimatedMinutes}m
                </span>
              </div>

              {exercise ? (
                <div className="mt-4">
                  <ExerciseIllustration exercise={exercise} tone="white" className="h-40" />
                </div>
              ) : null}

              <ul className="mt-4 grid gap-1 text-sm font-semibold">
                {workout.exercises.map((pe, exerciseIndex) => {
                  const e = exerciseById(pe.exerciseId);
                  const slotKey = pe.slotKey ?? `day:${workout.dayOfWeek}:exercise:${pe.sortOrder ?? exerciseIndex + 1}`;
                  const editing = editingSlot === slotKey;
                  return (
                    <li key={pe.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/60 px-3 py-1.5">
                      <span>{e?.name ?? "Exercise"}</span>
                      <button
                        type="button"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white"
                        aria-label={`Edit ${e?.name ?? "exercise"}`}
                        onClick={() => {
                          setEditingSlot(editing ? null : slotKey);
                          setReplacementId(pe.exerciseId);
                          setReplacementSets(String(pe.sets));
                          setReplacementMeasure(String(pe.reps ?? pe.holdSeconds ?? ""));
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      {editing ? (
                        <div className="flex items-center gap-1">
                          <select className="input !min-h-9 max-w-36 text-xs" value={replacementId} onChange={(event) => setReplacementId(event.target.value)} aria-label="Replacement exercise">
                            {availableExercises.filter((candidate) => candidate.category === e?.category).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                          </select>
                          <input className="input !min-h-9 w-16 text-xs" inputMode="numeric" value={replacementSets} onChange={(event) => setReplacementSets(event.target.value)} aria-label="Sets" />
                          <input className="input !min-h-9 w-16 text-xs" inputMode="numeric" value={replacementMeasure} onChange={(event) => setReplacementMeasure(event.target.value)} aria-label="Reps or hold seconds" />
                          <button type="button" className="min-h-9 rounded-xl bg-ink px-2 text-[11px] font-extrabold text-white" onClick={() => {
                            const candidate = EXERCISES.find((item) => item.id === replacementId);
                            void actions.applyWorkoutOverride({
                              slotKey,
                              plannedExerciseId: pe.id,
                              replacementExerciseId: replacementId,
                              sets: Math.max(1, Number(replacementSets) || pe.sets),
                              ...(candidate?.measure === "hold"
                                ? { holdSeconds: Math.max(1, Number(replacementMeasure) || pe.holdSeconds || 1) }
                                : { reps: Math.max(1, Number(replacementMeasure) || pe.reps || 1) }),
                              restSeconds: pe.restSeconds,
                            });
                            setEditingSlot(null);
                          }}>Save</button>
                        </div>
                      ) : null}
                      <span className="tabular-nums text-ink-soft">
                        {pe.sets} × {pe.reps ?? `${pe.holdSeconds}s`}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-3 text-[11px] font-semibold text-muted">
                Warm-up: {workout.warmup.join(" · ")}
              </p>

              <Link
                href={`/workouts/session/${workout.id}`}
                className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-bold text-white"
              >
                {completedWorkoutIds.has(workout.id) ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden /> Repeat session
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" aria-hidden /> Start
                  </>
                )}
              </Link>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-[11px] font-semibold text-muted">
        Exercise illustrations by Bryl Lim (CC BY-SA 4.0) via @bryllim/workout-guide.
      </p>
    </div>
  );
}
