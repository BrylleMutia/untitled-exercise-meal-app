import { fromKey, todayKey, weekdayShort } from "@/utility/dates";

interface DayStripProps {
  selected: string;
  onSelect: (date: string) => void;
}

/** Horizontal week selector used on nutrition/grocery screens. */
export function DayStrip({ selected, onSelect }: DayStripProps) {
  const today = todayKey();
  const mondayOffset = (fromKey(selected).getDay() + 6) % 7;
  const monday = fromKey(selected);
  monday.setDate(monday.getDate() - mondayOffset);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Choose a day">
      {days.map((key) => {
        const active = key === selected;
        const isToday = key === today;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-pressed={active}
            className={`flex min-w-12 flex-1 flex-col items-center rounded-2xl px-1 py-2 text-[11px] font-extrabold transition-colors ${
              active ? "bg-ink text-white" : "bg-white text-muted hover:bg-lav-50"
            }`}
          >
            <span className="uppercase">{weekdayShort(key)}</span>
            <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full text-sm tabular-nums">
              {isToday && !active ? (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-lav-100 text-ink">
                  {fromKey(key).getDate()}
                </span>
              ) : (
                fromKey(key).getDate()
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
