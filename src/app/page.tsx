"use client";

import Link from "next/link";
import {
  ArrowRight,
  Dumbbell,
  Flame,
  Play,
  Plus,
  ShoppingBasket,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { dayStatus, entriesForDate, totalsForDate } from "@/utility/nutrition";
import { suggestProgression } from "@/utility/progression";
import { estimateWorkoutEnergyKcal } from "@/utility/workoutEnergy";
import { formatLong, startOfWeek, todayKey } from "@/utility/dates";

const quickLinks = [
  {
    href: "/workouts",
    tone: "peach" as const,
    icon: Dumbbell,
    title: "Workouts",
    blurb: "Keep active, keep healthy",
  },
  {
    href: "/nutrition",
    tone: "lavender" as const,
    icon: UtensilsCrossed,
    title: "Nutrition",
    blurb: "Enjoy food, hit targets",
  },
  {
    href: "/grocery",
    tone: "mint" as const,
    icon: ShoppingBasket,
    title: "Grocery",
    blurb: "A fresh week, planned",
  },
  {
    href: "/progress",
    tone: "coral" as const,
    icon: TrendingUp,
    title: "Progress",
    blurb: "Watch habits compound",
  },
];

export default function HomePage() {
  const { snapshot } = useApp();
  const today = todayKey();
  const target = snapshot.target;
  const totals = totalsForDate(snapshot.nutritionLogs, today);
  const entries = entriesForDate(snapshot.nutritionLogs, today);
  const loggedSlots = Object.values(entries).filter((list) => list.length > 0).length;
  const status = dayStatus(snapshot.nutritionLogs, today);
  const nutritionTargets = [
    { label: "Calories", value: status === "unlogged" ? null : totals.calories, target: target?.calories ?? 0, unit: " kcal", barClassName: "bg-blush-300" },
    { label: "Protein", value: status === "unlogged" ? null : totals.proteinG, target: target?.proteinG ?? 0, unit: " g", barClassName: "bg-lav-300" },
    { label: "Carbs", value: status === "unlogged" ? null : totals.carbsG, target: target?.carbsG ?? 0, unit: " g", barClassName: "bg-peach-200" },
    { label: "Fat", value: status === "unlogged" ? null : totals.fatG, target: target?.fatG ?? 0, unit: " g", barClassName: "bg-mint-200" },
  ];

  const todayDow = new Date().getDay();
  const todaysWorkout = snapshot.plan?.workouts.find((w) => w.dayOfWeek === todayDow);
  const weekOf = startOfWeek(today);
  const completedWorkoutIds = new Set(
    snapshot.sessions
      .filter(
        (s) =>
          s.status === "completed" &&
          s.date >= weekOf &&
          s.date <= today,
      )
      .map((s) => `${s.plannedWorkoutId}:${s.date}`),
  );
  const completedThisWeek = completedWorkoutIds.size;
  const scheduledThisWeek = snapshot.plan?.workouts.length ?? 0;
  const weekPct = scheduledThisWeek > 0 ? completedThisWeek / scheduledThisWeek : 0;
  const plannedWorkoutMinutes = Object.fromEntries(
    (snapshot.plan?.workouts ?? []).map((workout) => [workout.id, workout.estimatedMinutes]),
  );
  const workoutEnergyEstimateKcal =
    snapshot.profile?.targetEligibility === "eligible"
      ? estimateWorkoutEnergyKcal({
          sessions: snapshot.sessions,
          fromDate: weekOf,
          toDate: today,
          weightKg: snapshot.profile.weightKg,
          plannedWorkoutMinutes,
          fallbackWorkoutMinutes: snapshot.profile.sessionMinutes,
        })
      : null;

  const suggestion =
    snapshot.profile?.targetEligibility !== "unsupported" &&
    todaysWorkout && snapshot.sessions.length > 0
      ? suggestProgression(todaysWorkout.exercises[0]?.exerciseId ?? "", snapshot.sessions)
      : null;

  if (!snapshot.onboarded) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <Card tone="lavender" className="w-full max-w-md p-8 text-center">
          <p className="text-5xl" aria-hidden>
            🏋️
          </p>
          <h2 className="mt-4 text-2xl font-extrabold">Let&apos;s set you up</h2>
          <p className="mt-2 text-sm font-semibold text-ink-soft">
            Answer a few questions and get a calisthenics week and meal plan you
            can actually edit. Under five minutes.
          </p>
          <Link href="/onboarding" className="mt-6 block">
            <Button className="w-full">Start onboarding</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Today's meals — blush hero card from the reference */}
      <Card tone="blush" className="animate-fade-up">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/70">
              <UtensilsCrossed className="h-4.5 w-4.5 text-ink" aria-hidden />
            </span>
            <div>
              <h2 className="font-extrabold">Today&apos;s meals</h2>
              <p className="text-xs font-bold text-ink-soft">
                {status === "unlogged"
                  ? "No meals logged yet"
                  : `${loggedSlots} of 4 meals logged${status === "partial" ? " · still logging" : ""}`}
              </p>
            </div>
          </div>
          <Link href="/nutrition" aria-label="Add food">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-white/70 text-ink shadow-chip">
              <Plus className="h-4 w-4" aria-hidden />
            </span>
          </Link>
        </div>

        {target ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3" role="group" aria-label="Today's nutrition targets">
              {nutritionTargets.map((metric) => (
                <ProgressBar key={metric.label} {...metric} compact />
              ))}
            </div>
            <p className="mt-2 text-[11px] font-semibold text-ink-soft">
              Targets are estimates from your profile.
            </p>
          </>
        ) : (
          <p className="mt-4 rounded-2xl bg-white/60 p-3 text-xs font-semibold text-ink-soft">
            Daily targets aren&apos;t set yet. You can still log meals.
          </p>
        )}

        <div className="mt-4">
          <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-bold">
            {formatLong(today)}
          </span>
        </div>
      </Card>

      {/* Weekly progress ring — lavender card */}
      <Card tone="lavender" className="flex animate-fade-up items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/70">
              <Flame className="h-4 w-4 text-ink" aria-hidden />
            </span>
            <h2 className="font-extrabold">Your progress</h2>
          </div>
          <p className="mt-4 text-4xl font-extrabold tabular-nums">
            {Math.round(weekPct * 100)}%
          </p>
          <p className="mt-1 text-xs font-bold text-ink-soft">
            {completedThisWeek} of {scheduledThisWeek} workouts this week
          </p>
          <p className="mt-2 max-w-sm text-[11px] font-semibold text-ink-soft">
            {snapshot.profile?.targetEligibility !== "eligible"
              ? "Workout energy estimates are unavailable for this profile."
              : workoutEnergyEstimateKcal === null
                ? "Complete a workout to see a rough energy estimate."
                : (
                    <>
                      Rough 3.8 MET moderate-calisthenics estimate from elapsed time and profile
                      weight; pauses and effort vary.{" "}
                      <a
                        href="https://pacompendium.com/conditioning-exercise/"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        Source
                      </a>
                    </>
                  )}
          </p>
        </div>
        <ProgressRing
          value={weekPct}
          size={110}
          label="Workouts completed this week"
          centerLabel={workoutEnergyEstimateKcal === null ? "—" : `≈${workoutEnergyEstimateKcal}`}
          centerSub="kcal est."
          barClassName="text-ink"
        />
        <p className="sr-only">
          Estimated workout energy this week: {workoutEnergyEstimateKcal === null
            ? "not available"
            : `approximately ${workoutEnergyEstimateKcal} kilocalories`}.
        </p>
      </Card>

      {/* Quick links grid */}
      <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
        {quickLinks.map(({ href, tone, icon: Icon, title, blurb }) => (
          <Link key={href} href={href} className="group block">
            <Card tone={tone} className="flex h-full min-h-36 flex-col justify-between transition-transform group-hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold">{title}</h3>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white/70">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold text-ink-soft">{blurb}</p>
              <p className="mt-3 flex items-center gap-1 text-sm font-extrabold">
                Open <ArrowRight className="h-4 w-4" aria-hidden />
              </p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Today's workout */}
      <Card className="lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold">Today&apos;s workout</h2>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-peach-100">
            <Dumbbell className="h-4 w-4" aria-hidden />
          </span>
        </div>
        {todaysWorkout ? (
          <>
            <p className="mt-3 text-lg font-extrabold">{todaysWorkout.title}</p>
            <p className="text-sm font-semibold text-muted">
              {todaysWorkout.focus} · {todaysWorkout.exercises.length} exercises · ~
              {todaysWorkout.estimatedMinutes} min
            </p>
            {suggestion ? (
              <p
                className={`mt-3 rounded-2xl px-3 py-2 text-xs font-bold ${
                  suggestion.action === "progress"
                    ? "bg-mint-100"
                    : suggestion.action === "regress"
                      ? "bg-blush-100"
                      : "bg-peach-100"
                }`}
              >
                {suggestion.reason}
              </p>
            ) : null}
            <Link href={`/workouts/session/${todaysWorkout.id}`} className="mt-4 block lg:ml-auto lg:max-w-xs">
              <Button className="w-full">
                <Play className="h-4 w-4" aria-hidden /> Start workout
              </Button>
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm font-semibold text-muted">
              Rest day — no workout scheduled. Rest days are part of the plan,
              not a failure.
            </p>
            <Link href="/workouts" className="mt-4 block lg:ml-auto lg:max-w-xs">
              <Button variant="soft" className="w-full">
                View this week
              </Button>
            </Link>
          </>
        )}
      </Card>

    </div>
  );
}
