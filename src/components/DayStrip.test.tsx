import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DayStrip } from "./DayStrip";

afterEach(() => vi.useRealTimers());
describe("Local calendar day labels", () => {
  it("limits preview days without changing unrestricted callers", () => {
    const props = { weekOf: "2026-10-11", selected: "2026-10-14", onSelect: () => {} };
    const restricted = renderToStaticMarkup(<DayStrip {...props} availableDates={["2026-10-14", "2026-10-16"]} />);
    expect(restricted.match(/disabled=""/g)).toHaveLength(5);
    expect(renderToStaticMarkup(<DayStrip {...props} />)).not.toContain('disabled=""');
    expect(renderToStaticMarkup(<DayStrip {...props} availableDates={[]} />).match(/disabled=""/g)).toHaveLength(7);
  });
  it("keeps the compact week anchored independently of selection and distinguishes today", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 11, 30, 12));
    const html = renderToStaticMarkup(<DayStrip compact weekOf="2026-12-28" selected="2027-01-01" onSelect={() => {}} />);
    expect(html.match(/aria-pressed=/g)).toHaveLength(7);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Friday, January 1, 2027"');
    expect(html).toContain('aria-label="Monday, December 28, 2026"');
    expect(html).toContain('aria-current="date"');
    expect(html).toContain('>Today</span>');
    expect(html).not.toMatch(/>Dec<\/span>|>Jan<\/span>/);
    expect(html).toContain("bg-ink text-white");
    expect(html).toContain("min-h-11 min-w-11");
    const anchored = renderToStaticMarkup(<DayStrip compact weekOf="2026-12-28" selected="2027-01-15" onSelect={() => {}} />);
    expect(anchored).toContain('data-date="2026-12-28"');
    expect(anchored).not.toContain('data-date="2027-01-15"');
  });
  it("shows weekday, number and month in order, with a full selected-date label", () => {
    const html = renderToStaticMarkup(<DayStrip selected="2026-10-14" onSelect={() => {}} />);
    expect(html).toContain('aria-label="Wednesday, October 14, 2026"');
    const selected = html.slice(html.indexOf('aria-pressed="true"'), html.indexOf('</button>', html.indexOf('aria-pressed="true"')));
    expect(selected).toMatch(/Wed<\/span>[\s\S]*14[\s\S]*Oct<\/span>/);
  });
  it("uses each day's own month and year across a year boundary", () => {
    const html = renderToStaticMarkup(<DayStrip selected="2026-12-30" weekStartsOn={1} onSelect={() => {}} />);
    expect(html.match(/>Dec<\/span>/g)).toHaveLength(4);
    expect(html.match(/>Jan<\/span>/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Friday, January 1, 2027"');
  });
  it("retains today's indication, selected state, and disabled controls", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 14, 12));
    const html = renderToStaticMarkup(<DayStrip selected="2026-10-15" disabled onSelect={() => {}} />);
    expect(html).toContain('aria-label="Wednesday, October 14, 2026" aria-current="date"');
    expect(html.match(/disabled=""/g)).toHaveLength(7);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
});
