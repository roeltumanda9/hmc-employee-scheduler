import { SPINNER } from "../lib/ui";

// Placeholder shown while the Scheduler loads a period.
export default function GridSkeleton() {
  return (
    <div
      className="-mx-4 sm:mx-0 bg-white border-y border-slate-900/[0.07] sm:border-0 sm:rounded-2xl sm:ring-1 sm:ring-slate-900/[0.06] shadow-card overflow-hidden"
      aria-busy="true"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <span className={`${SPINNER} w-4 h-4`} />
        <p className="text-sm text-slate-500">Loading schedule…</p>
      </div>
      <div className="p-3 sm:p-4 space-y-2.5 animate-pulse" aria-hidden="true">
        {Array.from({ length: 6 }, (_, r) => (
          <div key={r} className="flex items-center gap-2">
            <div className="w-24 sm:w-56 shrink-0 space-y-1.5">
              <div className="h-3 rounded-full bg-slate-200/80 w-4/5" />
              <div className="h-2.5 rounded-full bg-slate-100 w-1/2" />
            </div>
            {Array.from({ length: 10 }, (_, c) => (
              <div
                key={c}
                className="h-10 sm:h-12 flex-1 min-w-10 rounded-lg bg-slate-100"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
