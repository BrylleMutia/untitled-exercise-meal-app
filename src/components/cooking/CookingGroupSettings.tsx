"use client";
import { useRef, useState } from "react";
import { Link2, LogOut, Users } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useCookingGroup } from "./useCookingGroup";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { startOfWeek, todayKey, weekdayNames } from "@/utility/dates";
import type { CookingGroup, GroupCommand, GroupCommandResult } from "@/types/cookingGroup";

export function CookingGroupSettings() {
  const { snapshot, actions, pendingMutation } = useApp();
  const group = useCookingGroup(startOfWeek(todayKey(), snapshot.profile?.weekStartsOn ?? 0));
  const [pin, setPin] = useState(""); const [invitation, setInvitation] = useState<{ pin: string; expiresAt: string } | null>(null);
  const [review, setReview] = useState<GroupCommandResult | null>(null); const [connected, setConnected] = useState<CookingGroup | null>(null);
  const [leaving, setLeaving] = useState(false); const [error, setError] = useState(""); const [day, setDay] = useState(snapshot.profile?.weekStartsOn ?? 0);
  const heading = useRef<HTMLHeadingElement>(null);
  const retryIntent = useRef<{ tag: string; key: string } | null>(null);
  const current = group.data?.group; const disabled = Boolean(pendingMutation) || group.loading;
  async function command(input: GroupCommand) {
    setError(""); try {
      let request = input;
      if ("idempotencyKey" in input) {
        const { idempotencyKey, ...intent } = input; const tag = JSON.stringify(intent);
        if (retryIntent.current?.tag !== tag) retryIntent.current = { tag, key: idempotencyKey };
        request = { ...input, idempotencyKey: retryIntent.current.key };
      }
      const result = await actions.cookingGroupCommand(request); retryIntent.current = null; group.refresh();
      if (input.action === "invite" && !result.pin) setError("The invitation was created, but its private PIN could not be recovered. Generate a new PIN to replace it.");
      return result;
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Connection unavailable. Retry when connected."); group.refresh(); return null; }
  }
  return <Card tone="lavender" id="cooking-group">
    <h2 ref={heading} tabIndex={-1} className="flex items-center gap-2 font-extrabold"><Users className="h-5 w-5" aria-hidden />Cooking group</h2>
    <p className="mt-2 text-sm text-ink-soft">Plan and shop together with up to six people. Connecting shares all current and future recipes and covers, planned meals, and a group grocery list. Saved recipe copies may remain after you leave. Your health details, actual food logs, and workouts stay private.</p>
    {group.loading ? <p role="status" className="mt-3 text-sm">Loading connection…</p> : null}
    {group.error ? <div role="alert" className="mt-3 text-danger-900"><p>{group.error}</p><Button variant="soft" onClick={group.refresh}>Retry connection</Button></div> : null}
    {current ? <>
      <ul className="mt-4 grid gap-2" aria-label="Cooking group members">{current.members.map(m => <li key={m.id} className="flex min-w-0 items-center gap-3 rounded-2xl bg-white/70 p-3"><span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lav-200 font-extrabold">{m.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 break-words font-bold">{m.name}{m.id === snapshot.userId ? " (you)" : ""}</span></li>)}</ul>
      <p className="mt-3 text-xs text-ink-soft">Week starts on {weekdayNames[current.weekStartsOn]}. Every member may generate plans and edit shared groceries.</p>
      <div className="mt-4 flex flex-wrap gap-2"><Button disabled={disabled || current.members.length >= 6} onClick={async () => { const result = await command({ action: "invite", idempotencyKey: crypto.randomUUID() }); if (result?.pin && result.expiresAt) setInvitation({ pin: result.pin, expiresAt: result.expiresAt }); }}><Link2 className="h-4 w-4" aria-hidden />Generate PIN</Button><Button variant="soft" disabled={disabled} onClick={() => setLeaving(true)}><LogOut className="h-4 w-4" aria-hidden />Leave group</Button></div>
      <section className="mt-5 border-t border-ink/10 pt-4" aria-label="Shared week preference"><label className="grid gap-2 text-sm font-bold">Propose start of week<select className="input" value={day} disabled={disabled} onChange={e => setDay(Number(e.target.value) as typeof day)}>{weekdayNames.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label><Button variant="soft" className="mt-2" disabled={disabled || day === current.weekStartsOn} onClick={() => void command({ action: "propose-week", day, groupRevision: current.revision, idempotencyKey: crypto.randomUUID() })}>Propose change</Button>
      <p className="mt-2 text-xs text-ink-soft">Everyone must approve before account calendars and shared weeks regroup. Dates and logged history stay intact.</p>
      {current.proposal ? <div className="mt-3 grid gap-2 rounded-2xl bg-white/70 p-3"><p className="text-sm font-bold">Proposed: {weekdayNames[current.proposal.day]} · {current.proposal.approvals.length}/{current.members.length} approved</p><div className="flex flex-wrap gap-2"><Button disabled={disabled || current.proposal.approvals.includes(snapshot.userId)} onClick={() => void command({ action: "vote-week", proposalId: current.proposal!.id, approve: true, groupRevision: current.revision, idempotencyKey: crypto.randomUUID() })}>Approve regrouping</Button><Button variant="soft" disabled={disabled} onClick={() => void command({ action: "vote-week", proposalId: current.proposal!.id, approve: false, groupRevision: current.revision, idempotencyKey: crypto.randomUUID() })}>Reject</Button></div></div> : null}</section>
    </> : !group.loading && !group.error ? <div className="mt-4 grid gap-4 md:grid-cols-2"><div><Button disabled={disabled} onClick={async () => { const result = await command({ action: "invite", idempotencyKey: crypto.randomUUID() }); if (result?.pin && result.expiresAt) setInvitation({ pin: result.pin, expiresAt: result.expiresAt }); }}><Link2 className="h-4 w-4" aria-hidden />Generate PIN</Button><p className="mt-2 text-xs text-ink-soft">Create a group and privately share a one-use PIN.</p></div><form className="grid gap-2" onSubmit={async e => { e.preventDefault(); const result = await command({ action: "inspect-pin", pin }); if (result) setReview(result); }}><label className="grid gap-1 text-sm font-bold">Connection PIN<input className="input uppercase" autoComplete="off" maxLength={6} pattern="[A-Za-z0-9]{6}" value={pin} onChange={e => setPin(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())} disabled={disabled} /></label><Button type="submit" variant="soft" disabled={disabled || pin.length !== 6}>Review connection</Button></form></div> : null}
    {invitation ? <div className="mt-4 rounded-2xl bg-white p-4" role="status"><p className="text-sm font-bold">Your connection PIN</p><p className="my-2 break-all text-3xl font-extrabold tracking-widest tabular-nums">{invitation.pin}</p><p className="text-xs text-ink-soft">One use · expires {new Date(invitation.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Share privately. Generating another PIN replaces this one.</p></div> : null}
    {error ? <p role="alert" className="mt-3 rounded-xl bg-danger-100 p-3 text-sm text-danger-900">{error}{error.includes("Start of week") ? <a href="#start-of-week" className="ml-2 inline-flex min-h-11 items-center font-bold underline">Review Start of week</a> : null}</p> : null}
    {review?.group ? <Modal open title="Connect cooking accounts" returnFocus={heading} onClose={() => setReview(null)} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="soft" disabled={disabled} onClick={() => setReview(null)}>Cancel</Button><Button disabled={disabled} onClick={async () => { const result = await command({ action: "join", pin, groupRevision: review.group!.revision, idempotencyKey: crypto.randomUUID() }); if (result?.group) { setReview(null); setPin(""); setConnected(result.group); } }}>Connect and share</Button></div>}><p className="font-bold">Join {review.inviter}&apos;s cooking group</p><p className="mt-2 text-sm">Week starts on {weekdayNames[review.group.weekStartsOn]}.</p><ul className="mt-3 grid gap-1">{review.group.members.map(m => <li key={m.id}>{m.name}</li>)}</ul><p className="mt-4 text-sm">Connecting shares all current and future personal recipes and covers with this group. Members can plan meals for you and edit the shared plan and groceries. Your existing personal plans and lists remain separate until you review a generation.</p><p className="mt-3 text-sm">Saved recipe copies may remain in members&apos; plans after you leave. Actual food logs, health details, and workout information stay private.</p>{error ? <p role="alert" className="mt-3 text-danger-900">{error}</p> : null}</Modal> : null}
    {connected ? <Modal open title="Accounts connected" returnFocus={heading} onClose={() => setConnected(null)} footer={<Button onClick={() => setConnected(null)}>Done</Button>}><p>Your cooking accounts are connected. Nutrition plans, shared recipes, and group groceries can now stay in sync.</p><ul className="mt-4 grid gap-2">{connected.members.map(m => <li key={m.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-lav-50 p-3 font-bold"><span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lav-200">{m.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 break-words">{m.name}</span></li>)}</ul></Modal> : null}
    {leaving && current ? <Modal open title="Leave cooking group" onClose={() => setLeaving(false)} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="soft" disabled={disabled} onClick={() => setLeaving(false)}>Cancel</Button><Button variant="danger" disabled={disabled} onClick={async () => { if (await command({ action: "leave", groupId: current.id, groupRevision: current.revision, idempotencyKey: crypto.randomUUID() })) { setLeaving(false); setInvitation(null); } }}>Leave group</Button></div>}><p>You will lose access to the shared list and live group recipes. Your saved assignments, recorded history, and retained recipe copies stay with your account. Shared spending will not be copied to your personal lists.</p>{error ? <p role="alert" className="text-danger-900">{error}</p> : null}</Modal> : null}
  </Card>;
}
