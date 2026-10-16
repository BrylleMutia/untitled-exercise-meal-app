export type CalorieBudgetInput = {
  target: number | null;
  logged: number;
  status: "unlogged" | "partial" | "complete";
  estimated?: boolean;
  mode?: "eaten" | "planned";
};

/** Missing intake is unknown; walking and workout estimates never enter this budget. */
export function calorieBudgetState({ target, logged, status, estimated = false, mode = "eaten" }: CalorieBudgetInput) {
  const hasTarget = target !== null && Number.isFinite(target) && target > 0;
  const hasLogs = status !== "unlogged";
  const completeBudget = hasLogs && (mode === "eaten" || status === "complete");
  const remaining = hasTarget && completeBudget ? Math.max(0, Math.round(target - logged)) : null;
  const over = hasTarget && completeBudget && logged > target;
  const fraction = remaining === null || target === null ? 0 : Math.min(1, remaining / target);
  const summary = mode === "planned"
    ? !hasTarget ? "No calorie target set" : !hasLogs ? "No active meals planned; planned nutrition is unknown" : !completeBudget ? "Planned calorie total is incomplete" : over
      ? `About ${Math.round(logged - target!)} planned calories above the estimated target`
      : `${estimated ? "Approximately " : ""}${remaining} planned calories remaining to the estimated target`
    : !hasTarget ? "No calorie target set" : !hasLogs ? "No meals logged; intake is unknown" : over
    ? `About ${Math.round(logged - target)} kcal above the estimated target`
    : `${estimated ? "Approximately " : ""}${remaining} kcal remaining from the estimated target`;
  return { hasTarget, hasLogs, remaining, over, fraction, summary };
}
