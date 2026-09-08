import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="grid place-items-center rounded-3xl border-2 border-dashed border-lav-200 bg-white/50 px-6 py-10 text-center">
      <h3 className="text-base font-extrabold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm font-semibold text-muted">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
