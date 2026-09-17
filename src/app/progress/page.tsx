"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { averages, dayStatus } from "@/utility/nutrition";
import { monthMatrix, sameMonth, startOfWeek, todayKey } from "@/utility/dates";
import type { Tone } from "@/components/progress/progressShared";
import { HistoryList, Sparkline } from "@/components/progress/progressShared";

export default function ProgressPage() {
  const { snapshot } = useApp();
  const today = todayKey();
  const [month] = useState(today);

  const completedSessions = snapshot.sessions.filter(
    (s) => s.status === "completed",
  );
  const weekOf = startOfWeek(today);
  const scheduled = snapshot.plan?.workouts.length ?? 0;
  const completedThisWeek = new Set(
    completedSessions
      .filter((s) => s.date >= weekOf && s.date <= today)
      .map((s) => `${s.plannedWorkoutId}:${s.date}`),
  ).size;

  const avgs = averages(snapshot.nutritionLogs);
  const weights = [...snapshot.weights].sort((a, b) => a.date.localeCompare(b.date));
  const firstWeight = weights[0];
  const lastWeight = weights[weights.length - 1];

  const grid = monthMatrix(month);
  const completedDates = new Set(completedSessions.map((s) => s.date));
  const nutritionDays = new Map(
    [...new Set(snapshot.nutritionLogs.map((l) => l.date))].map((d) => [
      d,
      dayStatus(snapshot.nutritionLogs, d),
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
            firstWeight && lastWeight
              ? `${lastWeight.weightKg.toFixed(1)} kg`
              : "—"
          }
          sub={
            firstWeight && lastWeight
              ? `${(lastWeight.weightKg - firstWeight.weightKg).toFixed(1)} kg since ${firstWeight.date} · your entries`
              : "log a weight to see trends"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-extrabold">Weight</h2>
          <p className="text-xs font-semibold text-muted">
            Trend lines describe your entries; they never replace the original
            value.
          </p>
          <div className="mt-4">
            <Sparkline
              points={weights.slice(-16).map((w) => w.weightKg)}
              ariaLabel="Weight trend sparkline"
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-muted">
            {weights.length} entries
            {firstWeight ? `, latest ${lastWeight?.weightKg.toFixed(1)} kg` : ""}.
          </p>
        </Card>

        <Card>
          <h2 className="font-extrabold">Calendar</h2>
          <p className="text-xs font-semibold text-muted">
            Workout completion counts scheduled days only — rest gaps are
            excluded, not counted as failures. Nutrition days are labeled
            complete, partial, or unlogged, never zero.
          </p>
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
              return (
                <div
                  key={day}
                  title={`${day} — workout ${hasWorkout ? "completed" : "no completed workout"}, nutrition ${
                    status ?? "unlogged"
                  }`}
                  className={`grid h-9 place-items-center rounded-lg text-xs font-bold tabular-nums ${
                    inMonth ? "bg-cream" : "opacity-25"
                  }`}
                >
                  <span className="relative">
                    {Number(day.slice(8, 10))}
                    <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5">
                      {hasWorkout ? <Dot tone="lav" /> : null}
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
            <span className="flex items-center gap-1"><Dot tone="mint" /> nutrition complete</span>
            <span className="flex items-center gap-1"><Dot tone="peach" /> nutrition partial</span>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="font-extrabold">Recent history</h2>
        <HistoryList />
      </Card>

      <p className="text-center text-[11px] font-semibold text-muted">
        Scheduled this week: {scheduled} session(s), completed {completedThisWeek}.
        Rest days are never red flags.
      </p>
    </div>
  );
}

function Dot({ tone }: { tone: Tone }) {
  const classes = { lav: "bg-lav-500", mint: "bg-mint-200", peach: "bg-peach-200" };
  return <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${classes[tone]}`} />;
}
