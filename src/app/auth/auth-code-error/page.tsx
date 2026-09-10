import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6">
      <section className="rounded-3xl bg-coral-100 p-7 text-center shadow-card">
        <h1 className="text-xl font-extrabold">That link is no longer valid</h1>
        <p className="mt-2 text-sm font-semibold text-ink-soft">
          It may have expired, already been used, or been opened by an email
          security scanner. Request a new confirmation or password-reset email
          and open the newest link once.
        </p>
        <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-2xl bg-ink px-5 text-sm font-bold text-white">
          Return home
        </Link>
      </section>
    </main>
  );
}
