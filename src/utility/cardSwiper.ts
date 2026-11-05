export type SwipeDecision = "skip" | "add";

export function swipeDecision(distance: number, width: number): SwipeDecision | null {
  if (!Number.isFinite(distance) || !Number.isFinite(width) || width <= 0) return null;
  const threshold = Math.min(96, Math.max(56, width * .22));
  return Math.abs(distance) < threshold ? null : distance < 0 ? "skip" : "add";
}
