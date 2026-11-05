"use client";

import { useState, type ReactNode } from "react";
import { DayStrip } from "@/components/DayStrip";
import { formatFullDate, todayKey } from "@/utility/dates";
import { mealSlotLabels, recipeMealSlots } from "@/utility/recipeMealSlots";
import type { ResultingPlannedMeal } from "@/types/planningPreview";
import { MealRow } from "./MealRow";
import { RecipeCover } from "./RecipeCover";
import { PlannedMealSummary } from "./PlannedMealSummary";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";

export function DailyPlanPreview({ weekOf, dates, meals, people, userId, current, disabled, loading = false, renderServings }: {
  weekOf: string;
  dates: string[];
  meals: ResultingPlannedMeal[];
  people?: Array<{ id: string; name: string }>;
  userId: string;
  current: boolean;
  disabled: boolean;
  loading?: boolean;
  renderServings?: (meal: ResultingPlannedMeal) => ReactNode;
}) {
  const [dateChoice, setDateChoice] = useState("");
  const [personChoice, setPersonChoice] = useState("");
  const date = dates.includes(dateChoice) ? dateChoice : dates.includes(todayKey()) ? todayKey() : [...dates].sort()[0] ?? "";
  const person = people?.find(member => member.id === personChoice) ?? people?.find(member => member.id === userId) ?? people?.[0];
  const rows = meals.filter(meal => meal.date === date && (!people || meal.memberId === person?.id));
  return <div className="grid min-w-0 gap-3" aria-label="Daily planned preview">
    {people ? <label className="grid min-w-0 gap-1 text-sm font-bold">Person<select className="input" disabled={disabled || !people.length} value={person?.id ?? ""} onChange={event => setPersonChoice(event.target.value)}>{!people.length ? <option value="">Choose people above</option> : people.map(member => <option key={member.id} value={member.id}>{member.name}{member.id === userId ? " (you)" : ""}</option>)}</select></label> : null}
    <DayStrip weekOf={weekOf} selected={date} availableDates={dates} onSelect={setDateChoice} disabled={disabled} />
    {date ? <p className="break-words text-sm font-bold" role="status">{person ? `${person.name} · ` : ""}{formatFullDate(date)}</p> : null}
    <div aria-busy={loading} className="min-w-0">
    {loading ? <LoadingIndicator label="Generating plan preview…" /> : null}
    {current && !loading && date && (!people || person) ? <div className="grid min-w-0 gap-4">{recipeMealSlots.map(slot => <section className="min-w-0 border-t border-ink/10 pt-4" key={slot} aria-label={`${mealSlotLabels[slot]} preview`}>
      <h4 className="font-extrabold">{mealSlotLabels[slot]}</h4>
      {rows.some(meal => meal.slot === slot) ? <ul className="mt-2 grid min-w-0 gap-1.5">{rows.filter(meal => meal.slot === slot).map(meal => <MealRow key={`${meal.memberId ?? userId}:${meal.id}`} tone="home-meal" ariaLabel={`${meal.status === "new" ? "New" : "Kept"} planned meal: ${meal.label}`} summary={<div className="flex min-w-0 items-start gap-3">
        <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-lg"><RecipeCover image={meal.image} name={meal.label} fill /></span>
        <div className="min-w-0 flex-1"><span className="mb-1 block text-xs font-bold text-ink-soft">{meal.status === "new" ? "New" : "Kept"}</span><PlannedMealSummary meal={meal} showServing={false} /></div>
      </div>}>
        {renderServings && meal.status === "new" ? renderServings(meal) : <p className="text-xs font-semibold text-ink-soft">Estimated servings <span className="ml-2 font-bold tabular-nums text-ink">{meal.servings}</span></p>}
      </MealRow>)}</ul> : <p className="mt-2 text-sm text-ink-soft">No planned meal</p>}
    </section>)}</div> : null}
    </div>
  </div>;
}
