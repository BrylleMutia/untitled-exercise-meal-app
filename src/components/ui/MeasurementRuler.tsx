"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { boundedRulerValue, rulerKeyValue } from "@/utility/measurementRuler";

interface MeasurementRulerProps {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step?: number;
  defaultPosition: number;
  position?: number;
  tickInterval: number;
  disabled?: boolean;
  error?: string;
}

type Drag = { id: number; x: number; y: number; value: number; captured: boolean };

export function MeasurementRuler({ label, unit, value, onChange, min, max, step = 0.1, defaultPosition, position, tickInterval, disabled = false, error }: MeasurementRulerProps) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [editing, setEditing] = useState(false);
  const hasValue = value.trim() !== "" && Number.isFinite(Number(value));
  const displayValue = !editing && hasValue && !error ? String(Math.round(Number(value) * 10) / 10) : value;
  const numeric = hasValue ? position ?? Number(value) : defaultPosition;
  const current = Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : defaultPosition));
  const pixelsPerTick = 12;
  const centerTick = Math.floor(current / tickInterval);
  const ticks = Array.from({ length: 65 }, (_, index) => centerTick + index - 32);

  useEffect(() => {
    const element = track.current;
    return () => {
      const active = drag.current;
      drag.current = null;
      if (active && element?.hasPointerCapture(active.id)) element.releasePointerCapture(active.id);
    };
  }, [disabled, unit]);

  function stop(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.id !== event.pointerId || disabled) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (!active.captured) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) { stop(event); return; }
      if (Math.abs(dx) < Math.abs(dy) * 1.25) return;
      active.captured = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
    }
    event.preventDefault();
    onChange(String(boundedRulerValue(active.value - dx / pixelsPerTick * tickInterval, min, max, step)));
  }

  return <div className={`grid min-w-0 gap-1 ${disabled ? "opacity-50" : ""}`}>
    <label id={`${id}-label`} htmlFor={`${id}-value`} className="text-xs font-extrabold text-ink-soft">{label} ({unit})</label>
    <div className="flex min-h-11 items-center justify-center gap-1">
      <input id={`${id}-value`} aria-describedby={error ? `${id}-error` : undefined} aria-invalid={Boolean(error)}
        inputMode="decimal" autoComplete="off" disabled={disabled} value={displayValue} placeholder="—"
        onChange={event => onChange(event.target.value)} onFocus={event => { setEditing(true); event.target.select(); }} onBlur={() => setEditing(false)}
        className="min-h-11 min-w-0 max-w-full rounded-lg bg-transparent px-1 text-center text-2xl font-extrabold tabular-nums text-ink placeholder:text-ink-soft hover:bg-lav-50 disabled:cursor-not-allowed"
        style={{ width: `${Math.max(3, Math.min(displayValue.length + 1, 12))}ch` }} />
      <span aria-hidden="true" className="text-xs font-bold text-ink-soft">{unit}</span>
    </div>
    <div ref={track} role="slider" tabIndex={disabled ? -1 : 0} aria-label={`${label} ruler (${unit})`} aria-disabled={disabled}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={current}
      aria-valuetext={hasValue ? `${value} ${unit}` : "Not entered"} aria-invalid={Boolean(error)}
      aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
      className={`relative min-h-14 min-w-0 select-none rounded-lg bg-cream/60 ${disabled ? "cursor-not-allowed" : "cursor-ew-resize"}`}
      style={{ touchAction: "pan-y pinch-zoom" }}
      onKeyDown={event => {
        if (disabled) return;
        const next = rulerKeyValue(event.key, current, min, max, step);
        if (next === null) return;
        event.preventDefault();
        onChange(String(next));
      }}
      onPointerDown={event => {
        if (disabled || !event.isPrimary || event.button !== 0) return;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, value: current, captured: false };
      }} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={() => { drag.current = null; }}
      onPointerLeave={event => { if (!drag.current?.captured) stop(event); }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
        {ticks.map(tick => {
          const measurement = Number((tick * tickInterval).toFixed(6));
          if (measurement < min - 0.000001 || measurement > max + 0.000001) return null;
          const major = tick % 5 === 0;
          return <span key={tick} className="absolute top-2 flex -translate-x-1/2 flex-col items-center" style={{ left: `calc(50% + ${(measurement - current) / tickInterval * pixelsPerTick}px)` }}>
            <span className={`${major ? "h-6 bg-ink/40" : "h-3 bg-ink/25"} w-px`} />
            {major ? <span className="mt-1 text-[0.6875rem] font-semibold tabular-nums text-ink-soft">{measurement}</span> : null}
          </span>;
        })}
        <span className={`absolute bottom-5 left-1/2 top-0 w-0.5 -translate-x-1/2 bg-lav-500 ${hasValue ? "" : "opacity-40"}`}><span className="absolute -left-[3px] top-0 size-2 rounded-full bg-lav-500" /></span>
      </div>
    </div>
    <p id={`${id}-hint`} className="sr-only">Swipe left to increase or right to decrease. Use arrow keys to adjust, or type the value above.</p>
    {error ? <p id={`${id}-error`} className="text-xs font-semibold text-danger-900">{error}</p> : null}
  </div>;
}
