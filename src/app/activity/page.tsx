"use client";

import { useState } from "react";
import { Footprints } from "lucide-react";
import { DailyStepEditor } from "@/components/activity/DailyStepEditor";
import { Card } from "@/components/ui/Card";
import { HelpPopover } from "@/components/ui/HelpPopover";
import { addDays, todayKey } from "@/utility/dates";


export default function ActivityPage() {
  const [date, setDate] = useState(todayKey());
  const [busy, setBusy] = useState(false);
  return <div className="grid gap-4">
    <Card tone="mint">
      <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-xl font-extrabold"><Footprints aria-hidden className="h-5 w-5" /> Daily steps</h2><HelpPopover title="Daily steps"><p>Add a daily total from your phone, watch, or your own count. Entries are manual; devices do not sync automatically.</p></HelpPopover></div>
      <label className="mt-4 grid gap-2 text-sm font-bold">Date<input type="date" className="input" disabled={busy} value={date} min={addDays(todayKey(), -365)} max={todayKey()} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label>
    </Card>
    <DailyStepEditor key={date} date={date} onBusyChange={setBusy} />
  </div>;
}
