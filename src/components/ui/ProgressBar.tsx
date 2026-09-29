interface ProgressBarProps {
  label: string;
  value: number | null;
  target: number;
  unit: string;
  barClassName?: string;
  compact?: boolean;
}

export function ProgressBar({ label, value, target, unit, barClassName = "bg-ink", compact = false }: ProgressBarProps) {
  const pct = value !== null && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className={compact ? "min-w-0" : undefined}>
      <div className={compact ? "grid gap-0.5 text-xs font-bold" : "flex items-baseline justify-between text-xs font-bold"}>
        <span className="text-ink-soft">{label}</span>
        <span className="tabular-nums text-ink">
          {value === null ? "Not logged" : Math.round(value)}
          <span className="text-muted"> / {Math.round(target)}{unit}</span>
        </span>
      </div>
      <div
        className={`overflow-hidden rounded-full bg-white/70 ${compact ? "mt-1.5 h-1.5" : "mt-1 h-2"}`}
        role="progressbar"
        aria-label={label}
        aria-valuenow={value === null ? undefined : Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
        aria-valuetext={value === null ? "No entry logged" : undefined}
      >
        <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
