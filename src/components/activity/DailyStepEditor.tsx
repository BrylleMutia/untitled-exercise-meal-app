"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { LoaderCircle } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { HelpHeading, HelpPopover } from "@/components/ui/HelpPopover";
import { Modal } from "@/components/ui/Modal";
import { nutritionMetricStyles } from "@/components/ui/nutritionMetrics";
import { validateDailySteps } from "@/utility/dailySteps";
import { formatFullDate } from "@/utility/dates";
import { estimateWalkingEnergy, supportsWalkingEnergyEstimate } from "@/utility/walkingEnergy";
import { clearDraft, createDraftEnvelope, readDraft, writeDraft } from "@/services/draftStore";
import { queueStepDraftTask, waitForStepDraftTasks } from "@/services/stepDraftQueue";

type StepDraft = { steps: string; minutes: string; revision: number };
export function DailyStepEditor({ date, onClose, returnFocus, onBusyChange }: {
  date: string; onClose?: () => void; returnFocus?: RefObject<HTMLElement | null>; onBusyChange?: (busy: boolean) => void;
}) {
  const { snapshot, actions, error, pendingMutation } = useApp();
  const entry = snapshot.dailySteps.find(candidate => candidate.date === date);
  const draftType = `daily-steps:${date}`, queueKey = `${snapshot.userId}:${draftType}`;
  const [draft, setDraft] = useState<StepDraft>({ steps: entry ? String(entry.steps) : "", minutes: entry?.walkingMinutes === undefined ? "" : String(entry.walkingMinutes), revision: entry?.revision ?? 0 });
  const draftRef = useRef(draft);
  const [ready, setReady] = useState(false), [saving, setSaving] = useState(false), [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const busy = useRef(false), saved = useRef(false), lastAttempt = useRef<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const formId = useId(), minutesId = useId();
  const locked = saving || Boolean(pendingMutation);
  useEffect(() => {
    let active = true;
    void waitForStepDraftTasks(queueKey).catch(() => {}).then(() => readDraft<StepDraft>(snapshot.userId, draftType)).then(stored => {
      if (!active) return;
      if (stored && typeof stored.payload.steps === "string" && typeof stored.payload.minutes === "string" && Number.isInteger(stored.payload.revision)) {
        draftRef.current = stored.payload; setDraft(stored.payload); setMessage("Your unfinished step entry was restored.");
      }
      setReady(true);
    });
    return () => { active = false; };
  }, [snapshot.userId, draftType, queueKey]);
  function change(name: "steps" | "minutes", value: string) {
    if (!ready || locked) return;
    const next = { ...draftRef.current, ...(saved.current ? { revision: entry?.revision ?? 0 } : {}), [name]: value };
    saved.current = false; draftRef.current = next; setDraft(next); setMessage(null); setInvalid(false); setFailed(false);
    void queueStepDraftTask(queueKey, async () => {
      const accepted = await writeDraft(createDraftEnvelope({ userId: snapshot.userId, draftType, payload: next, ttlMs: 7 * 86400000 }));
      if (!accepted) setMessage("Draft storage is unavailable. Keep this editor open until you save.");
    }).catch(() => setMessage("Draft storage is unavailable. Keep this editor open until you save."));
  }
  async function complete(next: StepDraft, text: string) {
    saved.current = true; draftRef.current = next; setDraft(next);
    await queueStepDraftTask(queueKey, () => clearDraft(snapshot.userId, draftType));
    setMessage(text); onClose?.();
  }
  async function save(reapply = false) {
    if (busy.current || !ready || locked) return;
    const steps = draft.steps.trim() ? Number(draft.steps) : NaN;
    const minutes = draft.minutes.trim() ? Number(draft.minutes) : undefined;
    const problem = validateDailySteps(date, steps, minutes);
    if (problem) { setMessage(problem); setInvalid(true); return; }
    busy.current = true; setSaving(true); onBusyChange?.(true); setMessage(null); setInvalid(false);
    try {
      const revision = reapply || saved.current ? entry?.revision ?? 0 : draft.revision;
      const signature = JSON.stringify({ steps, minutes, revision });
      const retry = failed && error?.retryable && lastAttempt.current === signature;
      lastAttempt.current = signature;
      const confirmed = retry ? await actions.retryLast() : await actions.saveDailySteps(date, steps, minutes, revision);
      setFailed(!confirmed);
      if (confirmed) await complete({ ...draft, revision: revision + 1 }, "Steps saved to your account.");
    } catch { setFailed(true); setMessage("Steps could not be saved. Your input is retained; retry saving."); }
    finally { busy.current = false; setSaving(false); onBusyChange?.(false); }
  }
  async function remove() {
    if (!entry || busy.current || locked) return;
    busy.current = true; setSaving(true); onBusyChange?.(true); setMessage(null);
    try {
      const signature = `remove:${date}:${entry.revision}`;
      const retry = failed && error?.retryable && lastAttempt.current === signature;
      lastAttempt.current = signature;
      const confirmed = retry ? await actions.retryLast() : await actions.deleteDailySteps(date, entry.revision);
      setFailed(!confirmed);
      if (confirmed) await complete({ steps: "", minutes: "", revision: 0 }, "Entry removed. This day is unlogged again.");
    } catch { setFailed(true); setMessage("The entry could not be removed. Retry or refresh this date."); }
    finally { busy.current = false; setSaving(false); onBusyChange?.(false); }
  }
  const supported = supportsWalkingEnergyEstimate(snapshot.profile);
  const estimate = supported && snapshot.profile && entry ? estimateWalkingEnergy(snapshot.profile.weightKg, entry.walkingMinutes) : null;
  const controls = <div className="flex min-w-0 flex-wrap justify-end gap-2">
    {entry ? <Button variant="danger" disabled={!ready || locked} onClick={() => void remove()}>Remove entry</Button> : null}
    {onClose ? <Button variant="soft" disabled={locked} onClick={onClose}>Cancel</Button> : null}
    <Button form={formId} type="submit" className="min-w-0 flex-1 sm:flex-none" disabled={!ready || locked} aria-busy={saving}>{saving ? <><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Saving…</> : "Save steps"}</Button>
  </div>;
  const form = <form id={formId} className="grid min-w-0 gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    <label className="grid gap-2 text-sm font-bold">Steps<input ref={field} className="input" inputMode="numeric" value={draft.steps} onChange={event => change("steps", event.target.value)} disabled={!ready || locked} placeholder="e.g. 6500" aria-invalid={invalid || undefined} /></label>
    <div className="grid gap-2"><div className="flex items-center justify-between gap-2"><label htmlFor={minutesId} className="text-sm font-bold">Walking minutes (optional)</label><HelpPopover title="Walking minutes"><p>Use time spent walking, excluding workouts. Steps alone cannot tell us walking speed or energy use. Leave blank if unknown; zero records no walking time.</p></HelpPopover></div><input id={minutesId} className="input" inputMode="numeric" value={draft.minutes} onChange={event => change("minutes", event.target.value)} disabled={!ready || locked} placeholder="Leave blank if unknown" /></div>
    {message ? <p role={invalid || failed ? "alert" : "status"} className={`text-sm font-semibold ${invalid || failed ? "text-danger-900" : "text-ink-soft"}`}>{message}</p> : null}
    {failed && error?.code === "stale_version" ? <div role="alert" className="rounded-2xl bg-danger-100 p-3 text-sm font-semibold text-danger-900"><p>This date was changed elsewhere. Saved total: {entry ? `${entry.steps.toLocaleString()} steps` : "unlogged"}. Your draft is retained.</p><Button variant="soft" className="mt-2" disabled={locked} onClick={() => void save(true)}>Reapply my draft</Button></div>
      : failed && !message ? <p role="alert" className="text-sm text-danger-900">The operation was not confirmed. Your input is retained; retry or refresh this date.</p> : null}
  </form>;
  const details = <div className="min-w-0"><h2 className="font-extrabold">{entry ? `${entry.steps.toLocaleString()} steps saved` : "No steps logged for this date"}</h2>
    <HelpHeading title="Walking energy"><p>{estimate?.assumption ?? "Walking energy uses walking time and profile weight, with an adult reference for ages 19–59."}</p><p>Walking and workout estimates are separate. Your daily food target stays the same.</p><a href="https://pacompendium.com/walking/" target="_blank" rel="noreferrer">Walking estimate source</a></HelpHeading>
    <p className={`w-fit max-w-full text-xs font-semibold text-ink ${estimate ? `rounded-full px-3 py-1 ${nutritionMetricStyles.calories.pill}` : ""}`}>{estimate ? `Walking energy: roughly ${estimate.lowKcal}–${estimate.highKcal} kcal.` : !entry ? "Walking energy: not logged." : !supported ? "Walking energy estimate unavailable for this profile." : entry.walkingMinutes === 0 ? "Walking energy estimate unavailable for 0 walking minutes." : "Add walking minutes for an energy estimate."}</p>
    {onClose ? <p className="mt-3 text-xs text-ink-soft">Entries are manual totals from your phone, watch, or your own count. Devices do not sync automatically.</p> : null}</div>;
  return onClose ? <Modal open title={entry ? "Edit steps" : "Add steps"} onClose={onClose} footer={controls} returnFocus={returnFocus} dismissalDisabled={locked}>
    <p className="mb-4 text-sm font-semibold">{formatFullDate(date)}</p>{form}<div className="mt-5 rounded-2xl bg-mint-50 p-4">{details}</div>
  </Modal> : <><Card>{form}<div className="mt-4">{controls}</div></Card><Card tone="mint">{details}</Card></>;
}
