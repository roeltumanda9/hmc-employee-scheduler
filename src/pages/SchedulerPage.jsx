import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { MONTHS, getPayrollPeriodDays, periodTitle } from "../lib/dates";
import { printSchedule } from "../lib/printSchedule";
import {
  departmentNames,
  findDepartment,
  resolveShift,
  useSettings,
} from "../lib/settings";
import { canEditSchedules } from "../lib/auth";
import { friendlyError } from "../lib/errors";
import { handleMenuKeyDown } from "../lib/useDialog";
import ScheduleGrid from "../components/ScheduleGrid";
import ConfirmModal from "../components/ConfirmModal";
import ErrorBanner from "../components/ErrorBanner";
import Icon from "../components/Icon";
import {
  BTN,
  BTN_SIZE,
  CARD,
  EYEBROW,
  MENU,
  MENU_HEADING,
  MENU_ITEM,
  SPINNER,
  SPINNER_ON_BRAND,
} from "../lib/ui";

import { STATUS_MAP } from "../lib/statuses";

// Supabase returns at most 1000 rows per request by default, so page through.
const PAGE_SIZE = 1000;

async function fetchSchedules(firstIso, lastIso, employeeIds) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase
      .from("schedules")
      .select("*")
      .gte("date", firstIso)
      .lte("date", lastIso)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (employeeIds) q = q.in("employee_id", employeeIds);
    const { data, error } = await q;
    if (error) return { data: null, error };
    rows.push(...data);
    if (data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

function rowsByKey(rows) {
  const map = {};
  for (const s of rows || []) {
    const key = `${s.employee_id}|${s.date}`;
    if (!map[key]) map[key] = [];
    map[key].push(s);
  }
  return map;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Fallback save used until the `save_schedule_changes` database function is
 * installed. Works from fresh server rows (not the edit snapshot), so a retry
 * after a partial failure never inserts a second row for the same cell.
 * Not atomic: returns the first error, after which earlier batches are saved.
 */
async function saveInBatches(changes, serverRows) {
  const byKey = rowsByKey(serverRows);
  const deleteIds = [];
  const updates = {}; // status -> row ids
  const inserts = [];

  for (const { employee_id, date, status } of changes) {
    const [keep, ...extra] = byKey[`${employee_id}|${date}`] || [];
    // Extra rows for one cell are leftovers of earlier duplicate saves.
    deleteIds.push(...extra.map((s) => s.id));

    if (status === null) {
      if (keep) deleteIds.push(keep.id);
    } else if (!keep) {
      inserts.push({ employee_id, date, status });
    } else if (keep.status !== status) {
      if (!updates[status]) updates[status] = [];
      updates[status].push(keep.id);
    }
  }

  // 100 ids per request keeps the URL well under length limits.
  for (const ids of chunk(deleteIds, 100)) {
    const { error } = await supabase.from("schedules").delete().in("id", ids);
    if (error) return error;
  }
  for (const [status, allIds] of Object.entries(updates)) {
    for (const ids of chunk(allIds, 100)) {
      const { error } = await supabase
        .from("schedules")
        .update({ status })
        .in("id", ids);
      if (error) return error;
    }
  }
  for (const rows of chunk(inserts, 500)) {
    const { error } = await supabase.from("schedules").insert(rows);
    if (error) return error;
  }
  return null;
}

export default function SchedulerPage({ role, onDirtyChange }) {
  const canEdit = canEditSchedules(role);
  const settings = useSettings();

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;

  function monthOffset(delta) {
    let m = todayMonth + delta;
    let y = todayYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    if (m > 12) {
      m = 1;
      y += 1;
    }
    return { year: y, month: m };
  }

  const PREV = monthOffset(-1);
  const NEXT = monthOffset(1);

  function isAllowed(y, m) {
    const key = y * 100 + m;
    return (
      key >= PREV.year * 100 + PREV.month && key <= NEXT.year * 100 + NEXT.month
    );
  }

  const [confirmClear, setConfirmClear] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [pending, setPending] = useState({});
  const [error, setError] = useState("");
  // Navigation waiting on "discard unsaved changes?" confirmation.
  const [discardAction, setDiscardAction] = useState(null);
  // Save waiting on "someone else changed these cells" confirmation.
  const [conflict, setConflict] = useState(null);
  const loadSeq = useRef(0);

  const [month, setMonth] = useState(() => {
    const savedM = parseInt(localStorage.getItem("hmc_sched_month"), 10);
    const savedY = parseInt(localStorage.getItem("hmc_sched_year"), 10);
    if (
      savedM >= 1 &&
      savedM <= 12 &&
      savedY >= 2000 &&
      savedY <= 2100 &&
      isAllowed(savedY, savedM)
    ) {
      return savedM;
    }
    return todayMonth;
  });

  const [year, setYear] = useState(() => {
    const savedM = parseInt(localStorage.getItem("hmc_sched_month"), 10);
    const savedY = parseInt(localStorage.getItem("hmc_sched_year"), 10);
    if (
      savedM >= 1 &&
      savedM <= 12 &&
      savedY >= 2000 &&
      savedY <= 2100 &&
      isAllowed(savedY, savedM)
    ) {
      return savedY;
    }
    return todayYear;
  });

  const [half, setHalf] = useState(() => {
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
    const codes = findDepartment(settings, dept)?.shifts || [];
    const resolved = codes
      .map((code) => resolveShift(settings, code, dept))
      .filter(Boolean);

    const hasOff = resolved.some((s) => s.code === "OFF");
    if (!hasOff && STATUS_MAP["OFF"]) {
      resolved.push(STATUS_MAP["OFF"]);
    }
    return resolved;
  }, [dept, isAllDepts, settings]);

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

  const firstIso = days[0]?.iso;
  const lastIso = days[days.length - 1]?.iso;
  const pendingCount = Object.keys(pending).length;
  const dirty = editing && pendingCount > 0;

  async function load() {
    const seq = ++loadSeq.current;
    setLoading(true);

    const [empRes, schRes] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
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

    const key = `${employeeId}|${iso}`;
    setPending((prev) => ({ ...prev, [key]: status ?? null }));

    setSchedules((prev) => {
      const existing = prev.find(
        (s) => s.employee_id === employeeId && s.date === iso,
      );

      if (!status) {
        return prev.filter((s) => s.id !== existing?.id);
      }

      if (existing) {
        return prev.map((s) => (s.id === existing.id ? { ...s, status } : s));
      }

      return [
        ...prev,
        {
          id: `pending-${key}`,
          employee_id: employeeId,
          date: iso,
          status,
          _pending: true,
        },
      ];
    });
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
    const before = rowsByKey(editSnapshot);
    const now = rowsByKey(serverRows);
    const conflicts = Object.keys(pending).filter(
      (key) => (before[key]?.[0]?.status ?? null) !== (now[key]?.[0]?.status ?? null),
    ).length;

    if (conflicts > 0) {
      setSaving(false);
      setConflict({ count: conflicts, serverRows });
      return;
    }

    await commitSave(serverRows);
  }

  async function commitSave(serverRows) {
    setSaving(true);

    const changes = Object.entries(pending).map(([key, status]) => {
      const [employee_id, date] = key.split("|");
      return { employee_id, date, status };
    });

    // Atomic path: `save_schedule_changes` from supabase/proposed_integrity.sql.
    // PGRST202 means it isn't installed yet, so fall back to batched writes.
    let { error } = await supabase.rpc("save_schedule_changes", { changes });
    if (error?.code === "PGRST202") {
      error = await saveInBatches(changes, serverRows);
    }

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
  }

  function changeMonth(delta) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (!isAllowed(y, m)) return;
    setMonth(m);
    setYear(y);
  }

  function canGoPrev() {
    const current = year * 100 + month;
    return current > PREV.year * 100 + PREV.month;
  }

  function canGoNext() {
    const current = year * 100 + month;
    return current < NEXT.year * 100 + NEXT.month;
  }

  function handlePrint() {
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
      <div className="lg:sticky lg:top-[4.5rem] lg:z-40 lg:-mx-6 lg:px-6 lg:py-2.5 lg:bg-[#f6f8f7]/85 lg:backdrop-blur-md">
        <div className={`${CARD} p-2.5 sm:p-3 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center`}>
          {/* MONTH */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => confirmDiscard(() => changeMonth(-1))}
              disabled={!canGoPrev()}
              aria-label="Previous month"
              className={`${BTN.secondary} ${BTN_SIZE.icon} sm:h-11 sm:w-11 shrink-0`}
              title={
                canGoPrev() ? "Previous month" : "No earlier months available"
              }
            >
              <Icon name="chevronLeft" size={18} strokeWidth={2.5} />
            </button>

            <div className="flex-1 min-w-0 text-center px-1 lg:min-w-[12.5rem]">
              <div
                className="text-[1.0625rem] sm:text-lg font-bold text-slate-900 tracking-tight leading-tight truncate"
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
              className={`${BTN.secondary} ${BTN_SIZE.icon} sm:h-11 sm:w-11 shrink-0`}
              title={canGoNext() ? "Next month" : "No later months available"}
            >
              <Icon name="chevronRight" size={18} strokeWidth={2.5} />
            </button>
          </div>

          <div className="hidden xl:block h-8 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

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
              className="inline-flex h-10 sm:h-11 p-1 rounded-xl bg-slate-100 ring-1 ring-inset ring-slate-900/[0.04]"
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
                  className={`px-2.5 sm:px-3.5 h-full text-xs sm:text-sm font-semibold rounded-[9px] whitespace-nowrap tabular-nums transition ${
                    half === p.value
                      ? "bg-white text-green-700 shadow-card ring-1 ring-slate-900/[0.06]"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className="sm:hidden">{p.short}</span>
                  <span className="hidden sm:inline">{p.long}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ACTIONS (view mode) */}
          {!editing && (
            <div
              className={`grid gap-2 sm:gap-2.5 lg:flex lg:items-center lg:ml-auto ${
                showEditAction ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              <button
                onClick={handlePrint}
                disabled={visibleEmployees.length === 0}
                className={`${BTN.secondary} ${BTN_SIZE.md} sm:h-11`}
                title="Print this schedule"
              >
                <Icon name="printer" size={16} />
                Print
              </button>

              {showEditAction && (
                <button
                  onClick={() => {
                    setEditSnapshot(schedules);
                    setPending({});
                    setEditing(true);
                  }}
                  disabled={loading || visibleEmployees.length === 0}
                  className={`${BTN.primary} ${BTN_SIZE.md} sm:h-11 sm:px-5`}
                  title="Enable editing"
                >
                  <Icon name="pencil" size={16} strokeWidth={2.25} />
                  Edit
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
                  className={`${BTN.destructiveSoft} h-11 w-11 sm:w-auto sm:px-4 shrink-0`}
                  aria-label="Clear this period"
                  title={
                    isAllDepts
                      ? "Not available in preview mode"
                      : "Clear this period"
                  }
                >
                  <Icon name="trash" size={16} />
                  <span className="hidden sm:inline">Clear</span>
                </button>

                {!isAllDepts && (
                  <>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      className={`${BTN.secondary} h-11 px-4 flex-1 sm:flex-none`}
                      title="Discard changes"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdits}
                      disabled={saving || pendingCount === 0}
                      className={`${BTN.primary} h-11 px-5 flex-[1.4] sm:flex-none`}
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
                          {pendingCount > 0 && (
                            <span className="min-w-5 h-5 px-1.5 rounded-full bg-white/20 text-xs font-bold tabular-nums grid place-items-center">
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

      {editing && (
        <div className="flex items-center gap-3 rounded-2xl bg-amber-50 ring-1 ring-inset ring-amber-200/80 px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-amber-900 animate-fade-in">
          <span
            className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 grid place-items-center shrink-0"
            aria-hidden="true"
          >
            <Icon name="pencil" size={14} strokeWidth={2.5} />
          </span>
          <span className="flex-1 min-w-0">
            <strong className="font-semibold">Editing mode</strong> — changes aren't saved until you click{" "}
            <strong className="font-semibold">Save</strong>.
            {pendingCount > 0 && (
              <span className="ml-1 text-amber-700 tabular-nums">
                ({pendingCount} unsaved {pendingCount === 1 ? "change" : "changes"})
              </span>
            )}
          </span>
          <button
            onClick={cancelEdit}
            className="shrink-0 text-xs font-semibold text-amber-900 underline underline-offset-2 hover:no-underline"
          >
            Discard
          </button>
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* Shift legend: one swipeable row on phones, wrapped from sm up */}
      {!isAllDepts && legendShifts.length > 0 && (
        <div className={`${CARD} overflow-hidden px-3 sm:px-4 py-2.5 sm:py-3`}>
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <div className={EYEBROW}>Shifts</div>
            <div className="text-xs font-semibold text-slate-700 truncate">{dept}</div>
          </div>

          <ul className="flex gap-2 overflow-x-auto scroll-none snap-x -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
            {legendShifts.map((s) => (
              <li
                key={s.code}
                className="snap-start shrink-0 inline-flex items-center gap-2 rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-900/[0.05] p-1 pr-3"
              >
                <span
                  className={`inline-flex items-center justify-center min-w-[2.75rem] h-7 rounded-lg px-2 text-xs font-bold tracking-tight shadow-[inset_0_0_0_1px_rgb(15_23_42/0.06)] ${s.classes}`}
                >
                  {s.code}
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                    {s.label}
                  </span>
                  {s.time && (
                    <span className="text-[0.6875rem] text-slate-500 whitespace-nowrap tabular-nums">
                      {s.time}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
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
          readOnly={isAllDepts || !canEdit || !editing}
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
    </div>
  );
}

/* ------------------ Loading skeleton ------------------ */
function GridSkeleton() {
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

/* ------------------ Department dropdown ------------------ */
function DepartmentDropdown({ value, onChange }) {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    menuRef.current?.querySelector('[aria-selected="true"]')?.focus();
    return () => {
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  function close(refocus) {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }

  const isAll = value === "all";
  const label = isAll ? "All departments" : value;

  const options = [
    { value: "all", label: "All departments", preview: true },
    ...departmentNames(settings, { activeOnly: true, keep: value })
      .sort((a, b) => a.localeCompare(b))
      .map((d) => ({ value: d, label: d, preview: false })),
  ];

  return (
    <div ref={wrapRef} className="relative min-w-0 w-full lg:w-auto">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Department: ${label}`}
        className={`inline-flex items-center gap-2 rounded-xl px-3 sm:px-3.5 h-10 sm:h-11 text-sm font-semibold transition w-full lg:min-w-[11rem] lg:w-auto justify-between bg-white shadow-card ${
          open
            ? "ring-2 ring-green-600"
            : "ring-1 ring-inset ring-slate-200 hover:ring-slate-300 hover:bg-slate-50"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon
            name="building"
            size={16}
            className={`shrink-0 ${isAll ? "text-green-600" : "text-slate-400"}`}
          />
          <span
            className={`truncate ${isAll ? "text-green-700" : "text-slate-800"}`}
          >
            {label}
          </span>
        </span>

        <Icon
          name="chevronDown"
          size={16}
          className={`text-slate-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Select department"
          onKeyDown={(e) => handleMenuKeyDown(e, menuRef.current, close)}
          className={`absolute z-40 top-full left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto overscroll-contain scroll-thin ${MENU}`}
        >
          <div className={MENU_HEADING} aria-hidden="true">
            Select department
          </div>

          {options.map((opt) => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  close(true);
                  onChange(opt.value);
                }}
                className={`${MENU_ITEM} ${
                  active
                    ? "bg-green-50 text-green-800 focus:bg-green-100"
                    : "text-slate-700 hover:bg-slate-100 focus:bg-slate-100"
                }`}
              >
                <span className="flex-1 truncate font-medium">{opt.label}</span>

                {opt.preview && (
                  <span className="text-[0.625rem] uppercase tracking-wider font-bold text-green-700 bg-white ring-1 ring-inset ring-green-600/20 rounded-full px-1.5 py-0.5 shrink-0">
                    Preview
                  </span>
                )}

                {active && (
                  <Icon
                    name="check"
                    size={16}
                    strokeWidth={3}
                    className="text-green-600 shrink-0"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
