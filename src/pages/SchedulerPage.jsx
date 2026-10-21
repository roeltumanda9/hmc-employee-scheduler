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

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Pinned only on large screens, just below the app header (z-30).
          On phones and tablets it scrolls away so the grid gets the screen. */}
      <div className="lg:sticky lg:top-[calc(4.5rem+1px)] lg:z-20 lg:-mx-6 lg:px-6 lg:py-2 lg:bg-slate-100/80 lg:backdrop-blur lg:border-b lg:border-slate-200">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-2.5 sm:p-4 grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
          {/* MONTH */}
          <div className="order-1 sm:order-none col-span-2 flex flex-col items-center sm:flex-1 sm:min-w-[300px]">
            <div className="flex items-center justify-center gap-2 sm:gap-3 h-10 sm:h-12 w-full">
              <button
                onClick={() => confirmDiscard(() => changeMonth(-1))}
                disabled={!canGoPrev()}
                aria-label="Previous month"
                className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 grid place-items-center rounded-xl text-white bg-gradient-to-br from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 active:scale-95 shadow-sm shadow-green-200 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-400 shrink-0"
                title={
                  canGoPrev() ? "Previous month" : "No earlier months available"
                }
              >
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <div className="text-center flex-1 sm:flex-none sm:min-w-[200px]">
                <div
                  className="text-base sm:text-xl md:text-2xl font-black text-green-800 tracking-tight leading-none"
                  aria-live="polite"
                >
                  {periodTitle(days, month, year)}
                </div>
              </div>

              <button
                onClick={() => confirmDiscard(() => changeMonth(1))}
                disabled={!canGoNext()}
                aria-label="Next month"
                className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 grid place-items-center rounded-xl text-white bg-gradient-to-br from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 active:scale-95 shadow-sm shadow-green-200 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-400 shrink-0"
                title={canGoNext() ? "Next month" : "No later months available"}
              >
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>

          <div className="hidden xl:block h-12 w-px bg-slate-200" />

          {/* PERIOD */}
          <div className="order-2 sm:order-none flex flex-col items-stretch sm:items-center min-w-0">
            <div
              className="hidden sm:block text-[10px] uppercase tracking-[0.2em] text-green-700 font-bold mb-1"
            >
              Period
            </div>
            <div
              role="group"
              aria-label="Payroll period"
              className="inline-flex rounded-xl bg-slate-100 p-1 h-10 sm:h-12 items-center shadow-inner w-full sm:w-auto justify-center"
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
                  className={`px-2 sm:px-4 h-full text-xs sm:text-sm font-bold rounded-lg transition flex-1 sm:flex-none whitespace-nowrap ${
                    half === p.value
                      ? "bg-white text-green-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <span className="sm:hidden">{p.short}</span>
                  <span className="hidden sm:inline">{p.long}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="hidden xl:block h-12 w-px bg-slate-200" />

          {/* ACTIONS */}
          {canEdit && !isAllDepts && (
            <div className="order-4 sm:order-none flex flex-col items-stretch sm:items-center min-w-0">
              <div className="hidden sm:block text-[10px] uppercase tracking-[0.2em] text-green-700 font-bold mb-1">
                {editing ? "Editing" : "Actions"}
              </div>

              {!editing ? (
                <button
                  onClick={() => {
                    setEditSnapshot(schedules);
                    setPending({});
                    setEditing(true);
                  }}
                  disabled={loading || visibleEmployees.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 h-10 sm:h-12 w-full sm:w-auto text-xs sm:text-sm font-black text-white bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-500 hover:to-amber-700 active:scale-95 shadow-sm shadow-amber-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none rounded-xl transition"
                  title="Enable editing"
                >
                  <svg
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                  EDIT
                </button>
              ) : (
                <div className="flex items-center gap-1.5 sm:gap-2 h-10 sm:h-12 w-full sm:w-auto">
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 h-full flex-1 sm:flex-none text-xs sm:text-sm font-black text-slate-700 bg-white border-2 border-slate-200 hover:bg-slate-50 active:scale-95 disabled:opacity-40 rounded-xl transition"
                    title="Discard changes"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={saveEdits}
                    disabled={saving || pendingCount === 0}
                    className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 h-full flex-1 sm:flex-none text-xs sm:text-sm font-black text-white bg-gradient-to-br from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 active:scale-95 shadow-sm shadow-green-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none rounded-xl transition"
                    title="Save changes"
                  >
                    {saving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        SAVING…
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        SAVE
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="hidden xl:block h-12 w-px bg-slate-200" />

          {/* DEPARTMENT */}
          <div className="order-3 sm:order-none flex flex-col items-stretch sm:items-center min-w-0">
            <div className="hidden sm:block text-[10px] uppercase tracking-[0.2em] text-green-700 font-bold mb-1">
              Department
            </div>
            <div className="h-10 sm:h-12 flex items-stretch w-full sm:w-auto">
              <DepartmentDropdown
                value={dept}
                onChange={(next) => {
                  if (next !== dept) confirmDiscard(() => setDept(next));
                }}
              />
            </div>
          </div>

          <div className="hidden xl:block h-12 w-px bg-slate-200" />

          {/* TOOLS */}
          <div
            className={`order-5 sm:order-none flex flex-col items-stretch sm:items-center min-w-0 ${
              canEdit && !isAllDepts ? "" : "col-span-2"
            }`}
          >
            <div className="hidden sm:block text-[10px] uppercase tracking-[0.2em] text-green-700 font-bold mb-1">
              Tools
            </div>
            <div className="flex items-center gap-2 h-10 sm:h-12 w-full sm:w-auto">
              {canEdit && editing && (
                <button
                  onClick={askClearHalf}
                  disabled={isAllDepts || visibleEmployees.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 h-full flex-1 sm:flex-none text-xs sm:text-sm font-medium rounded-xl border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  title={
                    isAllDepts
                      ? "Not available in preview mode"
                      : "Clear this period"
                  }
                >
                  <svg
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                  Clear
                </button>
              )}

              {!editing && (
                <button
                  onClick={handlePrint}
                  disabled={visibleEmployees.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 h-full flex-1 sm:flex-none text-xs sm:text-sm font-semibold rounded-xl border border-green-200 text-green-700 bg-white hover:bg-green-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  title="Print this schedule"
                >
                  <svg
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Print
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <div className="bg-amber-50 ring-1 ring-amber-200 rounded-2xl px-3 sm:px-4 py-2 flex items-center gap-3 text-xs sm:text-sm text-amber-800 max-w-6xl mx-auto w-full">
          <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
          <span className="flex-1">
            <strong>Editing mode</strong> — changes aren't saved until you click{" "}
            <strong>Save</strong>.
            {pendingCount > 0 && (
              <span className="ml-1 text-amber-700">
                ({pendingCount} unsaved {pendingCount === 1 ? "change" : "changes"})
              </span>
            )}
          </span>
          <button
            onClick={cancelEdit}
            className="text-[11px] font-semibold text-amber-900 underline hover:no-underline"
          >
            Discard
          </button>
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* Stats row */}
      <div className="flex flex-col sm:flex-row items-stretch gap-3">
        <div className="w-full sm:w-[180px] sm:shrink-0 flex">
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 px-4 py-3 w-full flex flex-col items-center justify-center text-center">
            <div className="text-[10px] uppercase tracking-widest text-green-700 font-bold">
              Employees
            </div>
            <div className="mt-1 text-3xl sm:text-4xl font-black text-green-800 leading-none">
              {visibleEmployees.length}
            </div>
          </div>
        </div>

        {!isAllDepts && legendShifts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 px-4 py-3 sm:px-5 sm:py-4 flex-1">
            <div className="flex items-baseline justify-between mb-2 sm:mb-3">
              <div className="text-[10px] uppercase tracking-widest text-green-700 font-bold">
                Shifts
              </div>
              <div className="text-xs sm:text-sm font-bold text-slate-700">
                {dept}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-2">
              {legendShifts.map((s) => (
                <div key={s.code} className="inline-flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center min-w-[40px] sm:min-w-[48px] h-7 sm:h-8 rounded-md px-2 text-xs font-black tracking-wide shadow-sm ${s.classes}`}
                  >
                    {s.code}
                  </span>
                  <div className="flex flex-col leading-tight">
                    <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                      {s.label}
                    </span>
                    {s.time && (
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {s.time}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-12 text-center max-w-6xl mx-auto w-full">
          <div className="inline-block w-6 h-6 border-2 border-slate-300 border-t-green-600 rounded-full animate-spin" />
          <p className="mt-3 text-sm text-slate-500">Loading schedule…</p>
        </div>
      ) : visibleEmployees.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-12 text-center max-w-6xl mx-auto w-full">
          <div className="text-4xl">👥</div>
          <p className="mt-3 text-sm font-medium text-slate-700">
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
    <div ref={wrapRef} className="relative w-full sm:w-auto">
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
        className={`inline-flex items-center gap-2 rounded-xl border px-3 sm:px-4 h-full text-xs sm:text-sm font-bold transition w-full sm:min-w-[200px] sm:w-auto justify-between ${
          open
            ? "border-green-500 ring-2 ring-green-100 bg-white"
            : "border-slate-200 bg-slate-50/60 hover:bg-white"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <svg
            className={isAll ? "text-green-600" : "text-slate-400"}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 21h18" />
            <path d="M5 21V7l7-4 7 4v14" />
            <path d="M9 21v-6h6v6" />
          </svg>
          <span
            className={`truncate ${isAll ? "text-green-700 font-semibold" : "text-slate-800"}`}
          >
            {label}
          </span>
        </span>

        <svg
          className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Select department"
          onKeyDown={(e) => handleMenuKeyDown(e, menuRef.current, close)}
          className="absolute z-40 top-full right-0 sm:right-auto sm:left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 p-1.5"
        >
          <div
            className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold"
            aria-hidden="true"
          >
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
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition ${
                  active
                    ? "bg-green-50 text-green-800"
                    : "hover:bg-slate-50 text-slate-700"
                }`}
              >
                <span className="flex-1 truncate font-medium">{opt.label}</span>

                {opt.preview && (
                  <span className="text-[10px] uppercase tracking-wider font-bold text-green-700 bg-green-50 ring-1 ring-green-100 rounded-full px-1.5 py-0.5 shrink-0">
                    Preview
                  </span>
                )}

                {active && (
                  <svg
                    className="text-green-600 shrink-0"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
