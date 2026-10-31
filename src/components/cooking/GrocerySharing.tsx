"use client";

import { createUuid } from "@/utility/uuid";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { GrocerySharingNotice } from "./GrocerySharingNotice";
import type { GroupCommand, GroupWeek } from "@/types/cookingGroup";

export function GrocerySharing({ week, locked, refresh, onSavingChange, presentation = "grocery", returnFocus }: { week: GroupWeek; locked: boolean; refresh: () => void; onSavingChange: (saving: boolean) => void; presentation?: "grocery" | "settings"; returnFocus?: RefObject<HTMLElement | null> }) {
  const { actions } = useApp();
  const [reviewing, setReviewing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState<number | null>(null);
  const [error, setError] = useState("");
  const request = useRef<GroupCommand | null>(null);
  const dismissal = useRef<GroupCommand | null>(null);
  const saving = useRef(false);
  const autoStarted = useRef(false);
  const focusAfterTransfer = useRef(false);
  const heading = useRef<HTMLElement>(null);
  const enableButton = useRef<HTMLButtonElement>(null);
  const status = week.grocerySharing;
  const group = week.group;
  const needsConsent = status?.status === "not-enabled";
  const showReview = Boolean(group && needsConsent && (reviewing || presentation === "grocery" && !status?.promptDismissed && !closed));

  const share = useCallback(async (manual = false) => {
    if (!group || locked || saving.current) return;
    if (manual) focusAfterTransfer.current = true;
    autoStarted.current = true;
    saving.current = true; setRunning(true); onSavingChange(true); setError("");
    try {
      let latest = status;
      if (request.current || needsConsent) {
        request.current ??= { action: "share-groceries", groupId: group.id, groupRevision: group.revision, acknowledged: true, idempotencyKey: createUuid() };
        latest = (await actions.cookingGroupCommand(request.current)).sharing;
        request.current = null;
      }
      setClosed(true); setReviewing(false);
      while (latest?.next) {
        request.current = { action: "transfer-grocery-week", groupId: group.id, ...latest.next, idempotencyKey: createUuid() };
        latest = (await actions.cookingGroupCommand(request.current)).sharing;
        request.current = null;
        setCompleted(latest?.completed ?? null);
      }
      if (!latest || latest.remaining !== 0) throw new Error("The transfer was not confirmed. Refresh and retry; saved weeks are retained.");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Transfer failed. Saved weeks and drafts are retained.";
      // Transient retries retain the exact failed intent; a new baseline needs review.
      if (/changed|stale|review/i.test(message)) request.current = null;
      setError(message);
    } finally { saving.current = false; setRunning(false); onSavingChange(false); refresh(); }
  }, [actions, group, locked, needsConsent, onSavingChange, refresh, status]);

  useEffect(() => {
    if (presentation === "grocery") heading.current = document.querySelector<HTMLElement>("[data-grocery-heading]");
  }, [presentation]);

  useEffect(() => {
    if (focusAfterTransfer.current && !running && status?.status === "enabled" && status.remaining === 0) {
      (presentation === "settings" ? returnFocus?.current ?? enableButton.current : heading.current)?.focus();
      focusAfterTransfer.current = false;
    }
  }, [presentation, returnFocus, running, status?.remaining, status?.status]);

  useEffect(() => {
    if (status?.status === "transferring" && !autoStarted.current && !locked) {
      autoStarted.current = true;
      void share();
    }
  }, [locked, share, status?.status]);

  async function dismiss() {
    if (!group || locked || saving.current) return;
    saving.current = true; setRunning(true); onSavingChange(true); setError("");
    try {
      dismissal.current ??= { action: "dismiss-grocery-sharing", groupId: group.id, groupRevision: group.revision, idempotencyKey: createUuid() };
      await actions.cookingGroupCommand(dismissal.current);
      dismissal.current = null; setClosed(true); setReviewing(false);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not save your choice. Retry when connected.";
      if (/changed|stale|review/i.test(message)) dismissal.current = null;
      setError(message);
    } finally { saving.current = false; setRunning(false); onSavingChange(false); refresh(); }
  }

  if (!group || !status || status.status === "disconnected") return null;
  return <>
    {presentation === "settings" && needsConsent ? <Button ref={enableButton} variant="soft" className="mt-3" disabled={locked || running} onClick={() => { setReviewing(true); setError(""); }}>Enable grocery sharing</Button> : null}
    {showReview ? <Modal open title="Share groceries with your group" returnFocus={presentation === "settings" ? returnFocus ?? enableButton : heading} dismissalDisabled={locked || running} onClose={() => void dismiss()} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="soft" disabled={locked || running} onClick={() => void dismiss()}>Not now</Button><Button disabled={locked || running} onClick={() => void share(true)}>{running ? "Saving…" : "Share groceries"}</Button></div>}>
      <p className="mb-3 break-words font-bold">Shared with {group.members.map(member => member.name).join(", ")}</p>
      <GrocerySharingNotice />
      {error ? <p role="alert" className="mt-3 break-words text-sm text-danger-900">{error}</p> : null}
    </Modal> : null}
    {!showReview && (running || status.status === "transferring" || error) ? <div className="min-w-0 text-sm" aria-label="Grocery transfer">
      <p role="status" aria-live="polite">{running ? `Sharing groceries… ${completed ?? status.completed} weeks completed.` : `${status.remaining} saved weeks left to share.`}</p>
      {error ? <p role="alert" className="mt-1 break-words text-danger-900">{error}</p> : null}
      {!running ? <Button variant="soft" className="mt-2" disabled={locked} onClick={() => void share(true)}>{error ? "Retry sharing groceries" : "Resume grocery transfer"}</Button> : null}
    </div> : null}
  </>;
}
