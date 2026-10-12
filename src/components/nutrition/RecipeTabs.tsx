"use client";

import { useId, type ReactNode } from "react";

export type RecipeTab = "details" | "ingredients" | "instructions";
const tabs: Array<{ id: RecipeTab; label: string }> = [
  { id: "details", label: "Details" }, { id: "ingredients", label: "Ingredients" },
  { id: "instructions", label: "Instructions" },
];

export function RecipeTabs({ active, onChange, panels, disabled = false }: {
  active: RecipeTab; onChange: (tab: RecipeTab) => void;
  panels: Record<RecipeTab, ReactNode>; disabled?: boolean;
}) {
  const id = useId();
  return <div className="grid min-w-0 gap-5">
    <div role="tablist" aria-label="Recipe sections" className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,5rem),1fr))] rounded-2xl bg-cream p-1">
      {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${id}-${tab.id}-tab`}
        aria-selected={active === tab.id} aria-controls={`${id}-${tab.id}-panel`} tabIndex={active === tab.id ? 0 : -1}
        disabled={disabled} onClick={() => onChange(tab.id)}
        onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
            : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
            : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); onChange(tabs[next].id);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}
        className={`min-h-11 min-w-0 rounded-xl px-1 py-2 text-sm font-bold [overflow-wrap:anywhere] transition-colors disabled:opacity-60 ${active === tab.id ? "bg-lav-100 text-ink" : "text-ink-soft hover:bg-lav-50"}`}>{tab.label}</button>)}
    </div>
    {tabs.map(tab => <section key={tab.id} role="tabpanel" id={`${id}-${tab.id}-panel`} aria-labelledby={`${id}-${tab.id}-tab`}
      hidden={active !== tab.id} tabIndex={0} className="min-w-0 outline-offset-4">{panels[tab.id]}</section>)}
  </div>;
}
