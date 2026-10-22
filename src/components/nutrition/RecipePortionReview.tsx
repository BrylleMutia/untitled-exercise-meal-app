import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { NutritionPills } from "@/components/ui/NutritionPills";
import { HelpPopover } from "@/components/ui/HelpPopover";
import type { RecipePortion } from "@/utility/recipePortion";

export function RecipePortionReview({ name, date, slot, servings, portion, changed, unavailable, pending, canPlan, error, onServings, onLog, onPlan, onCancel, onReview, onRefresh }: {
  name: string; date: string; slot: string; servings: string; portion: RecipePortion | null;
  changed: boolean; unavailable: boolean; pending: boolean; canPlan: boolean; error: string;
  onServings: (value: string) => void; onLog?: () => void; onPlan: () => void; onCancel: () => void;
  onReview: () => void; onRefresh: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const invalidId = useId();
  useEffect(() => { input.current?.focus(); }, []);
  const validQuantity = servings.trim() !== "" && Number.isFinite(Number(servings)) && Number(servings) > 0;
  return <div className="grid min-w-0 gap-3 rounded-xl bg-white p-3 [overflow-wrap:anywhere] max-[400px]:p-2" role="group" aria-label="Review recipe servings" aria-busy={pending}>
    <div className="min-w-0">
      <h3 className="text-sm font-extrabold [overflow-wrap:anywhere]">{name}</h3>
      <p className="mt-1 text-xs font-semibold text-ink-soft">{date} · {slot}</p>
    </div>
    <label className="grid min-w-0 gap-1 text-xs font-bold">Recipe servings
      <input ref={input} className="input min-w-0 max-w-full" type="number" min="0" step="any" value={servings} disabled={pending} aria-invalid={!validQuantity} aria-describedby={!validQuantity ? invalidId : undefined} onChange={event => onServings(event.target.value)} />
    </label>
    {!validQuantity ? <p id={invalidId} className="text-xs font-semibold text-danger-900" role="alert">Enter a positive number of servings, including fractions.</p> : null}
    {unavailable ? <p className="text-xs font-semibold text-danger-900" role="alert">This recipe is archived or unavailable. Your portion is retained; refresh recipes or select another match.</p> : changed ? <div className="grid gap-2 text-danger-900" role="alert"><p className="text-xs font-semibold">This recipe changed since your review. Check the current preview before continuing.</p><Button variant="soft" disabled={pending} onClick={onReview}>Review updated recipe</Button></div> : null}
    {portion ? <><NutritionPills label="Recipe portion nutrition" values={portion.nutrition} precision={2} approximate /><div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-muted [overflow-wrap:anywhere]">{portion.source}</p>{portion.sourceDetails?.length ? <HelpPopover title="Recipe nutrition sources"><ul className="grid gap-2">{portion.sourceDetails.map(source => <li key={source} className="[overflow-wrap:anywhere]">{source}</li>)}</ul></HelpPopover> : null}</div></> : validQuantity && !unavailable ? <p className="text-xs font-semibold text-danger-900" role="alert">Recipe nutrition is unavailable. Resolve missing or invalid ingredients before saving.</p> : null}
    {error ? <p className="text-xs font-semibold text-danger-900" role="alert">{error}</p> : null}
    <div className="flex flex-wrap gap-2">
      {onLog ? <Button className="min-w-0 max-w-full !px-3" disabled={pending || !portion || changed || unavailable} onClick={onLog}>{pending ? "Saving…" : "Log meal"}</Button> : null}
      <Button className="min-w-0 max-w-full !px-3" variant={onLog ? "soft" : "primary"} disabled={pending || !portion || changed || unavailable || !canPlan || !portion.canPlan} onClick={onPlan}>{pending && !onLog ? "Adding…" : "Add to plan"}</Button>
      <Button className="min-w-0 max-w-full !px-3" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button>
    </div>
    {portion && (!canPlan || !portion.canPlan) ? <p className="text-xs font-semibold text-muted">Planning requires an eligible goal, a meal slot and compatible nutrition. Carb-limited plans require trusted catalog values.{onLog ? " You can still log this recipe." : null}</p> : null}
    {unavailable || changed || (!portion && validQuantity) ? <Button variant="ghost" className="justify-self-start" disabled={pending} onClick={onRefresh}>Refresh recipes</Button> : null}
  </div>;
}
