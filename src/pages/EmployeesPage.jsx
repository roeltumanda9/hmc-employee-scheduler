import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { departmentNames, useSettings } from "../lib/settings";
import EmployeeForm from "../components/EmployeeForm";
import ConfirmModal from "../components/ConfirmModal";
import ErrorBanner from "../components/ErrorBanner";
import { canManageEmployees } from "../lib/auth";
import { friendlyError } from "../lib/errors";
import { buildFullName } from "../lib/format";
import { handleMenuKeyDown } from "../lib/useDialog";

const DEPT_BADGE = "bg-slate-100 text-slate-700 ring-slate-200";

// "DELA CRUZ, JUAN S."
function displayName(e) {
  const f = (e.first_name || "").trim();
  const l = (e.last_name || "").trim();
  if (f || l) return buildFullName(e);
  return (e.name || "").toUpperCase();
}

export default function EmployeesPage({ role }) {
  const canManage = canManageEmployees(role);
  const settings = useSettings();

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [error, setError] = useState("");

  async function loadEmployees() {
    setLoading(true);
    const { data, error } = await supabase.from("employees").select("*");

    if (error) {
      setError(friendlyError(error, "load employees"));
    } else {
      setError("");
      const sorted = [...data].sort((a, b) => {
        const na = parseInt(a.number, 10);
        const nb = parseInt(b.number, 10);
        if (isNaN(na) && isNaN(nb)) return 0;
        if (isNaN(na)) return 1;
        if (isNaN(nb)) return -1;
        return na - nb;
      });
      setEmployees(sorted);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  async function handleDelete(id) {
    if (!canManage || !id) return;

    const { error } = await supabase.from("employees").delete().eq("id", id);

    setConfirmId(null);

    if (error) setError(friendlyError(error, "delete this employee"));
    else loadEmployees();
  }

  function openAdd() {
    if (!canManage) return;

    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(emp) {
    if (!canManage || !emp) return;

    setEditing(emp);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = employees.filter((e) => {
      if (deptFilter !== "all" && e.department !== deptFilter) return false;
      if (!q) return true;
      const haystack = [
        e.first_name,
        e.middle_name,
        e.last_name,
        e.name,
        e.number,
        e.role,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    // Sort by department (A–Z), then by name (A–Z)
    return [...result].sort((a, b) => {
      if (a.department !== b.department) {
        return (a.department || "").localeCompare(b.department || "");
      }
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [employees, search, deptFilter]);

  const counts = useMemo(() => {
    const c = { all: employees.length };
    for (const d of departmentNames(settings)) c[d] = 0;
    for (const e of employees) c[e.department] = (c[e.department] || 0) + 1;
    return c;
  }, [employees, settings]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {canManage && (
  <EmployeeForm
    open={formOpen}
    editing={editing}
    onDone={() => {
      closeForm();
      loadEmployees();
    }}
    onCancel={closeForm}
  />
)}

      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Team directory
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {employees.length}{" "}
              {employees.length === 1 ? "employee" : "employees"} registered
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            {/* Search */}
            <div className="relative flex-1 sm:flex-initial">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                aria-label="Search employees by name, number or role"
                type="search"
                className="w-full sm:w-56 rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-3 py-2.5 sm:py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
              />
            </div>

            {/* Add button (only for super admin) */}
            {canManage && (
              <button
                onClick={openAdd}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700 active:scale-95 shadow-sm shadow-green-200 transition"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add employee
              </button>
            )}
          </div>
        </div>

        {/* Filter row */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex items-center gap-3">
          <DepartmentFilterDropdown
            value={deptFilter}
            onChange={setDeptFilter}
            counts={counts}
          />
          <span className="ml-auto text-[11px] text-slate-400 font-medium">
            Showing {filtered.length} of {employees.length}
          </span>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto rounded-b-2xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wider">
                <th className="px-6 py-3 font-semibold w-24">Emp. No.</th>
                <th className="px-6 py-3 font-semibold">Employee</th>
                <th className="px-6 py-3 font-semibold">Department</th>
                <th className="px-6 py-3 font-semibold">Role</th>
                {canManage && (
                  <th className="px-6 py-3 font-semibold text-right">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td
                    colSpan={canManage ? 5 : 4}
                    className="px-6 py-12 text-center"
                  >
                    <div className="inline-block w-5 h-5 border-2 border-slate-300 border-t-green-600 rounded-full animate-spin" />
                    <p className="mt-2 text-xs text-slate-500">Loading…</p>
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={canManage ? 5 : 4}
                    className="px-6 py-12 text-center"
                  >
                    <EmptyState employees={employees} />
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((e) => {
                  const full = displayName(e);
                  return (
                    <tr
                      key={e.id}
                      className="hover:bg-green-50/40 transition-colors"
                    >
                      <td className="px-6 py-3 text-slate-600 font-mono text-xs tabular-nums">
                        {e.number || "—"}
                      </td>
                      <td className="px-6 py-3">
                        <div className="font-medium text-slate-800 truncate uppercase">
                          {full || "—"}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1 ring-1 ${DEPT_BADGE}`}
                        >
                          {e.department || "No department"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-600 uppercase">
                        {e.role}
                      </td>
                      {canManage && (
                        <td className="px-6 py-3">
                          <RowActions
                            name={full}
                            onEdit={() => openEdit(e)}
                            onAskDelete={() => setConfirmId(e.id)}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-slate-100 rounded-b-2xl overflow-hidden">
          {loading && (
            <div className="px-4 py-12 text-center">
              <div className="inline-block w-5 h-5 border-2 border-slate-300 border-t-green-600 rounded-full animate-spin" />
              <p className="mt-2 text-xs text-slate-500">Loading…</p>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="px-4 py-12 text-center">
              <EmptyState employees={employees} />
            </div>
          )}

          {!loading &&
            filtered.map((e) => {
              const full = displayName(e);
              return (
                <div key={e.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate uppercase">
                        {full || "—"}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {e.number ? `Emp. No. ${e.number}` : "No employee number"}
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center text-[10px] font-medium rounded-full px-2 py-1 ring-1 ${DEPT_BADGE}`}
                    >
                      {e.department || "No department"}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 uppercase">
                    {e.role}
                  </div>

                  {canManage && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => openEdit(e)}
                        aria-label={`Edit ${full}`}
                        className="flex-1 text-xs font-semibold text-green-700 py-2.5 rounded-lg bg-green-50 hover:bg-green-100 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmId(e.id)}
                        aria-label={`Delete ${full}`}
                        className="flex-1 text-xs font-semibold text-rose-600 py-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 transition"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={confirmId !== null}
        title="Delete this employee?"
        message={
          confirmId && employees.find((e) => e.id === confirmId) ? (
            <>
              You're about to permanently delete{" "}
              <strong className="text-slate-700">
                {displayName(employees.find((e) => e.id === confirmId))}
              </strong>
              . This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Yes, delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => handleDelete(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}

/* ------------------ Department filter dropdown ------------------ */
function DepartmentFilterDropdown({ value, onChange, counts }) {
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
  const activeCount = counts[value] ?? 0;

  const options = [
    { value: "all", label: "All departments" },
    ...departmentNames(settings)
      .sort((a, b) => a.localeCompare(b))
      .map((d) => ({ value: d, label: d })),
  ];

  return (
    <div ref={wrapRef} className="relative min-w-0">
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
        aria-label={`Filter by department: ${label}`}
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition w-full sm:w-auto sm:min-w-[220px] justify-between ${
          open
            ? "border-green-500 ring-2 ring-green-100 bg-white"
            : "border-slate-200 bg-slate-50/60 hover:bg-white"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <svg
            className={isAll ? "text-slate-400" : "text-green-600"}
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
            className={`truncate ${
              isAll ? "text-slate-800" : "text-green-700 font-semibold"
            }`}
          >
            {label}
          </span>
          <span className="text-[10px] font-bold rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 shrink-0">
            {activeCount}
          </span>
        </span>

        <svg
          className={`text-slate-400 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
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
          aria-label="Filter by department"
          onKeyDown={(e) => handleMenuKeyDown(e, menuRef.current, close)}
          className="absolute z-50 top-full left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 p-1.5"
        >
          <div
            className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold"
            aria-hidden="true"
          >
            Filter by department
          </div>

          {options.map((opt) => {
            const active = value === opt.value;
            const count = counts[opt.value] ?? 0;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(opt.value);
                  close(true);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition ${
                  active
                    ? "bg-green-50 text-green-800"
                    : "hover:bg-slate-50 text-slate-700"
                }`}
              >
                <span className="flex-1 truncate font-medium">{opt.label}</span>
                <span
                  className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0 ${
                    active
                      ? "bg-white text-green-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {count}
                </span>
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

/* ------------------ Row actions ------------------ */
function RowActions({ name, onEdit, onAskDelete }) {
  return (
    <div className="flex justify-end gap-1">
      <button
        onClick={onEdit}
        aria-label={`Edit ${name}`}
        className="text-xs font-medium text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-50 transition"
      >
        Edit
      </button>
      <button
        onClick={onAskDelete}
        aria-label={`Delete ${name}`}
        className="text-xs font-medium text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition"
      >
        Delete
      </button>
    </div>
  );
}

/* ------------------ Empty state ------------------ */
function EmptyState({ employees }) {
  return (
    <div>
      <div className="text-3xl">🗂️</div>
      <p className="mt-2 text-sm font-medium text-slate-700">
        {employees.length === 0 ? "No employees yet" : "No results found"}
      </p>
      <p className="text-xs text-slate-500 mt-1">
        {employees.length === 0
          ? 'Click "Add employee" to get started.'
          : "Try a different search or filter."}
      </p>
    </div>
  );
}
