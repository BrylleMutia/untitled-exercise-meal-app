"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { classifyGroceryName, groceryCategories, normalizeGroceryName, type GroceryCategoryDraft, type GroceryCategoryPreference } from "@/utility/groceryCategory";

export function GroceryCategoryField({ name, value, onChange, disabled, groupId, initialCategory, onResolve, refreshKey }: {
  name: string; value?: GroceryCategoryDraft; onChange: (value: GroceryCategoryDraft) => void;
  refreshKey?: number;
  onResolve?: (category: import("@/types/domain").GroceryCategory, nameKey: string) => void;
  disabled: boolean; groupId?: string; initialCategory?: import("@/types/domain").GroceryCategory;
}) {
  const { actions, snapshot, error } = useApp();
  const id = useId();
  const scope = `${snapshot.userId}:${groupId ?? "personal"}`;
  const loader = useRef(actions.loadGroceryCategoryPreferences);
  useEffect(() => { loader.current = actions.loadGroceryCategoryPreferences; }, [actions.loadGroceryCategoryPreferences]);
  const [read, setRead] = useState<{ scope: string; preferences: GroceryCategoryPreference[]; error: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (loader.current) void loader.current(groupId).then(preferences => { if (active) setRead({ scope, preferences, error: false }); }).catch(() => { if (active) setRead({ scope, preferences: [], error: true }); });
    return () => { active = false; };
  }, [scope, groupId, attempt, refreshKey, error?.message]);
  const key = normalizeGroceryName(name);
  const remembered = read?.scope === scope ? read.preferences.find(preference => preference.nameKey === key) : undefined;
  const explicit = value?.nameKey === key ? value : undefined;
  const automatic = classifyGroceryName(name);
  const category = explicit ? explicit.action === "reset" ? automatic : explicit.category : initialCategory ?? remembered?.category ?? automatic;
  const resolve = useRef(onResolve);
  useEffect(() => { resolve.current = onResolve; }, [onResolve]);
  useEffect(() => { resolve.current?.(category, key); }, [category, key]);
  const saved = !explicit && !initialCategory && remembered?.category != null;
  const stale = explicit && remembered && explicit.expectedRevision !== remembered.revision;
  return <div className="grid min-w-0 gap-1">
    <label htmlFor={id} className="text-sm font-bold">Category</label>
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <select id={id} className="input min-w-0 flex-1 md:max-w-64" value={category} disabled={disabled} onChange={event => onChange({ nameKey: key, category: event.target.value as typeof category, action: "remember", expectedRevision: remembered?.revision ?? 0 })}>
        {groceryCategories.map(category => <option key={category}>{category}</option>)}
      </select>
      {explicit || remembered?.category != null || initialCategory ? <button type="button" disabled={disabled} className="min-h-[44px] text-sm font-bold underline underline-offset-2" onClick={() => onChange({ nameKey: key, category: automatic, action: "reset", expectedRevision: remembered?.revision ?? 0 })}>Use automatic category</button> : null}
    </div>
    {saved ? <p className="text-xs text-muted">{groupId ? "Using the group’s saved category" : "Using your saved category"}</p> : null}
    {stale ? <p className="text-xs">Saved category changed to {remembered.category ?? "Automatic"}. Your selection is retained. <button type="button" disabled={disabled} className="min-h-[44px] font-bold underline" onClick={() => onChange({ ...explicit, expectedRevision: remembered.revision })}>Review saved category</button></p> : null}
    {read?.scope === scope && read.error ? <div className="flex flex-wrap items-center gap-2 text-xs"><span>Saved categories unavailable. Automatic suggestions still work.</span><button type="button" disabled={disabled} className="min-h-[44px] font-bold underline" onClick={() => setAttempt(value => value + 1)}>Retry categories</button></div> : null}
  </div>;
}

export function categoryChoice(name: string, draft?: GroceryCategoryDraft) {
  return draft?.nameKey === normalizeGroceryName(name) ? { category: draft.category, preference: { action: draft.action, expectedRevision: draft.expectedRevision } } : undefined;
}
