import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { isWorking, tallyDays, unknownShift } from "../lib/statuses";
import {
  findShift,
  leaveChecker,
  leaveTypes,
  shiftsForDepartment,
  useSettings,
} from "../lib/settings";
import { handleMenuKeyDown } from "../lib/useDialog";
import { MONTHS } from "../lib/dates";
import { computeLayout } from "../lib/gridLayout";
import Icon from "./Icon";

const COMPACT_QUERY = "(max-width: 639px)";

// Height of the month band row above the day numbers (px).
const MONTH_BAND_H = 28;

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Edge shadows on the pinned column/header, shown once the grid has scrolled
// (the scroll handler toggles data-sx / data-sy on the scroll container).
// The biometric number column inside the sticky name cell: full height, with
// its own right border, like the "No." column of the print sheet.
const NO_COL =
  "absolute inset-y-0 left-0 w-12 flex justify-center border-r border-slate-300";

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

// { inner, outer }: width inside the element (without a vertical scrollbar)
// and including it. The observer fires when a scrollbar appears, too.
function useElementWidth(ref) {
  const [size, setSize] = useState({ inner: 0, outer: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = { inner: el.clientWidth, outer: el.offsetWidth };
      setSize((prev) =>
        prev.inner === next.inner && prev.outer === next.outer ? prev : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
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
  // Unsaved edits keyed "employeeId|iso" (SchedulerPage `pending`); marked with a dot.
  pending = null,
  // (employeeId, iso, cellIsLeave) => leave status (src/lib/leave.js); blocks
  // the Leave option past the yearly limit. Null when not editing.
  leaveStatus = null,
}) {
  const compact = useMediaQuery(COMPACT_QUERY);
  const settings = useSettings();
  const paneRef = useRef(null);
  const { inner: paneWidth, outer: paneOuterWidth } = useElementWidth(paneRef);
  const z = computeLayout(paneWidth, days.length, compact, paneOuterWidth);
  // Narrow totals columns get one-word headers (full text stays in aria-label).
  const shortLabels = z.summaryW < 76;
  const showRowNumber = !compact && z.empW >= 220;
  // Name cells leave room on the left for the biometric number column.
  const namePad = showRowNumber
    ? `pl-[3.75rem] pr-3 ${z.fit ? "lg:pr-4" : ""}`
    : `px-3 ${z.fit ? "lg:px-4" : ""}`;

  const lookup = {};
  for (const s of schedules) {
    lookup[`${s.employee_id}|${s.date}`] = s;
  }

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Where the grid scrolls sideways (phones, tablets), open each period at
  // today's column (one day of context before it) instead of its first day.
  // Runs once per period, so it never fights the user's own scrolling.
  const todayIndex = days.findIndex((d) => d.iso === todayIso);
  const periodKey = days[0]?.iso;
  const jumpedFor = useRef(null);
  useLayoutEffect(() => {
    const el = paneRef.current;
    if (!el || paneWidth === 0 || z.fit || jumpedFor.current === periodKey) return;
    jumpedFor.current = periodKey;
    if (todayIndex > 1) el.scrollLeft = (todayIndex - 1) * z.dayW;
  }, [periodKey, todayIndex, paneWidth, z.fit, z.dayW]);

  const isLeave = leaveChecker(settings);

  const dailyManpower = {};
  for (const d of days) {
    let count = 0;
    for (const emp of employees) {
      const st = lookup[`${emp.id}|${d.iso}`]?.status;
      if (isWorking(st, isLeave)) count++;
    }
    dailyManpower[d.iso] = count;
  }

  // Footer: only Leave gets a period total; Present / Off / Total stay per
  // employee (a sum over everyone isn't a useful number).
  const { leave: grandLeave } = tallyDays(
    employees.flatMap((emp) =>
      days.map((d) => lookup[`${emp.id}|${d.iso}`]?.status),
    ),
    isLeave,
  );

  // Day column styling shared by header, body and footer.
  const isWeekend = (d) => d.weekday === "Sat" || d.weekday === "Sun";
  // A stronger rule after Sunday groups the period into weeks.
  // One even line between all days (slate-200 stays visible on the tinted
  // weekend columns).
  const dayBorder = () => "border-r border-slate-300";

  // The grid scrolls inside its own pane so the day header, name column and
  // manpower footer stay pinned. Heights leave room for the app header (and,
  // on phones while editing, the bottom save bar).
  const paneHeight = readOnly
    ? "max-h-[calc(100dvh-4.5rem)]"
    : "max-h-[calc(100dvh-9.5rem)]";

  // Consecutive days of the same month, for the month band above the dates.
  const monthGroups = [];
  for (const d of days) {
    const [y, m] = d.iso.split("-").map(Number);
    const last = monthGroups[monthGroups.length - 1];
    if (last && last.month === m && last.year === y) last.span++;
    else monthGroups.push({ key: `${y}-${m}`, year: y, month: m, span: 1 });
  }

  // Each totals column keeps one fill from heading to footer.
  const SUMMARY = [
    { key: "leave", full: ["Leave"], short: "Leave", head: "bg-emerald-50 text-emerald-800", foot: "bg-emerald-50 text-emerald-800", fill: "bg-emerald-50", body: "text-emerald-800" },
    { key: "present", full: ["Physical", "Present"], short: "Present", head: "bg-green-50 text-green-800", foot: "bg-green-50 text-green-800", fill: "bg-green-50", body: "text-green-700" },
    { key: "off", full: ["Physical", "Off"], short: "Off", head: "bg-rose-50 text-rose-700", foot: "bg-rose-50 text-rose-700", fill: "bg-rose-50", body: "text-rose-600" },
    { key: "total", full: ["Total", "Working Days"], short: "Total", head: "bg-slate-100 text-slate-700", foot: "bg-slate-100 text-slate-800", fill: "bg-slate-100", body: "text-slate-900" },
  ];

  return (
    <div className="-mx-4 sm:mx-0 bg-white border-y border-slate-900/[0.07] sm:border-0 sm:rounded-2xl sm:ring-1 sm:ring-slate-900/[0.14] shadow-card overflow-hidden">
      <div
        ref={paneRef}
        // In fit mode the vertical scrollbar is hidden (wheel/touch/keys still
        // scroll) so the columns reach the pane's edge with no white gutter.
        className={`group/grid ${z.fit ? "overflow-y-auto overflow-x-hidden scroll-none" : "overflow-auto overscroll-x-contain scroll-thin"} ${paneHeight} sm:max-h-[calc(100dvh-6rem)] lg:max-h-[calc(100dvh-9.5rem)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600`}
        role="region"
        aria-label="Schedule grid"
        tabIndex={0}
        onScroll={onGridScroll}
        // Keyboard focus never lands under the pinned name column/header.
        style={{ scrollPaddingLeft: z.empW, scrollPaddingTop: 64 + MONTH_BAND_H }}
      >
        {/* Fixed layout with an explicit width so columns keep the computed
            sizes (in fit mode the sum equals the pane width). */}
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
            {SUMMARY.map((s) => (
              <col key={s.key} style={{ width: z.summaryW }} />
            ))}
          </colgroup>

          <thead>
            {/* Month band: a period spans two months (27th → 11th). */}
            <tr>
              <th
                scope="col"
                rowSpan={2}
                className={`sticky left-0 top-0 z-30 bg-white border-b border-slate-300 border-r border-r-slate-400 ${namePad} py-2 text-left align-bottom ${NAME_SHADOW}`}
              >
                {showRowNumber && (
                  <span
                    className={`${NO_COL} items-end pb-2 text-[11px] sm:text-[12px] font-semibold uppercase tracking-wide text-slate-500`}
                    title="Biometric number"
                  >
                    No.
                  </span>
                )}
                <span className="block text-[15px] sm:text-[17px] text-slate-900 font-bold leading-tight">
                  Employee
                </span>
                <span className="block text-[12px] sm:text-[13px] text-slate-500 font-medium leading-tight tabular-nums">
                  {employees.length} {employees.length === 1 ? "person" : "people"}
                </span>
              </th>

              {monthGroups.map((g, i) => (
                <th
                  key={g.key}
                  scope="colgroup"
                  colSpan={g.span}
                  style={{ height: MONTH_BAND_H }}
                  className={`sticky top-0 z-20 bg-white border-b border-slate-200 ${
                    i < monthGroups.length - 1 ? "border-r border-r-slate-300" : ""
                  } px-2 py-0 text-left align-middle`}
                >
                  <span className="block truncate text-[12px] sm:text-[13px] uppercase tracking-[0.06em] font-bold text-green-800">
                    {g.span * z.dayW >= 125 ? MONTHS[g.month - 1] : SHORT_MONTHS[g.month - 1]}
                  </span>
                </th>
              ))}

              {SUMMARY.map((s, i) => (
                <th
                  key={s.key}
                  scope="col"
                  rowSpan={2}
                  aria-label={s.full.join(" ")}
                  title={s.full.join(" ")}
                  className={`sticky top-0 z-20 ${s.head} border-b border-slate-300 ${
                    i === 0 ? "border-l border-l-slate-300" : ""
                  } ${i < 3 ? "border-r border-r-slate-300" : ""} px-1 py-2 text-center ${HEAD_SHADOW}`}
                >
                  {shortLabels ? (
                    <span className="text-[11px] font-semibold leading-tight">
                      {s.short}
                    </span>
                  ) : (
                    <span className="block text-[10px] uppercase tracking-wide font-semibold leading-tight">
                      {s.full[0]}
                      {s.full[1] && (
                        <>
                          <br />
                          {s.full[1]}
                        </>
                      )}
                    </span>
                  )}
                </th>
              ))}
            </tr>

            <tr>
              {days.map((d) => {
                const weekend = isWeekend(d);
                const isToday = d.iso === todayIso;
                return (
                  <th
                    key={d.iso}
                    scope="col"
                    aria-label={spokenDate(d)}
                    style={{ top: MONTH_BAND_H }}
                    className={`sticky z-20 border-b border-slate-300 ${dayBorder(d)} px-0 py-1.5 text-center ${HEAD_SHADOW} ${
                      isToday ? "bg-green-50" : weekend ? "bg-slate-50" : "bg-white"
                    }`}
                  >
                    <div
                      className={`${z.weekday} uppercase tracking-[0.04em] font-semibold leading-none ${
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
            </tr>
          </thead>

          <tbody>
            {employees.map((emp) => {
              const { present, off, leave } = tallyDays(
                days.map((d) => lookup[`${emp.id}|${d.iso}`]?.status),
                isLeave,
              );
              const total = present;
              const values = { leave, present, off, total };

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
                    className={`sticky left-0 z-10 bg-white ${hoverBg} border-b border-slate-300 border-r border-r-slate-400 ${namePad} py-1 text-left font-normal transition-colors ${NAME_SHADOW}`}
                  >
                    {/* Biometric number in its own bordered column, as on the
                        print sheet (narrow layouts show it before the role). */}
                    {showRowNumber && (
                      <div
                        className={`${NO_COL} items-center text-[12px] font-semibold tabular-nums text-slate-700`}
                        title="Biometric number"
                      >
                        {emp.biometric_no || ""}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div>
                        <div
                          className={`font-semibold ${z.nameText} text-slate-900 leading-snug ${
                            "line-clamp-2 break-words text-balance"
                          }`}
                        >
                          {emp.name}
                        </div>
                        <div
                          className={`${z.metaText} text-slate-500 truncate leading-tight`}
                        >
                          {!showRowNumber && emp.biometric_no && (
                            <span className="tabular-nums">No. {emp.biometric_no} · </span>
                          )}
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
                        className={`border-b border-slate-300 ${dayBorder(d)} ${z.cellPad} align-middle ${
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
                          changed={!!pending && key in pending}
                          leaveStatus={
                            leaveStatus
                              ? (cellIsLeave) => leaveStatus(emp.id, d.iso, cellIsLeave)
                              : null
                          }
                          onChange={(newStatus) =>
                            onSetStatus(emp.id, d.iso, newStatus)
                          }
                        />
                      </td>
                    );
                  })}

                  {SUMMARY.map((s, i) => (
                    <td
                      key={s.key}
                      className={`${s.fill} border-b border-slate-300 ${
                        i === 0 ? "border-l border-l-slate-300" : ""
                      } ${i < 3 ? "border-r border-r-slate-300" : ""} px-1 text-center transition-colors`}
                    >
                      <SummaryNumber
                        value={values[s.key]}
                        className={`${s.body} ${z.summaryText}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>

          {/* ---------- TOTAL MANPOWER FOOTER (pinned to the bottom) ---------- */}
          <tfoot>
            <tr>
              <th
                scope="row"
                className={`sticky left-0 bottom-0 z-30 bg-green-50 border-t border-t-slate-300 border-r border-r-slate-400 px-3 ${z.fit ? "lg:px-4" : ""} py-2 text-left font-normal ${NAME_SHADOW}`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="hidden sm:grid w-6 h-6 rounded-md bg-green-600 text-white place-items-center shadow-brand shrink-0"
                    aria-hidden="true"
                  >
                    <Icon name="users" size={12} strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-green-800 font-bold leading-tight">
                      Total manpower
                    </div>
                    <div className="text-[10px] text-green-700/80 leading-tight">
                      per day
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
                    className={`sticky bottom-0 z-20 border-t border-t-slate-300 ${dayBorder(d)} py-2 text-center ${
                      isToday ? "bg-green-100" : "bg-green-50"
                    }`}
                  >
                    <span
                      className={`font-bold tabular-nums ${z.summaryText} text-green-800`}
                    >
                      {count}
                    </span>
                  </td>
                );
              })}

              {SUMMARY.map((s, i) => (
                <td
                  key={s.key}
                  className={`sticky bottom-0 z-20 ${s.foot} border-t border-t-slate-300 ${
                    i === 0 ? "border-l border-l-slate-300" : ""
                  } ${i < 3 ? "border-r border-r-slate-300" : ""} py-2 text-center`}
                >
                  <span className={`font-bold tabular-nums ${z.summaryText}`}>
                    {s.key === "leave" ? grandLeave : ""}
                  </span>
                </td>
              ))}
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
  changed,
  leaveStatus,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const settings = useSettings();
  const current = status
    ? findShift(settings, status) || unknownShift(status)
    : null;

  function close(refocus) {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }

  const look = current
    ? `${current.classes} shadow-[inset_0_0_0_1px_rgb(15_23_42/0.06)] ${
        readOnly ? "" : "hover:shadow-[inset_0_0_0_2px_rgb(15_23_42/0.18)]"
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
        aria-label={`${label}: ${current?.label || "No shift"}${changed ? " (unsaved)" : ""}`}
        aria-haspopup={readOnly ? undefined : "menu"}
        aria-expanded={readOnly ? undefined : open}
        className={`relative w-full grid place-items-center overflow-hidden whitespace-nowrap ${radiusClass} ${textClass} font-bold leading-none transition-[transform,box-shadow,background-color,border-color,color] duration-150 ${
          readOnly ? "cursor-default select-none" : "active:scale-[0.94]"
        } ${look} ${open ? "ring-2 ring-green-600 ring-offset-1" : ""}`}
        title={
          readOnly
            ? current?.label || "Preview only"
            : current?.label || "Click to set"
        }
      >
        {status ||
          (readOnly ? (
            // Empty day: a faint dot keeps the grid quiet so shifts stand out.
            <span className="w-1 h-1 rounded-full bg-slate-200" aria-hidden="true" />
          ) : (
            <Icon name="plus" size={14} strokeWidth={2.5} />
          ))}
        {changed && (
          <span
            className="absolute top-[3px] right-[3px] w-1.5 h-1.5 rounded-full bg-amber-500 ring-[1.5px] ring-white"
            aria-hidden="true"
          />
        )}
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
          leaveStatus={leaveStatus}
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
   Phones: a bottom sheet with large two-column tiles, a pinned header and
   page scroll locked behind it. */
function Popup({
  anchorRef,
  label,
  name,
  dateText,
  current,
  statuses,
  compact,
  leaveStatus,
  onClose,
  onPick,
}) {
  const ref = useRef(null);
  const [style, setStyle] = useState({ visibility: "hidden" });
  const settings = useSettings();
  const leaves = leaveTypes(settings);
  const currentShift = current
    ? findShift(settings, current) || unknownShift(current)
    : null;
  // "shifts": the department's shifts + one "Leave" entry; "leave": the
  // leave types. A cell that holds a leave opens straight on the leave list.
  const [view, setView] = useState(currentShift?.isLeave ? "leave" : "shifts");
  // Yearly leave allowance for this employee/day (null when unknown).
  const leaveInfo = leaveStatus ? leaveStatus(!!currentShift?.isLeave) : null;

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
    // `view` changes the menu's height, so re-place it.
  }, [anchorRef, compact, view]);

  // The sheet covers the page on phones; keep the page from scrolling behind it.
  useEffect(() => {
    if (!compact) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [compact]);

  // Move focus into the menu: the current shift, else the first option.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    (
      el.querySelector('[aria-checked="true"]') ||
      el.querySelector('[role^="menuitem"]')
    )?.focus();
  }, [view]);

  const onLeaveView = view === "leave";

  return (
    <>
      <div
        className={`fixed inset-0 z-40 ${compact ? "bg-slate-950/40 backdrop-blur-[1px] animate-fade-in" : ""}`}
        onClick={() => onClose(false)}
      />
      <div
        ref={ref}
        role="menu"
        aria-label={`${onLeaveView ? "Set leave" : "Set shift"} for ${label}`}
        onKeyDown={(e) => handleMenuKeyDown(e, ref.current, onClose)}
        className={
          compact
            ? "fixed z-50 inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain bg-white rounded-t-[28px] shadow-overlay animate-sheet-up pb-[max(1rem,env(safe-area-inset-bottom))]"
            : "fixed z-50 w-80 max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain scroll-thin bg-white rounded-2xl shadow-overlay p-1.5 animate-pop-in"
        }
        style={compact ? undefined : style}
      >
        <div
          className={compact ? "sticky top-0 z-10 bg-white/95 backdrop-blur rounded-t-[28px] border-b border-slate-100" : ""}
          aria-hidden="true"
        >
          {compact && (
            <div className="pt-2.5 pb-1">
              <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-200" />
            </div>
          )}

          <div className={compact ? "px-5 pt-1.5 pb-3.5 flex items-center gap-3" : "px-3 pt-2 pb-2"}>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.08em] text-slate-400 font-semibold">
                {onLeaveView ? "Set leave" : "Set shift"} · {dateText}
              </div>
              <div
                className={`font-semibold text-slate-900 truncate ${compact ? "text-base mt-0.5" : "text-sm"}`}
              >
                {name}
              </div>
            </div>
            {compact && (
              <span
                className={`shrink-0 inline-flex items-center justify-center min-w-[3rem] h-8 px-2.5 rounded-lg text-xs font-bold ${
                  currentShift ? currentShift.classes : "bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-200"
                }`}
              >
                {currentShift ? currentShift.code : "—"}
              </span>
            )}
          </div>
        </div>

        {onLeaveView && (
          <div className={compact ? "px-4 pt-3" : "pb-0.5"}>
            <button
              type="button"
              role="menuitem"
              onClick={() => setView("shifts")}
              className={
                compact
                  ? "inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                  : "w-full flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
              }
            >
              <Icon name="chevronLeft" size={16} strokeWidth={2.5} />
              All shifts
            </button>
            {leaveInfo && (
              <p className={`text-xs text-slate-500 ${compact ? "px-1 pt-1" : "px-2.5 pb-1"}`}>
                {leaveInfo.used} of {leaveInfo.limit} leave days used in {leaveInfo.year}
                {leaveInfo.remaining > 0 && !currentShift?.isLeave
                  ? ` · ${leaveInfo.remaining} left`
                  : ""}
              </p>
            )}
          </div>
        )}

        <div className={compact ? "grid grid-cols-2 gap-2 px-4 pt-3.5" : "space-y-0.5"}>
          {onLeaveView
            ? leaves.map((s) => (
                <MenuOption
                  key={s.code}
                  compact={compact}
                  chipClasses={s.classes}
                  chip={s.code}
                  title={s.label}
                  subtitle={s.time}
                  selected={current === s.code}
                  onClick={() => onPick(s.code)}
                />
              ))
            : (
                <>
                  {statuses.map((s) => (
                    <MenuOption
                      key={s.code}
                      compact={compact}
                      chipClasses={s.classes}
                      chip={s.code}
                      title={s.label}
                      subtitle={s.time}
                      selected={current === s.code}
                      onClick={() => onPick(s.code)}
                    />
                  ))}
                  {leaves.length > 0 && (
                    <MenuOption
                      compact={compact}
                      opensSubmenu
                      chipClasses={
                        currentShift?.isLeave
                          ? currentShift.classes
                          : "bg-slate-100 text-slate-600"
                      }
                      chip={currentShift?.isLeave ? currentShift.code : "LV"}
                      title="Leave"
                      subtitle={
                        leaveInfo?.blocked
                          ? `Limit reached · ${leaveInfo.used}/${leaveInfo.limit}`
                          : leaveInfo
                            ? `${currentShift?.isLeave ? `${currentShift.label} · ` : ""}${leaveInfo.used}/${leaveInfo.limit} used in ${leaveInfo.year}`
                            : currentShift?.isLeave
                              ? currentShift.label
                              : leaves.map((l) => l.code).join(" · ")
                      }
                      selected={!!currentShift?.isLeave}
                      disabled={!!leaveInfo?.blocked}
                      onClick={() => setView("leave")}
                    />
                  )}
                </>
              )}
        </div>

        <div
          className={
            compact
              ? "grid grid-cols-2 gap-2 px-4 pt-3"
              : "mt-1 pt-1 border-t border-slate-100"
          }
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => onPick(null)}
            className={
              compact
                ? "h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-50 text-rose-700 text-sm font-semibold active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                : "w-full flex items-center gap-2 text-left px-3 py-2.5 text-sm rounded-xl hover:bg-rose-50 focus:bg-rose-50 focus:outline-none text-rose-600 font-medium transition-colors"
            }
          >
            <Icon name="trash" size={15} />
            Clear
          </button>
          {compact && (
            <button
              type="button"
              role="menuitem"
              onClick={() => onClose(true)}
              className="h-12 inline-flex items-center justify-center rounded-2xl bg-slate-100 text-slate-700 text-sm font-semibold active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/* ---- One option in the shift picker (a tile on phones, a row on desktop) ---- */
function MenuOption({
  compact,
  chip,
  chipClasses,
  title,
  subtitle,
  selected,
  opensSubmenu = false,
  // Unavailable (e.g. yearly leave limit reached): stays focusable so the
  // reason in `subtitle` is still read out, but does nothing.
  disabled = false,
  onClick,
}) {
  return (
    <button
      type="button"
      // The "Leave" entry opens the leave list rather than picking a value.
      role={opensSubmenu ? "menuitem" : "menuitemradio"}
      aria-checked={opensSubmenu ? undefined : selected}
      aria-haspopup={opensSubmenu && !disabled ? "menu" : undefined}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={
        disabled
          ? compact
            ? "relative flex flex-col items-start gap-2 min-h-[5.5rem] p-3 rounded-2xl text-left bg-slate-50 ring-1 ring-slate-200 opacity-70 cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            : "w-full flex items-center gap-3 px-2.5 py-2 text-sm rounded-xl text-left opacity-70 cursor-not-allowed focus:outline-none focus:bg-slate-100"
          : compact
            ? `relative flex flex-col items-start gap-2 min-h-[5.5rem] p-3 rounded-2xl text-left transition active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${
                selected
                  ? "bg-green-50 ring-2 ring-green-600"
                  : "bg-white ring-1 ring-slate-200 active:bg-slate-50"
              }`
            : `w-full flex items-center gap-3 px-2.5 py-2 text-sm rounded-xl text-left transition-colors focus:outline-none hover:bg-slate-100 focus:bg-slate-100 ${
                selected ? "bg-green-50 hover:bg-green-50 focus:bg-green-100" : ""
              }`
      }
    >
      <span
        className={`min-w-[3rem] h-8 px-2 rounded-lg text-xs font-bold tracking-tight flex items-center justify-center shrink-0 shadow-[inset_0_0_0_1px_rgb(15_23_42/0.06)] ${chipClasses}`}
      >
        {chip}
      </span>
      <span className="flex-1 min-w-0 w-full">
        <span className="block text-sm text-slate-900 font-medium truncate">
          {title}
        </span>
        {subtitle && (
          <span className={`block text-xs mt-0.5 truncate ${disabled ? "text-rose-600 font-medium" : "text-slate-500"}`}>
            {subtitle}
          </span>
        )}
      </span>
      {opensSubmenu && disabled ? (
        <span className={compact ? "absolute top-3 right-3 text-slate-400" : "text-slate-400 shrink-0"}>
          <Icon name="lock" size={15} />
        </span>
      ) : opensSubmenu ? (
        <span
          className={
            compact
              ? "absolute top-3 right-3 text-slate-400"
              : "text-slate-400 shrink-0"
          }
        >
          <Icon name="chevronRight" size={16} strokeWidth={2.5} />
        </span>
      ) : (
        selected && (
          <span
            className={
              compact
                ? "absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-green-600 text-white grid place-items-center"
                : "text-green-600 shrink-0"
            }
          >
            <Icon name="check" size={compact ? 12 : 16} strokeWidth={3} />
          </span>
        )
      )}
    </button>
  );
}
