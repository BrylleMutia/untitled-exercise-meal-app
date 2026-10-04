"use client";

import { useEffect } from "react";

export function AuthCompletion({ next }: { next: string }) {
  useEffect(() => {
    window.location.replace(next);
  }, [next]);

  return (
    <div className="grid min-h-[60dvh] place-items-center text-center" role="status">
      <p className="text-sm font-bold text-muted">Loading your account…</p>
    </div>
  );
}
