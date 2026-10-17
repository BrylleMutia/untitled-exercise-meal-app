import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { addDays, formatCompactWeekRange, formatFullDate, startOfWeek, todayKey } from "@/utility/dates";

import type { Weekday } from "@/types/domain";

export function WeekNavigator({ weekOf, onChange, disabled = false, weekStartsOn = 0 }: { weekStartsOn?: Weekday; weekOf: string; onChange: (week: string) => void; disabled?: boolean }) {
  return <div className="grid min-w-0 gap-3" role="group" aria-label="Choose a grocery week">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
        <Button variant="soft" className="!h-[44px] !min-h-[44px] !w-[44px] !p-0" aria-label="Previous grocery week" disabled={disabled} onClick={() => onChange(addDays(weekOf, -7))}><ChevronLeft className="h-4 w-4" aria-hidden /></Button>
        <Button variant="soft" className="!min-h-11 !px-3 text-xs" disabled={disabled} onClick={() => onChange(startOfWeek(todayKey(), weekStartsOn))}>This week</Button>
        <Button variant="soft" className="!h-[44px] !min-h-[44px] !w-[44px] !p-0" aria-label="Next grocery week" disabled={disabled} onClick={() => onChange(addDays(weekOf, 7))}><ChevronRight className="h-4 w-4" aria-hidden /></Button>
      </div>
      <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold">Jump to week
        <input type="date" className="input min-h-11 min-w-0 max-w-full !w-auto" aria-label="Jump to grocery week" value={weekOf} disabled={disabled}
          onChange={event => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onChange(startOfWeek(event.target.value, weekStartsOn)); }} />
      </label>
    </div>
    <p className="min-w-0 break-words font-extrabold" aria-live="polite" aria-atomic="true">
      <span aria-hidden>{formatCompactWeekRange(weekOf)} <span className="block text-xs font-semibold text-ink-soft">{weekOf.slice(0, 4)}{addDays(weekOf, 6).slice(0, 4) !== weekOf.slice(0, 4) ? `–${addDays(weekOf, 6).slice(0, 4)}` : ""}</span></span>
      <span className="sr-only">{formatFullDate(weekOf)} through {formatFullDate(addDays(weekOf, 6))}</span>
    </p>
  </div>;
}
