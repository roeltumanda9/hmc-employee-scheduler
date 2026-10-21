import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { STATUS_MAP } from "../lib/statuses";
import { shiftsForDepartment, useSettings } from "../lib/settings";
import { handleMenuKeyDown } from "../lib/useDialog";

// Fixed large sizes for readability
const SIZES = {
  empW: 280,
  dayW: 92,
  summaryW: 100,
  cellH: 68,
  cellText: "text-base",
  nameText: "text-lg",
  metaText: "text-sm",
  dayNum: "text-lg",
  dayNumCircle: "w-11 h-11",
  weekday: "text-sm",
  summaryText: "text-lg",
  totalText: "text-lg",
};

// Phones: narrower name column and cells so several days fit on screen.
const COMPACT_SIZES = {
  empW: 136,
  dayW: 54,
  summaryW: 64,
  cellH: 48,
  cellText: "text-sm",
  nameText: "text-sm",
  metaText: "text-[11px]",
  dayNum: "text-sm",
  dayNumCircle: "w-8 h-8",
  weekday: "text-[10px]",
  summaryText: "text-base",
  totalText: "text-base",
};

const COMPACT_QUERY = "(max-width: 639px)";

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// "Mon, Oct 12" — for screen-reader labels
function spokenDate(d) {
  const [, m, day] = d.iso.split("-").map(Number);
  return `${d.weekday}, ${SHORT_MONTHS[m - 1]} ${day}`;
}

export default function ScheduleGrid({
  employees,
  days,
  schedules,
  onSetStatus,
  readOnly = false,
}) {
  const compact = useMediaQuery(COMPACT_QUERY);
  const settings = useSettings();
  const z = compact ? COMPACT_SIZES : SIZES;

  // Summary columns pin to the right edge on wider screens. On phones only
  // the name column stays pinned, otherwise there's no room left for days.
  // `slot` counts from the right: Total = 0, Off = 1, Present = 2, IL = 3.
  const pinRight = (slot) =>
    compact ? undefined : { position: "sticky", right: slot * z.summaryW };

  const lookup = {};
  for (const s of schedules) {
    lookup[`${s.employee_id}|${s.date}`] = s;
  }

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const dailyManpower = {};
  for (const d of days) {
    let count = 0;
    for (const emp of employees) {
      const st = lookup[`${emp.id}|${d.iso}`]?.status;
      if (st && st !== "OFF" && st !== "IL") count++;
    }
    dailyManpower[d.iso] = count;
  }

  let grandPresent = 0;
  let grandOff = 0;
  let grandIL = 0;
  for (const emp of employees) {
    for (const d of days) {
      const st = lookup[`${emp.id}|${d.iso}`]?.status;
      if (st === "IL") grandIL++;
      else if (st && st !== "OFF") grandPresent++;
      else if (st === "OFF") grandOff++;
    }
  }
  const grandTotal = grandPresent;

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
      <div
        className="overflow-x-auto overscroll-x-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-500"
        role="region"
        aria-label="Schedule grid"
        tabIndex={0}
      >
        <table className="border-collapse" style={{ minWidth: "100%" }}>
          <colgroup>
            <col style={{ width: z.empW }} />
            {days.map((d) => (
              <col key={d.iso} style={{ width: z.dayW }} />
            ))}
            <col style={{ width: z.summaryW }} />
            <col style={{ width: z.summaryW }} />
            <col style={{ width: z.summaryW }} />
            <col style={{ width: z.summaryW }} />
          </colgroup>

          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-2 sm:px-3 py-2 text-left"
              >
                <span className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  Employee
                </span>
              </th>

              {days.map((d) => {
                const isWeekend = d.weekday === "Sat" || d.weekday === "Sun";
                const isToday = d.iso === todayIso;
                return (
                  <th
                    key={d.iso}
                    scope="col"
                    aria-label={spokenDate(d)}
                    className={`border-b border-r border-slate-200 px-0.5 py-1.5 text-center ${
                      isWeekend ? "bg-slate-100" : "bg-slate-50"
                    }`}
                  >
                    <div
                      className={`${z.weekday} uppercase tracking-wide ${
                        isWeekend ? "text-rose-400" : "text-slate-400"
                      }`}
                    >
                      {d.weekday}
                    </div>
                    <div
                      className={`mx-auto mt-0.5 ${z.dayNumCircle} grid place-items-center rounded-full font-bold ${z.dayNum} ${
                        isToday
                          ? "bg-green-600 text-white shadow"
                          : "text-slate-700"
                      }`}
                    >
                      {d.day}
                    </div>
                  </th>
                );
              })}
              <th
                scope="col"
                style={pinRight(3)}
                className="z-20 bg-emerald-50 border-b border-r border-slate-200 px-1 py-2 text-center"
              >
                <div className="text-[10px] uppercase tracking-wider text-emerald-800 font-bold leading-tight">
                  Incentive
                  <br />
                  Leave
                </div>
              </th>
              <th
                scope="col"
                style={pinRight(2)}
                className="z-20 bg-emerald-50 border-b border-r border-slate-200 px-1 py-2 text-center"
              >
                <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold leading-tight">
                  Physical
                  <br />
                  Present
                </div>
              </th>
              <th
                scope="col"
                style={pinRight(1)}
                className="z-20 bg-rose-50 border-b border-r border-slate-200 px-1 py-2 text-center"
              >
                <div className="text-[10px] uppercase tracking-wider text-rose-700 font-bold leading-tight">
                  Physical
                  <br />
                  Off
                </div>
              </th>
              <th
                scope="col"
                style={pinRight(0)}
                className="z-20 bg-slate-100 border-b border-slate-200 px-1 py-2 text-center"
              >
                <div className="text-[10px] uppercase tracking-wider text-slate-700 font-bold leading-tight">
                  Total
                  <br />
                  Working Days
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {employees.map((emp, idx) => {
              let present = 0;
              let off = 0;
              let il = 0;
              for (const d of days) {
                const st = lookup[`${emp.id}|${d.iso}`]?.status;
                if (st === "IL") il++;
                else if (st && st !== "OFF") present++;
                else if (st === "OFF") off++;
              }
              const total = present;

              // Opaque backgrounds: pinned cells must hide what scrolls beneath.
              const rowBg = idx % 2 ? "bg-slate-50" : "bg-white";
              const hoverBg = readOnly ? "" : "group-hover:bg-green-50";
              const statuses = shiftsForDepartment(settings, emp.department);

              return (
                <tr
                  key={emp.id}
                  className={`group ${rowBg} ${
                    readOnly ? "" : "hover:bg-green-50/40"
                  } transition-colors`}
                >
                  <th
                    scope="row"
                    title={emp.name}
                    className={`sticky left-0 z-10 ${rowBg} ${hoverBg} border-b border-r border-slate-200 px-2 sm:px-3 py-2 text-left font-normal transition-colors`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Row number (display only — not the employee number) */}
                      {!compact && (
                        <div
                          className="w-9 h-9 shrink-0 grid place-items-center rounded-lg bg-green-50 text-green-700 text-sm font-bold tabular-nums ring-1 ring-green-100"
                          aria-hidden="true"
                        >
                          {idx + 1}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div
                          className={`font-semibold ${z.nameText} text-slate-800 leading-tight ${
                            compact ? "line-clamp-2 break-words" : "truncate"
                          }`}
                        >
                          {emp.name}
                        </div>
                        <div
                          className={`${z.metaText} text-slate-500 truncate leading-tight`}
                        >
                          {emp.role}
                        </div>
                      </div>
                    </div>
                  </th>

                  {days.map((d) => {
                    const key = `${emp.id}|${d.iso}`;
                    const status = lookup[key]?.status;
                    const isToday = d.iso === todayIso;
                    return (
                      <td
                        key={d.iso}
                        className={`border-b border-r border-slate-200 p-0 align-middle ${
                          isToday ? "bg-green-50/40" : ""
                        }`}
                      >
                        <CellButton
                          status={status}
                          isToday={isToday}
                          height={z.cellH}
                          textClass={z.cellText}
                          readOnly={readOnly}
                          statuses={statuses}
                          label={`${emp.name}, ${spokenDate(d)}`}
                          compact={compact}
                          onChange={(newStatus) =>
                            onSetStatus(emp.id, d.iso, newStatus)
                          }
                        />
                      </td>
                    );
                  })}
                  <td
                    style={pinRight(3)}
                    className={`z-10 ${rowBg} ${hoverBg} border-b border-r border-slate-200 px-1 py-2 text-center transition-colors`}
                  >
                    <SummaryNumber
                      value={il}
                      className={`text-emerald-800 ${z.summaryText}`}
                    />
                  </td>
                  <td
                    style={pinRight(2)}
                    className={`z-10 ${rowBg} ${hoverBg} border-b border-r border-slate-200 px-1 py-2 text-center transition-colors`}
                  >
                    <SummaryNumber
                      value={present}
                      className={`text-emerald-700 ${z.summaryText}`}
                    />
                  </td>
                  <td
                    style={pinRight(1)}
                    className={`z-10 ${rowBg} ${hoverBg} border-b border-r border-slate-200 px-1 py-2 text-center transition-colors`}
                  >
                    <SummaryNumber
                      value={off}
                      className={`text-rose-700 ${z.summaryText}`}
                    />
                  </td>
                  <td
                    style={pinRight(0)}
                    className="z-10 bg-slate-50 border-b border-slate-200 px-1 py-2 text-center"
                  >
                    <SummaryNumber
                      value={total}
                      className={`text-slate-800 ${z.summaryText}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* ---------- TOTAL MANPOWER FOOTER ---------- */}
          <tfoot>
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-20 bg-green-50 border-t-2 border-green-200 border-r border-slate-200 px-2 sm:px-3 py-2.5 text-left font-normal"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="hidden sm:grid w-6 h-6 rounded-md bg-green-600 text-white place-items-center shadow-sm shrink-0"
                    aria-hidden="true"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-green-700 font-bold leading-tight">
                      Total manpower
                    </div>
                    <div className="text-[10px] text-green-600 leading-tight">
                      of the day
                    </div>
                  </div>
                </div>
              </th>

              {days.map((d) => {
                const count = dailyManpower[d.iso] || 0;
                const isToday = d.iso === todayIso;
                return (
                  <td
                    key={d.iso}
                    className={`border-t-2 border-green-200 border-r border-slate-200 py-2 text-center ${
                      isToday ? "bg-green-100" : "bg-green-50/70"
                    }`}
                  >
                    <span
                      className={`font-bold ${z.totalText} ${
                        count > 0 ? "text-green-700" : "text-green-300"
                      }`}
                    >
                      {count}
                    </span>
                  </td>
                );
              })}
              <td
                style={pinRight(3)}
                className="z-20 bg-emerald-50 border-t-2 border-green-200 border-r border-slate-200 py-2 text-center"
              >
                <span className={`font-bold text-emerald-800 ${z.totalText}`}>
                  {grandIL}
                </span>
              </td>
              <td
                style={pinRight(2)}
                className="z-20 bg-emerald-50 border-t-2 border-green-200 border-r border-slate-200 py-2 text-center"
              >
                <span className={`font-bold text-emerald-700 ${z.totalText}`}>
                  {grandPresent}
                </span>
              </td>
              <td
                style={pinRight(1)}
                className="z-20 bg-rose-50 border-t-2 border-green-200 border-r border-slate-200 py-2 text-center"
              >
                <span className={`font-bold text-rose-700 ${z.totalText}`}>
                  {grandOff}
                </span>
              </td>
              <td
                style={pinRight(0)}
                className="z-20 bg-slate-100 border-t-2 border-green-200 py-2 text-center"
              >
                <span className={`font-bold text-slate-700 ${z.totalText}`}>
                  {grandTotal}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ---- Summary cell ---- */
function SummaryNumber({ value, className }) {
  return (
    <span className={`font-bold ${className}`}>{value > 0 ? value : "—"}</span>
  );
}

/* ---- Cell button ---- */
function CellButton({
  status,
  isToday,
  height,
  textClass,
  readOnly,
  statuses,
  label,
  compact,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const current = status ? STATUS_MAP[status] : null;

  function close(refocus) {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }

  const look = current
    ? `${current.classes} shadow-sm`
    : readOnly
      ? "bg-white text-slate-300"
      : "bg-white text-slate-300 hover:bg-slate-100 hover:text-slate-500";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (!readOnly) setOpen((o) => !o);
        }}
        disabled={readOnly}
        style={{ height }}
        aria-label={`${label}: ${current?.label || "No shift"}`}
        aria-haspopup={readOnly ? undefined : "menu"}
        aria-expanded={readOnly ? undefined : open}
        className={`w-full ${textClass} font-bold tracking-wide transition-all duration-150 ${
          readOnly ? "cursor-default select-none" : "active:scale-95"
        } ${look} ${isToday ? "ring-2 ring-inset ring-green-300" : ""}`}
        title={
          readOnly
            ? current?.label || "Preview only"
            : current?.label || "Click to set"
        }
      >
        {status || "—"}
      </button>

      {!readOnly && open && (
        <Popup
          anchorRef={btnRef}
          label={label}
          current={status}
          statuses={statuses}
          compact={compact}
          onClose={close}
          onPick={(code) => {
            onChange(code);
            close(true);
          }}
        />
      )}
    </>
  );
}

/* ---- Popup ----
   Desktop: floats next to the cell, measured after render and clamped to the
   viewport (scrolls internally if taller than the screen).
   Phones: a bottom sheet, so it can never hang off the side. */
function Popup({ anchorRef, label, current, statuses, compact, onClose, onPick }) {
  const ref = useRef(null);
  const [style, setStyle] = useState({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (compact) return;

    function place() {
      const el = ref.current;
      const anchor = anchorRef.current;
      if (!el || !anchor) return;

      const M = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const r = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = Math.min(el.scrollHeight, vh - M * 2);

      const left = Math.max(M, Math.min(r.left, vw - w - M));
      let top = r.bottom + 6;
      if (top + h > vh - M) {
        const above = r.top - h - 6;
        top = above >= M ? above : Math.max(M, vh - h - M);
      }

      setStyle({ top, left, maxHeight: vh - M * 2 });
    }

    place();
    // Capture phase catches inner scroll containers (the grid) too.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, compact]);

  // Move focus into the menu: the current shift, else the first option.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    (
      el.querySelector('[aria-checked="true"]') ||
      el.querySelector('[role^="menuitem"]')
    )?.focus();
  }, []);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 ${compact ? "bg-slate-900/30" : ""}`}
        onClick={() => onClose(false)}
      />
      <div
        ref={ref}
        role="menu"
        aria-label={`Set shift for ${label}`}
        onKeyDown={(e) => handleMenuKeyDown(e, ref.current, onClose)}
        className={
          compact
            ? "fixed z-50 inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto bg-white rounded-t-2xl shadow-2xl ring-1 ring-slate-200 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            : "fixed z-50 w-72 max-w-[calc(100vw-16px)] overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-2xl p-2"
        }
        style={compact ? undefined : style}
      >
        {compact && (
          <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-slate-200" aria-hidden="true" />
        )}
        <div className="px-3 py-1.5" aria-hidden="true">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
            Set shift
          </div>
          <div className="text-xs text-slate-500 truncate">{label}</div>
        </div>

        {statuses.map((s) => (
          <button
            key={s.code}
            type="button"
            role="menuitemradio"
            aria-checked={current === s.code}
            onClick={() => onPick(s.code)}
            className={`w-full flex items-start gap-3 px-3 py-2.5 text-sm rounded-xl hover:bg-slate-100 focus:bg-slate-100 focus:outline-none transition text-left ${
              current === s.code ? "ring-1 ring-inset ring-green-300 bg-green-50/60" : ""
            }`}
          >
            <span
              className={`min-w-[52px] h-9 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${s.classes}`}
            >
              {s.code}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-slate-800 font-medium truncate">
                {s.label}
              </span>
              {s.time && (
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  {s.time}
                </span>
              )}
            </span>
          </button>
        ))}

        <div className="my-1.5 border-t border-slate-100" />

        <button
          type="button"
          role="menuitem"
          onClick={() => onPick(null)}
          className="w-full text-left px-3 py-2.5 text-sm rounded-xl hover:bg-rose-50 focus:bg-rose-50 focus:outline-none text-rose-600 font-medium transition"
        >
          Clear
        </button>
      </div>
    </>
  );
}
