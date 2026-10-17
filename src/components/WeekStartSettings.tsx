"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { weekdayNames } from "@/utility/dates";
import type { Weekday } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function WeekStartSettings() {
  const { snapshot, actions, pendingMutation, error } = useApp();
  const profile = snapshot.profile;
  const [draft, setDraft] = useState<{ value: Weekday; revision: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const value = draft?.value ?? profile?.weekStartsOn ?? 0;
  return <Card id="start-of-week">
    <label htmlFor="week-start" className="font-extrabold">Start of week</label>
    <p id="week-start-description" className="mt-2 text-sm font-semibold text-ink-soft">Choose how calendars, meal plans, groceries, and weekly progress are grouped. Meals stay on their dates and logged history stays intact. Grocery edits stay together in the week containing their old start date.</p>
    <select id="week-start" className="input mt-3" aria-describedby="week-start-description" value={value} disabled={!profile || Boolean(pendingMutation)} onChange={event => { setDraft({ value: Number(event.target.value) as Weekday, revision: profile!.revision ?? 1 }); setSaved(false); }}>
      {weekdayNames.map((name, day) => <option key={name} value={day}>{name}</option>)}
    </select>
    <Button className="mt-3" disabled={!profile || refreshing || Boolean(pendingMutation) || value === profile.weekStartsOn || Boolean(attempted && error?.code === "stale_version")} onClick={async () => {
      setAttempted(true);
      if (await actions.setWeekStart(value, (draft && draft.revision > 0 ? draft.revision : profile!.revision) ?? 1)) { setDraft(null); setSaved(true); }
    }}>{pendingMutation === "set_week_start" ? "Regrouping weeks…" : "Save start of week"}</Button>
    {saved ? <p role="status" className="mt-3 text-sm font-semibold">Weeks regrouped. Review your grocery lists; custom items and edits were carried over once.</p> : null}
    {attempted && error && draft ? <div role="alert" className="mt-3 text-sm font-semibold"><p>{error.message} Your selection is retained.</p>{error.code === "stale_version" ? <Button variant="soft" className="mt-2" disabled={refreshing || Boolean(pendingMutation)} onClick={async () => {
      setRefreshing(true);
      try { if (await actions.refreshSnapshot()) { setDraft(current => current ? { ...current, revision: -1 } : current); setAttempted(false); actions.clearError(); } }
      finally { setRefreshing(false); }
    }}>{refreshing ? "Refreshing…" : "Refresh and review"}</Button> : null}</div> : null}
  </Card>;
}
