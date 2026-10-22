import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { STATUS_MAP } from "../lib/statuses";
import { shiftsForDepartment, useSettings } from "../lib/settings";
import { handleMenuKeyDown } from "../lib/useDialog";
import Icon from "./Icon";

/* ------------------------------------------------------------------
   Layout
   Desktop ("fit"): columns are sized from the measured pane width so the
   whole period (name + every day + 4 totals) fits with no horizontal
   scroll. Phones and narrow tablets fall back to fixed sizes and scroll
   sideways with the name column pinned.
   Sizes are in px (not rem) because the root font is 18px on desktop.
   ------------------------------------------------------------------ */

// Smallest usable day column when fitting; below this we scroll instead.
const MIN_FIT_DAY = 33;

// Fit-mode type/cell scale, chosen by how wide each day column ends up.
const FIT_TIERS = [
  {
    upTo: 42, // 1280px-class screens
    cellH: 34,
    cellPad: "p-[2px]",
    cellRadius: "rounded-md",
    cellText: "text-[10.5px] tracking-[-0.02em]",
    nameText: "text-[13px]",
    metaText: "text-[11px]",
    dayNum: "text-[12.5px]",
    dayNumCircle: "w-[24px] h-[24px]",
    weekday: "text-[9.5px]",
    summaryText: "text-[13px]",
  },
  {
    upTo: 56, // 1366–1600px
    cellH: 40,
    cellPad: "p-[3px]",
    cellRadius: "rounded-lg",
    cellText: "text-[12px]",
    nameText: "text-[14px]",
    metaText: "text-[11.5px]",
    dayNum: "text-[14px]",
    dayNumCircle: "w-[28px] h-[28px]",
    weekday: "text-[10px]",
    summaryText: "text-[14px]",
  },
  {
    upTo: Infinity, // 1680px and up
    cellH: 46,
    cellPad: "p-1",
    cellRadius: "rounded-[10px]",
    cellText: "text-[13.5px]",
    nameText: "text-[15px]",
    metaText: "text-[12px]",
    dayNum: "text-[15px]",
    dayNumCircle: "w-[32px] h-[32px]",
    weekday: "text-[11px]",
    summaryText: "text-[15px]",
  },
];

// Tablets / small windows: fixed sizes, horizontal scroll.
const SCROLL_SIZES = {
  empW: 200,
  dayW: 60,
  summaryW: 76,
  cellH: 48,
  cellPad: "p-[3px]",
  cellRadius: "rounded-lg",
  cellText: "text-[13px]",
  nameText: "text-[15px]",
  metaText: "text-[12px]",
  dayNum: "text-[14px]",
  dayNumCircle: "w-[30px] h-[30px]",
  weekday: "text-[10.5px]",
  summaryText: "text-[15px]",
};

// Phones: ~5 days on screen, each cell still a ≥44px touch target.
const COMPACT_SIZES = {
  empW: 124,
  dayW: 52,
  summaryW: 64,
  cellH: 44,
  cellPad: "p-[3px]",
  cellRadius: "rounded-lg",
  cellText: "text-[13px]",
  nameText: "text-[13px]",
  metaText: "text-[11px]",
  dayNum: "text-[14px]",
  dayNumCircle: "w-[28px] h-[28px]",
  weekday: "text-[10px]",
  summaryText: "text-[14px]",
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function computeLayout(paneWidth, dayCount, compact) {
  if (compact) return { ...COMPACT_SIZES, fit: false };
  if (paneWidth > 0 && dayCount > 0) {
    const empW = Math.round(clamp(paneWidth * 0.18, 160, 260));
    const summaryW = Math.round(clamp(paneWidth * 0.055, 52, 84));
    // Floor to 1/100 px so rounding can never push the table past the pane.
    const dayW =
      Math.floor(((paneWidth - empW - 4 * summaryW) / dayCount) * 100) / 100;
    if (dayW >= MIN_FIT_DAY) {
      const tier = FIT_TIERS.find((t) => dayW < t.upTo);
      return { ...tier, empW, summaryW, dayW, fit: true };
    }
  }
  return { ...SCROLL_SIZES, fit: false };
}

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
  const paneRef = useRef(null);
  const paneWidth = useElementWidth(paneRef);
  const z = computeLayout(paneWidth, days.length, compact);
  // Narrow totals columns get one-word headers (full text stays in aria-label).
  const shortLabels = z.summaryW < 76;
  const showRowNumber = !compact && z.empW >= 220;

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

  const SUMMARY = [
    { key: "il", full: ["Incentive", "Leave"], short: "IL", head: "bg-emerald-50 text-emerald-800", foot: "bg-emerald-50 text-emerald-800", body: "text-emerald-800" },
    { key: "present", full: ["Physical", "Present"], short: "Present", head: "bg-green-50 text-green-800", foot: "bg-green-50 text-green-800", body: "text-green-700" },
    { key: "off", full: ["Physical", "Off"], short: "Off", head: "bg-rose-50 text-rose-700", foot: "bg-rose-50 text-rose-700", body: "text-rose-600" },
    { key: "total", full: ["Total", "Working Days"], short: "Total", head: "bg-slate-100 text-slate-700", foot: "bg-slate-100 text-slate-800", body: "text-slate-900" },
  ];

  return (
    <div className="-mx-4 sm:mx-0 bg-white border-y border-slate-900/[0.07] sm:border-0 sm:rounded-2xl sm:ring-1 sm:ring-slate-900/[0.06] shadow-card overflow-hidden">
      <div
        ref={paneRef}
        className={`group/grid ${z.fit ? "overflow-y-auto overflow-x-hidden" : "overflow-auto overscroll-x-contain"} [scrollbar-gutter:stable] scroll-thin ${paneHeight} sm:max-h-[calc(100dvh-6rem)] lg:max-h-[calc(100dvh-12rem)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600`}
        role="region"
        aria-label="Schedule grid"
        tabIndex={0}
        onScroll={onGridScroll}
        // Keyboard focus never lands under the pinned name column/header.
        style={{ scrollPaddingLeft: z.empW, scrollPaddingTop: 64 }}
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
            <tr>
              <th
                scope="col"
                className={`sticky left-0 top-0 z-30 bg-white border-b border-r border-slate-200 px-3 ${z.fit ? "lg:px-4" : ""} py-2 text-left align-bottom ${NAME_SHADOW}`}
              >
                <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.08em] text-slate-500 font-semibold">
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
                    className={`sticky top-0 z-20 border-b border-slate-200 ${dayBorder(d)} px-0 py-1.5 text-center ${HEAD_SHADOW} ${
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

              {SUMMARY.map((s, i) => (
                <th
                  key={s.key}
                  scope="col"
                  aria-label={s.full.join(" ")}
                  title={s.full.join(" ")}
                  className={`sticky top-0 z-20 ${s.head} border-b border-slate-200 ${
                    i === 0 ? "border-l" : ""
                  } ${i < 3 ? "border-r" : ""} px-1 py-2 text-center ${HEAD_SHADOW}`}
                >
                  {shortLabels ? (
                    <span className="text-[11px] font-semibold leading-tight">
                      {s.short}
                    </span>
                  ) : (
                    <span className="block text-[10px] uppercase tracking-wide font-semibold leading-tight">
                      {s.full[0]}
                      <br />
                      {s.full[1]}
                    </span>
                  )}
                </th>
              ))}
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
              const values = { il, present, off, total };

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
                    className={`sticky left-0 z-10 bg-white ${hoverBg} border-b border-r border-slate-100 px-3 ${z.fit ? "lg:px-4" : ""} py-1 text-left font-normal transition-colors ${NAME_SHADOW}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Row number (display only — not the employee number) */}
                      {showRowNumber && (
                        <div
                          className="w-5 shrink-0 text-right text-[12px] font-medium text-slate-400 tabular-nums"
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

                  {SUMMARY.map((s, i) => (
                    <td
                      key={s.key}
                      className={`${s.key === "total" ? "bg-slate-50" : `bg-white ${hoverBg}`} border-b border-slate-100 ${
                        i === 0 ? "border-l border-l-slate-200" : ""
                      } ${i < 3 ? "border-r" : ""} px-1 text-center transition-colors`}
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
                className={`sticky left-0 bottom-0 z-30 bg-green-50 border-t border-green-200 border-r border-r-slate-200 px-3 ${z.fit ? "lg:px-4" : ""} py-2 text-left font-normal ${NAME_SHADOW}`}
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
                      className={`font-bold tabular-nums ${z.summaryText} ${
                        count > 0 ? "text-green-800" : "text-green-300"
                      }`}
                    >
                      {count}
                    </span>
                  </td>
                );
              })}

              {SUMMARY.map((s, i) => (
                <td
                  key={s.key}
                  className={`sticky bottom-0 z-20 ${s.foot} border-t border-green-200 ${
                    i === 0 ? "border-l border-l-slate-200" : ""
                  } ${i < 3 ? "border-r border-r-slate-200" : ""} py-2 text-center`}
                >
                  <span className={`font-bold tabular-nums ${z.summaryText}`}>
                    {{ il: grandIL, present: grandPresent, off: grandOff, total: grandTotal }[s.key]}
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
        aria-label={`${label}: ${current?.label || "No shift"}`}
        aria-haspopup={readOnly ? undefined : "menu"}
        aria-expanded={readOnly ? undefined : open}
        className={`w-full grid place-items-center overflow-hidden whitespace-nowrap ${radiusClass} ${textClass} font-bold leading-none transition-[transform,box-shadow,background-color,border-color,color] duration-150 ${
          readOnly ? "cursor-default select-none" : "active:scale-[0.94]"
        } ${look} ${open ? "ring-2 ring-green-600 ring-offset-1" : ""}`}
        title={
          readOnly
            ? current?.label || "Preview only"
            : current?.label || "Click to set"
        }
      >
        {status ||
          (readOnly ? "—" : <Icon name="plus" size={14} strokeWidth={2.5} />)}
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
   Phones: a bottom sheet with large two-column tiles, a pinned header and
   page scroll locked behind it. */
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
  }, []);

  const currentShift = current ? STATUS_MAP[current] : null;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 ${compact ? "bg-slate-950/40 backdrop-blur-[1px] animate-fade-in" : ""}`}
        onClick={() => onClose(false)}
      />
      <div
        ref={ref}
        role="menu"
        aria-label={`Set shift for ${label}`}
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
                Set shift · {dateText}
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

        <div className={compact ? "grid grid-cols-2 gap-2 px-4 pt-3.5" : "space-y-0.5"}>
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
                  className={`min-w-[3rem] h-8 px-2 rounded-lg text-xs font-bold tracking-tight flex items-center justify-center shrink-0 shadow-[inset_0_0_0_1px_rgb(15_23_42/0.06)] ${s.classes}`}
                >
                  {s.code}
                </span>
                <span className="flex-1 min-w-0 w-full">
                  <span className="block text-sm text-slate-900 font-medium truncate">
                    {s.label}
                  </span>
                  {s.time && (
                    <span className="block text-xs text-slate-500 mt-0.5 truncate">
                      {s.time}
                    </span>
                  )}
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
