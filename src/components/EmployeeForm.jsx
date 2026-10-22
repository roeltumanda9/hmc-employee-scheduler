import { useEffect, useId, useState } from "react";
import { supabase } from "../lib/supabase";
import { departmentNames, useSettings } from "../lib/settings";
import { buildFullName, formatName, formatRole } from "../lib/format";
import { friendlyError } from "../lib/errors";
import { useDialog } from "../lib/useDialog";
import { BACKDROP, BTN, BTN_SIZE, DIALOG, INPUT, LABEL, SPINNER_ON_BRAND } from "../lib/ui";
import Icon from "./Icon";

const empty = {
  first_name: "",
  middle_name: "",
  last_name: "",
  number: "",
  department: "",
  role: "",
};

// Find the next employee number by looking at existing numbers
async function getNextEmployeeNumber() {
  const { data, error } = await supabase.from("employees").select("number");

  if (error || !data) return "1001";

  const nums = data.map((r) => parseInt(r.number, 10)).filter((n) => !isNaN(n));

  if (nums.length === 0) return "1001";
  const max = Math.max(...nums);
  return String(max + 1);
}

export default function EmployeeForm({ open, editing, onDone, onCancel }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [loadingNumber, setLoadingNumber] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useDialog(open, onCancel);
  const settings = useSettings();
  // Inactive departments are hidden, except the one this employee is already in.
  const departmentOptions = departmentNames(settings, {
    activeOnly: true,
    keep: editing?.department,
  });
  const titleId = useId();

  // Load form values when the modal opens
  useEffect(() => {
    if (!open) return;
    setError("");

    if (editing) {
      setForm({
        first_name: editing.first_name || "",
        middle_name: editing.middle_name || "",
        last_name: editing.last_name || "",
        number: String(editing.number ?? ""),
        department: editing.department || "",
        role: editing.role || "",
      });
      return;
    }

    // Adding new — fetch the next auto-assigned number
    setForm(empty);
    setLoadingNumber(true);
    let cancelled = false;

    (async () => {
      const next = await getNextEmployeeNumber();
      if (!cancelled) {
        setForm((f) => ({ ...f, number: next }));
        setLoadingNumber(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, editing]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim(),
      last_name: form.last_name.trim(),
      name: buildFullName(form),
      number: String(form.number ?? "").trim(),
      department: form.department.trim(),
      role: form.role.trim(),
    };

    let error;
    if (editing) {
      ({ error } = await supabase
        .from("employees")
        .update(payload)
        .eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("employees").insert(payload));

      // Another admin took this number first. Once employees.number is unique
      // in the database this surfaces as 23505, so fetch a fresh number and retry.
      for (let attempt = 0; attempt < 3 && isNumberTaken(error); attempt++) {
        payload.number = await getNextEmployeeNumber();
        ({ error } = await supabase.from("employees").insert(payload));
      }
    }

    setSaving(false);
    if (error) {
      setError(
        friendlyError(error, editing ? "save this employee" : "add this employee"),
      );
      return;
    }

    setForm(empty);
    onDone();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      <div className={BACKDROP} onClick={onCancel} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${DIALOG} sm:max-w-2xl rounded-t-3xl sm:rounded-2xl overflow-hidden max-h-[92dvh] sm:max-h-[90vh] flex flex-col max-sm:animate-sheet-up`}
      >
        <div className="sm:hidden pt-2.5" aria-hidden="true">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="px-5 sm:px-6 pt-3 pb-4 sm:py-5 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="hidden sm:grid w-10 h-10 rounded-xl bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/15 place-items-center shrink-0"
              aria-hidden="true"
            >
              <Icon name={editing ? "pencil" : "plus"} size={18} strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
                {editing ? "Edit employee" : "Add new employee"}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {editing
                  ? "Update the details and save your changes."
                  : "Fill in the details to register a new staff member."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className={`${BTN.ghost} ${BTN_SIZE.icon} -mr-2 -mt-1 shrink-0`}
            title="Close"
            aria-label="Close"
          >
            <Icon name="x" size={18} strokeWidth={2.25} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-5 sm:px-6 py-5 sm:py-6 overflow-y-auto overscroll-contain space-y-5">
            {error && (
              <div
                role="alert"
                className="rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-200/80 px-4 py-3 text-sm text-rose-800"
              >
                {error}
              </div>
            )}

            {/* Name row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="First name">
                <input
                  required
                  autoFocus
                  value={form.first_name}
                  onChange={(e) =>
                    update("first_name", formatName(e.target.value))
                  }
                  placeholder="e.g. JUAN"
                  className={`${INPUT} uppercase`}
                />
              </Field>

              <Field label="Middle name">
                <input
                  value={form.middle_name}
                  onChange={(e) =>
                    update("middle_name", formatName(e.target.value))
                  }
                  placeholder="e.g. SANTOS"
                  className={`${INPUT} uppercase`}
                />
              </Field>

              <Field label="Last name">
                <input
                  required
                  value={form.last_name}
                  onChange={(e) =>
                    update("last_name", formatName(e.target.value))
                  }
                  placeholder="e.g. DELA CRUZ"
                  className={`${INPUT} uppercase`}
                />
              </Field>
            </div>

            {/* Department + Role */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Department">
                <select
                  required
                  value={form.department}
                  onChange={(e) => update("department", e.target.value)}
                  className={`${INPUT} ${
                    form.department ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  <option value="" disabled>
                    Select department
                  </option>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d} className="text-slate-800">
                      {d}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Role">
                <input
                  required
                  value={form.role}
                  onChange={(e) => update("role", formatRole(e.target.value))}
                  placeholder="e.g. CASHIER"
                  className={`${INPUT} uppercase`}
                />
              </Field>
            </div>

            {/* Preview */}
            <div className="rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-900/[0.05] px-4 py-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-slate-500 text-xs">Display name:</span>
              <span className="font-semibold text-slate-900 uppercase">
                {buildFullName(form) || "—"}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 sm:px-6 py-3.5 sm:py-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] bg-slate-50/70 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className={`${BTN.secondary} ${BTN_SIZE.lg} sm:h-10 w-full sm:w-auto`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loadingNumber}
              className={`${BTN.primary} ${BTN_SIZE.lg} sm:h-10 w-full sm:w-auto`}
            >
              {saving ? (
                <>
                  <span className={SPINNER_ON_BRAND} />
                  Saving…
                </>
              ) : editing ? (
                "Save changes"
              ) : (
                "Add employee"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function isNumberTaken(error) {
  return (
    error?.code === "23505" &&
    /number/i.test(`${error.message} ${error.details || ""}`)
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}
