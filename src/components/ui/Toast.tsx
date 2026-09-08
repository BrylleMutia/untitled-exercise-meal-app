"use client";

import { Check, Info, TriangleAlert } from "lucide-react";
import { useAppOptional } from "@/contexts/AppContext";

const toneIcon = {
  ok: <Check className="h-4 w-4" aria-hidden />,
  info: <Info className="h-4 w-4" aria-hidden />,
  warn: <TriangleAlert className="h-4 w-4" aria-hidden />,
};

export function ToastHost() {
  const app = useAppOptional();
  if (!app || app.toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {app.toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex animate-pop items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-bold text-white shadow-card"
        >
          {toneIcon[toast.tone]}
          {toast.message}
        </div>
      ))}
    </div>
  );
}
