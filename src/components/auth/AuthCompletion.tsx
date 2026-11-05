"use client";

import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { useEffect } from "react";

export function AuthCompletion({ next }: { next: string }) {
  useEffect(() => {
    window.location.replace(next);
  }, [next]);

  return (
    <div className="grid min-h-[60dvh] place-items-center text-center"><LoadingIndicator label="Loading your account…" /></div>
  );
}
