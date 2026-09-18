"use client";

import { Check, Dumbbell, Scale, UtensilsCrossed } from "lucide-react";
import { useAppOptional } from "@/contexts/AppContext";
import type { HistoryReadModel } from "@/types/backend";

export type Tone = "lav" | "mint" | "peach";

interface SparklineProps {
  points: number[];
  ariaLabel: string;
}

export function Sparkline({ points, ariaLabel }: SparklineProps) {
  const width = 280;
  const height = 80;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => [
    (i / Math.max(1, points.length - 1)) * width,
    height - 12 - ((p - min) / range) * (height - 24),
  ]);
  const path = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <path d={path} fill="none" strokeWidth={4} strokeLinecap="round" className="stroke-lav-500" />
      {coords.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === coords.length - 1 ? 5 : 3}
          className="fill-lav-500"
        />
      ))}
    </svg>
  );
}

/**
 * Accessible text alternative to the calendar history — summary lists every
 * session and nutrition day instead of hiding information in a graphic.
 */
export function HistoryList({ history }: { history?: HistoryReadModel | null }) {
  const app = useAppOptional();
  if (!app) return null;

  const rows = [
    ...(history?.sessions ?? app.snapshot.sessions).map((s) => ({
      date: s.date,
      icon: <Dumbbell className="h-4 w-4" aria-hidden />,
      label:
        s.status === "completed"
          ? "Workout completed"
          : s.status === "partial"
            ? "Workout partially logged"
            : "Workout abandoned",
        detail: `${"loggedExerciseCount" in s ? s.loggedExerciseCount : s.logs.length} exercises · planned vs actual kept separate`,
    })),
    ...(history?.nutritionLogs ?? app.snapshot.nutritionLogs).map((n) => ({
      date: n.date,
      icon: <UtensilsCrossed className="h-4 w-4" aria-hidden />,
      label: `Nutrition — ${n.slot}`,
      detail: `${n.foodId ?? n.customName ?? "entry"} · ${Math.round(n.calories)} kcal`,
    })),
    ...(history?.weights ?? app.snapshot.weights).map((w) => ({
      date: w.date,
      icon: <Scale className="h-4 w-4" aria-hidden />,
      label: "Weight entry",
      detail: `${w.weightKg.toFixed(1)} kg`,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);

  if (rows.length === 0) {
    return (
      <p className="mt-2 rounded-2xl bg-cream p-3 text-sm font-semibold text-muted">
        Nothing logged yet — your first completed workout or saved meal will
        appear here.
      </p>
    );
  }

  return (
    <ul className="mt-3 grid gap-1.5">
      {rows.map((row, i) => (
        <li key={`${row.date}-${i}`} className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white">
            {row.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {row.label}
              <span className="font-semibold text-muted"> · {row.date}</span>
            </p>
            <p className="truncate text-[11px] font-semibold text-muted">{row.detail}</p>
          </div>
          <Check className="h-4 w-4 shrink-0 text-mint-200" aria-hidden />
        </li>
      ))}
    </ul>
  );
}
