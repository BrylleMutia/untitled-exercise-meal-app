interface ProgressRingProps {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  trackClassName?: string;
  barClassName?: string;
  label: string;
  centerLabel: string;
  centerSub?: string;
}

/** Accessible circular progress with a text alternative via aria-label. */
export function ProgressRing({
  value,
  size = 96,
  stroke = 9,
  trackClassName = "text-white/70",
  barClassName = "text-lav-500",
  label,
  centerLabel,
  centerSub,
}: ProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className="relative grid place-items-center"
      role="img"
      aria-label={`${label}: ${Math.round(clamped * 100)}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          className={trackClassName}
          stroke="currentColor"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          className={barClassName}
          stroke="currentColor"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-lg font-extrabold tabular-nums leading-none">{centerLabel}</p>
          {centerSub ? (
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
              {centerSub}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
