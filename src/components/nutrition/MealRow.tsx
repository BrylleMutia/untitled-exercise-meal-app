import type { ReactNode } from "react";

export function MealRow({ summary, actions, children }: {
  summary: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
}) {
  return <li className="grid min-w-0 gap-2 rounded-xl bg-lav-50 px-3 py-2">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-[1_1_10rem]">{summary}</div>
      <div className="flex min-w-0 max-w-full flex-wrap justify-end gap-1">{actions}</div>
    </div>
    {children}
  </li>;
}
