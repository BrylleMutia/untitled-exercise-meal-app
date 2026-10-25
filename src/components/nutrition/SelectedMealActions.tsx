import { Button } from "@/components/ui/Button";

export function SelectedMealActions({ pending, valid, canPlan, blocked, blockedId, onLog, onPlan, onChange }: {
  pending: boolean; valid: boolean; canPlan: boolean; blocked?: string; blockedId?: string;
  onLog: () => void; onPlan: () => void; onChange: () => void;
}) {
  return <div className="grid min-w-0 gap-2">
    {blocked ? <p id={blockedId} role="alert" className="text-xs font-semibold text-danger-900">{blocked}</p> : null}
    {!canPlan ? <p className="text-xs text-ink-soft">Set an eligible daily goal before adding meals to a plan. You can still log this meal.</p> : null}
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <Button className="min-w-0 !px-3 [overflow-wrap:anywhere]" disabled={pending || !valid} onClick={onLog}>{pending ? "Saving…" : "Log meal"}</Button>
      <Button variant="soft" className="min-w-0 !px-3 [overflow-wrap:anywhere]" disabled={pending || !valid || !canPlan} onClick={onPlan}>Add to plan</Button>
    </div>
    <Button variant="ghost" className="min-w-0 justify-self-start !px-1 text-xs" disabled={pending} onClick={onChange}>Change selection</Button>
  </div>;
}
