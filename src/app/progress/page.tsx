"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { HelpHeading } from "@/components/ui/HelpPopover";
import { averages, dayStatus } from "@/utility/nutrition";
import { addDays, monthMatrix, sameMonth, startOfWeek, todayKey } from "@/utility/dates";
import type { Tone } from "@/components/progress/progressShared";
import { HistoryList, Sparkline } from "@/components/progress/progressShared";
import type { HistoryReadModel } from "@/types/backend";
import { summarizeWeightEntries } from "@/utility/weightTrend";

export default function ProgressPage() {
  const { snapshot, actions, error } = useApp();
  const today = todayKey();
  const [month] = useState(today);
  const [history, setHistory] = useState<HistoryReadModel | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void actions.loadHistory({ from: addDays(today, -365), to: today, limit: 50 }).then((loaded) => {
      if (active && loaded) setHistory(loaded);
    }).finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [actions, today]);

  const loadMore = async () => {
    if (!history || historyLoading) return;
    setHistoryLoading(true);
    try {
      const next = await actions.loadHistory({
        from: history.summary.rangeFrom,
        to: history.summary.rangeTo,
        limit: 50,
        sessionsCursor: history.nextCursors.sessions,
        nutritionCursor: history.nextCursors.nutrition,
        weightsCursor: history.nextCursors.weights,
      });
      if (!next) return;
      setHistory((current) => current ? {
        ...next,
        sessions: current.nextCursors.sessions ? [...current.sessions, ...next.sessions] : current.sessions,
        nutritionLogs: current.nextCursors.nutrition ? [...current.nutritionLogs, ...next.nutritionLogs] : current.nutritionLogs,
        weights: current.nextCursors.weights ? [...current.weights, ...next.weights] : current.weights,
        nextCursors: {
          ...(current.nextCursors.sessions ? (next.nextCursors.sessions ? { sessions: next.nextCursors.sessions } : {}) : {}),
          ...(current.nextCursors.nutrition ? (next.nextCursors.nutrition ? { nutrition: next.nextCursors.nutrition } : {}) : {}),
          ...(current.nextCursors.weights ? (next.nextCursors.weights ? { weights: next.nextCursors.weights } : {}) : {}),
        },
        summary: current.summary,
      } : next);
    } finally {
      setHistoryLoading(false);
    }
  };

  const sessions = history?.sessions ?? snapshot.sessions;
  const nutritionLogs = history?.nutritionLogs ?? snapshot.nutritionLogs;
  const weights = history?.weights ?? snapshot.weights;

  const completedSessions = sessions.filter(
    (s) => s.status === "completed",
  );
  const weekOf = startOfWeek(today);
  const scheduledDayOfWeek = new Set(snapshot.plan?.workouts.map((workout) => workout.dayOfWeek) ?? []);
  const scheduled = Array.from({ length: 7 }, (_, offset) => addDays(weekOf, offset))
    .filter((date) => scheduledDayOfWeek.has(new Date(`${date}T00:00:00Z`).getUTCDay())).length;
  const completedThisWeek = new Set(
    completedSessions
      .filter((s) => s.date >= weekOf && s.date <= today)
      .map((s) => `${s.plannedWorkoutId}:${s.date}`),
  ).size;

  const avgs = averages(nutritionLogs);
  const { count: weightCount, first: firstWeight, latest: lastWeight, chartEntries, changeKg } = summarizeWeightEntries(weights);

  const grid = monthMatrix(month);
  const completedDates = new Set(completedSessions.map((s) => s.date));
  const scheduledDays = scheduledDayOfWeek;
  const nutritionDays = new Map(
    [...new Set(nutritionLogs.map((l) => l.date))].map((d) => [
      d,
      dayStatus(nutritionLogs, d),
    ]),
  );

  return (
    <div className="grid gap-4 pb-4">
      {/* Trends */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          tone="lavender"
          label="Avg daily calories"
          value={avgs.loggedDays > 0 ? String(avgs.avgCalories) : "—"}
          sub={`over ${avgs.loggedDays} logged days (estimates)`}
        />
        <StatTile
          tone="peach"
          label="Avg protein"
          value={avgs.loggedDays > 0 ? `${avgs.avgProteinG}g` : "—"}
          sub={`over ${avgs.loggedDays} logged days (estimates)`}
        />
        <StatTile
          tone="mint"
          label="Workouts completed"
          value={String(completedSessions.length)}
          sub={`${completedThisWeek}/${scheduled} this week`}
        />
        <StatTile
          tone="blush"
          label="Weight trend"
          value={
            lastWeight
              ? `${lastWeight.weightKg.toFixed(1)} kg`
              : "—"
          }
          sub={
            changeKg !== null && firstWeight
              ? `${changeKg > 0 ? "+" : ""}${changeKg.toFixed(1)} kg since ${firstWeight.date} · ${weightCount} entries`
              : lastWeight ? `1 entry on ${lastWeight.date} · no trend yet` : "No weight entries yet"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="self-start">
          <HelpHeading title="Weight"><p>Trend lines describe your entries; they never replace the original value.</p></HelpHeading>
          {chartEntries.length >= 2 && lastWeight ? <>
            <div className="mt-4">
              <Sparkline
                points={chartEntries.map((entry) => entry.weightKg)}
                ariaLabel={`Weight trend from ${chartEntries[0].date} to ${lastWeight.date}, ${chartEntries.length} entries`}
              />
            </div>
            <p className="mt-2 text-xs font-semibold text-muted">
              {chartEntries.length === weightCount ? `${weightCount} entries` : `Latest ${chartEntries.length} of ${weightCount} entries`} from {chartEntries[0].date} to {lastWeight.date}; latest {lastWeight.weightKg.toFixed(1)} kg.
            </p>
          </> : <p className="mt-4 rounded-2xl bg-cream p-4 text-sm font-semibold text-ink-soft">
            {lastWeight
              ? `One weight entry: ${lastWeight.weightKg.toFixed(1)} kg on ${lastWeight.date}. Log another weight in Settings to see a trend.`
              : "No weight entries yet. Log weight in Settings to see a trend."}
          </p>}
        </Card>

        <Card>
          <HelpHeading title="Calendar"><p>Workout completion counts scheduled days only. Rest days are excluded, not counted as failures. Nutrition days are complete, partial, or unlogged; missing entries never mean zero intake.</p></HelpHeading>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i} className="text-[10px] font-extrabold text-muted">
                {d}
              </span>
            ))}
            {grid.flat().map((day) => {
              const inMonth = sameMonth(day, month);
              const status = nutritionDays.get(day);
              const hasWorkout = completedDates.has(day);
              const scheduledWorkout = scheduledDays.has(new Date(`${day}T00:00:00Z`).getUTCDay());
              return (
                <div
                  key={day}
                  title={`${day} — workout ${hasWorkout ? "completed" : scheduledWorkout ? "scheduled but unlogged" : "rest day"}, nutrition ${
                    status ?? "unlogged"
                  }`}
                  className={`grid h-9 place-items-center rounded-lg text-xs font-bold tabular-nums ${
                    inMonth ? "bg-cream" : "opacity-25"
                  }`}
                >
                  <span className="relative">
                    {Number(day.slice(8, 10))}
                    <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5">
                      {hasWorkout ? <Dot tone="lav" /> : scheduledWorkout ? <Dot tone="slate" /> : null}
                      {status === "complete" ? <Dot tone="mint" /> : null}
                      {status === "partial" ? <Dot tone="peach" /> : null}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-bold text-muted">
            <span className="flex items-center gap-1"><Dot tone="lav" /> workout done</span>
            <span className="flex items-center gap-1"><Dot tone="slate" /> scheduled / unlogged</span>
            <span className="flex items-center gap-1"><Dot tone="mint" /> nutrition complete</span>
            <span className="flex items-center gap-1"><Dot tone="peach" /> nutrition partial</span>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="font-extrabold">Recent history</h2>
        {error && history === null ? <p className="mt-2 rounded-xl bg-peach-100 p-3 text-xs font-bold" role="alert">History could not be loaded. Your current snapshot remains available; retry below.</p> : null}
        <HistoryList history={history} />
        {history?.nextCursors.sessions || history?.nextCursors.nutrition || history?.nextCursors.weights ? (
          <Button variant="soft" className="mt-3 !min-h-11 !px-3 text-xs" disabled={historyLoading} onClick={() => void loadMore()}>
            {historyLoading ? "Loading…" : "Load more history"}
          </Button>
        ) : null}
      </Card>

    </div>
  );
}

function Dot({ tone }: { tone: Tone | "slate" }) {
  const classes = { lav: "bg-lav-500", mint: "bg-mint-200", peach: "bg-peach-200", slate: "bg-ink-soft" };
  return <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${classes[tone]}`} />;
}
