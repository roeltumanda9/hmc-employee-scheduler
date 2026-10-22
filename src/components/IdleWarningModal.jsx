import { useEffect, useId, useState } from "react";
import { useDialog } from "../lib/useDialog";
import { BACKDROP, BTN, BTN_SIZE, DIALOG } from "../lib/ui";
import Icon from "./Icon";

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
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className={BACKDROP} />

      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        className={`${DIALOG} max-w-md overflow-hidden rounded-3xl sm:rounded-2xl`}
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div
              className="w-11 h-11 rounded-2xl bg-amber-50 ring-1 ring-inset ring-amber-600/15 text-amber-600 grid place-items-center shrink-0"
              aria-hidden="true"
            >
              <Icon name="clock" size={22} strokeWidth={2.25} />
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <h3 id={titleId} className="text-base font-semibold text-slate-900 tracking-tight">
                Still there?
              </h3>
              <p id={messageId} className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                For security, you'll be signed out automatically due to
                inactivity
                {remaining ? (
                  <>
                    {" "}in{" "}
                    <strong className="font-semibold text-slate-900 tabular-nums">
                      {remaining}
                    </strong>
                  </>
                ) : (
                  " shortly"
                )}
                .
              </p>
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                <Icon name="lock" size={12} />
                This keeps shared computers secure.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-6 pb-5 sm:pb-6 sm:pt-1 flex items-center justify-end">
          <button
            type="button"
            onClick={onStaySignedIn}
            className={`${BTN.primary} ${BTN_SIZE.lg} sm:h-10 w-full sm:w-auto`}
          >
            <Icon name="check" size={14} strokeWidth={3} />
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
