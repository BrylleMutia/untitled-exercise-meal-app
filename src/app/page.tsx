"use client";

import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Dumbbell,
  Flame,
  Footprints,
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
import { CalorieBudgetRing } from "@/components/ui/CalorieBudgetRing";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { HelpHeading, HelpPopover } from "@/components/ui/HelpPopover";
import { dayStatus, entriesForDate, totalsForDate } from "@/utility/nutrition";
import { suggestProgression, type ProgressionSuggestion } from "@/utility/progression";
import type { PlannedWorkout } from "@/types/domain";
import { estimateWorkoutEnergyKcal } from "@/utility/workoutEnergy";
import { estimateWalkingEnergy, supportsWalkingEnergyEstimate } from "@/utility/walkingEnergy";
import { formatLong, startOfWeek, todayKey } from "@/utility/dates";
import { participationMilestones } from "@/utility/milestones";
import { targetForDate } from "@/utility/targetHistory";

const dashboardRingSize = 116;
const summaryPillClassName = "inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-soft";
const ringActionClassName = "absolute -right-1 -top-1 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/70 text-ink shadow-chip hover:bg-white";

const quickLinks = [
  {
    href: "/workouts",
    tone: "peach" as const,
    icon: Dumbbell,
    title: "Workouts",
  },
  {
    href: "/nutrition",
    tone: "lavender" as const,
    icon: UtensilsCrossed,
    title: "Nutrition",
  },
  {
    href: "/grocery",
    tone: "mint" as const,
    icon: ShoppingBasket,
    title: "Grocery",
  },
  {
    href: "/progress",
    tone: "coral" as const,
    icon: TrendingUp,
    title: "Progress",
  },
];

const summaryActionClassName = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-sm font-bold text-white transition-[background-color,transform] duration-150 hover:bg-ink-soft active:scale-[0.98] motion-reduce:transition-none @min-[420px]/workout:w-auto @min-[420px]/workout:shrink-0";

function WorkoutSummary({ workout, suggestion, headingId, className }: {
  workout: PlannedWorkout | undefined;
  suggestion: ProgressionSuggestion | null;
  headingId: string;
  className: string;
}) {
  return (
    <Card padding="compact" className={`@container/workout ${className}`} role="region" aria-labelledby={headingId}>
      <div className="flex flex-col gap-3 @min-[420px]/workout:flex-row @min-[420px]/workout:items-center @min-[420px]/workout:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-peach-100">
              <Dumbbell className="h-4 w-4" aria-hidden />
            </span>
            <h2 id={headingId} className="font-extrabold">Today&apos;s workout</h2>
          </div>
          {workout ? <>
            <p className="mt-2 text-lg font-extrabold">{workout.title}</p>
            <p className="text-sm font-semibold text-ink-soft">
              {workout.focus} · {workout.exercises.length} exercises · ~{workout.estimatedMinutes} min
            </p>
          </> : <p className="mt-2 text-sm font-semibold text-ink-soft">
            Rest day — no workout scheduled.
          </p>}
          {workout && suggestion ? (
            <p className={`mt-2 rounded-2xl px-3 py-2 text-xs font-bold ${
              suggestion.action === "progress" ? "bg-mint-100"
                : suggestion.action === "regress" ? "bg-blush-100" : "bg-peach-100"
            }`}>
              {suggestion.reason}
            </p>
          ) : null}
        </div>
        <Link href={workout ? `/workouts/session/${workout.id}` : "/workouts"} className={summaryActionClassName}>
          {workout ? <><Play className="h-4 w-4" aria-hidden /> Start workout</> : "View this week"}
        </Link>
      </div>
    </Card>
  );
}

export default function HomePage() {
  const { snapshot } = useApp();
  const today = todayKey();
  const stepsEntry = snapshot.dailySteps.find((entry) => entry.date === today);
  const dailyStepTarget = snapshot.profile?.dailyStepTarget;
  const stepProgress = dailyStepTarget !== undefined && stepsEntry ? stepsEntry.steps / dailyStepTarget : null;
  const stepPercent = stepProgress === null ? null : Math.round(Math.min(1, stepProgress) * 100);
  const walkingEstimateSupported = supportsWalkingEnergyEstimate(snapshot.profile);
  const walkingEstimate = walkingEstimateSupported && snapshot.profile && stepsEntry
    ? estimateWalkingEnergy(snapshot.profile.weightKg, stepsEntry.walkingMinutes)
    : null;
  const target = targetForDate(snapshot.nutritionWeekTargets, today);
  const totals = totalsForDate(snapshot.nutritionLogs, today);
  const entries = entriesForDate(snapshot.nutritionLogs, today);
  const loggedSlots = Object.values(entries).filter((list) => list.length > 0).length;
  const status = dayStatus(snapshot.nutritionLogs, today);
  const milestones = snapshot.profile?.celebrationsEnabled ? participationMilestones(snapshot, today) : [];
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

  const workoutEnergyStatus = snapshot.profile?.targetEligibility !== "eligible"
    ? "Energy estimate unavailable for this profile."
    : snapshot.plan?.trainingProgram === "pilates"
      ? "Energy estimate unavailable for this program."
      : workoutEnergyEstimateKcal === null ? "Energy estimate: not logged." : null;

  const suggestion =
    snapshot.plan?.trainingProgram !== "pilates" &&
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
            Set up your profile and editable plans.
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
      {milestones.length > 0 ? <Card tone="mint" className="animate-pop lg:col-span-2">
        <HelpHeading title="Personal milestones"><p>Milestones recognize participation and personal firsts. Rest days and missing entries never lose points.</p></HelpHeading>
        <ul className="mt-2 flex flex-wrap gap-2">{milestones.map((milestone) => <li key={milestone} className="rounded-full bg-white/70 px-3 py-2 text-xs font-bold">{milestone}</li>)}</ul>
      </Card> : null}
      <div className="contents lg:mt-[35px] lg:grid lg:content-start lg:gap-4">
        {/* Today's meals — blush hero card from the reference */}
        <Card tone="blush" className="@container/meals mt-[35px] animate-fade-up md:px-[23px] md:py-[26px] lg:mt-0 lg:py-[50px]">
          <div className="grid grid-cols-1 content-center gap-x-6 gap-y-4 md:grid-cols-[minmax(0,1fr)_116px]">
            <div className="flex min-w-0 items-center gap-3 md:col-span-2 md:@min-[420px]/meals:col-span-1">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/70">
                <UtensilsCrossed className="h-4.5 w-4.5 text-ink" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1">
                  <h2 className="font-extrabold">Today&apos;s meals</h2>
                  <HelpPopover title="Today's meals"><p>Calorie and macro targets are estimates from your profile. Missing entries stay unknown; logged meals may still be partial.</p><Link href="/nutrition">Target and meal details</Link></HelpPopover>
                  <time dateTime={today} className="ml-3 inline-block max-w-[calc(100%_-_0.75rem)] shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-soft [overflow-wrap:anywhere]">
                    {formatLong(today)}
                  </time>
                </div>
              </div>
            </div>
            <div className="relative row-start-2 w-[116px] justify-self-center self-center md:col-start-2 md:justify-self-auto md:@min-[420px]/meals:row-span-3 md:@min-[420px]/meals:row-start-1">
              <CalorieBudgetRing size={dashboardRingSize} target={target?.calories ?? null} logged={totals.calories} status={status} estimated={snapshot.nutritionLogs.some((entry) => entry.date === today && entry.estimated)} />
              <Link href="/nutrition" aria-label="Add food" className={ringActionClassName}>
                <Plus className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <p className="col-start-1 row-start-3 min-w-0 self-center text-xs font-bold text-ink-soft md:row-start-2">
              {status === "unlogged"
                ? "No meals logged yet"
                : `${loggedSlots} of 4 meals logged${status === "partial" ? " · still logging" : ""}`}
            </p>
            {target ? (
              <div className="@container/macros row-start-4 min-w-0 md:col-span-2 md:row-start-3 md:@min-[420px]/meals:col-span-1">
                <div className="grid min-w-0 gap-3 @min-[15rem]/macros:grid-cols-3" role="group" aria-label="Today's nutrition targets">
                  {nutritionTargets.filter((metric) => metric.label !== "Calories").map((metric) => (
                    <ProgressBar key={metric.label} {...metric} compact stackTarget />
                  ))}
                </div>
              </div>
            ) : (
              <p className="row-start-4 text-xs font-semibold text-ink-soft md:col-span-2 md:row-start-3 md:@min-[420px]/meals:col-span-1">Daily targets aren&apos;t set yet. You can still log meals.</p>
            )}
          </div>
        </Card>
        <WorkoutSummary workout={todaysWorkout} suggestion={suggestion} headingId="home-workout-heading-desktop" className="hidden lg:block lg:py-[39px]" />
      </div>

      <div className="grid content-start gap-4 lg:mt-[35px]">
        {/* Weekly progress ring — lavender card */}
        <Card tone="lavender" padding="compact" className="grid animate-fade-up grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_116px] md:px-[23px] md:py-[26px]">
          <div className="flex min-w-0 items-center gap-2 md:col-start-1 md:row-start-1">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/70">
              <Flame className="h-4 w-4 text-ink" aria-hidden />
            </span>
            <h2 className="font-extrabold">Your progress</h2>
            <HelpPopover title="Your progress"><p>Completion counts scheduled workouts this week.</p><p>Workout energy is a rough 3.8 MET calisthenics estimate using elapsed time and profile weight. Pauses and effort vary. Pilates and custom workouts do not receive this estimate.</p><a href="https://pacompendium.com/conditioning-exercise/" target="_blank" rel="noreferrer">Workout energy source</a></HelpPopover>
          </div>
          <div className="relative my-1 w-[116px] justify-self-center self-center md:col-start-2 md:row-span-2 md:row-start-1 md:my-0"><ProgressRing
            value={weekPct}
            size={dashboardRingSize}
            label="Workouts completed this week"
            centerLabel={workoutEnergyEstimateKcal === null ? "—" : `≈${workoutEnergyEstimateKcal}`}
            centerSub="kcal est."
            barClassName="text-ink"
          />
            <Link href="/workouts" aria-label="Open workouts" className={ringActionClassName}>
              <Plus className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="min-w-0 text-center md:col-start-1 md:row-start-2 md:text-left">
            <p className="text-3xl font-extrabold tabular-nums">
              {Math.round(weekPct * 100)}%
            </p>
            <p className="mt-1 text-xs font-bold text-ink-soft">
              {completedThisWeek} of {scheduledThisWeek} workouts this week
            </p>
            {workoutEnergyStatus ? <p className={`mt-[17px] ${summaryPillClassName}`}>
              <Flame className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">{workoutEnergyStatus}</span>
            </p> : null}
          </div>
          <p className="sr-only">
            Estimated workout energy this week: {workoutEnergyEstimateKcal === null
              ? "not available"
              : `approximately ${workoutEnergyEstimateKcal} kilocalories`}.
          </p>
        </Card>

        <Card tone="mint" padding="compact" className="md:px-[23px] md:py-[26px]" role="region" aria-labelledby="home-steps-heading">
          <div className="grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_116px]">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 md:col-start-1 md:row-start-1">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/70">
                  <Footprints className="h-4 w-4" aria-hidden />
                </span>
                <h2 id="home-steps-heading" className="font-extrabold">Today&apos;s steps</h2>
                <HelpPopover title="Today's steps"><p>Only today&apos;s saved manual entry appears here. Your optional target is a personal preference.</p><p>Walking energy is a rough range using walking minutes and current weight, with an adult reference for ages 19–59. It is separate from workout energy and does not change food targets.</p><Link href="/activity">Estimate details</Link></HelpPopover>
              </div>
            </div>
            <div className="relative my-1 w-[116px] justify-self-center self-center md:col-start-2 md:row-span-2 md:row-start-1 md:my-0">
              <ProgressRing value={stepProgress} size={dashboardRingSize} label="Daily step target progress"
                unavailableLabel={dailyStepTarget === undefined ? "Daily step target is not set" : `No steps logged today; daily target ${dailyStepTarget.toLocaleString()} steps`}
                centerLabel={stepPercent === null ? "—" : `${stepPercent}%`}
                centerSub={dailyStepTarget === undefined ? "no target" : stepsEntry ? stepProgress !== null && stepProgress >= 1 ? "Target reached" : "of target" : "not logged"}
                barClassName="text-ink" />
              <Link href="/activity" aria-label={stepsEntry ? "Edit daily steps" : "Log daily steps"} className={ringActionClassName}>
                <Plus className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="min-w-0 text-center md:col-start-1 md:row-start-2 md:text-left">
              <p className="text-2xl font-extrabold tabular-nums">
                {stepsEntry && dailyStepTarget !== undefined ? <>
                  <span aria-hidden>{`${stepsEntry.steps.toLocaleString()} / ${dailyStepTarget.toLocaleString()}`}</span>
                  <span className="sr-only">{`${stepsEntry.steps.toLocaleString()} of ${dailyStepTarget.toLocaleString()} steps`}</span>
                </> : stepsEntry ? <>
                  <span aria-hidden>{stepsEntry.steps.toLocaleString()}</span>
                  <span className="sr-only">{`${stepsEntry.steps.toLocaleString()} steps`}</span>
                </> : "Not logged"}
              </p>
              {!stepsEntry ? <p className="mt-1 text-xs font-bold text-ink-soft">No steps logged today</p> : null}
              {dailyStepTarget === undefined || !stepsEntry ? <p className="mt-1 text-xs font-bold text-ink-soft">
                {dailyStepTarget === undefined ? "No daily target" : `Daily target: ${dailyStepTarget.toLocaleString()} steps`}
              </p> : null}
              <div className="mt-[16px] flex min-w-0 flex-wrap items-center justify-center gap-3 md:justify-start">
                {stepsEntry?.walkingMinutes !== undefined ? <p className={summaryPillClassName}>
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 tabular-nums">{`${stepsEntry.walkingMinutes.toLocaleString()} walking minutes`}</span>
                </p> : stepsEntry ? <p className="text-xs font-semibold text-ink-soft">Walking time not logged</p> : null}
                <p className={walkingEstimate ? summaryPillClassName : "min-w-0 text-xs font-semibold text-ink-soft"}>
                  {walkingEstimate ? <>
                    <Flame className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span aria-hidden className="font-extrabold tabular-nums">{`≈${walkingEstimate.lowKcal}–${walkingEstimate.highKcal} kcal`}</span>
                    <span className="sr-only">{`Estimated walking energy: approximately ${walkingEstimate.lowKcal} to ${walkingEstimate.highKcal} kilocalories`}</span>
                  </> : !stepsEntry ? "Energy not logged"
                    : !walkingEstimateSupported ? "Energy unavailable for this profile"
                    : stepsEntry.walkingMinutes === 0 ? "Energy unavailable for 0 minutes"
                    : "Add walking minutes for an estimate"}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 md:justify-start">
                <Link href="/settings#daily-step-target" className="inline-flex min-h-11 items-center rounded-xl px-1 text-xs font-bold underline underline-offset-2">{dailyStepTarget === undefined ? "Set target" : "Edit target"}</Link>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <WorkoutSummary workout={todaysWorkout} suggestion={suggestion} headingId="home-workout-heading-mobile" className="lg:hidden" />

      {/* Quick links grid */}
      <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
        {quickLinks.map(({ href, tone, icon: Icon, title }) => (
          <Link key={href} href={href} className="group block">
            <Card tone={tone} className="flex h-full flex-col justify-between transition-transform group-hover:-translate-y-0.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="min-w-0 max-w-full break-words font-extrabold">{title}</h3>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white/70">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
              </div>
              <p className="mt-3 flex items-center gap-1 text-sm font-extrabold">
                Open <ArrowRight className="h-4 w-4" aria-hidden />
              </p>
            </Card>
          </Link>
        ))}
      </div>

    </div>
  );
}
