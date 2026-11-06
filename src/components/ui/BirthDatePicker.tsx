"use client";

import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { birthDateFromParts, changeBirthDatePart, daysInBirthMonth, type BirthDateParts } from "@/utility/birthDate";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Option = { value: number | null; label: string };

function wheelRowHeight(element: HTMLElement) {
  return element.querySelector<HTMLElement>('[role="option"]')?.getBoundingClientRect().height ?? 0;
}

function DateWheel({ label, value, options, onChange, disabled, invalid, describedBy }: {
  label: string; value: number | null; options: Option[]; onChange: (value: number | null) => void; disabled: boolean; invalid: boolean; describedBy?: string;
}) {
  const id = useId();
  const port = useRef<HTMLDivElement>(null);
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef({ text: "", time: 0 });
  const controlledScroll = useRef(false);
  const latest = useRef({ options, onChange, disabled });
  useLayoutEffect(() => { latest.current = { options, onChange, disabled }; });
  useLayoutEffect(() => {
    const element = port.current;
    if (!element) return;
    let frame = 0;
    function align() {
      if (!element) return;
      if (timer.current) clearTimeout(timer.current);
      const rowHeight = wheelRowHeight(element);
      if (!rowHeight) return;
      controlledScroll.current = true;
      element.scrollTop = selected * rowHeight;
      if (document.activeElement === element) element.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { controlledScroll.current = false; });
    }
    align();
    const observer = new ResizeObserver(align);
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [selected, options.length, disabled]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function choose(index: number) {
    if (!disabled) onChange(options[Math.max(0, Math.min(options.length - 1, index))].value);
  }
  return <div className="relative min-w-0">
    <span id={`${id}-label`} className="sr-only">{label}</span>
    <div ref={port} role="listbox" aria-labelledby={`${id}-label`} aria-describedby={describedBy}
      aria-activedescendant={`${id}-${selected}`} aria-disabled={disabled} aria-invalid={invalid} tabIndex={disabled ? -1 : 0}
      className={`birth-date-wheel min-w-0 snap-y snap-mandatory overscroll-contain rounded-xl text-center focus-visible:-outline-offset-4 ${disabled ? "cursor-not-allowed overflow-y-hidden" : "cursor-ns-resize overflow-y-auto"}`}
      onKeyDown={event => {
        if (disabled) return;
        const move = ({ ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10 } as Record<string, number>)[event.key];
        if (move !== undefined) { event.preventDefault(); input.current.text = ""; choose(selected + move); }
        else if (event.key === "Home" || event.key === "End") { event.preventDefault(); input.current.text = ""; choose(event.key === "Home" ? 1 : options.length - 1); }
        else if (/^[a-z0-9]$/i.test(event.key)) {
          event.preventDefault();
          const now = Date.now();
          input.current.text = now - input.current.time > 800 ? event.key : input.current.text + event.key;
          input.current.time = now;
          const found = options.findIndex(option => option.value !== null && option.label.toLowerCase().startsWith(input.current.text.toLowerCase()));
          if (found >= 0) choose(found);
        }
      }}
      onScroll={() => {
        if (controlledScroll.current || disabled) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const element = port.current;
          if (!element || latest.current.disabled) return;
          const rowHeight = wheelRowHeight(element);
          if (!rowHeight) return;
          const index = Math.max(0, Math.min(latest.current.options.length - 1, Math.round(element.scrollTop / rowHeight)));
          latest.current.onChange(latest.current.options[index].value);
        }, 140);
      }}>
      <div aria-hidden="true" className="birth-date-wheel-spacer" />
      {options.map((option, index) => <div key={option.value ?? "empty"} id={`${id}-${index}`} role="option" aria-selected={selected === index}
        className={`birth-date-wheel-option flex snap-center items-center justify-center tabular-nums ${selected === index ? "font-extrabold text-ink" : "font-semibold text-ink-soft"}`}
        onClick={() => { input.current.text = ""; choose(index); }}>{option.label}</div>)}
      <div aria-hidden="true" className="birth-date-wheel-spacer" />
    </div>
  </div>;
}

export function BirthDatePicker({ value, onChange, referenceDate, age, disabled = false, error, legacyAge }: {
  value: BirthDateParts; onChange: (value: BirthDateParts) => void; referenceDate: string; age: number | null;
  disabled?: boolean; error?: string; legacyAge?: number;
}) {
  const id = useId();
  const year = Number(referenceDate.slice(0, 4));
  const years = Array.from({ length: 102 }, (_, index) => ({ value: year - index, label: String(year - index) }));
  const columns: Array<{ field: keyof BirthDateParts; label: string; options: Option[] }> = [
    { field: "day", label: "Day", options: Array.from({ length: daysInBirthMonth(value.year, value.month) }, (_, index) => ({ value: index + 1, label: String(index + 1) })) },
    { field: "month", label: "Month", options: months.map((label, index) => ({ value: index + 1, label })) },
    { field: "year", label: "Year", options: years },
  ];
  return <fieldset disabled={disabled} className={`grid min-w-0 gap-1 ${disabled ? "opacity-50" : ""}`} aria-describedby={`${id}-status${error ? ` ${id}-error` : ""}`}>
    <legend className="mb-3 text-xs font-extrabold text-ink-soft">Birthday</legend>
    <div className="birth-date-picker relative -mx-0.5 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.75fr)]">
      <span aria-hidden="true" className="birth-date-selection pointer-events-none absolute inset-x-0 rounded-full bg-lav-50" />
      {columns.map(column => <DateWheel key={column.field} label={column.label} value={value[column.field]} disabled={disabled} invalid={Boolean(error)}
        options={[{ value: null, label: "—" }, ...column.options]}
        describedBy={error ? `${id}-error` : `${id}-status`}
        onChange={selected => onChange(changeBirthDatePart(value, column.field, selected))} />)}
    </div>
    <p id={`${id}-status`} role="status" className="text-center text-xs font-semibold text-ink-soft">
      {legacyAge !== undefined && !Object.values(value).some(part => part !== null)
        ? `Birthday not set · Saved age: ${legacyAge} years` : age !== null ? `Age: ${age} years`
        : value.day === null && value.month !== null && value.year !== null ? "Choose a valid day for this month and year."
        : birthDateFromParts(value) ? "Check your birthday." : "Select your day, month, and year."}
    </p>
    {error ? <p id={`${id}-error`} className="text-xs font-semibold text-danger-900">{error}</p> : null}
  </fieldset>;
}
