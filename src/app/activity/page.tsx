"use client";

import { useEffect, useRef, useState } from "react";
import { Footprints, LoaderCircle } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { HelpHeading, HelpPopover } from "@/components/ui/HelpPopover";
import { addDays, todayKey } from "@/utility/dates";
import { validateDailySteps } from "@/utility/dailySteps";
import { estimateWalkingEnergy, supportsWalkingEnergyEstimate } from "@/utility/walkingEnergy";
import { clearDraft, createDraftEnvelope, readDraft, writeDraft } from "@/services/draftStore";

type StepDraft = { steps: string; minutes: string; revision: number };

export default function ActivityPage() {
  const [date, setDate] = useState(todayKey());
  return <div className="grid gap-4">
    <Card tone="mint">
      <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-xl font-extrabold"><Footprints aria-hidden className="h-5 w-5" /> Daily steps</h2><HelpPopover title="Daily steps"><p>Add a daily total from your phone, watch, or your own count. Entries are manual; devices do not sync automatically.</p></HelpPopover></div>
      <label className="mt-4 grid gap-2 text-sm font-bold">Date<input type="date" className="input" value={date} min={addDays(todayKey(), -365)} max={todayKey()} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label>
    </Card>
    <StepEditor key={date} date={date} />
  </div>;
}

function StepEditor({ date }: { date: string }) {
  const { snapshot, actions, error } = useApp();
  const entry = snapshot.dailySteps.find((candidate) => candidate.date === date);
  const draftType = `daily-steps:${date}`;
  const [draft, setDraft] = useState<StepDraft>({ steps: entry ? String(entry.steps) : "", minutes: entry?.walkingMinutes === undefined ? "" : String(entry.walkingMinutes), revision: entry?.revision ?? 0 });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);
  const lastAttempt = useRef<string | null>(null);


  useEffect(() => {
    let active = true;
    void readDraft<StepDraft>(snapshot.userId, draftType).then((stored) => {
      if (!active) return;
      if (stored && typeof stored.payload.steps === "string" && typeof stored.payload.minutes === "string" && Number.isInteger(stored.payload.revision)) {
        setDraft(stored.payload);
        setMessage("Your unfinished step entry was restored.");
      }
      setReady(true);
    });
    return () => { active = false; };
  }, [snapshot.userId, draftType]);

  useEffect(() => {
    if (!ready || saved || saving) return;
    void writeDraft(createDraftEnvelope({ userId: snapshot.userId, draftType, payload: draft, ttlMs: 7 * 86400000 }));
  }, [draft, draftType, ready, saved, saving, snapshot.userId]);

  function change(field: "steps" | "minutes", value: string) {
    setSaved(false);
    setMessage(null);
    setDraft((current) => ({ ...current, revision: saved ? entry?.revision ?? 0 : current.revision, [field]: value }));
  }

  async function save(reapply = false) {
    if (busy.current || !ready) return;
    const steps = draft.steps.trim() ? Number(draft.steps) : Number.NaN;
    const minutes = draft.minutes.trim() ? Number(draft.minutes) : undefined;
    const invalid = validateDailySteps(date, steps, minutes);
    if (invalid) { setMessage(invalid); return; }
    busy.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const revision = reapply || saved ? entry?.revision ?? 0 : draft.revision;
      const signature = JSON.stringify({ steps, minutes, revision });
      const retry = error?.retryable && lastAttempt.current === signature;
      lastAttempt.current = signature;
      const confirmed = retry ? await actions.retryLast() : await actions.saveDailySteps(date, steps, minutes, revision);
      if (confirmed) {
        setSaved(true);
        setDraft((current) => ({ ...current, revision: revision + 1 }));
        await clearDraft(snapshot.userId, draftType);
        setMessage("Steps saved to your account.");
      }
    } finally { busy.current = false; setSaving(false); }
  }

  async function remove() {
    if (!entry || busy.current) return;
    lastAttempt.current = null;
    busy.current = true;
    setSaving(true);
    try {
      if (await actions.deleteDailySteps(date, entry.revision)) {
        setSaved(true);
        setDraft({ steps: "", minutes: "", revision: 0 });
        await clearDraft(snapshot.userId, draftType);
        setMessage("Entry removed. This day is unlogged again.");
      }
    } finally { busy.current = false; setSaving(false); }
  }

  const estimateSupported = supportsWalkingEnergyEstimate(snapshot.profile);
  const estimate = estimateSupported && snapshot.profile && entry
    ? estimateWalkingEnergy(snapshot.profile.weightKg, entry.walkingMinutes) : null;
  return <>
    <Card>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label className="grid gap-2 text-sm font-bold">Steps<input className="input" inputMode="numeric" value={draft.steps} onChange={(event) => change("steps", event.target.value)} disabled={!ready || saving} placeholder="e.g. 6500" /></label>
        <div className="grid gap-2"><div className="flex items-center justify-between gap-2"><label htmlFor="walking-minutes" className="text-sm font-bold">Walking minutes (optional)</label><HelpPopover title="Walking minutes"><p>Use time spent walking, excluding workouts. Steps alone cannot tell us walking speed or energy use. Leave blank if unknown; zero records no walking time.</p></HelpPopover></div><input id="walking-minutes" className="input" inputMode="numeric" value={draft.minutes} onChange={(event) => change("minutes", event.target.value)} disabled={!ready || saving} placeholder="Leave blank if unknown" /></div>
        {message ? <p role="status" className="text-sm font-semibold text-ink-soft">{message}</p> : null}
        {error?.code === "stale_version" ? <div role="alert" className="rounded-2xl bg-peach-100 p-3 text-sm font-semibold">
          <p>This date was changed elsewhere. Saved total: {entry ? `${entry.steps.toLocaleString()} steps` : "unlogged"}. Your draft is retained.</p>
          <Button variant="soft" className="mt-2" disabled={saving} onClick={() => void save(true)}>Reapply my draft</Button>
        </div> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="flex-1" disabled={!ready || saving} aria-busy={saving}>{saving ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> Saving…</> : "Save steps"}</Button>
          {entry ? <Button variant="ghost" disabled={saving} onClick={() => void remove()}>Remove entry</Button> : null}
        </div>
      </form>
    </Card>
    <Card tone="mint">
      <h2 className="font-extrabold">{entry ? `${entry.steps.toLocaleString()} steps saved` : "No steps logged for this date"}</h2>
      <HelpHeading title="Walking energy"><p>{estimate?.assumption ?? "Walking energy uses walking time and profile weight, with an adult reference for ages 19–59."}</p><p>Walking and workout estimates are separate. Your daily food target stays the same.</p><a href="https://pacompendium.com/walking/" target="_blank" rel="noreferrer">Walking estimate source</a></HelpHeading>
      <p className="text-xs font-semibold text-ink-soft">{estimate ? `Walking energy: roughly ${estimate.lowKcal}–${estimate.highKcal} kcal.` : !entry ? "Walking energy: not logged." : !estimateSupported ? "Walking energy estimate unavailable for this profile." : entry.walkingMinutes === 0 ? "Walking energy estimate unavailable for 0 walking minutes." : "Add walking minutes for an energy estimate."}</p>
    </Card>
  </>;
}
