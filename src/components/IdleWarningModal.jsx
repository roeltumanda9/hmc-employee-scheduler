import { useEffect, useId, useState } from "react";
import { useDialog } from "../lib/useDialog";

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function IdleWarningModal({ open, deadline, onStaySignedIn }) {
  const dialogRef = useDialog(open, onStaySignedIn);
  const titleId = useId();
  const messageId = useId();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [open]);

  if (!open) return null;

  const remaining = deadline ? formatRemaining(deadline - now) : null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden focus:outline-none"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-amber-50 ring-1 ring-amber-100 grid place-items-center shrink-0"
              aria-hidden="true"
            >
              <svg
                width="22" height="22" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                className="text-amber-600"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <h3 id={titleId} className="text-base font-semibold text-slate-800">
                Still there?
              </h3>
              <p id={messageId} className="text-sm text-slate-500 mt-1">
                For security, you'll be signed out automatically due to
                inactivity
                {remaining ? (
                  <>
                    {" "}in{" "}
                    <strong className="text-slate-800 tabular-nums">
                      {remaining}
                    </strong>
                  </>
                ) : (
                  " shortly"
                )}
                .
              </p>
              <p className="text-xs text-slate-400 mt-2">
                This keeps shared computers secure.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onStaySignedIn}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700 active:scale-95 shadow-sm shadow-green-200 transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
