"use client";

import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Apple, ConciergeBell, Plus, Sandwich, Sun, UtensilsCrossed } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { CalorieBudgetRing } from "@/components/ui/CalorieBudgetRing";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { nutritionMetricStyles } from "@/components/ui/nutritionMetrics";
import { useNutritionWeek } from "./useNutritionWeek";
import { AddMealDialog } from "./AddMealDialog";
import { PlannedMealActions } from "./PlannedMealActions";
import { LoggedMealAction } from "./LoggedMealAction";
import { RecipeCover } from "./RecipeCover";
import { nutritionWeekSnapshot } from "@/utility/nutritionWeek";
import { dailyMealRows, mealSlots, mealSlotLabels, slotCalorieLabel, type DailyMealRow } from "@/utility/dailyMealRows";
import { dayStatus, totalsForDate } from "@/utility/nutrition";
import { targetForDate } from "@/utility/targetHistory";
import { formatLong, startOfWeek, todayKey, weekdayShort } from "@/utility/dates";
import type { MealSlot } from "@/types/domain";

const slotIcons = { breakfast: Sun, lunch: Sandwich, dinner: ConciergeBell, snack: Apple };

function MealText({ row }: { row: DailyMealRow }) {
  return <><span className="block text-sm font-bold">{row.name}</span><span className="block text-xs text-ink-soft">{row.calories === null ? "Calories unavailable" : `${row.partial ? "Partial · " : ""}≈${Math.round(row.calories)} kcal`}</span></>;
}

export function TodayMealsCard() {
  const { snapshot: current, pendingMutation } = useApp();
  const date = todayKey();
  const week = useNutritionWeek(startOfWeek(date, current.profile?.weekStartsOn ?? 0));
  const snapshot = nutritionWeekSnapshot(current, week.data);
  const [slot, setSlot] = useState<MealSlot | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const restoreSlot = useRef<MealSlot | null>(null);
  useEffect(() => {
    if (week.loading || pendingMutation || !restoreSlot.current) return;
    document.getElementById(`home-add-meal-${restoreSlot.current}`)?.focus();
    restoreSlot.current = null;
  }, [week.loading, week.data, pendingMutation, slot]);
  const rows = dailyMealRows(snapshot, date);
  const totals = totalsForDate(snapshot.nutritionLogs, date);
  const status = dayStatus(snapshot.nutritionLogs, date);
  const applicable = targetForDate(snapshot.nutritionWeekTargets, date);
  const target = snapshot.profile?.targetEligibility === "unsupported" || applicable?.safetyOutcome === "unsupported_population" ? null : applicable;
  const locked = week.loading || Boolean(week.error) || Boolean(pendingMutation);
  const refresh = () => week.refresh();
  return <Card tone="blush" className="@container/meals mt-[35px] animate-fade-up md:px-[23px] md:py-[26px] lg:mt-0" role="region" aria-labelledby="home-meals-heading">
    <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/70"><UtensilsCrossed className="h-4.5 w-4.5" aria-hidden /></span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"><h2 id="home-meals-heading" className="font-extrabold">Today&apos;s meals</h2>
        <time dateTime={date} aria-label={formatLong(date)} className="ml-auto max-w-full rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-soft [overflow-wrap:anywhere]">{`${weekdayShort(date)}, ${date.slice(5).replace("-", "/")}`}</time>
      </div>
    </div>
    <div className="mt-4 grid min-w-0 grid-cols-[116px_minmax(0,1fr)] items-center gap-3 rounded-2xl p-2 @min-[24rem]/meals:gap-5 @min-[24rem]/meals:p-4">
      <div className="grid min-w-0 justify-items-center"><CalorieBudgetRing size={116} showCaption={false} target={target?.calories ?? null} logged={totals.calories} status={status} estimated={snapshot.nutritionLogs.some(log => log.date === date && log.estimated)} /></div>
      {target ? <div className="grid min-w-0 gap-3" role="group" aria-label="Today's nutrition targets">{([
        ["Protein", "proteinG", target.proteinG], ["Carbs", "carbsG", target.carbsG], ["Fat", "fatG", target.fatG],
      ] as const).map(([label, metric, maximum]) => <ProgressBar key={metric} label={label} value={status === "unlogged" ? null : totals[metric]} target={maximum} unit=" g" compact inlineHeader barClassName={nutritionMetricStyles[metric].bar} />)}</div>
        : <p className="min-w-0 text-xs font-semibold text-ink-soft">Daily targets aren&apos;t set yet. You can still log meals.</p>}
    </div>
    {week.loading ? <LoadingIndicator className="mt-3" label="Refreshing today’s meals…" /> : null}
    {week.error ? <div role="alert" className="mt-3 rounded-xl bg-danger-100 p-3 text-sm text-danger-900"><p>Today&apos;s meals could not be refreshed. Your saved entries are retained.</p><Button variant="soft" onClick={refresh}>Retry meals</Button></div> : null}
    <div className="mt-4 grid min-w-0 divide-y divide-ink/10 rounded-2xl bg-white/50">{mealSlots.map(mealSlot => {
      const items = rows.filter(row => row.slot === mealSlot);
      const Icon = slotIcons[mealSlot];
      const calories = slotCalorieLabel(items);
      const focusSlot = () => { restoreSlot.current = mealSlot; };
      return <section key={mealSlot} className="min-w-0" aria-label={mealSlotLabels[mealSlot]}>
        <div className="flex min-w-0 items-center gap-2 px-2 py-1"><Icon className="h-5 w-5 shrink-0" aria-hidden /><div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2"><h3 className="text-sm font-extrabold">{mealSlotLabels[mealSlot]}</h3>{calories ? <p className="text-xs text-ink-soft">{calories}</p> : null}</div>
          <IconButton id={`home-add-meal-${mealSlot}`} variant="ghost" label={`Add meal to ${mealSlotLabels[mealSlot]}`} tooltip={`Add meal to ${mealSlotLabels[mealSlot]}`} size="compact" disabled={locked} aria-haspopup="dialog" onClick={event => { trigger.current = event.currentTarget; setSlot(mealSlot); }}><Plus className="h-4 w-4" aria-hidden /></IconButton>
        </div>
        {items.length ? <ul className="grid min-w-0 divide-y divide-ink/10">{items.map(row => <li key={row.id} className="flex w-full min-w-0 flex-wrap items-center gap-2 bg-white/70 p-2">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg"><RecipeCover image={row.image} name={row.name} selection /></div>
          {row.logged ? <Link href="/nutrition" className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left [overflow-wrap:anywhere]" aria-label={`View logged ${row.name} in Nutrition`}><MealText row={row} /></Link>
            : <div className="min-w-0 flex-1 [overflow-wrap:anywhere]"><MealText row={row} /></div>}
          {row.logged ? <LoggedMealAction key={`${row.id}:${row.log?.revision}`} row={row} disabled={locked} onUndone={() => { focusSlot(); refresh(); }} /> : row.planned && week.data ? <div className="ml-auto flex min-w-0 flex-wrap gap-1"><PlannedMealActions meal={row.planned} snapshot={snapshot} week={week.data} disabled={locked} onChanged={refresh} focusAfterChange={focusSlot} /></div> : null}
        </li>)}</ul> : null}
      </section>;
    })}</div>
    {slot && week.data ? <AddMealDialog key={`${date}:${slot}`} date={date} slot={slot} week={week.data} returnFocus={trigger} onClose={() => { restoreSlot.current = slot; setSlot(null); }} /> : null}
  </Card>;
}
