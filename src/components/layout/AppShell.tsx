"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Settings } from "lucide-react";
import { useAppOptional } from "@/contexts/AppContext";
import { BottomNav } from "./BottomNav";
import { ToastHost } from "@/components/ui/Toast";

const TITLES: Array<[string, string]> = [
  ["/workouts", "Workouts"],
  ["/nutrition", "Nutrition"],
  ["/grocery", "Grocery"],
  ["/progress", "Progress"],
  ["/settings", "Settings"],
];

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/workouts", label: "Workouts" },
  { href: "/nutrition", label: "Nutrition" },
  { href: "/grocery", label: "Grocery" },
  { href: "/progress", label: "Progress" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const app = useAppOptional();
  const isOnboarding = pathname.startsWith("/onboarding");

  if (!app?.hydrated) {
    return (
      <main className="grid min-h-dvh place-items-center px-6" role="status">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-3xl bg-lav-100" />
          <p className="mt-3 text-sm font-bold text-muted">Loading your local demo…</p>
        </div>
      </main>
    );
  }

  if (isOnboarding) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-xl px-4 py-6">
        {children}
        <ToastHost />
      </main>
    );
  }

  const title = TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1];
  const name = app?.snapshot.profile?.name ?? "there";
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pt-6 lg:max-w-5xl">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/settings"
            aria-label="Open profile settings"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lav-200 text-base font-extrabold text-ink"
          >
            {initial}
          </Link>
          <div className="min-w-0">
            {title ? (
              <h1 className="truncate text-lg font-extrabold">{title}</h1>
            ) : (
              <>
                <p className="text-xs font-bold text-muted">Welcome back</p>
                <h1 className="truncate text-lg font-extrabold">Hello, {name}!</h1>
              </>
            )}
          </div>
          <span className="hidden rounded-full bg-mint-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-ink-soft sm:inline-block">
            Demo mode
          </span>
        </div>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
                  active ? "bg-lav-100 text-ink" : "text-muted hover:bg-lav-50"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Notifications (demo, not active)"
            className="relative grid h-11 w-11 place-items-center rounded-full bg-white text-ink shadow-chip"
          >
            <Bell className="h-5 w-5" aria-hidden />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-coral-300" />
          </button>
          <Link
            href="/settings"
            aria-label="Settings"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink shadow-chip"
          >
            <Settings className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-5 md:pb-14 lg:max-w-5xl">
        {app.storageUnavailable ? (
          <div className="mb-4 rounded-2xl bg-coral-100 px-4 py-3 text-xs font-bold text-ink" role="status">
            Browser storage is unavailable. Changes are visible for this session
            but may not survive a refresh.
          </div>
        ) : null}
        {children}
      </main>

      <footer className="mx-auto w-full max-w-3xl px-4 pb-28 text-center md:pb-8 lg:max-w-5xl">
        <p className="text-[11px] font-semibold text-muted">
          Estimates only — not medical, dietary, or exercise care. Demo build:
          data stays in this browser.
        </p>
      </footer>

      <BottomNav />
      <ToastHost />
    </div>
  );
}
