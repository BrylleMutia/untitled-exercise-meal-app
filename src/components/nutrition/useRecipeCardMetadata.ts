"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { todayKey } from "@/utility/dates";
import type { RecipeCardReadModel, SetRecipeFavoriteInput } from "@/types/backend";

export function useRecipeCardMetadata() {
  const { snapshot, actions } = useApp();
  const [date, setDate] = useState(todayKey);
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<{ userId: string; model: RecipeCardReadModel } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingMeal, setPendingMeal] = useState<string | null>(null);
  const request = useRef(0);
  const saving = useRef(false);
  const deferredRead = useRef(false);
  const retry = useRef<SetRecipeFavoriteInput | null>(null);
  const refresh = useCallback(() => setRefreshKey(value => value + 1), []);
  useEffect(() => {
    const update = () => { setDate(todayKey()); refresh(); };
    const timer = setInterval(() => setDate(todayKey()), 60_000);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("online", update); };
  }, [refresh]);
  useEffect(() => {
    if (saving.current) { deferredRead.current = true; return; }
    let active = true;
    const id = ++request.current;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      try {
        const model = await actions.loadRecipeCardMetadata(date);
        if (active && request.current === id) { setState({ userId: snapshot.userId, model }); setError(""); }
      } catch (reason) {
        if (active && request.current === id) setError(reason instanceof Error ? reason.message : "Favorites and Popular are unavailable. Retry when connected.");
      } finally { if (active && request.current === id) setLoading(false); }
    });
    return () => { active = false; };
  }, [actions, snapshot.userId, snapshot.savedMeals, snapshot.loggedMeals, snapshot.nutritionLogs, date, refreshKey]);
  const model = state?.userId === snapshot.userId && state.model.asOfDate === date ? state.model : null;
  const recipes = new Map(model?.recipes.map(item => [item.mealId, item]));
  async function favorite(mealId: string) {
    const metadata = recipes.get(mealId);
    if (!metadata || saving.current || loading || error) return;
    saving.current = true; setPendingMeal(mealId);
    // Invalidate in-flight reads; background refreshes cannot replace this write's response.
    ++request.current;
    const desired = !metadata.favorite;
    const previous = retry.current;
    const input = previous?.mealId === mealId && previous.favorite === desired && previous.expectedRevision === metadata.favoriteRevision && previous.asOfDate === date
      ? previous : { mealId, favorite: desired, expectedRevision: metadata.favoriteRevision, asOfDate: date, idempotencyKey: crypto.randomUUID() };
    retry.current = input;
    try {
      const result = await actions.setRecipeFavorite(input);
      setState({ userId: snapshot.userId, model: result }); setError("");
      retry.current = null;
      if (deferredRead.current) refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Favorite was not saved. Refresh and retry."); }
    finally { saving.current = false; deferredRead.current = false; setLoading(false); setPendingMeal(null); }
  }
  return { recipes, error, loading, pendingMeal, favorite, refresh, available: Boolean(model) && !loading && !error };
}
