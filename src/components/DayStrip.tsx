import { formatFullDate, fromKey, todayKey, weekdayShort, startOfWeek, weekDates } from "@/utility/dates";
import type { Weekday } from "@/types/domain";

interface DayStripProps {
  selected: string;
  onSelect: (date: string) => void;
  disabled?: boolean;
  weekStartsOn?: Weekday;
}

/** Local-calendar week selector with full dates for assistive navigation. */
export function DayStrip({ selected, onSelect, disabled = false, weekStartsOn = 0 }: DayStripProps) {
  const today = todayKey();
  const days = weekDates(startOfWeek(selected, weekStartsOn));

  return (
    <div className="flex min-w-0 gap-1 overflow-x-auto p-1.5" role="group" aria-label="Choose a day">
      {days.map((key) => {
        const active = key === selected;
        const isToday = key === today;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(key)}
            aria-pressed={active}
            aria-label={formatFullDate(key)}
            aria-current={isToday ? "date" : undefined}
            className={`group flex min-h-11 min-w-11 shrink-0 flex-1 flex-col items-center rounded-xl border bg-white text-[11px] font-extrabold text-ink transition-colors disabled:opacity-50 motion-reduce:transition-none ${
              active ? "border-ink" : "border-white hover:border-blush-200"
            }`}
          >
            <span className={`w-full rounded-t-xl border-b border-dashed px-1 py-1 text-center font-normal uppercase transition-colors motion-reduce:transition-none ${active ? "border-white/40 bg-ink text-white" : "border-ink/20 bg-blush-100 text-ink-soft group-hover:bg-blush-200"}`}>{weekdayShort(key)}</span>
            <span className="mt-1 grid h-7 w-7 place-items-center rounded-full text-sm tabular-nums">
              {isToday && !active ? (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-lav-100 text-ink">
                  {fromKey(key).getDate()}
                </span>
              ) : (
                fromKey(key).getDate()
              )}
            </span>
            <span className="mt-0.5 mb-1.5 font-normal text-ink-soft">{fromKey(key).toLocaleDateString("en-US", { month: "short" })}</span>
          </button>
        );
      })}
    </div>
  );
}
