"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { createClient } from "@/lib/supabase/client";
import type { GroupWeek } from "@/types/cookingGroup";

let accountRefresh: Promise<boolean> | null = null;

export function useCookingGroup(weekOf: string) {
  const { snapshot, actions } = useApp();
  const [state, setState] = useState<{ key: string; data?: GroupWeek; error?: string }>({ key: "" });
  const [attempt, setAttempt] = useState(0);
  const key = `${snapshot.userId}:${weekOf}`;
  const refresh = useCallback(() => setAttempt(n => n + 1), []);
  const load = useRef(actions.loadCookingGroupWeek);
  useEffect(() => { load.current = actions.loadCookingGroupWeek; }, [actions.loadCookingGroupWeek]);
  useEffect(() => {
    if (!snapshot.userId || !snapshot.onboarded) return;
    let active = true;
    void load.current(weekOf).then(data => { if (active) setState({ key, data }); }).catch(error => { if (active) setState(previous => ({ key, data: previous.key === key ? previous.data : undefined, error: error.message })); });
    return () => { active = false; };
  }, [snapshot, key, weekOf, attempt]);
  const groupId = state.key === key ? state.data?.group?.id : undefined;
  useEffect(() => {
    if (groupId) return;
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, [groupId, refresh]);
  useEffect(() => {
    if (!groupId) return;
    const changed = () => {
      refresh();
      // Also refresh canonical personal projections and confirmed calendar changes.
      if (!accountRefresh) accountRefresh = actions.refreshSnapshot({ silent: true }).finally(() => { accountRefresh = null; });
    };
    const client = createClient();
    const channel = client.channel(`cooking:${groupId}`, { config: { private: true } }).on("broadcast", { event: "changed" }, changed).subscribe(status => { if (status === "SUBSCRIBED") changed(); });
    const visibleRefresh = () => { if (document.visibilityState === "visible") changed(); };
    window.addEventListener("focus", visibleRefresh); window.addEventListener("online", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    const timer = setInterval(visibleRefresh, 30000);
    return () => { clearInterval(timer); window.removeEventListener("focus", visibleRefresh); window.removeEventListener("online", visibleRefresh); document.removeEventListener("visibilitychange", visibleRefresh); void client.removeChannel(channel); };
  }, [groupId, refresh, actions]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, loading: state.key !== key, refresh };
}
