"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { IconButton } from "@/components/ui/IconButton";
import { clientId } from "@/utility/mealLogging";
import type { DailyMealRow } from "@/utility/dailyMealRows";

export function LoggedMealAction({ row, disabled, onUndone }: {
  row: DailyMealRow; disabled: boolean; onUndone: () => void;
}) {
  const { actions, pendingMutation } = useApp();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const retry = useRef("");
  const locked = disabled || busy || Boolean(pendingMutation) || !row.log;
  async function undo() {
    if (locked || submitting.current || !row.log) return;
    submitting.current = true; setBusy(true); setFailed(false);
    retry.current ||= clientId("undo-meal-log");
    try {
      const remove = row.log.kind === "meal" ? actions.deleteLoggedMeal : actions.deleteNutrition;
      const saved = await remove(row.log.id, row.log.revision, retry.current);
      if (saved) onUndone();
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      submitting.current = false; setBusy(false);
    }
  }
  return <>
    <IconButton variant="ghost" size="compact" label={`Undo logged ${row.name}`} tooltip="Undo meal log" disabled={locked} aria-busy={busy} onClick={() => void undo()}>
      <span className="grid h-[32px] w-[32px] shrink-0 place-items-center rounded-full bg-mint-100"><Check className="h-4 w-4 text-ink" aria-hidden /></span>
    </IconButton>
    {failed ? <p role="alert" className="basis-full text-xs text-danger-900">The meal log could not be undone. Your saved log is retained; retry or refresh this day.</p> : null}
  </>;
}
