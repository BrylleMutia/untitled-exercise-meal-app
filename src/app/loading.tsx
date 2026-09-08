export default function Loading() {
  return (
    <div
      className="grid min-h-[60vh] place-items-center"
      role="status"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-12 animate-pulse rounded-3xl bg-lav-100" />
        <p className="text-sm font-semibold text-muted">Loading your day…</p>
      </div>
    </div>
  );
}
