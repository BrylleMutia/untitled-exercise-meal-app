"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { HelpPopover } from "@/components/ui/HelpPopover";
import { clearDraft, createDraftEnvelope, draftTtlMs, readDraft, writeDraft } from "@/services/draftStore";
import { validateDailyStepTarget } from "@/utility/dailySteps";

type TargetDraft = { value: string; revision: number };
const draftType = "daily-step-target";

export function DailyStepTargetSettings() {
  const { snapshot, actions, error, pendingMutation } = useApp();
  const [draft, setDraft] = useState<TargetDraft>(() => ({ value: snapshot.profile?.dailyStepTarget?.toString() ?? "", revision: snapshot.profile?.revision ?? 1 }));
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftUnavailable, setDraftUnavailable] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [refreshedForReapply, setRefreshedForReapply] = useState(false);
  const [awaitingRefresh, setAwaitingRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);
  const lastAttempt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void readDraft<TargetDraft>(snapshot.userId, draftType).then((stored) => {
      if (!active) return;
      if (stored && typeof stored.payload.value === "string" && Number.isInteger(stored.payload.revision) && stored.payload.revision >= 1) {
        setDraft(stored.payload);
        setDirty(true);
        setMessage("Your unfinished step target was restored.");
      }
      setReady(true);
    });
    return () => { active = false; };
  }, [snapshot.userId]);

  useEffect(() => {
    if (!ready || !dirty || saved || saving) return;
    void writeDraft(createDraftEnvelope({ userId: snapshot.userId, draftType, payload: draft, ttlMs: draftTtlMs(draftType) }))
      .then((stored) => setDraftUnavailable(!stored));
  }, [draft, dirty, ready, saved, saving, snapshot.userId]);

  async function save(target: number | null, reapply = false) {
    if (busy.current || !ready || pendingMutation) return;
    if (awaitingRefresh || (refreshedForReapply || attempted && error?.code === "stale_version") && !reapply) return;
    const invalid = validateDailyStepTarget(target);
    if (invalid) { setMessage(invalid); return; }
    busy.current = true;
    setSaving(true);
    setAttempted(true);
    setMessage(null);
    try {
      const revision = reapply || saved ? snapshot.profile?.revision ?? draft.revision : draft.revision;
      const signature = JSON.stringify({ target, revision });
      const retry = error?.retryable && lastAttempt.current === signature;
      lastAttempt.current = signature;
      const confirmed = retry ? await actions.retryLast() : await actions.setDailyStepTarget(target, revision);
      if (confirmed) {
        setSaved(true);
        setDirty(false);
        setAttempted(false);
        setRefreshedForReapply(false);
        setAwaitingRefresh(false);
        lastAttempt.current = null;
        setDraft({ value: target?.toString() ?? "", revision: revision + 1 });
        await clearDraft(snapshot.userId, draftType);
        setMessage(target === null ? "Daily step target removed." : "Daily step target saved to your account.");
      }
    } finally { busy.current = false; setSaving(false); }
  }

  const target = draft.value.trim() ? Number(draft.value) : null;
  const disabled = !ready || saving || refreshing || Boolean(pendingMutation);
  const stale = awaitingRefresh || refreshedForReapply || attempted && error?.code === "stale_version";
  return <Card id="daily-step-target" role="region" aria-labelledby="daily-step-target-heading">
    <div className="flex items-center justify-between gap-2"><h2 id="daily-step-target-heading" className="font-extrabold">Daily step target</h2><HelpPopover title="Daily step target"><p>Choose a target that suits your routine. You can change or remove it here. This preference does not change your workout plan or food targets.</p><p>Use a whole number from 1 to 200,000. This is a technical limit, not a recommendation. Leave blank for no target.</p></HelpPopover></div>
    <form className="mt-3 grid gap-3" onSubmit={(event) => { event.preventDefault(); void save(target); }}>
      <label className="sr-only" htmlFor="daily-step-target-input">Daily step target</label>
      <input id="daily-step-target-input" className="input" inputMode="numeric" value={draft.value} placeholder="Leave blank for no target" disabled={disabled}
        onChange={(event) => { setDraft({ value: event.target.value, revision: saved ? snapshot.profile?.revision ?? draft.revision : draft.revision }); setDirty(true); setSaved(false); setMessage(null); }} />
      {message ? <p role="status" className="text-sm font-semibold text-ink-soft">{message}</p> : null}
      {draftUnavailable ? <p role="status" className="text-sm font-semibold text-ink-soft">This browser could not store your draft. Keep this page open until your target is saved.</p> : null}
      {attempted && error && !stale ? <p role="alert" className="text-sm font-semibold text-ink-soft">{error.message} Your step target draft is retained.</p> : null}
      {stale ? <div role="alert" className="rounded-2xl bg-peach-100 p-3 text-sm font-semibold">
        <p>Your profile changed elsewhere. Saved step target: {snapshot.profile?.dailyStepTarget?.toLocaleString() ?? "Not set"}. Your draft is retained.</p>
        {awaitingRefresh || error?.details?.refreshedSnapshotAvailable === false ? <Button variant="soft" className="mt-2 mr-2" disabled={disabled} onClick={async () => {
          setAwaitingRefresh(true);
          setRefreshing(true);
          try { if (await actions.refreshSnapshot()) { setRefreshedForReapply(true); setAwaitingRefresh(false); } }
          finally { setRefreshing(false); }
        }}>{refreshing ? "Refreshing profile…" : "Retry loading saved profile"}</Button> : null}
        <Button variant="soft" className="mt-2" disabled={disabled || awaitingRefresh || error?.details?.refreshedSnapshotAvailable === false} onClick={() => void save(target, true)}>Reapply my step target</Button>
      </div> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={disabled || stale} aria-busy={saving}>{saving ? "Saving target…" : error?.retryable && attempted ? "Retry saving target" : "Save target"}</Button>
        {snapshot.profile?.dailyStepTarget !== undefined ? <Button variant="ghost" disabled={disabled || stale} onClick={() => { setDraft((current) => ({ ...current, value: "" })); setDirty(true); setSaved(false); void save(null); }}>Remove target</Button> : null}
      </div>
    </form>
  </Card>;
}
