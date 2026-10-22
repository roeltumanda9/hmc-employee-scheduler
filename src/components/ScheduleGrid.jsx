import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { STATUS_MAP } from "../lib/statuses";
import { shiftsForDepartment, useSettings } from "../lib/settings";
import { handleMenuKeyDown } from "../lib/useDialog";
import Icon from "./Icon";

// Fixed large sizes for readability
const SIZES = {
  empW: 280,
  dayW: 88,
  summaryW: 96,
  cellH: 56,
  cellPad: "p-1",
  cellRadius: "rounded-[10px]",
  cellText: "text-[0.9375rem]",
  nameText: "text-base",
  metaText: "text-xs",
  dayNum: "text-base",
  dayNumCircle: "w-9 h-9",
  weekday: "text-[0.6875rem]",
  summaryText: "text-base",
  totalText: "text-base",
};

// Phones: narrower name column and cells so ~5 days fit on screen, while
// each cell stays a comfortable ≥44px touch target.
const COMPACT_SIZES = {
  empW: 124,
  dayW: 52,
  summaryW: 60,
  cellH: 44,
  cellPad: "p-[3px]",
  cellRadius: "rounded-lg",
  cellText: "text-[0.8125rem]",
  nameText: "text-[0.8125rem]",
  metaText: "text-[0.6875rem]",
  dayNum: "text-sm",
  dayNumCircle: "w-7 h-7",
  weekday: "text-[0.625rem]",
  summaryText: "text-sm",
  totalText: "text-sm",
};

const COMPACT_QUERY = "(max-width: 639px)";

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Edge shadows on the pinned column/header, shown once the grid has scrolled
// (the scroll handler toggles data-sx / data-sy on the scroll container).
const NAME_SHADOW =
  "group-data-[sx]/grid:shadow-[8px_0_12px_-8px_rgb(15_23_42/0.18)]";
const HEAD_SHADOW =
  "group-data-[sy]/grid:shadow-[0_8px_12px_-8px_rgb(15_23_42/0.14)]";

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

function useElementWidth(ref) {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}

// "Mon, Oct 12" — for screen-reader labels
function spokenDate(d) {
  const [, m, day] = d.iso.split("-").map(Number);
  return `${d.weekday}, ${SHORT_MONTHS[m - 1]} ${day}`;
}

function onGridScroll(e) {
  const el = e.currentTarget;
  el.toggleAttribute("data-sx", el.scrollLeft > 1);
  el.toggleAttribute("data-sy", el.scrollTop > 1);
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
  const paneRef = useRef(null);
  const paneWidth = useElementWidth(paneRef);

  // Summary columns pin to the right edge when the pane is wide enough to
  // still show a few days between them and the pinned name column (not on
  // phones or narrow tablets, where they'd cover every day).
  // `slot` counts from the right: Total = 0, Off = 1, Present = 2, IL = 3.
  const pinSummary =
    !compact && paneWidth >= z.empW + 4 * z.summaryW + 4 * z.dayW;
  const pinRight = (slot) =>
    pinSummary ? { position: "sticky", right: slot * z.summaryW } : undefined;
  // Divider + shadow where the pinned summary block starts.
  const pinEdge = pinSummary
    ? "border-l border-slate-200 shadow-[-8px_0_12px_-8px_rgb(15_23_42/0.12)]"
    : "border-l border-slate-200";

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

  // Day column styling shared by header, body and footer.
  const isWeekend = (d) => d.weekday === "Sat" || d.weekday === "Sun";
  // A stronger rule after Sunday groups the period into weeks.
  const dayBorder = (d) =>
    d.weekday === "Sun" ? "border-r border-slate-200" : "border-r border-slate-100";

  // The grid scrolls inside its own pane so the day header, name column and
  // manpower footer stay pinned. Heights leave room for the app header (and,
  // on phones while editing, the bottom save bar).
  const paneHeight = readOnly
    ? "max-h-[calc(100dvh-4.5rem)]"
    : "max-h-[calc(100dvh-9.5rem)]";

  return (
    <div className="-mx-4 sm:mx-0 bg-white border-y border-slate-900/[0.07] sm:border-0 sm:rounded-2xl sm:ring-1 sm:ring-slate-900/[0.06] shadow-card overflow-hidden">
      <div
        ref={paneRef}
        className={`group/grid overflow-auto overscroll-x-contain scroll-thin ${paneHeight} sm:max-h-[calc(100dvh-6rem)] lg:max-h-[calc(100dvh-12rem)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600`}
        role="region"
        aria-label="Schedule grid"
        tabIndex={0}
        onScroll={onGridScroll}
        // Keyboard focus never lands under the pinned name column/header.
        style={{ scrollPaddingLeft: z.empW, scrollPaddingTop: compact ? 56 : 72 }}
      >
        {/* Fixed layout with an explicit width so columns keep their sizes
            (auto layout squeezes them to fit, breaking the pinned columns). */}
        <table
          className="border-separate border-spacing-0"
          style={{
            minWidth: "100%",
            width: z.empW + days.length * z.dayW + 4 * z.summaryW,
            tableLayout: "fixed",
          }}
        >
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
                className={`sticky left-0 top-0 z-30 bg-white border-b border-r border-slate-200 px-3 sm:px-4 py-2 text-left align-bottom ${NAME_SHADOW}`}
              >
                <span className="text-[0.625rem] sm:text-[0.6875rem] uppercase tracking-[0.08em] text-slate-500 font-semibold">
                  Employee
                </span>
              </th>

              {days.map((d) => {
                const weekend = isWeekend(d);
                const isToday = d.iso === todayIso;
                return (
                  <th
                    key={d.iso}
                    scope="col"
                    aria-label={spokenDate(d)}
                    className={`sticky top-0 z-20 border-b border-slate-200 ${dayBorder(d)} px-0.5 py-1.5 sm:py-2 text-center ${HEAD_SHADOW} ${
                      isToday ? "bg-green-50" : weekend ? "bg-slate-50" : "bg-white"
                    }`}
                  >
                    <div
                      className={`${z.weekday} uppercase tracking-[0.06em] font-semibold leading-none ${
                        isToday
                          ? "text-green-700"
                          : weekend
                            ? "text-rose-500"
                            : "text-slate-400"
                      }`}
                    >
                      {d.weekday}
                    </div>
                    <div
                      className={`mx-auto mt-1 ${z.dayNumCircle} grid place-items-center rounded-full font-semibold tabular-nums ${z.dayNum} ${
                        isToday
                          ? "bg-green-600 text-white shadow-brand"
                          : "text-slate-800"
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
                className={`sticky top-0 z-30 bg-emerald-50 border-b border-r border-slate-200 ${pinEdge} px-1 py-2 text-center ${HEAD_SHADOW}`}
              >
                <div className="text-[0.625rem] uppercase tracking-wide text-emerald-800 font-semibold leading-tight">
                  Incentive
                  <br />
                  Leave
                </div>
              </th>
              <th
                scope="col"
                style={pinRight(2)}
                className={`sticky top-0 z-30 bg-green-50 border-b border-r border-slate-200 px-1 py-2 text-center ${HEAD_SHADOW}`}
              >
                <div className="text-[0.625rem] uppercase tracking-wide text-green-800 font-semibold leading-tight">
                  Physical
                  <br />
                  Present
                </div>
              </th>
              <th
                scope="col"
                style={pinRight(1)}
                className={`sticky top-0 z-30 bg-rose-50 border-b border-r border-slate-200 px-1 py-2 text-center ${HEAD_SHADOW}`}
              >
                <div className="text-[0.625rem] uppercase tracking-wide text-rose-700 font-semibold leading-tight">
                  Physical
                  <br />
                  Off
                </div>
              </th>
              <th
                scope="col"
                style={pinRight(0)}
                className={`sticky top-0 z-30 bg-slate-100 border-b border-slate-200 px-1 py-2 text-center ${HEAD_SHADOW}`}
              >
                <div className="text-[0.625rem] uppercase tracking-wide text-slate-700 font-semibold leading-tight">
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
              const hoverBg = readOnly ? "" : "group-hover:bg-green-50";
              const statuses = shiftsForDepartment(settings, emp.department);

              return (
                <tr
                  key={emp.id}
                  className={`group bg-white ${
                    readOnly ? "" : "hover:bg-green-50/40"
                  } transition-colors`}
                >
                  <th
                    scope="row"
                    title={emp.name}
                    className={`sticky left-0 z-10 bg-white ${hoverBg} border-b border-r border-slate-100 px-3 sm:px-4 py-1.5 text-left font-normal transition-colors ${NAME_SHADOW}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Row number (display only — not the employee number) */}
                      {!compact && (
                        <div
                          className="w-6 shrink-0 text-right text-sm font-medium text-slate-400 tabular-nums"
                          aria-hidden="true"
                        >
                          {idx + 1}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div
                          className={`font-semibold ${z.nameText} text-slate-900 leading-snug ${
                            compact ? "line-clamp-2 break-words" : "truncate"
                          }`}
                        >
                          {emp.name}
                        </div>
                        <div
                          className={`${z.metaText} text-slate-500 truncate leading-tight mt-0.5`}
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
                        className={`border-b border-slate-100 ${dayBorder(d)} ${z.cellPad} align-middle ${
                          isToday ? "bg-green-50/70" : isWeekend(d) ? "bg-slate-50/70" : ""
                        }`}
                      >
                        <CellButton
                          status={status}
                          height={z.cellH}
                          textClass={z.cellText}
                          radiusClass={z.cellRadius}
                          readOnly={readOnly}
                          statuses={statuses}
                          label={`${emp.name}, ${spokenDate(d)}`}
                          name={emp.name}
                          dateText={spokenDate(d)}
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
                    className={`z-10 bg-white ${hoverBg} border-b border-r border-slate-100 ${pinEdge} px-1 py-2 text-center transition-colors`}
                  >
                    <SummaryNumber
                      value={il}
                      className={`text-emerald-800 ${z.summaryText}`}
                    />
                  </td>
                  <td
                    style={pinRight(2)}
                    className={`z-10 bg-white ${hoverBg} border-b border-r border-slate-100 px-1 py-2 text-center transition-colors`}
                  >
                    <SummaryNumber
                      value={present}
                      className={`text-green-700 ${z.summaryText}`}
                    />
                  </td>
                  <td
                    style={pinRight(1)}
                    className={`z-10 bg-white ${hoverBg} border-b border-r border-slate-100 px-1 py-2 text-center transition-colors`}
                  >
                    <SummaryNumber
                      value={off}
                      className={`text-rose-600 ${z.summaryText}`}
                    />
                  </td>
                  <td
                    style={pinRight(0)}
                    className="z-10 bg-slate-50 border-b border-slate-100 px-1 py-2 text-center"
                  >
                    <SummaryNumber
                      value={total}
                      className={`text-slate-900 ${z.summaryText}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* ---------- TOTAL MANPOWER FOOTER (pinned to the bottom) ---------- */}
          <tfoot>
            <tr>
              <th
                scope="row"
                className={`sticky left-0 bottom-0 z-30 bg-green-50 border-t border-green-200 border-r border-r-slate-200 px-3 sm:px-4 py-2 sm:py-2.5 text-left font-normal ${NAME_SHADOW}`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="hidden sm:grid w-7 h-7 rounded-lg bg-green-600 text-white place-items-center shadow-brand shrink-0"
                    aria-hidden="true"
                  >
                    <Icon name="users" size={14} strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="text-[0.6875rem] uppercase tracking-[0.06em] text-green-800 font-bold leading-tight">
                      Total manpower
                    </div>
                    <div className="text-[0.625rem] text-green-700/80 leading-tight">
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
                    className={`sticky bottom-0 z-20 border-t border-green-200 ${dayBorder(d)} py-2 text-center ${
                      isToday ? "bg-green-100" : "bg-green-50"
                    }`}
                  >
                    <span
                      className={`font-bold tabular-nums ${z.totalText} ${
                        count > 0 ? "text-green-800" : "text-green-300"
                      }`}
                    >
                      {count}
                    </span>
                  </td>
                );
              })}
              <td
                style={pinRight(3)}
                className={`sticky bottom-0 z-30 bg-emerald-50 border-t border-green-200 border-r border-r-slate-200 ${pinEdge} py-2 text-center`}
              >
                <span className={`font-bold tabular-nums text-emerald-800 ${z.totalText}`}>
                  {grandIL}
                </span>
              </td>
              <td
                style={pinRight(2)}
                className="sticky bottom-0 z-30 bg-green-50 border-t border-green-200 border-r border-r-slate-200 py-2 text-center"
              >
                <span className={`font-bold tabular-nums text-green-800 ${z.totalText}`}>
                  {grandPresent}
                </span>
              </td>
              <td
                style={pinRight(1)}
                className="sticky bottom-0 z-30 bg-rose-50 border-t border-green-200 border-r border-r-slate-200 py-2 text-center"
              >
                <span className={`font-bold tabular-nums text-rose-700 ${z.totalText}`}>
                  {grandOff}
                </span>
              </td>
              <td
                style={pinRight(0)}
                className="sticky bottom-0 z-30 bg-slate-100 border-t border-green-200 py-2 text-center"
              >
                <span className={`font-bold tabular-nums text-slate-800 ${z.totalText}`}>
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
  return value > 0 ? (
    <span className={`font-semibold tabular-nums ${className}`}>{value}</span>
  ) : (
    <span className="font-semibold text-slate-300">—</span>
  );
}

/* ---- Cell button ---- */
function CellButton({
  status,
  height,
  textClass,
  radiusClass,
  readOnly,
  statuses,
  label,
  name,
  dateText,
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
    ? `${current.classes} shadow-[inset_0_0_0_1px_rgb(15_23_42/0.06)] ${
        readOnly ? "" : "hover:shadow-[inset_0_0_0_2px_rgb(15_23_42/0.16)]"
      }`
    : readOnly
      ? "text-slate-300"
      : "border border-dashed border-slate-200 text-slate-300 hover:border-green-400 hover:bg-green-50 hover:text-green-600";

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
        className={`w-full grid place-items-center ${radiusClass} ${textClass} font-bold tracking-tight leading-none transition-[transform,box-shadow,background-color,border-color,color] duration-150 ${
          readOnly ? "cursor-default select-none" : "active:scale-[0.94]"
        } ${look} ${open ? "ring-2 ring-green-600 ring-offset-1" : ""}`}
        title={
          readOnly
            ? current?.label || "Preview only"
            : current?.label || "Click to set"
        }
      >
        {status ||
          (readOnly ? "—" : <Icon name="plus" size={compact ? 14 : 16} strokeWidth={2.5} />)}
      </button>

      {!readOnly && open && (
        <Popup
          anchorRef={btnRef}
          label={label}
          name={name}
          dateText={dateText}
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
   Phones: a bottom sheet with large two-column tiles, so it can never hang
   off the side and every option is an easy thumb target. */
function Popup({ anchorRef, label, name, dateText, current, statuses, compact, onClose, onPick }) {
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

  const currentShift = current ? STATUS_MAP[current] : null;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 ${compact ? "bg-slate-950/40 animate-fade-in" : ""}`}
        onClick={() => onClose(false)}
      />
      <div
        ref={ref}
        role="menu"
        aria-label={`Set shift for ${label}`}
        onKeyDown={(e) => handleMenuKeyDown(e, ref.current, onClose)}
        className={
          compact
            ? "fixed z-50 inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto overscroll-contain bg-white rounded-t-3xl shadow-overlay animate-sheet-up pb-[max(1rem,env(safe-area-inset-bottom))]"
            : "fixed z-50 w-80 max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain scroll-thin bg-white rounded-2xl shadow-overlay p-1.5 animate-pop-in"
        }
        style={compact ? undefined : style}
      >
        {compact && (
          <div className="pt-2.5 pb-1" aria-hidden="true">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-200" />
          </div>
        )}

        <div
          className={compact ? "px-5 pt-2 pb-4 flex items-start gap-3" : "px-3 pt-2 pb-2"}
          aria-hidden="true"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[0.6875rem] uppercase tracking-[0.08em] text-slate-400 font-semibold">
              Set shift · {dateText}
            </div>
            <div
              className={`font-semibold text-slate-900 truncate ${compact ? "text-base mt-0.5" : "text-sm"}`}
            >
              {name}
            </div>
          </div>
          {compact && currentShift && (
            <span
              className={`shrink-0 mt-1 inline-flex items-center h-7 px-2.5 rounded-lg text-xs font-bold ${currentShift.classes}`}
            >
              {currentShift.code}
            </span>
          )}
        </div>

        <div className={compact ? "grid grid-cols-2 gap-2 px-4" : "space-y-0.5"}>
          {statuses.map((s) => {
            const selected = current === s.code;
            return (
              <button
                key={s.code}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => onPick(s.code)}
                className={
                  compact
                    ? `relative flex flex-col items-start gap-2 p-3 rounded-2xl text-left transition active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${
                        selected
                          ? "bg-green-50 ring-2 ring-green-600"
                          : "bg-white ring-1 ring-slate-200"
                      }`
                    : `w-full flex items-center gap-3 px-2.5 py-2 text-sm rounded-xl text-left transition-colors focus:outline-none hover:bg-slate-100 focus:bg-slate-100 ${
                        selected ? "bg-green-50 hover:bg-green-50 focus:bg-green-100" : ""
                      }`
                }
              >
                <span
                  className={`min-w-[3rem] h-8 px-2 rounded-lg text-xs font-bold tracking-tight flex items-center justify-center shrink-0 shadow-[inset_0_0_0_1px_rgb(15_23_42/0.06)] ${s.classes}`}
                >
                  {s.code}
                </span>
                <span className="flex-1 min-w-0 w-full">
                  <span className="block text-sm text-slate-900 font-medium truncate">
                    {s.label}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5 truncate">
                    {s.time || " "}
                  </span>
                </span>
                {selected && (
                  <span
                    className={
                      compact
                        ? "absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-green-600 text-white grid place-items-center"
                        : "text-green-600 shrink-0"
                    }
                  >
                    <Icon name="check" size={compact ? 12 : 16} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className={compact ? "px-4 pt-3" : "mt-1 pt-1 border-t border-slate-100"}>
          <button
            type="button"
            role="menuitem"
            onClick={() => onPick(null)}
            className={
              compact
                ? "w-full h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-50 text-rose-700 text-sm font-semibold active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                : "w-full flex items-center gap-2 text-left px-3 py-2.5 text-sm rounded-xl hover:bg-rose-50 focus:bg-rose-50 focus:outline-none text-rose-600 font-medium transition-colors"
            }
          >
            <Icon name="trash" size={15} />
            Clear
          </button>
        </div>
      </div>
    </>
  );
}
