import Link from "next/link";
import { Dumbbell } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-xl content-center gap-5 px-4 py-8">
      <div className="text-center">
        <Link href="/auth/sign-in" className="inline-flex items-center gap-2 text-sm font-extrabold">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-lav-200 text-ink shadow-chip">
            <Dumbbell className="h-5 w-5" aria-hidden />
          </span>
          <span>CaliCoach</span>
        </Link>
      </div>
      <section className="rounded-3xl bg-white p-6 shadow-card sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-ink-soft">{description}</p>
        <div className="mt-6">{children}</div>
      </section>
      {footer ? <div className="text-center text-sm font-semibold text-muted">{footer}</div> : null}
      <p className="text-center text-[11px] font-semibold text-muted">
        Estimates only — not medical, dietary, or exercise care.
      </p>
    </main>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-2xl bg-coral-100 px-4 py-3 text-sm font-bold text-ink">
      {children}
    </div>
  );
}

export function AuthSuccess({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-2xl bg-mint-100 px-4 py-3 text-sm font-bold text-ink">
      {children}
    </div>
  );
}
