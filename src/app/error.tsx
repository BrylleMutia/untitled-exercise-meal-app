"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="w-full max-w-sm rounded-3xl bg-blush-100 p-6 text-center shadow-card">
        <h2 className="text-lg font-extrabold">Something went wrong</h2>
        <p className="mt-2 text-sm text-ink-soft">
          {error.message || "An unexpected error occurred."} Your saved data was
          not affected.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 min-h-12 w-full rounded-2xl bg-ink font-bold text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
