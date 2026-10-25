"use client";

import { useEffect, useRef } from "react";
import { formatFullDate, fromKey, todayKey, weekdayShort, startOfWeek, weekDates } from "@/utility/dates";
import type { Weekday } from "@/types/domain";

interface DayStripProps {
  selected: string;
  onSelect: (date: string) => void;
  disabled?: boolean;
  weekStartsOn?: Weekday;
  compact?: boolean;
  weekOf?: string;
}

const stripClassName = "flex min-w-0 gap-1 overflow-x-auto p-1.5";

function tileClassName(active: boolean, dashedUnselected = false) {
  return `group flex min-h-11 min-w-11 shrink-0 flex-1 flex-col items-center rounded-xl border bg-white text-[11px] font-extrabold text-ink transition-colors motion-reduce:transition-none ${
    active ? "border-solid border-ink" : dashedUnselected ? "border-dashed border-ink/50 hover:border-ink/60" : "border-white hover:border-blush-200"
  }`;
}

function DayTileContent({ date, active, isToday }: { date: string; active: boolean; isToday: boolean }) {
  return <>
    <span className={`w-full rounded-t-xl border-b border-dashed px-1 py-1 text-center font-normal uppercase transition-colors motion-reduce:transition-none ${active ? "border-white/40 bg-ink text-white" : "border-ink/20 bg-blush-100 text-ink-soft group-hover:bg-blush-200"}`}>{weekdayShort(date)}</span>
    <span className="mt-1 grid h-7 w-7 place-items-center rounded-full text-sm tabular-nums">
      {isToday && !active ? (
        <span className="grid h-7 w-7 place-items-center rounded-full bg-lav-100 text-ink">{fromKey(date).getDate()}</span>
      ) : fromKey(date).getDate()}
    </span>
    <span className="mt-0.5 mb-1.5 font-normal text-ink-soft">{fromKey(date).toLocaleDateString("en-US", { month: "short" })}</span>
  </>;
}

/** The displayed week is independent of selection, including an empty selection. */
export function DayCheckboxStrip({ weekOf, selectedDates, onToggle, disabled = false }: {
  weekOf: string;
  selectedDates: string[];
  onToggle: (date: string, checked: boolean) => void;
  disabled?: boolean;
}) {
  const today = todayKey();
  return <div className={stripClassName}>
    {weekDates(weekOf).map(date => {
      const active = selectedDates.includes(date);
      return <label key={date} className={`${tileClassName(active, true)} relative focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-lav-500 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
        <input type="checkbox" className="absolute inset-0 h-full w-full cursor-[inherit] opacity-0"
          aria-label={formatFullDate(date)} aria-current={date === today ? "date" : undefined}
          checked={active} disabled={disabled} onChange={event => onToggle(date, event.target.checked)} />
        <DayTileContent date={date} active={active} isToday={date === today} />
      </label>;
    })}
  </div>;
}

/** Local-calendar week selector with full dates for assistive navigation. */
export function DayStrip({ selected, onSelect, disabled = false, weekStartsOn = 0, compact = false, weekOf }: DayStripProps) {
  const today = todayKey();
  const anchor = weekOf ?? startOfWeek(selected, weekStartsOn);
  const days = weekDates(anchor);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!compact || !strip.current) return;
    const container = strip.current;
    // Only scroll this strip horizontally; scrollIntoView also moves the page.
    const reveal = () => {
      const tile = container.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!tile) return;
      const bounds = container.getBoundingClientRect(), item = tile.getBoundingClientRect();
      if (item.left < bounds.left + 6) container.scrollLeft += item.left - bounds.left - 6;
      else if (item.right > bounds.right - 6) container.scrollLeft += item.right - bounds.right + 6;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(container);
    container.querySelectorAll("button").forEach(tile => observer.observe(tile));
    document.fonts?.addEventListener("loadingdone", reveal);
    return () => { observer.disconnect(); document.fonts?.removeEventListener("loadingdone", reveal); };
  }, [compact, selected, anchor]);

  return (
    <div ref={strip} className={stripClassName} role="group" aria-label="Choose a day">
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
            data-date={key}
            className={`${compact ? `flex min-h-11 min-w-11 shrink-0 grow flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-extrabold transition-colors motion-reduce:transition-none ${active ? "border-ink bg-ink text-white" : "border-transparent bg-white/70 text-ink hover:bg-white"}` : tileClassName(active)} disabled:opacity-50`}
          >
            {compact ? <><span className="whitespace-nowrap font-semibold">{isToday ? "Today" : weekdayShort(key)}</span><span className="text-sm tabular-nums">{fromKey(key).getDate()}</span></> : <DayTileContent date={key} active={active} isToday={isToday} />}
          </button>
        );
      })}
    </div>
  );
}
