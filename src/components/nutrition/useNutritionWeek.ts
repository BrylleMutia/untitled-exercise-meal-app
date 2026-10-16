"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import type { NutritionWeekReadModel } from "@/types/backend";

export function useNutritionWeek(weekOf: string) {
  const { snapshot, actions } = useApp();
  const loader = useRef(actions.loadNutritionWeek);
  useEffect(() => { loader.current = actions.loadNutritionWeek; }, [actions.loadNutritionWeek]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; snapshot: typeof snapshot; data?: NutritionWeekReadModel; error?: string }>({ key: "", snapshot });
  const key = `${snapshot.userId}:${weekOf}`;
  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      try {
        const data = await loader.current(weekOf);
        if (active) setState({ key, snapshot, data });
      } catch (error) {
        if (active) setState(previous => ({ key, snapshot, data: previous.key === key ? previous.data : undefined,
          error: error instanceof Error ? error.message : "Weekly nutrition could not be loaded. Retry to refresh this week." }));
      }
    });
    return () => { active = false; };
  }, [weekOf, key, snapshot, attempt]);
  const current = state.key === key && state.snapshot === snapshot;
  return { data: state.key === key ? state.data : undefined, error: current ? state.error : undefined,
    loading: !current || !state.data && !state.error, refresh: () => { setState(previous => ({ ...previous, snapshot: { ...snapshot } })); setAttempt(value => value + 1); } };
}
