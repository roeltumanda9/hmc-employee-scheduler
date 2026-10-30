import { useEffect, useMemo, useRef, useState } from "react";
import {
  MONTHS,
  FIRST_MONTH,
  MONTHS_AHEAD,
  MONTHS_BACK,
  addMonths,
  getPayrollPeriodDays,
  isPeriodLocked,
  oldestEditablePeriod,
  periodContaining,
  periodTitle,
  previousPeriod,
} from "../lib/dates";
import {
  findDepartment,
  findShift,
  leaveChecker,
  leaveTypes,
  shiftsForDepartment,
  useSettings,
} from "../lib/settings";
import { canEditSchedules } from "../lib/auth";
import { friendlyError } from "../lib/errors";
import { countLeave, leaveStatusFor } from "../lib/leave";
import { fetchEmployees } from "../lib/employeeData";
import {
  fetchLeaveRows,
  fetchSchedules,
  saveScheduleChanges,
} from "../lib/scheduleData";
import {
  applyStatus,
  cellKey,
  countConflicts,
  pendingRow,
  pendingToChanges,
  planCopy,
} from "../lib/scheduleEdits";
import ScheduleGrid from "../components/ScheduleGrid";
import ConfirmModal from "../components/ConfirmModal";
import DepartmentDropdown from "../components/DepartmentDropdown";
import ErrorBanner from "../components/ErrorBanner";
import GridSkeleton from "../components/GridSkeleton";
import HistoryModal from "../components/HistoryModal";
import Icon from "../components/Icon";
import { BTN, BTN_SIZE, CARD, SPINNER_ON_BRAND } from "../lib/ui";

// Months as one comparable number (2026-10 → 24318).
const monthIndex = ({ year, month }) => year * 12 + month;

// The month/year remembered from the last visit, if it is still in range.
function savedMonth(isAllowed) {
  const month = parseInt(localStorage.getItem("hmc_sched_month"), 10);
  const year = parseInt(localStorage.getItem("hmc_sched_year"), 10);
  const valid =
    month >= 1 && month <= 12 && year >= 2000 && year <= 2100 && isAllowed(year, month);
  return valid ? { year, month } : null;
}

export default function SchedulerPage({ role, onDirtyChange }) {
  const canEdit = canEditSchedules(role);
  const settings = useSettings();

  // Navigation: MONTHS_BACK months back (view / print old schedules), but not
  // before FIRST_MONTH, to MONTHS_AHEAD ahead. Periods before the previous
  // one are read-only.
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const back = addMonths(todayYear, todayMonth, -MONTHS_BACK);
  const PREV = monthIndex(back) < monthIndex(FIRST_MONTH) ? FIRST_MONTH : back;
  const NEXT = addMonths(todayYear, todayMonth, MONTHS_AHEAD);
  // The period today falls in: the default, and where "Today" goes.
  const current = periodContaining(today);

  function isAllowed(y, m) {
    const key = monthIndex({ year: y, month: m });
    return key >= monthIndex(PREV) && key <= monthIndex(NEXT);
  }

  const [confirmClear, setConfirmClear] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Short confirmation shown at the bottom ({ id, title, detail, tone }).
  const [toast, setToast] = useState(null);
  const [copying, setCopying] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [pending, setPending] = useState({});
  const [error, setError] = useState("");
  // Navigation waiting on "discard unsaved changes?" confirmation.
  const [discardAction, setDiscardAction] = useState(null);
  // Save waiting on "someone else changed these cells" confirmation.
  const [conflict, setConflict] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const loadSeq = useRef(0);

  const [month, setMonth] = useState(() => savedMonth(isAllowed)?.month ?? current.month);
  const [year, setYear] = useState(() => savedMonth(isAllowed)?.year ?? current.year);

  const [half, setHalf] = useState(() => {
    if (!savedMonth(isAllowed)) return current.half;
    const v = parseInt(localStorage.getItem("hmc_sched_half"), 10);
    return v === 2 ? 2 : 1;
  });

  const [dept, setDept] = useState(() => {
    const v = localStorage.getItem("hmc_sched_dept");
    return v || "all";
  });

  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);

  const months = MONTHS;

  const isAllDepts = dept === "all";

  const days = useMemo(
    () => getPayrollPeriodDays(year, month, half),
    [year, month, half],
  );

  const legendShifts = useMemo(() => {
    if (isAllDepts) return [];
    const resolved = shiftsForDepartment(settings, dept);

    const hasOff = resolved.some((s) => s.code === "OFF");
    const off = findShift(settings, "OFF");
    if (!hasOff && off) {
      resolved.push(off);
    }

    // Every department can use every leave type, so list only the ones used
    // by this department in this period instead of all of them.
    const ids = new Set(
      employees.filter((e) => e.department === dept).map((e) => e.id),
    );
    const used = new Set(
      schedules.filter((s) => ids.has(s.employee_id)).map((s) => s.status),
    );
    for (const leave of leaveTypes(settings)) {
      if (used.has(leave.code)) resolved.push(leave);
    }
    return resolved;
  }, [dept, isAllDepts, settings, employees, schedules]);

  // A department remembered from a previous visit may have been renamed or
  // removed on the Settings page since; fall back to "All departments".
  useEffect(() => {
    if (settings.source === "database" && !isAllDepts && !findDepartment(settings, dept)) {
      setDept("all");
    }
  }, [settings, dept, isAllDepts]);

  const visibleEmployees = useMemo(() => {
    if (isAllDepts) return employees;
    return employees.filter((e) => e.department === dept);
  }, [employees, dept, isAllDepts]);

  // History covers the employees on screen; "All departments" shows everyone.
  const historyEmployeeIds = useMemo(
    () => (isAllDepts ? null : visibleEmployees.map((e) => e.id)),
    [isAllDepts, visibleEmployees],
  );

  const firstIso = days[0]?.iso;
  const lastIso = days[days.length - 1]?.iso;
  const pendingCount = Object.keys(pending).length;
  const dirty = editing && pendingCount > 0;

  // ---- Yearly leave limit (MAX_LEAVE_DAYS_PER_YEAR, all leave types) ----
  // While editing: saved leave for the year(s) this period touches, so the
  // picker can block leave beyond the limit. The database enforces it too.
  const [savedLeave, setSavedLeave] = useState([]);
  const isLeave = leaveChecker(settings);
  const leaveCodesKey = leaveTypes(settings).map((l) => l.code).join(",");
  const visibleIdsKey = visibleEmployees.map((e) => e.id).join(",");

  useEffect(() => {
    if (!editing || !leaveCodesKey || !visibleIdsKey || !firstIso) {
      setSavedLeave([]);
      return;
    }
    let active = true;
    fetchLeaveRows(
      `${firstIso.slice(0, 4)}-01-01`,
      `${lastIso.slice(0, 4)}-12-31`,
      leaveCodesKey.split(","),
      visibleIdsKey.split(","),
    ).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(friendlyError(error, "check the leave days used this year"));
      else setSavedLeave(data);
    });
    return () => {
      active = false;
    };
  }, [editing, firstIso, lastIso, visibleIdsKey, leaveCodesKey]);

  const leaveCounts = useMemo(
    () =>
      countLeave({
        saved: savedLeave,
        current: schedules,
        periodIsos: days.map((d) => d.iso),
        isLeave,
      }),
    // `isLeave` is derived from settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedLeave, schedules, days, settings],
  );

  const leaveStatus = (employeeId, iso, cellIsLeave) =>
    leaveStatusFor(leaveCounts, employeeId, iso, cellIsLeave);

  async function load() {
    const seq = ++loadSeq.current;
    setLoading(true);

    const [empRes, schRes] = await Promise.all([
      fetchEmployees(),
      fetchSchedules(firstIso, lastIso),
    ]);

    // A newer load started while this one was in flight; let it win.
    if (seq !== loadSeq.current) return;

    if (empRes.error) setError(friendlyError(empRes.error, "load employees"));
    else setEmployees(empRes.data);

    if (schRes.error) setError(friendlyError(schRes.error, "load the schedule"));
    else setSchedules(schRes.data);

    setLoading(false);
  }

  // Reload only when the period changes; `load` reads the current `days`.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, half]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  // Hide the "saved" toast after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Warn before closing or reloading the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Changing month/period/department drops pending edits, so ask first.
  function confirmDiscard(action) {
    if (dirty) setDiscardAction(() => action);
    else action();
  }

  useEffect(() => {
    localStorage.setItem("hmc_sched_month", String(month));
    localStorage.setItem("hmc_sched_year", String(year));
    localStorage.setItem("hmc_sched_half", String(half));
    localStorage.setItem("hmc_sched_dept", dept);

    if (editing && editSnapshot) setSchedules(editSnapshot);
    setEditing(false);
    setPending({});
    setEditSnapshot(null);
    // Must run only on navigation, not whenever edit state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, half, dept]);

  function setStatus(employeeId, iso, status) {
    if (isAllDepts || !canEdit || !editing) return;

    const key = cellKey(employeeId, iso);
    setPending((prev) => ({ ...prev, [key]: status ?? null }));
    setSchedules((prev) => applyStatus(prev, employeeId, iso, status));
  }

  function askClearHalf() {
    if (isAllDepts || !canEdit || !editing) return;
    const empIds = visibleEmployees.map((e) => e.id);
    if (empIds.length === 0 || days.length === 0) return;
    setConfirmClear(true);
  }

  function confirmClearHalf() {
    if (!canEdit || isAllDepts || !editing) return;
    setConfirmClear(false);

    const empIds = visibleEmployees.map((e) => e.id);
    if (empIds.length === 0 || days.length === 0) return;

    const empIdSet = new Set(empIds);
    const daySet = new Set(days.map((d) => d.iso));

    const newPending = { ...pending };
    for (const empId of empIds) {
      for (const iso of daySet) {
        newPending[`${empId}|${iso}`] = null;
      }
    }
    setPending(newPending);

    setSchedules((prev) =>
      prev.filter((s) => !(empIdSet.has(s.employee_id) && daySet.has(s.date))),
    );
  }

  function showToast(title, detail, tone = "success") {
    setToast({ id: Date.now(), title, detail, tone });
  }

  // The values a copy started with; checked after the fetch so a copy that
  // finishes after the user navigated or cancelled is dropped.
  const latest = useRef(null);
  latest.current = { firstIso, dept, editing };

  // Fill this period's empty days from the previous period, matching
  // weekdays (see sameWeekdayIn). Never overwrites a shift and never touches
  // a cell already changed in this edit session. Result is a pending draft.
  async function copyPreviousPeriod() {
    if (isAllDepts || !canEdit || !editing || copying) return;
    const start = { firstIso, dept };
    setCopying(true);
    setError("");

    const prev = previousPeriod(year, month, half);
    const prevDays = getPayrollPeriodDays(prev.year, prev.month, prev.half);
    const empIds = visibleEmployees.map((e) => e.id);
    const { data, error } = await fetchSchedules(
      prevDays[0].iso,
      prevDays[prevDays.length - 1].iso,
      empIds,
    );
    setCopying(false);

    const now = latest.current;
    if (!now.editing || now.firstIso !== start.firstIso || now.dept !== start.dept) return;
    if (error) {
      setError(friendlyError(error, "copy the previous period"));
      return;
    }

    // Copied leave counts toward the yearly limit too; what won't fit is skipped.
    const { fills, leaveSkipped } = planCopy({
      employeeIds: empIds,
      days,
      prevDays,
      sourceRows: data,
      currentRows: schedules,
      pending,
      leaveCounts,
      isLeave,
    });
    const skippedNote = leaveSkipped
      ? ` · ${leaveSkipped} leave ${leaveSkipped === 1 ? "day" : "days"} skipped (yearly limit)`
      : "";

    if (fills.length === 0) {
      showToast(
        "Nothing to copy",
        `no empty day had a shift in the previous period${skippedNote}`,
        "info",
      );
      return;
    }

    setPending((p) => {
      const next = { ...p };
      for (const f of fills) next[cellKey(f.employeeId, f.iso)] = f.status;
      return next;
    });
    setSchedules((rows) => [
      ...rows,
      ...fills.map((f) => pendingRow(f.employeeId, f.iso, f.status)),
    ]);
    showToast(
      "Copied from the previous period",
      `${fills.length} ${fills.length === 1 ? "shift" : "shifts"} added — review, then Save${skippedNote}`,
    );
  }

  function cancelEdit() {
    if (editSnapshot) setSchedules(editSnapshot);
    setPending({});
    setEditSnapshot(null);
    setEditing(false);
  }

  async function saveEdits() {
    if (!canEdit || isAllDepts || !editing || saving) return;
    setSaving(true);
    setError("");

    const empIds = visibleEmployees.map((e) => e.id);
    const { data: serverRows, error: fetchError } = await fetchSchedules(
      firstIso,
      lastIso,
      empIds,
    );
    if (fetchError) {
      setSaving(false);
      setError(friendlyError(fetchError, "save the schedule"));
      return;
    }

    // Cells another user changed after this edit session started.
    const conflicts = countConflicts(pending, editSnapshot, serverRows);

    if (conflicts > 0) {
      setSaving(false);
      setConflict({ count: conflicts, serverRows });
      return;
    }

    await commitSave(serverRows);
  }

  async function commitSave(serverRows) {
    setSaving(true);

    const changes = pendingToChanges(pending);
    const error = await saveScheduleChanges(changes, serverRows);

    if (error) {
      setSaving(false);
      setError(friendlyError(error, "save all of your changes"));
      // Some batches may have been written. Re-baseline on what the server now
      // holds so Save can be retried and Cancel shows the real saved state.
      const fresh = await fetchSchedules(firstIso, lastIso);
      if (!fresh.error) setEditSnapshot(fresh.data);
      return;
    }

    setPending({});
    setEditSnapshot(null);
    setEditing(false);
    await load();
    setSaving(false);
    showToast(
      "Schedule saved",
      `${changes.length} ${changes.length === 1 ? "change" : "changes"}`,
    );
  }

  function changeMonth(delta) {
    const next = addMonths(year, month, delta);
    if (!isAllowed(next.year, next.month)) return;
    setMonth(next.month);
    setYear(next.year);
  }

  const canGoPrev = () => monthIndex({ year, month }) > monthIndex(PREV);
  const canGoNext = () => monthIndex({ year, month }) < monthIndex(NEXT);

  const onCurrentPeriod =
    year === current.year && month === current.month && half === current.half;

  function goToToday() {
    setMonth(current.month);
    setYear(current.year);
    setHalf(current.half);
  }

  // Closed payroll period: view and print only.
  const locked = isPeriodLocked({ year, month, half }, today);
  const editableFrom = (() => {
    const p = oldestEditablePeriod(today);
    return getPayrollPeriodDays(p.year, p.month, p.half)[0];
  })();

  // The print builder loads on first use; most visits never print.
  async function handlePrint() {
    let printSchedule;
    try {
      ({ printSchedule } = await import("../lib/printSchedule"));
    } catch (err) {
      setError(friendlyError(err, "open the print view"));
      return;
    }
    printSchedule({
      dept,
      isAllDepts,
      days,
      month,
      year,
      half,
      schedules,
      visibleEmployees,
      settings,
      onError: setError,
    });
  }

  const showEditAction = canEdit && !isAllDepts;

  return (
    <div className={`space-y-3 sm:space-y-4 ${editing ? "pb-20 sm:pb-0" : ""}`}>
      {/* Pinned only on large screens, just below the app header (z-30).
          On phones and tablets it scrolls away so the grid gets the screen.
          z-40 keeps its department menu above the grid's sticky header (z-30). */}
      <div className="lg:sticky lg:top-14 lg:z-40 lg:-mx-6 lg:px-6 lg:py-2 lg:bg-[#f6f8f7]/85 lg:backdrop-blur-md">
        <div className={`${CARD} p-2.5 sm:p-3 lg:p-2.5 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-2`}>
          {/* MONTH */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => confirmDiscard(() => changeMonth(-1))}
              disabled={!canGoPrev()}
              aria-label="Previous month"
              className={`${BTN.secondary} ${BTN_SIZE.icon} sm:h-11 sm:w-11 lg:h-10 lg:w-10 shrink-0`}
              title={
                canGoPrev() ? "Previous month" : "Schedules start here"
              }
            >
              <Icon name="chevronLeft" size={18} strokeWidth={2.5} />
            </button>

            <div className="flex-1 min-w-0 text-center px-1 lg:min-w-[10.5rem]">
              <div
                className="text-[1.0625rem] sm:text-lg lg:text-base 2xl:text-lg font-bold text-slate-900 tracking-tight leading-tight truncate"
                aria-live="polite"
              >
                {periodTitle(days, month, year)}
              </div>
              <div className="text-xs text-slate-500 leading-tight mt-0.5 truncate">
                {half === 1 ? "1st period" : "2nd period"}
                <span className="mx-1.5 text-slate-300" aria-hidden="true">•</span>
                <span className="tabular-nums">{visibleEmployees.length}</span>{" "}
                {visibleEmployees.length === 1 ? "employee" : "employees"}
              </div>
            </div>

            <button
              onClick={() => confirmDiscard(() => changeMonth(1))}
              disabled={!canGoNext()}
              aria-label="Next month"
              className={`${BTN.secondary} ${BTN_SIZE.icon} sm:h-11 sm:w-11 lg:h-10 lg:w-10 shrink-0`}
              title={canGoNext() ? "Next month" : "No later months available"}
            >
              <Icon name="chevronRight" size={18} strokeWidth={2.5} />
            </button>

            {!onCurrentPeriod && (
              <button
                onClick={() => confirmDiscard(goToToday)}
                className={`${BTN.tertiary} ${BTN_SIZE.md} sm:h-11 lg:h-10 px-3 shrink-0`}
                title="Go to the payroll period of today"
              >
                Today
              </button>
            )}
          </div>

          <div className="hidden 2xl:block h-8 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

          {/* DEPARTMENT + PERIOD */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:gap-2.5 lg:flex lg:items-center">
            <DepartmentDropdown
              value={dept}
              onChange={(next) => {
                if (next !== dept) confirmDiscard(() => setDept(next));
              }}
            />

            <div
              role="group"
              aria-label="Payroll period"
              className="inline-flex h-10 sm:h-11 lg:h-10 p-1 rounded-xl bg-slate-100 ring-1 ring-inset ring-slate-900/[0.04]"
            >
              {[
                { value: 1, short: "27–11", long: "1st · 27–11" },
                { value: 2, short: "12–26", long: "2nd · 12–26" },
              ].map((p) => (
                <button
                  key={p.value}
                  onClick={() => {
                    if (half !== p.value) confirmDiscard(() => setHalf(p.value));
                  }}
                  aria-pressed={half === p.value}
                  className={`px-2.5 sm:px-3.5 lg:px-2.5 2xl:px-3.5 h-full text-xs sm:text-sm font-semibold rounded-[9px] whitespace-nowrap tabular-nums transition ${
                    half === p.value
                      ? "bg-white text-green-700 shadow-card ring-1 ring-slate-900/[0.06]"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className="sm:hidden lg:inline 2xl:hidden">{p.short}</span>
                  <span className="hidden sm:inline lg:hidden 2xl:inline">{p.long}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ACTIONS (view mode) */}
          {!editing && (
            <div
              className={`grid gap-2 sm:gap-2.5 lg:flex lg:items-center lg:ml-auto ${
                ["grid-cols-1", "grid-cols-2", "grid-cols-3"][
                  Number(canEdit) + Number(showEditAction)
                ]
              }`}
            >
              <button
                onClick={handlePrint}
                disabled={visibleEmployees.length === 0}
                className={`${BTN.secondary} ${BTN_SIZE.md} sm:h-11 lg:h-10 lg:w-10 lg:px-0 2xl:w-auto 2xl:px-4`}
                title="Print this schedule"
              >
                <Icon name="printer" size={16} />
                {/* Icon-only on laptops to keep the toolbar on one row. */}
                <span className="lg:sr-only 2xl:not-sr-only">Print</span>
              </button>

              {canEdit && (
                <button
                  onClick={() => setHistoryOpen(true)}
                  disabled={visibleEmployees.length === 0}
                  className={`${BTN.secondary} ${BTN_SIZE.md} sm:h-11 lg:h-10 lg:w-10 lg:px-0 2xl:w-auto 2xl:px-4`}
                  title="Who changed this schedule, and when"
                >
                  <Icon name="clock" size={16} />
                  <span className="lg:sr-only 2xl:not-sr-only">History</span>
                </button>
              )}

              {showEditAction && (
                <button
                  onClick={() => {
                    setEditSnapshot(schedules);
                    setPending({});
                    setEditing(true);
                  }}
                  disabled={loading || locked || visibleEmployees.length === 0}
                  className={`${BTN.primary} ${BTN_SIZE.md} sm:h-11 sm:px-5 lg:h-10`}
                  title={locked ? "This payroll period is closed" : "Enable editing"}
                >
                  <Icon name={locked ? "lock" : "pencil"} size={16} strokeWidth={2.25} />
                  {locked ? "Locked" : "Edit"}
                </button>
              )}
            </div>
          )}

          {/* ACTIONS (edit mode): a bottom bar on phones, inline from sm up */}
          {canEdit && editing && (
            <div className="fixed inset-x-0 bottom-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-8px_24px_-12px_rgb(15_23_42/0.2)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-sheet-up sm:static sm:z-auto sm:ml-auto sm:bg-transparent sm:backdrop-blur-none sm:border-0 sm:shadow-none sm:p-0 sm:animate-none">
              <div className="flex items-center gap-2">
                <button
                  onClick={askClearHalf}
                  disabled={isAllDepts || visibleEmployees.length === 0}
                  className={`${BTN.destructiveSoft} h-11 w-11 lg:h-10 lg:w-10 2xl:w-auto 2xl:px-4 shrink-0`}
                  aria-label="Clear this period"
                  title={
                    isAllDepts
                      ? "Not available in preview mode"
                      : "Clear this period"
                  }
                >
                  <Icon name="trash" size={16} />
                  <span className="hidden 2xl:inline">Clear</span>
                </button>

                {!isAllDepts && (
                  <>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      className={`${BTN.secondary} h-11 lg:h-10 px-4 lg:px-3 flex-1 sm:flex-none`}
                      title="Discard changes"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdits}
                      disabled={saving || pendingCount === 0}
                      className={`${BTN.primary} h-11 lg:h-10 px-5 lg:px-3.5 flex-[1.4] sm:flex-none`}
                      title="Save changes"
                    >
                      {saving ? (
                        <>
                          <span className={SPINNER_ON_BRAND} />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Icon name="check" size={16} strokeWidth={3} />
                          Save
                          {/* Laptops: the count is in the editing banner; keeps one toolbar row. */}
                          {pendingCount > 0 && (
                            <span className="min-w-5 h-5 px-1.5 rounded-full bg-white/20 text-xs font-bold tabular-nums grid place-items-center lg:hidden 2xl:grid">
                              {pendingCount}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {locked && showEditAction && (
        <div className="flex items-center gap-3 rounded-2xl bg-slate-100 ring-1 ring-inset ring-slate-200 px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-slate-700 animate-fade-in">
          <span
            className="w-7 h-7 rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 grid place-items-center shrink-0"
            aria-hidden="true"
          >
            <Icon name="lock" size={14} strokeWidth={2.5} />
          </span>
          <span className="flex-1 min-w-0">
            <strong className="font-semibold">Locked</strong> — this payroll period is closed, so it
            can be viewed and printed but not changed. Schedules from{" "}
            <strong className="font-semibold">
              {MONTHS[Number(editableFrom.iso.slice(5, 7)) - 1].slice(0, 3)} {editableFrom.day}
            </strong>{" "}
            onwards can still be edited.
          </span>
        </div>
      )}

      {editing && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-amber-50 ring-1 ring-inset ring-amber-200/80 px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-amber-900 animate-fade-in">
          <span
            className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 grid place-items-center shrink-0"
            aria-hidden="true"
          >
            <Icon name="pencil" size={14} strokeWidth={2.5} />
          </span>
          <span className="flex-1 min-w-[12rem]">
            <strong className="font-semibold">Editing mode</strong> — changes aren't saved until you click{" "}
            <strong className="font-semibold">Save</strong>.
            {pendingCount > 0 && (
              <span className="ml-1 text-amber-700 tabular-nums">
                ({pendingCount} unsaved {pendingCount === 1 ? "change" : "changes"})
              </span>
            )}
          </span>
          <span className="flex items-center gap-3 ml-auto">
            {/* Lives here (not the toolbar): it's an edit-mode action, and this
                keeps the laptop toolbar on one row. */}
            <button
              onClick={copyPreviousPeriod}
              disabled={copying || saving || visibleEmployees.length === 0}
              className={`${BTN.secondary} h-9 px-3 text-xs`}
              title="Fill empty days with the same weekday's shift from the last period. Shifts you've already entered are kept."
            >
              {copying ? (
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-green-600 animate-spin" />
              ) : (
                <Icon name="copy" size={14} />
              )}
              Copy previous period
            </button>
            <button
              onClick={cancelEdit}
              className="shrink-0 text-xs font-semibold text-amber-900 underline underline-offset-2 hover:no-underline"
            >
              Discard
            </button>
          </span>
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* Toast ("Schedule saved", copy results). The live region stays
          mounted so screen readers announce the message when it appears.
          Sits above the phone save bar while editing. */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed inset-x-0 ${editing ? "bottom-24" : "bottom-4"} sm:bottom-6 z-50 flex justify-center px-4 pointer-events-none`}
      >
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-slate-900 text-white pl-3 pr-4 py-3 shadow-overlay animate-pop-in max-w-md"
          >
            <span
              className={`w-7 h-7 rounded-full text-white grid place-items-center shrink-0 ${
                toast.tone === "info" ? "bg-slate-600" : "bg-green-500"
              }`}
              aria-hidden="true"
            >
              <Icon name={toast.tone === "info" ? "alertCircle" : "check"} size={15} strokeWidth={3} />
            </span>
            <span className="text-sm">
              <span className="font-semibold">{toast.title}</span>
              {toast.detail && (
                <span className="text-slate-300"> · {toast.detail}</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Shift legend: code, name and time for each shift this department
          uses. One swipeable row on phones, wrapped from sm up. */}
      {!isAllDepts && legendShifts.length > 0 && (
        <section
          aria-label={`Shifts for ${dept}`}
          className={`${CARD} overflow-hidden px-3 sm:px-4 py-3 sm:py-3.5`}
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="w-1 h-5 rounded-full bg-green-600 shrink-0" aria-hidden="true" />
            <h3 className="text-[0.9375rem] font-semibold text-slate-900 tracking-tight">
              Shifts
            </h3>
            <span className="min-w-0 truncate text-xs font-semibold rounded-full bg-green-50 text-green-800 ring-1 ring-inset ring-green-600/15 px-2 py-0.5">
              {dept}
            </span>
          </div>

          <ul className="flex gap-2 overflow-x-auto scroll-none snap-x -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
            {legendShifts.map((s) => (
              <li
                key={s.code}
                className="snap-start shrink-0 inline-flex items-center gap-2.5 rounded-xl bg-white ring-1 ring-inset ring-slate-200 shadow-card p-1.5 pr-3.5"
              >
                <span
                  className={`inline-flex items-center justify-center min-w-[3rem] h-8 rounded-lg px-2 text-xs font-bold tracking-tight shadow-[inset_0_0_0_1px_rgb(15_23_42/0.08)] ${s.classes}`}
                >
                  {s.code}
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-[0.8125rem] font-semibold text-slate-900 whitespace-nowrap">
                    {s.label}
                  </span>
                  <span className="text-xs text-slate-600 whitespace-nowrap tabular-nums mt-0.5">
                    {s.time || (s.isLeave ? "Leave" : s.code === "OFF" ? "Rest day" : "No set time")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? (
        <GridSkeleton />
      ) : visibleEmployees.length === 0 ? (
        <div className={`${CARD} px-6 py-14 text-center`}>
          <div className="mx-auto w-14 h-14 rounded-2xl bg-green-50 text-green-600 ring-1 ring-inset ring-green-600/10 grid place-items-center">
            <Icon name="users" size={24} strokeWidth={1.75} />
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-800">
            No employees in {isAllDepts ? "any department" : dept}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Add employees first, then come back to schedule them.
          </p>
        </div>
      ) : (
        <ScheduleGrid
          employees={visibleEmployees}
          days={days}
          schedules={schedules}
          onSetStatus={setStatus}
          pending={editing ? pending : null}
          readOnly={isAllDepts || !canEdit || !editing}
          leaveStatus={editing ? leaveStatus : null}
        />
      )}

      <ConfirmModal
        open={confirmClear}
        title="Clear this schedule?"
        message={
          <>
            You're about to clear all shifts for{" "}
            <strong className="text-slate-700">{dept}</strong> on{" "}
            <strong className="text-slate-700">
              {months[month - 1]} {year}
            </strong>{" "}
            ({half === 1 ? "1st Period (27 – 11)" : "2nd Period (12 – 26)"}).
            <span className="block text-xs text-rose-600 font-medium mt-2">
              Changes are still pending until you click Save.
            </span>
          </>
        }
        confirmLabel="Yes, clear"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmClearHalf}
        onCancel={() => setConfirmClear(false)}
      />

      <ConfirmModal
        open={discardAction !== null}
        title="Discard unsaved changes?"
        message={`You have ${pendingCount} unsaved ${pendingCount === 1 ? "change" : "changes"} in this schedule. Switching will discard ${pendingCount === 1 ? "it" : "them"}.`}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        variant="warning"
        onConfirm={() => {
          const action = discardAction;
          setDiscardAction(null);
          action?.();
        }}
        onCancel={() => setDiscardAction(null)}
      />

      <ConfirmModal
        open={conflict !== null}
        title="Someone else changed this schedule"
        message={
          conflict &&
          `${conflict.count} of the cells you edited ${conflict.count === 1 ? "was" : "were"} changed by another user after you started editing. Saving will replace their changes with yours.`
        }
        confirmLabel="Save mine anyway"
        cancelLabel="Keep editing"
        variant="warning"
        onConfirm={() => {
          const rows = conflict.serverRows;
          setConflict(null);
          commitSave(rows);
        }}
        onCancel={() => setConflict(null)}
      />

      {historyOpen && (
        <HistoryModal
          firstIso={firstIso}
          lastIso={lastIso}
          employeeIds={historyEmployeeIds}
          subtitle={`${isAllDepts ? "All departments" : dept} · ${periodTitle(days, month, year)} (${half === 1 ? "1st" : "2nd"} period)`}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}
