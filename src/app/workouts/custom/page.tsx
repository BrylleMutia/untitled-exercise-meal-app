"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import Link from "next/link";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HelpHeading, HelpPopover } from "@/components/ui/HelpPopover";
import { ExerciseIllustration } from "@/components/ExerciseIllustration";
import { EXERCISES, exerciseById } from "@/constants/exercises";
import { clearDraft, createDraftEnvelope, readDraft, writeDraft } from "@/services/draftStore";
import { customWorkoutMinutes, validateCustomWorkout } from "@/utility/customWorkouts";
import type { CustomMovement, CustomMovementLog, CustomWorkout, CustomWorkoutDefinition, CustomWorkoutSession } from "@/types/domain";

const newId = () => crypto.randomUUID();
type RoutineDraft = { id: string; version: number; definition: CustomWorkoutDefinition };
const movementDraftSchema = z.object({ id: z.string(), name: z.string(), exerciseId: z.string().optional(), sets: z.number(), reps: z.number().optional(), holdSeconds: z.number().optional(), restSeconds: z.number() });
const routineDraftSchema = z.object({ id: z.string(), version: z.number().int().nonnegative(), definition: z.object({ name: z.string(), movements: z.array(movementDraftSchema).max(24), estimatedMinutes: z.number().optional(), warmup: z.array(z.string()).optional(), cooldown: z.array(z.string()).optional(), safety: z.string().optional() }) });
const sessionDraftSchema = z.object({ revision: z.number().int().nonnegative(), actual: z.array(z.object({ movementId: z.string(), sets: z.number(), reps: z.number().optional(), holdSeconds: z.number().optional(), rpe: z.number().optional(), status: z.enum(["completed", "modified", "skipped"]), note: z.string().optional() })).max(24) });

export default function CustomWorkoutsPage() {
  const { snapshot, actions, pendingMutation } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const active = snapshot.customSessions.find((session) => session.status === "in_progress" || session.status === "paused");
  return <div className="grid gap-4">
    <Card tone="mint">
      <HelpHeading title="Your own routines" className="text-xl font-extrabold"><p>Save a routine for Pilates, strength, mobility, or another familiar activity. Catalog exercises use the existing guides; named movements are text-only and do not receive automatic progression.</p><p>Editing a routine keeps earlier sessions intact.</p></HelpHeading>
      <p className="mt-2 text-xs font-semibold text-ink-soft">Choose familiar movements. Stop for pain, dizziness, or unusual breathlessness.</p>
      <Link href="/workouts" className="inline-block min-h-11 py-3 text-sm font-bold underline">Back to weekly workouts</Link>
    </Card>
    {active ? <CustomSession key={active.id} session={active} /> : null}
    {editing !== null ? <RoutineEditor key={editing} routine={snapshot.customWorkouts.find((routine) => routine.id === editing)} onClose={() => setEditing(null)} /> : <Button onClick={() => setEditing("new")} disabled={Boolean(pendingMutation)}>Create a routine</Button>}
    {snapshot.customWorkouts.length === 0 && editing === null ? <p className="text-sm font-semibold text-muted">No routines saved yet. Start with a few familiar movements.</p> : null}
    {snapshot.customWorkouts.map((routine) => <Card key={routine.id}>
      <h3 className="font-extrabold">{routine.definition.name}</h3>
      <p className="mt-1 text-sm font-semibold text-muted">Version {routine.version} · about {routine.definition.estimatedMinutes ?? customWorkoutMinutes(routine.definition)} min · {routine.definition.movements.length} {routine.definition.movements.length === 1 ? "movement" : "movements"}</p>
      <div className="mt-3 flex flex-wrap gap-2"><Button disabled={Boolean(active || pendingMutation)} onClick={() => void actions.startCustomWorkout(routine.id, routine.version)}>Start routine</Button><Button variant="soft" disabled={Boolean(pendingMutation)} onClick={() => setEditing(routine.id)}>Edit routine</Button></div>
    </Card>)}
    <section aria-label="Custom workout history" className="grid gap-3">
      <h2 className="text-lg font-extrabold">Saved sessions</h2>
      {snapshot.customSessions.filter((session) => !["in_progress", "paused"].includes(session.status)).map((session) => <Card key={session.id}>
        <h3 className="font-extrabold">{session.planned.name} · {session.date}</h3>
        <p className="mt-1 text-sm font-semibold text-muted">{session.status} · routine version {session.workoutVersion}</p>
        <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-bold">Planned and recorded work</summary><ul className="grid gap-3">{session.planned.movements.map((movement) => {
          const actual = session.actual.find((entry) => entry.movementId === movement.id);
          return <li key={movement.id}><strong>{movement.name}</strong><p>Planned: {movement.sets} × {movement.reps !== undefined ? `${movement.reps} reps` : `${movement.holdSeconds}s hold`}</p><p>Recorded: {actual ? `${actual.status} · ${actual.sets} × ${actual.reps !== undefined ? `${actual.reps} reps` : `${actual.holdSeconds ?? 0}s hold`}${actual.rpe ? ` · RPE ${actual.rpe}` : ""}` : "Not logged"}</p>{actual?.note ? <p>{actual.note}</p> : null}</li>;
        })}</ul></details>
      </Card>)}
      {snapshot.customSessions.every((session) => ["in_progress", "paused"].includes(session.status)) ? <p className="text-sm font-semibold text-muted">Completed and partial sessions will appear here. Rest days need no entry.</p> : null}
    </section>
  </div>;
}

function RoutineEditor({ routine, onClose }: { routine?: CustomWorkout; onClose: () => void }) {
  const { snapshot, actions, error, pendingMutation } = useApp();
  const [draft, setDraft] = useState<RoutineDraft>(() => ({ id: routine?.id ?? newId(), version: routine?.version ?? 0, definition: routine?.definition ?? { name: "", movements: [] } }));
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState("text");
  const [movementName, setMovementName] = useState("");
  const [measure, setMeasure] = useState("reps");
  const lastAttempt = useRef<string | null>(null);
  const busy = useRef(false);
  const draftType = `custom-workout:${routine?.id ?? "new"}`;
  useEffect(() => {
    let active = true;
    void readDraft<RoutineDraft>(snapshot.userId, draftType).then((stored) => {
      if (!active) return;
      const parsed = routineDraftSchema.safeParse(stored?.payload);
      if (parsed.success) { setDraft(parsed.data); setMessage("Your routine draft was restored."); }
      setReady(true);
    });
    return () => { active = false; };
  }, [snapshot.userId, draftType]);
  useEffect(() => {
    if (ready && !pendingMutation) void writeDraft(createDraftEnvelope({ userId: snapshot.userId, draftType, payload: draft, ttlMs: 7 * 86400000 }));
  }, [draft, ready, pendingMutation, snapshot.userId, draftType]);
  const profile = snapshot.profile;
  const available = EXERCISES.filter((exercise) => exercise.equipment.every((item) => item === "none" || profile?.equipment.includes(item)) && exercise.difficulty <= (profile?.experience === "beginner" ? 2 : profile?.experience === "intermediate" ? 4 : 5));
  const update = (id: string, patch: Partial<CustomMovement>) => setDraft((current) => ({ ...current, definition: { ...current.definition, movements: current.definition.movements.map((movement) => movement.id === id ? { ...movement, ...patch } : movement) } }));
  function addMovement() {
    const exercise = exerciseById(selection);
    const name = exercise?.name ?? movementName.trim();
    if (!name) { setMessage("Name your movement first."); return; }
    const kind = exercise?.measure ?? measure;
    setDraft((current) => ({ ...current, definition: { ...current.definition, movements: [...current.definition.movements, { id: newId(), name, ...(exercise ? { exerciseId: exercise.id } : {}), sets: 2, restSeconds: 45, ...(kind === "reps" ? { reps: 6 } : { holdSeconds: 15 }) }] } }));
    setMovementName(""); setMessage(null);
  }
  async function save(reapply = false) {
    if (!profile || busy.current || pendingMutation) return;
    const invalid = validateCustomWorkout(draft.definition, profile);
    if (invalid) { setMessage(invalid); return; }
    const version = reapply ? snapshot.customWorkouts.find((item) => item.id === draft.id)?.version ?? 0 : draft.version;
    const signature = JSON.stringify({ ...draft, version });
    const retry = lastAttempt.current === signature && error?.retryable;
    lastAttempt.current = signature; busy.current = true;
    try {
      if (retry ? await actions.retryLast() : await actions.saveCustomWorkout(draft.id, version, draft.definition)) {
        setReady(false); await clearDraft(snapshot.userId, draftType); onClose();
      }
    } finally { busy.current = false; }
  }
  return <Card>
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <HelpHeading title={routine ? "Edit routine" : "Create routine"} className="text-lg font-extrabold"><p>Catalog movements include exercise guides. Named movements are text-only, with no automatic progression. Duration includes a 5-minute warm-up and 3-minute cooldown.</p><p>Saving changes creates the next routine version. Earlier sessions stay intact.</p></HelpHeading>
      <label className="grid gap-2 text-sm font-bold">Routine name<input className="input" maxLength={100} value={draft.definition.name} onChange={(event) => setDraft((current) => ({ ...current, definition: { ...current.definition, name: event.target.value } }))} disabled={Boolean(pendingMutation)} /></label>
      <fieldset disabled={Boolean(pendingMutation)} className="grid gap-3"><legend className="mb-2 font-bold">Add movement</legend>
        <label className="grid gap-2 text-sm font-bold">Movement source<select className="input" value={selection} onChange={(event) => setSelection(event.target.value)}><option value="text">My own named movement</option>{available.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select></label>
        {selection === "text" ? <><label className="grid gap-2 text-sm font-bold">Movement name<input className="input" maxLength={100} value={movementName} onChange={(event) => setMovementName(event.target.value)} /></label><label className="grid gap-2 text-sm font-bold">Measure<select className="input" value={measure} onChange={(event) => setMeasure(event.target.value)}><option value="reps">Reps</option><option value="hold">Hold time</option></select></label></> : null}
        <Button variant="soft" onClick={addMovement} disabled={draft.definition.movements.length >= 24}>Add movement</Button>
      </fieldset>
      {draft.definition.movements.map((movement, index) => <fieldset key={movement.id} disabled={Boolean(pendingMutation)} className="grid gap-3 rounded-2xl bg-paper p-3"><legend className="font-bold">{index + 1}. {movement.name}</legend>
        <div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-bold">Sets<input className="input" type="number" min={1} max={6} value={movement.sets} onChange={(event) => update(movement.id, { sets: Number(event.target.value) })} /></label><label className="grid gap-2 text-sm font-bold">{movement.reps !== undefined ? "Reps" : "Hold seconds"}<input className="input" type="number" min={movement.reps !== undefined ? 1 : 5} max={movement.reps !== undefined ? 50 : 120} value={movement.reps ?? movement.holdSeconds} onChange={(event) => update(movement.id, movement.reps !== undefined ? { reps: Number(event.target.value) } : { holdSeconds: Number(event.target.value) })} /></label></div>
        <label className="grid gap-2 text-sm font-bold">Rest seconds<input className="input" type="number" min={15} max={180} value={movement.restSeconds} onChange={(event) => update(movement.id, { restSeconds: Number(event.target.value) })} /></label>
        <div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={index === 0} onClick={() => setDraft((current) => { const movements = [...current.definition.movements]; [movements[index - 1], movements[index]] = [movements[index], movements[index - 1]]; return { ...current, definition: { ...current.definition, movements } }; })}>Move up</Button><Button variant="ghost" onClick={() => setDraft((current) => ({ ...current, definition: { ...current.definition, movements: current.definition.movements.filter((item) => item.id !== movement.id) } }))}>Remove movement</Button></div>
      </fieldset>)}
      <p className="text-sm font-semibold text-ink-soft">About {customWorkoutMinutes(draft.definition)} min · profile limit {profile?.sessionMinutes} min</p>
      {message ? <p role="status" className="text-sm font-bold">{message}</p> : null}
      {error?.code === "stale_version" ? <div role="alert"><p className="text-sm font-semibold">This routine changed elsewhere. Your draft is retained.</p><Button variant="soft" disabled={Boolean(pendingMutation)} onClick={() => void save(true)}>Save my draft as the next version</Button></div> : null}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={!ready || Boolean(pendingMutation)} aria-busy={Boolean(pendingMutation)}>{pendingMutation ? "Saving…" : "Save routine"}</Button><Button variant="ghost" disabled={Boolean(pendingMutation)} onClick={onClose}>Close editor</Button></div>
    </form>
  </Card>;
}

function CustomSession({ session }: { session: CustomWorkoutSession }) {
  const { snapshot, actions, pendingMutation, error } = useApp();
  const [actual, setActual] = useState(session.actual);
  const [revision, setRevision] = useState(session.revision);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const lastAttempt = useRef<string | null>(null);
  const busy = useRef(false);
  const draftType = `custom-session:${session.id}`;
  useEffect(() => {
    let active = true;
    void readDraft<{ actual: CustomMovementLog[]; revision: number }>(snapshot.userId, draftType).then((stored) => {
      if (!active) return;
      const parsed = sessionDraftSchema.safeParse(stored?.payload);
      if (parsed.success) { setActual(parsed.data.actual); setRevision(parsed.data.revision); setMessage("Your session draft was restored."); }
      setReady(true);
    });
    return () => { active = false; };
  }, [snapshot.userId, draftType]);
  useEffect(() => {
    if (ready && !pendingMutation) void writeDraft(createDraftEnvelope({ userId: snapshot.userId, draftType, payload: { actual, revision }, ttlMs: 7 * 86400000 }));
  }, [actual, revision, ready, pendingMutation, snapshot.userId, draftType]);
  const update = (movement: CustomMovement, patch: Partial<CustomMovementLog>) => {
    const entry = actual.find((item) => item.movementId === movement.id) ?? { movementId: movement.id, sets: movement.sets, ...(movement.reps !== undefined ? { reps: movement.reps } : { holdSeconds: movement.holdSeconds }), status: "modified" as const };
    setActual((current) => [...current.filter((item) => item.movementId !== movement.id), { ...entry, ...patch }]);
  };
  async function commit(status: CustomWorkoutSession["status"], reapply = false) {
    if (!ready || busy.current || pendingMutation) return;
    busy.current = true;
    const expected = reapply ? session.revision : revision;
    const signature = JSON.stringify({ actual, status, expected });
    const retry = lastAttempt.current === signature && error?.retryable;
    lastAttempt.current = signature;
    try {
      if (retry ? await actions.retryLast() : await actions.saveCustomSession({ ...session, actual, status, revision: expected })) {
        setRevision(expected + 1); setMessage("Session progress saved.");
        if (!["in_progress", "paused"].includes(status)) setReady(false);
        await clearDraft(snapshot.userId, draftType);
      }
    } finally { busy.current = false; }
  }
  const finishStatus = actual.length === session.planned.movements.length && actual.every((entry) => entry.status === "completed") ? "completed" : "partial";
  return <Card tone="peach">
    <div className="flex items-center justify-between gap-2"><h2 className="text-xl font-extrabold">{session.planned.name} · {session.status === "paused" ? "Paused" : "In progress"}</h2><HelpPopover title="Routine logging"><p>Record what happened, then save progress or finish. Unsaved changes are drafts.</p><p>RPE describes effort from 1 (very easy) to 10 (maximum). Named movements do not receive automatic progression.</p></HelpPopover></div>
    <p className="mt-2 text-xs font-semibold">Routine version {session.workoutVersion}</p>
    <p className="mt-2 text-sm font-semibold">Warm-up: {session.planned.warmup?.join(" · ")}</p>
    <div className="mt-4 grid gap-4">{session.planned.movements.map((movement) => {
      const entry = actual.find((item) => item.movementId === movement.id);
      const exercise = movement.exerciseId ? exerciseById(movement.exerciseId) : undefined;
      return <fieldset key={movement.id} disabled={Boolean(pendingMutation) || session.status === "paused"} className="grid gap-3 rounded-2xl bg-white/70 p-3"><legend className="font-extrabold">{movement.name}</legend>
        {exercise ? <div className="flex items-center gap-3"><ExerciseIllustration exercise={exercise} className="h-20 w-20" /><p className="text-xs font-semibold">{exercise.safety}</p></div> : <p className="text-xs font-semibold text-muted">Your named movement · text-only · no automatic progression</p>}
        <p className="text-sm font-bold">Planned {movement.sets} × {movement.reps !== undefined ? `${movement.reps} reps` : `${movement.holdSeconds}s hold`} · rest {movement.restSeconds}s</p>
        <div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-bold">Actual sets<input className="input" type="number" min={0} max={20} value={entry?.sets ?? movement.sets} onChange={(event) => update(movement, { sets: Number(event.target.value), status: "modified" })} /></label><label className="grid gap-2 text-sm font-bold">{movement.reps !== undefined ? "Actual reps" : "Actual hold seconds"}<input className="input" type="number" min={0} max={movement.reps !== undefined ? 500 : 3600} value={entry?.reps ?? entry?.holdSeconds ?? movement.reps ?? movement.holdSeconds} onChange={(event) => update(movement, { ...(movement.reps !== undefined ? { reps: Number(event.target.value) } : { holdSeconds: Number(event.target.value) }), status: "modified" })} /></label></div>
        <label className="grid gap-2 text-sm font-bold">RPE / effort (optional, 1–10)<input className="input" type="number" min={1} max={10} value={entry?.rpe ?? ""} onChange={(event) => update(movement, { rpe: event.target.value ? Number(event.target.value) : undefined })} /></label>
        <label className="grid gap-2 text-sm font-bold">Note (optional)<input className="input" maxLength={500} value={entry?.note ?? ""} onChange={(event) => update(movement, { note: event.target.value })} /></label>
        <div className="flex flex-wrap gap-2"><Button variant={entry?.status === "completed" ? "primary" : "soft"} aria-pressed={entry?.status === "completed"} onClick={() => update(movement, { status: "completed" })}>Mark complete</Button><Button variant="ghost" aria-pressed={entry?.status === "skipped"} onClick={() => update(movement, { status: "skipped", sets: 0, ...(movement.reps !== undefined ? { reps: 0 } : { holdSeconds: 0 }) })}>Skip movement</Button></div>
        <p className="text-xs font-bold">{entry ? `${entry.status} · draft until saved` : "Not recorded yet"}</p>
      </fieldset>;
    })}</div>
    <p className="mt-4 text-sm font-semibold">Cooldown: {session.planned.cooldown?.join(" · ")}</p><p className="mt-2 text-xs font-semibold">{session.planned.safety}</p>
    {message ? <p role="status" className="mt-3 text-sm font-bold">{message}</p> : null}
    {error?.code === "stale_version" ? <div role="alert" className="mt-3"><p className="text-sm">Saved progress changed elsewhere. Your draft is retained.</p><Button variant="soft" disabled={Boolean(pendingMutation)} onClick={() => void commit(session.status, true)}>Reapply my session draft</Button></div> : null}
    <div className="mt-4 flex flex-wrap gap-2"><Button disabled={!ready || Boolean(pendingMutation)} onClick={() => void commit(session.status === "paused" ? "in_progress" : "paused")}>{session.status === "paused" ? "Resume" : "Save progress & pause"}</Button><Button disabled={!ready || Boolean(pendingMutation) || actual.length === 0} onClick={() => void commit(session.status)}>Save progress</Button><Button disabled={!ready || Boolean(pendingMutation) || actual.length === 0} onClick={() => void commit(finishStatus)}>Finish {finishStatus === "partial" ? "partial session" : "workout"}</Button><Button variant="ghost" disabled={!ready || Boolean(pendingMutation)} onClick={() => void commit("abandoned")}>End without completing</Button></div>
  </Card>;
}
