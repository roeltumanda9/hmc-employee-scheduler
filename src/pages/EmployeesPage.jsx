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
import Icon from "../components/Icon";
import {
  BTN,
  BTN_SIZE,
  CARD,
  INPUT,
  MENU,
  MENU_HEADING,
  MENU_ITEM,
} from "../lib/ui";

const DEPT_BADGE = "bg-slate-50 text-slate-700 ring-slate-900/10";

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

      <div className={CARD}>
        {/* Header */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
              Team directory
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              <span className="tabular-nums">{employees.length}</span>{" "}
              {employees.length === 1 ? "employee" : "employees"} registered
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            {/* Search */}
            <div className="relative flex-1 sm:flex-initial">
              <Icon
                name="search"
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, number or role…"
                aria-label="Search employees by name, number or role"
                type="search"
                className={`${INPUT} h-10 pl-9 sm:w-72`}
              />
            </div>

            {/* Add button (only for super admin) */}
            {canManage && (
              <button
                onClick={openAdd}
                className={`${BTN.primary} ${BTN_SIZE.md}`}
              >
                <Icon name="plus" size={16} strokeWidth={2.5} />
                Add employee
              </button>
            )}
          </div>
        </div>

        {/* Filter row */}
        <div className="px-4 sm:px-6 pb-4 flex items-center gap-3 border-b border-slate-100">
          <DepartmentFilterDropdown
            value={deptFilter}
            onChange={setDeptFilter}
            counts={counts}
          />
          <span className="ml-auto text-xs text-slate-500 font-medium whitespace-nowrap tabular-nums">
            Showing {filtered.length} of {employees.length}
          </span>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto scroll-thin rounded-b-2xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50/80 text-slate-500 text-left text-[0.6875rem] uppercase tracking-[0.08em]">
                <th className="px-6 py-3 font-semibold w-28">Emp. No.</th>
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
                  <td colSpan={canManage ? 5 : 4} className="p-0">
                    <ListSkeleton />
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={canManage ? 5 : 4}
                    className="px-6 py-14 text-center"
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
                      className="group hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-6 py-3">
                        <span className="inline-flex font-mono text-xs tabular-nums text-slate-600 bg-slate-100 rounded-md px-1.5 py-0.5">
                          {e.number || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="font-semibold text-slate-900 truncate uppercase">
                          {full || "—"}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1 ring-1 ring-inset ${DEPT_BADGE}`}
                        >
                          {e.department || "No department"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-600 uppercase text-[0.8125rem]">
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
          {loading && <ListSkeleton />}

          {!loading && filtered.length === 0 && (
            <div className="px-4 py-14 text-center">
              <EmptyState employees={employees} />
            </div>
          )}

          {!loading &&
            filtered.map((e) => {
              const full = displayName(e);
              return (
                <div key={e.id} className="px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 text-[0.9375rem] leading-snug uppercase break-words">
                      {full || "—"}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 uppercase truncate">
                      {e.role}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center text-[0.6875rem] font-medium rounded-full px-2 py-0.5 ring-1 ring-inset ${DEPT_BADGE}`}
                      >
                        {e.department || "No department"}
                      </span>
                      <span className="text-[0.6875rem] text-slate-400 font-mono tabular-nums">
                        {e.number ? `Emp. No. ${e.number}` : "No employee number"}
                      </span>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => openEdit(e)}
                        aria-label={`Edit ${full}`}
                        className={`${BTN.tertiary} h-10 px-3 text-xs flex-1`}
                      >
                        <Icon name="pencil" size={14} />
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmId(e.id)}
                        aria-label={`Delete ${full}`}
                        className={`${BTN.destructiveSoft} h-10 px-3 text-xs flex-1`}
                      >
                        <Icon name="trash" size={14} />
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

/* ------------------ Loading skeleton ------------------ */
function ListSkeleton() {
  return (
    <div className="px-4 sm:px-6 py-4 space-y-4" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse" aria-hidden="true">
          <div className="flex-1 space-y-2">
            <div className="h-3 rounded-full bg-slate-200/80 w-2/5" />
            <div className="h-2.5 rounded-full bg-slate-100 w-1/4" />
          </div>
          <div className="hidden sm:block h-6 w-24 rounded-full bg-slate-100" />
        </div>
      ))}
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
        className={`inline-flex items-center gap-2 rounded-xl h-10 px-3 text-sm font-medium transition w-full sm:w-auto sm:min-w-[15rem] justify-between bg-white shadow-card ${
          open
            ? "ring-2 ring-green-600"
            : "ring-1 ring-inset ring-slate-200 hover:ring-slate-300 hover:bg-slate-50"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon
            name="building"
            size={16}
            className={`shrink-0 ${isAll ? "text-slate-400" : "text-green-600"}`}
          />
          <span
            className={`truncate ${
              isAll ? "text-slate-800" : "text-green-700 font-semibold"
            }`}
          >
            {label}
          </span>
          <span className="text-[0.6875rem] font-semibold rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 shrink-0 tabular-nums">
            {activeCount}
          </span>
        </span>

        <Icon
          name="chevronDown"
          size={16}
          className={`text-slate-400 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Filter by department"
          onKeyDown={(e) => handleMenuKeyDown(e, menuRef.current, close)}
          className={`absolute z-50 top-full left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto overscroll-contain scroll-thin ${MENU}`}
        >
          <div className={MENU_HEADING} aria-hidden="true">
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
                className={`${MENU_ITEM} ${
                  active
                    ? "bg-green-50 text-green-800 focus:bg-green-100"
                    : "text-slate-700 hover:bg-slate-100 focus:bg-slate-100"
                }`}
              >
                <span className="flex-1 truncate font-medium">{opt.label}</span>
                <span
                  className={`text-[0.6875rem] font-semibold rounded-full px-1.5 py-0.5 shrink-0 tabular-nums ${
                    active
                      ? "bg-white text-green-700 ring-1 ring-inset ring-green-600/20"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {count}
                </span>
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

/* ------------------ Row actions ------------------ */
function RowActions({ name, onEdit, onAskDelete }) {
  return (
    <div className="flex justify-end gap-1">
      <button
        onClick={onEdit}
        aria-label={`Edit ${name}`}
        className={`${BTN.ghostBrand} ${BTN_SIZE.sm}`}
      >
        <Icon name="pencil" size={14} />
        Edit
      </button>
      <button
        onClick={onAskDelete}
        aria-label={`Delete ${name}`}
        className={`${BTN.destructiveGhost} ${BTN_SIZE.sm}`}
      >
        <Icon name="trash" size={14} />
        Delete
      </button>
    </div>
  );
}

/* ------------------ Empty state ------------------ */
function EmptyState({ employees }) {
  return (
    <div>
      <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-900/[0.06] grid place-items-center">
        <Icon name={employees.length === 0 ? "folder" : "search"} size={24} strokeWidth={1.75} />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-800">
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
