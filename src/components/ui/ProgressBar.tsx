interface ProgressBarProps {
  label: string;
  value: number;
  target: number;
  unit: string;
  barClassName?: string;
}

export function ProgressBar({ label, value, target, unit, barClassName = "bg-ink" }: ProgressBarProps) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs font-bold">
        <span className="text-ink-soft">{label}</span>
        <span className="tabular-nums text-ink">
          {Math.round(value)}
          <span className="text-muted"> / {Math.round(target)}{unit}</span>
        </span>
      </div>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full bg-white/70"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
      >
        <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
