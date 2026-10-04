import { calorieBudgetState, type CalorieBudgetInput } from "@/utility/calorieBudget";

type CalorieBudgetRingProps = CalorieBudgetInput & {
  size?: number;
};

/** A remaining-target display. An unlogged day is unknown, never zero intake. */
export function CalorieBudgetRing({ target, logged, status, estimated = false, size = 116 }: CalorieBudgetRingProps) {
  const { hasTarget, hasLogs, remaining, over, fraction, summary } = calorieBudgetState({ target, logged, status, estimated });
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="grid shrink-0 gap-1 text-center" role="img" aria-label={summary}>
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} stroke="currentColor" fill="none" className="text-white/70" />
          {remaining !== null ? (
            <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} stroke="currentColor" fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)} className="text-lav-500 transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none" />
          ) : null}
        </svg>
        <span className="absolute grid text-center">
          <strong className="text-lg font-extrabold tabular-nums">{remaining === null ? "—" : over ? "0" : estimated ? `≈${remaining}` : remaining}</strong>
          <span className="text-[10px] font-bold text-ink-soft">{hasTarget ? "kcal left" : "no target"}</span>
        </span>
      </div>
      <span className="max-w-32 text-[11px] font-semibold text-ink-soft">{over ? `≈${Math.round(logged - target!)} kcal above estimate` : hasLogs ? status === "partial" ? "Still logging" : "Daily estimate" : "Not logged"}</span>
    </div>
  );
}
