import { describe, expect, it } from "vitest";
import { boundedRulerValue, convertMeasurement, measurementMetricValue, rulerKeyValue } from "./measurementRuler";
import { cmToIn, kgToLb, validateProfileInput } from "./health";

describe("measurement ruler inputs", () => {
  it("bounds drag values and avoids floating point increments", () => {
    expect(boundedRulerValue(34.7, 35, 300, 0.1)).toBe(35);
    expect(boundedRulerValue(300.3, 35, 300, 0.1)).toBe(300);
    expect(rulerKeyValue("ArrowRight", 66.2, 35, 300, 0.1)).toBe(66.3);
    expect(rulerKeyValue("PageDown", 66.2, 35, 300, 0.1)).toBe(65.2);
    expect(rulerKeyValue("Home", 66.2, 35, 300, 0.1)).toBe(35);
    expect(rulerKeyValue("End", 66.2, 35, 300, 0.1)).toBe(300);
    expect(rulerKeyValue("Tab", 66.2, 35, 300, 0.1)).toBeNull();
  });

  it.each([120, 230, 178.37])("preserves height %s through repeated unit switches", metric => {
    let converted = convertMeasurement(String(metric), "metric", "imperial", "height");
    expect(measurementMetricValue(converted.value, "imperial", "height", converted.basis)).toBe(metric);
    for (let index = 0; index < 10; index++) {
      converted = convertMeasurement(converted.value, "imperial", "metric", "height", converted.basis);
      converted = convertMeasurement(converted.value, "metric", "imperial", "height", converted.basis);
    }
    expect(measurementMetricValue(converted.value, "imperial", "height", converted.basis)).toBe(metric);
    expect(validateProfileInput({ age: 30, sex: "female", heightCm: metric, weightKg: 70, daysPerWeek: 3, sessionMinutes: 30 })).toEqual([]);
  });

  it.each([35, 300, 66.27])("preserves weight %s through unit switches and honors subsequent edits", metric => {
    const converted = convertMeasurement(String(metric), "metric", "imperial", "weight");
    expect(measurementMetricValue(converted.value, "imperial", "weight", converted.basis)).toBe(metric);
    expect(convertMeasurement(converted.value, "imperial", "metric", "weight", converted.basis).basis?.metricValue).toBe(metric);
    expect(measurementMetricValue("100", "imperial", "weight", converted.basis)).toBeCloseTo(45.359237);
  });

  it("does not invent or clamp empty, partial, or invalid typed input", () => {
    for (const value of ["", " ", ".", "abc"]) {
      expect(convertMeasurement(value, "metric", "imperial", "weight")).toEqual({ value });
      expect(measurementMetricValue(value, "metric", "weight")).toBeNaN();
    }
    expect(measurementMetricValue("301", "metric", "weight")).toBe(301);
    expect(boundedRulerValue(cmToIn(230) + 1, cmToIn(120), cmToIn(230), 0.1)).toBe(cmToIn(230));
    expect(boundedRulerValue(0, kgToLb(35), kgToLb(300), 0.1)).toBe(kgToLb(35));
  });
});
