export type CalorieBudgetInput = {
  target: number | null;
  logged: number;
  status: "unlogged" | "partial" | "complete";
  estimated?: boolean;
};

/** Missing intake is unknown; walking and workout estimates never enter this budget. */
export function calorieBudgetState({ target, logged, status, estimated = false }: CalorieBudgetInput) {
  const hasTarget = target !== null && Number.isFinite(target) && target > 0;
  const hasLogs = status !== "unlogged";
  const remaining = hasTarget && hasLogs ? Math.max(0, Math.round(target - logged)) : null;
  const over = hasTarget && hasLogs && logged > target;
  const fraction = remaining === null || target === null ? 0 : Math.min(1, remaining / target);
  const summary = !hasTarget ? "No calorie target set" : !hasLogs ? "No meals logged; intake is unknown" : over
    ? `About ${Math.round(logged - target)} kcal above the estimated target`
    : `${estimated ? "Approximately " : ""}${remaining} kcal remaining from the estimated target`;
  return { hasTarget, hasLogs, remaining, over, fraction, summary };
}
