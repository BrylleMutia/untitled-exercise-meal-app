"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { addDays, formatCompactWeekRange, formatFullDate, startOfWeek, todayKey } from "@/utility/dates";

import type { Weekday } from "@/types/domain";

export function WeekNavigator({ weekOf, onChange, disabled = false, weekStartsOn = 0, context = "grocery" }: { weekStartsOn?: Weekday; weekOf: string; onChange: (week: string) => void; disabled?: boolean; context?: "grocery" | "group" }) {
  const toolbar = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLDivElement>(null);
  const range = useRef<HTMLParagraphElement>(null);
  const [wrapped, setWrapped] = useState(false);
  useEffect(() => {
    const measure = () => {
      if (navigation.current && range.current) setWrapped(range.current.getBoundingClientRect().top >= navigation.current.getBoundingClientRect().bottom);
    };
    const observer = new ResizeObserver(measure);
    for (const node of [toolbar.current, navigation.current, range.current]) if (node) observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  return <div className="grid min-w-0 gap-3" role="group" aria-label={`Choose a ${context} week`}>
    <div ref={toolbar} data-wrapped={wrapped} className="flex min-w-0 flex-wrap items-center justify-center gap-x-6 gap-y-2">
      <div ref={navigation} className={`flex min-w-0 max-w-full flex-[1_0_auto] flex-wrap items-center gap-1 ${wrapped ? "justify-center" : "justify-start"}`}>
        <Button variant="soft" className="!h-[44px] !min-h-[44px] !w-[44px] !p-0" aria-label={`Previous ${context} week`} disabled={disabled} onClick={() => onChange(addDays(weekOf, -7))}><ChevronLeft className="h-4 w-4" aria-hidden /></Button>
        <Button variant="soft" className="!min-h-11 !px-3 text-xs" disabled={disabled} onClick={() => onChange(startOfWeek(todayKey(), weekStartsOn))}>This week</Button>
        <Button variant="soft" className="!h-[44px] !min-h-[44px] !w-[44px] !p-0" aria-label={`Next ${context} week`} disabled={disabled} onClick={() => onChange(addDays(weekOf, 7))}><ChevronRight className="h-4 w-4" aria-hidden /></Button>
      </div>
    <p ref={range} className={`min-w-0 max-w-full flex-[1_0_auto] break-words font-extrabold ${wrapped ? "text-center" : "text-right"}`} aria-live="polite" aria-atomic="true">
      <span aria-hidden>{formatCompactWeekRange(weekOf)} <span className="block text-xs font-semibold text-ink-soft">{weekOf.slice(0, 4)}{addDays(weekOf, 6).slice(0, 4) !== weekOf.slice(0, 4) ? `–${addDays(weekOf, 6).slice(0, 4)}` : ""}</span></span>
      <span className="sr-only">{formatFullDate(weekOf)} through {formatFullDate(addDays(weekOf, 6))}</span>
    </p>
    </div>
  </div>;
}
