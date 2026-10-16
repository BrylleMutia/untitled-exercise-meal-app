import type { ReactNode } from "react";
import type { DailyTarget } from "@/types/domain";
import type { CalorieBudgetInput } from "@/utility/calorieBudget";
import { CalorieBudgetRing } from "@/components/ui/CalorieBudgetRing";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { nutritionMetricStyles } from "@/components/ui/nutritionMetrics";

type MacroMetric = "proteinG" | "carbsG" | "fatG";
export type SummaryMacro = { value: number | null; partial?: boolean };

/** Both modes share placement; each caller supplies its own truthful nutrition state. */
export function DailyNutritionSummary({ heading, help, context, calories, ring, metrics, target, children }: {
  heading: string;
  help?: ReactNode;
  context: ReactNode;
  calories?: ReactNode;
  ring: CalorieBudgetInput;
  metrics: Record<MacroMetric, SummaryMacro>;
  target: DailyTarget | null;
  children?: ReactNode;
}) {
  return <>
    <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-extrabold">{heading}</h2>{help}</div>
        <div className="break-words text-xs font-bold text-ink-soft">{context}</div>
      </div>
      <CalorieBudgetRing {...ring} size={96} />
    </div>
    {calories ? <p className="mt-2 text-xs font-bold text-ink-soft">{calories}</p> : null}
    <div className="mt-3 grid gap-2.5">
      {(["proteinG", "carbsG", "fatG"] as MacroMetric[]).map(metric => <ProgressBar key={metric}
        label={nutritionMetricStyles[metric].label} value={metrics[metric].value} target={target?.[metric] ?? null}
        unit=" g" precision={1} inlineHeader barClassName={nutritionMetricStyles[metric].bar}
        unavailableLabel={ring.mode === "planned" ? "Unavailable" : "Not logged"}
        valueNote={metrics[metric].partial && metrics[metric].value !== null ? "Partial total" : undefined}
        showProgress={!metrics[metric].partial && (metrics[metric].value !== null || ring.mode !== "planned")} />)}
    </div>
    {!target ? <p className="mt-2 text-xs font-semibold text-ink-soft">Daily target not set.</p> : null}
    {children}
  </>;
}
