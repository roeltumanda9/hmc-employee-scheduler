import { useEffect, useId, useState } from "react";
import { friendlyError } from "../lib/errors";
import { HISTORY_LIMIT, fetchScheduleHistory } from "../lib/scheduleData";
import { findShift, useSettings } from "../lib/settings";
import { unknownShift } from "../lib/statuses";
import { useDialog } from "../lib/useDialog";
import { BACKDROP, BTN, BTN_SIZE, DIALOG, SPINNER } from "../lib/ui";
import ErrorBanner from "./ErrorBanner";
import Icon from "./Icon";

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "2026-10-12" → "Mon, Oct 12"
function shiftDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${SHORT_MONTHS[m - 1]} ${d}`;
}

// When the change was made, in the viewer's local time.
function changedAt(ts) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ShiftChip({ code }) {
  const settings = useSettings();
  const shift = findShift(settings, code) || unknownShift(code);
  return (
    <span
      title={shift.label}
      className={`inline-flex items-center justify-center min-w-[2.75rem] h-6 px-1.5 rounded-md text-xs font-bold ${shift.classes}`}
    >
      {code}
    </span>
  );
}

const EMPTY_CHIP = (
  <span className="inline-flex items-center justify-center min-w-[2.75rem] h-6 px-1.5 rounded-md text-xs text-slate-400 border border-dashed border-slate-300">
    empty
  </span>
);

/**
 * Scheduler → History: who changed which shift and when, for the employees
 * and period on screen (newest first). Rendered only while open. Reads
 * `schedule_history` (supabase/proposed_schedule_history.sql).
 */
export default function HistoryModal({ firstIso, lastIso, employeeIds, subtitle, onClose }) {
  const dialogRef = useDialog(true, onClose);
  const titleId = useId();
  const [state, setState] = useState({ loading: true, rows: [], missing: false, error: "" });

  useEffect(() => {
    let active = true;
    fetchScheduleHistory(firstIso, lastIso, employeeIds).then(({ data, error, missing }) => {
      if (!active) return;
      setState({
        loading: false,
        rows: data || [],
        missing,
        error: error ? friendlyError(error, "load the change history") : "",
      });
    });
    return () => {
      active = false;
    };
  }, [firstIso, lastIso, employeeIds]);

  const { loading, rows, missing, error } = state;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      <div className={BACKDROP} onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${DIALOG} sm:max-w-2xl rounded-t-3xl sm:rounded-2xl overflow-hidden max-h-[92dvh] sm:max-h-[85vh] flex flex-col max-sm:animate-sheet-up`}
      >
        <div className="sm:hidden pt-2.5" aria-hidden="true">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-200" />
        </div>

        <div className="px-5 sm:px-6 pt-3 pb-4 sm:py-5 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="hidden sm:grid w-10 h-10 rounded-xl bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/15 place-items-center shrink-0"
              aria-hidden="true"
            >
              <Icon name="clock" size={18} strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
                Change history
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`${BTN.ghost} ${BTN_SIZE.icon} -mr-2 -mt-1 shrink-0`}
            title="Close"
            aria-label="Close"
          >
            <Icon name="x" size={18} strokeWidth={2.25} />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain scroll-thin">
          {error && (
            <div className="p-4 sm:px-6">
              <ErrorBanner message={error} />
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 px-5 sm:px-6 py-8 text-sm text-slate-500">
              <span className={`${SPINNER} w-4 h-4`} />
              Loading history…
            </div>
          ) : missing ? (
            <p className="px-5 sm:px-6 py-8 text-sm text-slate-600 leading-relaxed">
              Change history isn't switched on yet. Run{" "}
              <code className="font-mono text-xs bg-slate-100 rounded px-1 py-0.5">
                supabase/proposed_schedule_history.sql
              </code>{" "}
              in Supabase → SQL Editor. Changes are recorded from then on.
            </p>
          ) : rows.length === 0 && !error ? (
            <p className="px-5 sm:px-6 py-8 text-sm text-slate-500">
              No changes recorded for this period yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="px-5 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {r.employee_name || "Deleted employee"}
                    </div>
                    <div className="text-xs text-slate-500">{shiftDate(r.date)}</div>
                  </div>

                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    aria-label={`${r.action}: ${r.old_status || "empty"} to ${r.new_status || "empty"}`}
                  >
                    {r.old_status ? <ShiftChip code={r.old_status} /> : EMPTY_CHIP}
                    <Icon name="chevronRight" size={14} strokeWidth={2.5} className="text-slate-400" />
                    {r.new_status ? <ShiftChip code={r.new_status} /> : EMPTY_CHIP}
                  </div>

                  <div className="sm:w-48 shrink-0 sm:text-right">
                    <div className="text-xs text-slate-700 tabular-nums">{changedAt(r.changed_at)}</div>
                    <div className="text-xs text-slate-500 truncate" title={r.changed_by_email || undefined}>
                      {r.changed_by_email || (r.changed_by ? "Unknown user" : "Database / SQL editor")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {rows.length >= HISTORY_LIMIT && (
            <p className="px-5 sm:px-6 py-3 text-xs text-slate-500 border-t border-slate-100">
              Showing the latest {HISTORY_LIMIT} changes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
