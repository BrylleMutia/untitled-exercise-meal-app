"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/contexts/AppContext";
import { useCookingGroup } from "./useCookingGroup";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { CalendarDays } from "lucide-react";
import { WeekNavigator } from "@/components/WeekNavigator";
import { GroceryTotalAmount } from "@/components/GroceryTotalAmount";
import { CookingOverview } from "./GroupCookingSchedule";
import { GroupGrocery, asNutritionWeek } from "./GroupGrocery";
import { GenerationSummary, LastGenerated } from "./GenerationSummary";
import type { GroupGeneration, GroupWeek } from "@/types/cookingGroup";

type CookingSurface = { week?: GroupWeek; loading: boolean; error?: string; refresh: () => void; openOverview: (trigger: HTMLElement, assignmentId?: string) => void };
const CookingWeekContext = createContext<CookingSurface | undefined>(undefined);
export function useCookingSurface() { return useContext(CookingWeekContext); }
export function CookingOverviewButton({ disabled = false }: { disabled?: boolean }) {
  const cooking = useCookingSurface();
  return cooking?.week?.group ? <IconButton size="compact" label="Overview" tooltip="Overview" disabled={disabled} onClick={event => cooking.openOverview(event.currentTarget)}><CalendarDays className="h-5 w-5" aria-hidden /></IconButton> : null;
}
export function GenerationAttribution() {
  const week = useCookingSurface()?.week;
  const { snapshot } = useApp();
  return week?.generation?.memberIds.includes(snapshot.userId) ? <LastGenerated generation={week.generation} /> : null;
}

type SurfaceState = { connected: boolean; connectionKnown: boolean; sharedSaving: boolean };
type SurfaceProps = {
  weekOf: string;
  onWeekChange: (date: string) => void;
  kind: "nutrition" | "grocery";
  busy?: boolean;
  children: ReactNode | ((state: SurfaceState) => ReactNode);
};

export function CookingGroupSurface({ weekOf, onWeekChange, kind, busy = false, children }: SurfaceProps) {
  const { actions, pendingMutation, snapshot } = useApp();
  const group = useCookingGroup(weekOf);
  const week = group.data;
  const currentGroup = week?.group;
  const [sharedSaving, setSharedSaving] = useState(false);
  const [overview, setOverview] = useState<{ assignmentId?: string } | null>(null);
  const overviewFocus = useRef<HTMLElement | null>(null);
  function openOverview(trigger: HTMLElement, assignmentId?: string) { overviewFocus.current = trigger; setOverview({ assignmentId }); }
  useEffect(() => {
    const open = (event: Event) => openOverview(document.activeElement as HTMLElement, (event as CustomEvent<{ assignmentId: string }>).detail?.assignmentId);
    window.addEventListener("cali:open-cooking-group", open);
    return () => window.removeEventListener("cali:open-cooking-group", open);
  }, []);
  const [summaryFromOverview, setSummaryFromOverview] = useState(false);
  const [summary, setSummary] = useState<GroupGeneration | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [error, setError] = useState("");
  const notice = summary ?? week?.notices.find(item => !dismissed.includes(item.id));
  const locked = Boolean(pendingMutation) || busy || sharedSaving;
  const personal = typeof children === "function" ? children({ connected: Boolean(currentGroup), connectionKnown: Boolean(week), sharedSaving }) : children;

  async function closeNotice() {
    if (!notice) return;
    try {
      await actions.cookingGroupCommand({ action: "acknowledge", generationId: notice.id, idempotencyKey: `ack-${notice.id}` });
      setDismissed(ids => [...ids, notice.id]);
      setSummary(null);
      setSummaryFromOverview(false);
      group.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Acknowledgment failed. Retry when connected."); }
  }

  return <CookingWeekContext.Provider value={{ week, loading: group.loading, error: group.error, refresh: group.refresh, openOverview }}><div className="grid min-w-0 gap-4">
    {kind === "grocery" ? <Card tone="mint">
      <WeekNavigator weekOf={weekOf} onChange={onWeekChange} weekStartsOn={currentGroup?.weekStartsOn ?? snapshot.profile?.weekStartsOn ?? 0} disabled={locked} />
      {currentGroup && week ? <><p className="mt-3 break-words text-xs text-ink-soft">Shared with {currentGroup.members.map(member => member.name).join(", ")}</p><h2 className="mt-4 font-extrabold">Shared spending</h2><GroceryTotalAmount key={`${currentGroup.id}:${weekOf}`} groupId={currentGroup.id} week={asNutritionWeek(week)} disabled={locked || Boolean(group.error)} onRefresh={group.refresh} onSavingChange={setSharedSaving} /></> : null}
    </Card> : null}
    {kind === "nutrition" ? personal : null}
    {group.error ? <div role="alert" className="grid gap-2 rounded-xl bg-danger-100 p-3 text-danger-900"><p>Shared cooking could not be refreshed. Your daily meals, private groceries, and drafts are retained.</p><Button variant="soft" className="justify-self-start" disabled={locked} onClick={group.refresh}>Retry shared week</Button></div> : group.loading ? <p role="status">Checking shared cooking…</p> : null}
    {currentGroup && week && kind === "grocery" ? <section data-grocery-section aria-label="Shared grocery list" className="grid min-w-0 gap-4"><GroupGrocery key={`${currentGroup.id}:${weekOf}`} week={week} refresh={group.refresh} locked={locked || Boolean(group.error)} onSavingChange={setSharedSaving} />{week.generation ? <button className="min-h-11 justify-self-start text-left text-xs font-bold underline" disabled={locked} onClick={() => setSummary(week.generation)}>View generation summary</button> : null}</section> : null}
    {kind === "grocery" ? personal : null}
    {overview && kind === "nutrition" ? <CookingOverview week={week} loading={group.loading} error={group.error} disabled={locked} refresh={group.refresh} assignmentId={overview.assignmentId} returnFocus={overviewFocus} onClose={() => setOverview(null)} onSummary={() => { setSummaryFromOverview(true); setOverview(null); setSummary(week?.generation ?? null); }} /> : null}
    {error ? <p role="alert" className="rounded-xl bg-danger-100 p-3 text-danger-900">{error}</p> : null}
    {notice && week && !overview ? <GenerationSummary returnFocus={summaryFromOverview ? overviewFocus : undefined} generation={notice} week={week} onClose={() => void closeNotice()} /> : null}
  </div></CookingWeekContext.Provider>;
}
