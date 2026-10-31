import type { ReactNode } from "react";

export function MealRow({ summary, actions, children, thumbnail, ariaLabel, tone = "lavender", inline = false, edgeToEdgeThumbnail = false, inlineActionAlign = "center", mobileFlatPanels = false, mobileActionsBelow = false, mobileActionAlign = "end" }: {
  summary: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  thumbnail?: ReactNode;
  ariaLabel?: string;
  tone?: "lavender" | "home-meal";
  inline?: boolean;
  edgeToEdgeThumbnail?: boolean;
  inlineActionAlign?: "center" | "start";
  mobileFlatPanels?: boolean;
  mobileActionsBelow?: boolean;
  mobileActionAlign?: "start" | "end";
}) {
  const edgeThumbnail = inline && edgeToEdgeThumbnail;
  return <li aria-label={ariaLabel} className={`grid min-w-0 gap-2 rounded-xl ${tone === "home-meal" ? "bg-home-meal" : "bg-lav-50"} ${edgeThumbnail ? "pr-3 [--meal-thumbnail-inset:0.75rem]" : "px-3 py-2"} ${mobileFlatPanels ? edgeThumbnail ? "max-sm:rounded-none max-sm:pr-5 max-sm:[--meal-thumbnail-inset:1.25rem]" : "max-sm:rounded-none max-sm:px-5" : ""}`}>
    <div className={inline ? `grid min-w-0 ${edgeThumbnail ? "grid-cols-[calc(40px+var(--meal-thumbnail-inset))_minmax(0,1fr)_92px]" : "grid-cols-[40px_minmax(0,1fr)_92px]"} items-center gap-[8px]` : `flex min-w-0 flex-wrap items-start justify-between gap-2 ${mobileActionsBelow ? "max-sm:flex-col max-sm:items-stretch" : ""}`}>
      {inline ? <div data-meal-thumbnail className={edgeThumbnail ? `relative my-[10px] ml-[10px] min-h-[40px] self-stretch overflow-hidden rounded-l-xl ${mobileFlatPanels ? "max-sm:rounded-none" : ""}` : "h-[40px] w-[40px] overflow-hidden rounded-lg"}>{thumbnail}</div> : null}
      <div data-meal-summary className={inline ? `min-w-0 ${edgeThumbnail ? "py-2" : ""} ${inlineActionAlign === "start" ? "self-start" : ""}` : `min-w-0 flex-[1_1_10rem] ${mobileActionsBelow ? "max-sm:w-full max-sm:flex-none" : ""}`}>{summary}</div>
      {actions ? <div data-meal-actions className={inline ? `grid min-w-0 grid-cols-2 items-center gap-[4px] [&>p]:col-span-2 [&>p]:break-words ${edgeThumbnail ? "py-2" : ""} ${inlineActionAlign === "start" ? "self-start" : ""}` : `flex min-w-0 max-w-full flex-wrap justify-end gap-1 ${mobileActionsBelow ? mobileActionAlign === "start" ? "max-sm:self-start max-sm:justify-start" : "max-sm:self-end" : ""}`}>{actions}</div> : null}
    </div>
    {children}
  </li>;
}
