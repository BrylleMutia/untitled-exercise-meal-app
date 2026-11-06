import type { UnitSystem } from "@/types/domain";
import { cmToIn, inToCm, kgToLb, lbToKg } from "@/utility/health";

export type MeasurementKind = "height" | "weight";
export interface MeasurementBasis {
  displayValue: string;
  units: UnitSystem;
  metricValue: number;
}

export function measurementMetricValue(value: string, units: UnitSystem, kind: MeasurementKind, basis?: MeasurementBasis): number {
  if (!value.trim() || !Number.isFinite(Number(value))) return Number.NaN;
  // Display rounding must not alter the original measurement across unit switches.
  if (basis?.displayValue === value && basis.units === units && Number.isFinite(basis.metricValue)) return basis.metricValue;
  return units === "metric" ? Number(value) : kind === "height" ? inToCm(Number(value)) : lbToKg(Number(value));
}

export function convertMeasurement(value: string, from: UnitSystem, to: UnitSystem, kind: MeasurementKind, basis?: MeasurementBasis): { value: string; basis?: MeasurementBasis } {
  const metricValue = measurementMetricValue(value, from, kind, basis);
  if (!Number.isFinite(metricValue)) return { value };
  const converted = to === "metric" ? metricValue : kind === "height" ? cmToIn(metricValue) : kgToLb(metricValue);
  const displayValue = String(Math.round(converted * 10) / 10);
  return { value: displayValue, basis: { displayValue, units: to, metricValue } };
}

export function boundedRulerValue(value: number, min: number, max: number, step: number): number {
  return Math.min(max, Math.max(min, Number((Math.round(value / step) * step).toFixed(8))));
}

export function rulerKeyValue(key: string, value: number, min: number, max: number, step: number): number | null {
  if (key === "Home") return min;
  if (key === "End") return max;
  const direction = ({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 } as Record<string, number>)[key];
  return direction === undefined ? null : boundedRulerValue(value + direction * step, min, max, step);
}
