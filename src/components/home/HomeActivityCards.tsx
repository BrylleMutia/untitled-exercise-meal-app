"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Check, Dumbbell, Footprints, Pencil, Play, Plus } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { IconButton } from "@/components/ui/IconButton";
import { DailyStepEditor } from "@/components/activity/DailyStepEditor";
import { DayStrip } from "@/components/DayStrip";
import { formatFullDate, todayKey, weekdayShort, startOfWeek, weekDates } from "@/utility/dates";
import { formatWalkingTime, homeStepSummary, homeWorkoutSummary } from "@/utility/homeActivity";

const summaryClass = "mt-4 grid min-w-0 grid-cols-[116px_minmax(0,1fr)] items-center gap-3 rounded-2xl p-2 @min-[24rem]/activity:gap-5 @min-[24rem]/activity:p-4";
function Heading({ id, title, icon, date, action }: { id: string; title: string; icon: ReactNode; date: string; action?: ReactNode }) {
  const datePill = <time dateTime={date} aria-label={formatFullDate(date)} className="ml-auto min-w-0 max-w-full rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-soft [overflow-wrap:anywhere]">{`${weekdayShort(date)}, ${date.slice(5).replace("-", "/")}`}</time>;
  return <div className={`flex min-w-0 items-center gap-3 ${action ? "flex-wrap" : ""}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/70">{icon}</span>
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"><h2 id={id} className="max-w-full break-words font-extrabold [overflow-wrap:anywhere]">{title}</h2>
      {!action ? datePill : null}</div>{action ? <div className="ml-auto flex min-w-0 max-w-full items-center gap-1">{datePill}{action}</div> : null}</div>;
}
function Metric({ label, children, description }: { label: string; children: ReactNode; description?: string }) {
  const [visible, setVisible] = useState(false);
  const hint = useId();
  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setVisible(false); } };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, [visible]);
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-1"><dt className="break-words text-xs font-semibold leading-5 text-ink-soft [overflow-wrap:anywhere]">{label}:</dt>
    <dd tabIndex={description ? 0 : undefined} aria-label={description} aria-describedby={description && visible ? hint : undefined}
      onFocus={() => setVisible(true)} onBlur={() => setVisible(false)} onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}
      className="relative min-w-0 break-words text-right text-xs font-bold leading-5 tabular-nums [overflow-wrap:anywhere]">
      <span aria-hidden={description ? true : undefined}>{children}</span>
      {description && visible ? <span id={hint} role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-max max-w-[min(12rem,calc(100vw-2rem))] rounded-lg bg-ink px-3 py-2 text-left text-xs font-semibold text-white">{description}</span> : null}
    </dd></div>;
}
function ActionLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setVisible(false); } };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, [visible]);
  return <Link href={href} aria-label={label} onFocus={() => setVisible(true)} onBlur={() => setVisible(false)} onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)} className="relative inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-ink hover:bg-black/5">
    {children}{visible ? <span role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-max max-w-[min(12rem,calc(100vw-2rem))] rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white">{label}</span> : null}</Link>;
}

export function HomeWorkoutsCard() {
  const { snapshot } = useApp();
  const date = todayKey(), data = homeWorkoutSummary(snapshot, date);
  return <Card tone="lavender" className="@container/activity animate-fade-up md:px-[23px] md:py-[26px]" role="region" aria-labelledby="home-workouts-heading">
    <Heading id="home-workouts-heading" title="Workouts" date={date} icon={<Dumbbell className="h-4.5 w-4.5" aria-hidden />} />
    <div className={summaryClass} data-activity-summary>
      <ProgressRing value={data.progress} size={116} label="Workouts completed this week" unavailableLabel="No weekly workout plan is set" centerLabel={data.progress === null ? "—" : `${Math.round(Math.min(1, data.progress) * 100)}%`} centerSub="This week" barClassName="text-lav-500" />
      <dl className="grid min-w-0 gap-1" aria-label="Weekly workout metrics"><Metric label="Completed">{data.completed}</Metric><Metric label="Scheduled">{data.scheduled}</Metric><Metric label="Est. kcal" description={data.energyStatus ?? undefined}>{data.energyStatus ? "—" : `≈${data.energy}`}</Metric></dl>
    </div>
    <section className="mt-4 min-w-0 rounded-2xl bg-white/50 py-1" aria-label="Today's workout">
      <div className="mx-2 flex min-w-0 items-center justify-between gap-2"><h3 className="text-sm font-extrabold">Today&apos;s workout</h3><ActionLink href="/workouts" label="View weekly workouts"><CalendarDays className="h-4 w-4" aria-hidden /></ActionLink></div>
      {data.workout ? <div className="flex min-w-0 flex-wrap items-center gap-2 bg-white/70 px-2 py-2 last:rounded-b-xl [&>a]:ml-auto"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-lav-100"><Dumbbell className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1 basis-28 break-words"><p className="text-sm font-bold">{data.workout.title}</p><p className="text-xs text-ink-soft">{data.workout.focus} · {data.workout.exercises.length} exercises · ~{data.workout.estimatedMinutes} min</p>{data.finished ? <p className="text-xs font-semibold">Completed today</p> : null}</div>
        <ActionLink href={data.href} label={data.action}>{data.action === "View workouts" ? <Check className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}</ActionLink></div>
        : <p className="px-2 pb-3 text-sm font-semibold text-ink-soft">Rest day — no workout scheduled.</p>}
      {data.suggestion ? <p className={`mx-2 mt-2 rounded-xl px-3 py-2 text-xs font-semibold ${data.suggestion.action === "progress" ? "bg-mint-100" : data.suggestion.action === "regress" ? "bg-blush-100" : "bg-peach-100"}`}>{data.suggestion.reason}</p> : null}
    </section>
  </Card>;
}

export function HomeStepsCard() {
  const { snapshot, pendingMutation } = useApp();
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      setToday(todayKey());
      clearTimeout(timer);
      const midnight = new Date(); midnight.setHours(24, 0, 0, 100);
      timer = setTimeout(refresh, midnight.getTime() - Date.now());
    };
    refresh(); document.addEventListener("visibilitychange", refresh);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const weekOf = startOfWeek(today, snapshot.profile?.weekStartsOn ?? 0);
  const [selection, setSelection] = useState({ weekOf, date: today });
  const selected = weekDates(weekOf).includes(selection.date) ? selection.date : today;
  if (selection.weekOf !== weekOf) setSelection({ weekOf, date: selected });
  const data = homeStepSummary(snapshot, today, selected);
  const [date, setDate] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const action = useRef<HTMLButtonElement | null>(null);
  const selector = useRef<HTMLDivElement | null>(null);
  const fullDate = formatFullDate(selected);
  const context = selected === today ? "today" : `on ${fullDate}`;
  const upcomingDescription = `${fullDate} is upcoming. Step logging is available on that date.`;
  const stepDescription = data.upcoming ? upcomingDescription : !data.entry ? `No steps logged ${context}; ${data.target === undefined ? "0 steps" : `0 of ${data.target.toLocaleString()} steps`} shown as a placeholder.` : undefined;
  const closeEditor = () => {
    trigger.current = action.current ?? selector.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? null;
    setDate(null);
  };
  return <Card tone="mint" className="@container/activity animate-fade-up md:px-[23px] md:py-[26px]" role="region" aria-labelledby="home-steps-heading">
    <Heading id="home-steps-heading" title="Steps" date={selected} icon={<Footprints className="h-4.5 w-4.5" aria-hidden />}
      action={!data.upcoming ? <IconButton id={`home-steps-${selected}`} buttonRef={action} variant="ghost" size="compact" portalTooltip
        label={`${data.entry ? "Edit" : "Add"} steps for ${fullDate}`} tooltip={`${data.entry ? "Edit" : "Add"} steps for ${fullDate}`} disabled={Boolean(pendingMutation)}
        onClick={event => { if (selected > todayKey()) return; trigger.current = event.currentTarget; setDate(selected); }}>{data.entry ? <Pencil className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}</IconButton> : null} />
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">Selected {fullDate}{data.upcoming ? ". Upcoming." : "."}</p>
    <div className={summaryClass} data-activity-summary>
      <ProgressRing value={data.progress} size={116} label={`Daily step target progress for ${fullDate}`} unavailableLabel={data.upcoming ? upcomingDescription : data.target === undefined ? `Daily step target is not set for ${fullDate}` : `No steps logged ${context}; daily target ${data.target.toLocaleString()} steps`}
        centerLabel={data.progress === null ? "—" : `${Math.round(Math.min(1, data.progress) * 100)}%`} centerSub={data.upcoming ? "Upcoming" : data.target === undefined ? "No target" : !data.entry ? "Not logged" : data.progress !== null && data.progress >= 1 ? "Target reached" : "of target"} barClassName="text-ink" />
      <dl className="grid min-w-0 gap-1" aria-label={`Step metrics for ${fullDate}`}><Metric label="Steps" description={stepDescription}>
        <span aria-hidden>{data.upcoming ? "—" : `${(data.entry?.steps ?? 0).toLocaleString()}${data.target === undefined ? "" : ` / ${data.target.toLocaleString()}`}`}</span>
        {data.entry ? <span className="sr-only">{data.entry.steps.toLocaleString()}{data.target === undefined ? "" : ` of ${data.target.toLocaleString()}`} steps</span> : null}
      </Metric>
        <Metric label="Walk time" description={data.upcoming ? upcomingDescription : data.entry?.walkingMinutes === undefined ? `Walking time not logged ${context}` : undefined}>{data.entry?.walkingMinutes === undefined ? "—" : formatWalkingTime(data.entry.walkingMinutes)}</Metric>
        <Metric label="Est. kcal" description={data.energy ? undefined : data.upcoming ? upcomingDescription : `${data.energyLabel === "Not logged" ? "Walking energy not logged" : data.energyLabel} (${fullDate})`}>{data.energy ? `≈${data.energy.lowKcal}–${data.energy.highKcal}` : "—"}</Metric></dl>
    </div>
    <Link href="/settings#daily-step-target" className="inline-flex min-h-11 items-center rounded-xl text-xs font-bold underline underline-offset-2">{data.target === undefined ? "Set target" : "Edit target"}</Link>
    <h3 id="home-steps-week" className="mt-2 text-sm font-extrabold">This week</h3>
    <div ref={selector} className="mt-2 min-w-0 rounded-2xl bg-white/50" role="group" aria-labelledby="home-steps-week">
      <DayStrip compact weekOf={weekOf} selected={selected} onSelect={next => setSelection({ weekOf, date: next })} />
    </div>
    {date ? <DailyStepEditor key={`${snapshot.userId}:${date}`} date={date} onClose={closeEditor} returnFocus={trigger} /> : null}
  </Card>;
}
