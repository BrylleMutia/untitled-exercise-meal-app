"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  Pause,
  Play,
  Plus,
  SkipForward,
  Trash2,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ExerciseIllustration } from "@/components/ExerciseIllustration";
import { EmptyState } from "@/components/EmptyState";
import { exerciseById } from "@/constants/exercises";
import { secondsToClock } from "@/utility/dates";
import type { ExerciseLog, WorkoutSession } from "@/types/domain";

const RPE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { snapshot, actions } = useApp();

  const workout = snapshot.plan?.workouts.find((w) => w.id === params.id);
  const createdRef = useRef<string | null>(null);
  const creatingRef = useRef(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pausedMilliseconds, setPausedMilliseconds] = useState(0);
  const [finished, setFinished] = useState(false);

  // Create the in-progress session once (StrictMode safe via ref).
  useEffect(() => {
    if (!workout || createdRef.current || creatingRef.current) return;
    creatingRef.current = true;
    void actions.startSession(workout.id).then((id) => {
      if (!id) return;
      createdRef.current = id;
      setSessionId(id);
    });
  }, [workout, actions]);

  const session = snapshot.sessions.find((s) => s.id === sessionId);

  useEffect(() => {
    if (!session || finished || paused) return;
    const tick = window.setInterval(
      () =>
        setElapsed(
          Math.max(
            0,
            Math.floor(
              (Date.now() -
                new Date(session.startedAt).getTime() -
                pausedMilliseconds) /
                1000,
            ),
          ),
        ),
      1000,
    );
    return () => window.clearInterval(tick);
  }, [session, finished, paused, pausedMilliseconds]);

  const plannedExercise = workout?.exercises[index];
  const exercise = plannedExercise ? exerciseById(plannedExercise.exerciseId) : undefined;
  const log = session?.logs[index];

  const startLog = useCallback(
    (pe: NonNullable<typeof plannedExercise>): ExerciseLog => ({
      exerciseId: pe.exerciseId,
      planned: { sets: pe.sets, reps: pe.reps, holdSeconds: pe.holdSeconds },
      actual: { sets: pe.sets, reps: pe.reps, holdSeconds: pe.holdSeconds },
      status: "completed",
    }),
    [],
  );

  const save = useCallback(
    (updater: (current: WorkoutSession) => WorkoutSession) => {
      const current = snapshot.sessions.find((s) => s.id === sessionId);
      if (!current) return;
      void actions.saveSession(updater(current));
    },
    [snapshot.sessions, sessionId, actions],
  );

  const updateLog = useCallback(
    (updater: (current: ExerciseLog) => ExerciseLog) => {
      save((current) => {
        const logs = [...current.logs];
        logs[index] = updater(logs[index] ?? startLog(workout!.exercises[index]));
        return { ...current, logs };
      });
    },
    [save, index, startLog, workout],
  );

  const adjust = (field: "sets" | "reps" | "holdSeconds", delta: number) => {
    updateLog((log) => ({
      ...log,
      actual: {
        ...log.actual,
        [field]: Math.max(0, (log.actual[field] ?? 0) + delta),
      },
      status: log.status === "completed" ? "modified" : log.status,
    }));
  };

  if (!workout) {
    return (
      <EmptyState
        title="Workout not found"
        message="The plan may have been regenerated. Pick another session from the weekly list."
        action={
          <Link href="/workouts" className="font-extrabold underline underline-offset-4">
            Back to workouts
          </Link>
        }
      />
    );
  }

  const finish = async () => {
    if (!sessionId) return;
    if (await actions.finishSession(sessionId)) {
      setFinished(true);
      router.push("/workouts");
    }
  };

  const discard = async () => {
    if (!sessionId) return;
    if (await actions.abandonSession(sessionId)) router.push("/workouts");
  };

  const togglePaused = () => {
    if (paused) {
      const additional = pausedAt ? Date.now() - pausedAt : 0;
      setPausedMilliseconds((value) => value + additional);
      setPausedAt(null);
      setPaused(false);
    } else {
      setPausedAt(Date.now());
      setPaused(true);
    }
  };

  const isLast = index === workout.exercises.length - 1;
  const measureLabel = exercise?.measure === "hold" ? "seconds" : "reps";
  const measureValue = log
    ? (log.actual.reps ?? log.actual.holdSeconds ?? 0)
    : (plannedExercise?.reps ?? plannedExercise?.holdSeconds ?? 0);

  return (
    <div className="grid gap-4 pb-4">
      <div className="flex items-center justify-between">
        <Button variant="soft" onClick={discard} aria-label="Discard session">
          <Trash2 className="h-4 w-4" aria-hidden /> Discard
        </Button>
        <div className="text-center">
          <p className="text-sm font-extrabold tabular-nums" role="timer" aria-label="Elapsed time">
            {secondsToClock(elapsed)}
          </p>
          <p className="text-[11px] font-bold text-muted">{workout.title}</p>
        </div>
        <Button
          variant="soft"
          onClick={togglePaused}
          aria-pressed={paused}
          aria-label={paused ? "Resume" : "Pause"}
        >
          {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
        </Button>
      </div>

      <ol className="flex justify-center gap-1.5" aria-label="Exercise progress">
        {workout.exercises.map((pe, i) => (
          <li
            key={pe.id}
            className={`h-1.5 rounded-full transition-all ${
              i <= index ? "w-6 bg-ink" : "w-3 bg-lav-200"
            }`}
          />
        ))}
      </ol>

      <Card tone="lavender" className="animate-pop">
        <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">
          Exercise {index + 1} of {workout.exercises.length}
          {log?.status === "skipped" ? " · skipped" : log?.status === "modified" ? " · modified" : ""}
        </p>
        <h2 className="mt-1 text-2xl font-extrabold">{exercise?.name}</h2>
        <p className="mt-1 text-sm font-semibold text-ink-soft">{exercise?.description}</p>

        {exercise ? (
          <div className="mt-4">
            <ExerciseIllustration exercise={exercise} tone="white" className="h-44" />
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white/70 p-3">
            <p className="text-[11px] font-bold text-muted">Planned</p>
            <p className="text-lg font-extrabold tabular-nums">
              {plannedExercise?.sets} × {plannedExercise?.reps ?? `${plannedExercise?.holdSeconds}s`}
            </p>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <p className="text-[11px] font-bold text-muted">Rest</p>
            <p className="text-lg font-extrabold tabular-nums">{plannedExercise?.restSeconds}s</p>
          </div>
          <div className="rounded-2xl bg-white/70 p-3">
            <p className="text-[11px] font-bold text-muted">Safety</p>
            <p className="text-[11px] font-bold text-ink-soft">{exercise?.safety}</p>
          </div>
        </div>

        {/* Logging controls — big one-handed targets */}
        <div className="mt-4 grid gap-2">
          <Control
            label="Sets"
            value={log?.actual.sets ?? plannedExercise!.sets}
            onMinus={() => adjust("sets", -1)}
            onPlus={() => adjust("sets", 1)}
          />
          <Control
            label={measureLabel}
            value={measureValue}
            onMinus={() => adjust(exercise?.measure === "hold" ? "holdSeconds" : "reps", -1)}
            onPlus={() => adjust(exercise?.measure === "hold" ? "holdSeconds" : "reps", 1)}
          />
        </div>

        <div className="mt-4" role="group" aria-label="Rate of perceived exertion">
          <p className="text-xs font-extrabold text-ink-soft">How hard was it? (RPE)</p>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {RPE_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => updateLog((l) => ({ ...l, rpe: value }))}
                aria-pressed={log?.rpe === value}
                className={`min-h-11 rounded-xl text-sm font-extrabold tabular-nums ${
                  log?.rpe === value ? "bg-ink text-white" : "bg-white/70 text-ink"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] font-semibold text-muted">
            1-7 and it qualifies for progression. 9-10 or pain means we pull back.
          </p>
          <div className="mt-3 grid gap-2">
            <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-white/70 px-3 text-xs font-bold">
              <input
                type="checkbox"
                checked={log?.manageable ?? false}
                onChange={(e) => updateLog((l) => ({ ...l, manageable: e.target.checked }))}
                className="h-5 w-5 accent-lav-500"
              />
              No RPE? Mark this work as manageable to qualify.
            </label>
            <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-coral-100 px-3 text-xs font-bold">
              <input
                type="checkbox"
                checked={log?.pain ?? false}
                onChange={(e) => updateLog((l) => ({ ...l, pain: e.target.checked }))}
                className="h-5 w-5 accent-coral-300"
              />
              I felt pain or a safety concern; do not progress this exercise.
            </label>
          </div>
        </div>

        <label className="mt-4 grid gap-1.5">
          <span className="text-xs font-extrabold text-ink-soft">Note (optional)</span>
          <textarea
            value={log?.note ?? ""}
            onChange={(e) => updateLog((l) => ({ ...l, note: e.target.value }))}
            rows={2}
            placeholder="Form cues, discomfort, equipment used…"
            aria-label="Note about this exercise"
            className="input resize-none !h-auto py-3"
          />
        </label>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="soft"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          aria-label="Previous exercise"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            updateLog((l) => ({ ...l, status: l.status === "skipped" ? "completed" : "skipped" }))
          }
          aria-pressed={log?.status === "skipped"}
        >
          <SkipForward className="h-4 w-4" aria-hidden />
          {log?.status === "skipped" ? "Unskip" : "Skip"}
        </Button>
        {isLast ? (
          <Button onClick={finish}>
            <Check className="h-4 w-4" aria-hidden /> Finish
          </Button>
        ) : (
          <Button variant="soft" onClick={() => setIndex((i) => i + 1)} aria-label="Next exercise">
            Next <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

interface ControlProps {
  label: string;
  value: number;
  onMinus: () => void;
  onPlus: () => void;
}

function Control({ label, value, onMinus, onPlus }: ControlProps) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/70 px-3 py-2">
      <span className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMinus}
          aria-label={`Decrease ${label}`}
          className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink shadow-chip"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-12 text-center text-2xl font-extrabold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={onPlus}
          aria-label={`Increase ${label}`}
          className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink shadow-chip"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
