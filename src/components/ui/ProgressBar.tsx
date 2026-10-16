interface ProgressBarProps {
  label: string;
  value: number | null;
  target: number | null;
  unit: string;
  barClassName?: string;
  compact?: boolean;
  inlineHeader?: boolean;
  stackTarget?: boolean;
  precision?: 0 | 1;
  unavailableLabel?: string;
  valueNote?: string;
  showProgress?: boolean;
}

export function ProgressBar({ label, value, target, unit, barClassName = "bg-ink", compact = false, inlineHeader = false, stackTarget = false, precision = 0, unavailableLabel = "Not logged", valueNote, showProgress = true }: ProgressBarProps) {
  const pct = value !== null && target !== null && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const display = (amount: number) => Number(amount.toFixed(precision));
  return (
    <div className={stackTarget ? "grid min-w-0 grid-rows-[1fr_auto]" : compact ? "min-w-0" : undefined}>
      <div className={stackTarget ? "grid content-start gap-1 text-xs font-bold" : inlineHeader ? "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs font-bold" : compact ? "grid gap-0.5 text-xs font-bold" : "flex items-baseline justify-between text-xs font-bold"}>
        <span className="text-ink-soft">{label}</span>
        <span className={stackTarget ? "text-sm font-extrabold tabular-nums text-ink" : inlineHeader ? "ml-auto max-w-full text-right tabular-nums text-ink" : "tabular-nums text-ink"}>
          {value === null ? unavailableLabel : display(value)}
          {(inlineHeader || stackTarget) && value !== null ? unit : null}
          {valueNote ? <span className="text-ink-soft"> · {valueNote}</span> : null}
          {target !== null ? <span className={stackTarget ? "mt-1 block text-xs font-semibold text-ink-soft" : "text-muted"}>{stackTarget ? "of " : " / "}{display(target)}{unit}</span> : null}
        </span>
      </div>
      {showProgress && target !== null && target > 0 ? <div
        className={`overflow-hidden rounded-full bg-white/70 ${compact ? "mt-1.5 h-1.5" : "mt-1 h-2"}`}
        role="progressbar"
        aria-label={label}
        aria-valuenow={value === null ? undefined : display(value)}
        aria-valuemin={0}
        aria-valuemax={display(target)}
        aria-valuetext={value === null ? "No entry logged" : undefined}
      >
        <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${pct}%` }} />
      </div> : null}
    </div>
  );
}
