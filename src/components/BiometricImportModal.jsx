import { useId, useMemo, useState } from "react";
import {
  departmentMapFor,
  loadDeptMap,
  matchPeople,
  planImport,
  readAttendanceFile,
  saveDeptMap,
} from "../lib/biometricImport";
import { nextNumberFrom, saveEmployeeImport } from "../lib/employeeData";
import { friendlyError } from "../lib/errors";
import { departmentNames, useSettings } from "../lib/settings";
import { useDialog } from "../lib/useDialog";
import { BACKDROP, BTN, BTN_SIZE, DIALOG, EYEBROW, INPUT_SM, SPINNER_ON_BRAND } from "../lib/ui";
import ErrorBanner from "./ErrorBanner";
import Icon from "./Icon";

/**
 * Employees → Import from biometric. Reads an ATT2000 export (.xls), shows
 * what would change (new employees, name / department corrections), and
 * writes the ticked changes. Rendered only while open.
 */
export default function BiometricImportModal({ employees, onChanged, onClose }) {
  const [busy, setBusy] = useState(false);
  const dialogRef = useDialog(true, busy ? () => {} : onClose);
  const titleId = useId();
  const settings = useSettings();
  const appDepartments = departmentNames(settings, { activeOnly: true });

  const [file, setFile] = useState(null); // { name, people }
  const [deptMap, setDeptMap] = useState({});
  const [toggled, setToggled] = useState(() => new Set());
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { added, updated }

  const withBioNo = employees.some((e) => "biometric_no" in e);
  const matches = useMemo(
    () => (file ? matchPeople(file.people, employees) : new Map()),
    [file, employees],
  );
  const plan = useMemo(
    () =>
      file &&
      planImport({
        people: file.people,
        employees,
        matches,
        deptMap,
        withBioNo,
        firstNumber: nextNumberFrom(employees.map((e) => e.number)),
      }),
    [file, employees, matches, deptMap, withBioNo],
  );

  const isChecked = (item) => (item.doubtful ? toggled.has(item.key) : !toggled.has(item.key));
  const chosenInserts = plan ? plan.inserts.filter(isChecked) : [];
  const chosenUpdates = plan ? plan.updates.filter(isChecked) : [];
  const chosenCount = chosenInserts.length + chosenUpdates.length;

  function toggle(key) {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError("");
    try {
      const people = await readAttendanceFile(f);
      setDeptMap(departmentMapFor(people, matchPeople(people, employees), appDepartments, loadDeptMap()));
      setToggled(new Set());
      setFile({ name: f.name, people });
    } catch (err) {
      setError(err.message || "Couldn't read this file.");
    }
  }

  function changeDept(att, value) {
    const next = { ...deptMap, [att]: value };
    setDeptMap(next);
    saveDeptMap(next);
  }

  async function apply() {
    if (!chosenCount) return;
    setBusy(true);
    setError("");
    const { added, updated, error } = await saveEmployeeImport(chosenInserts, chosenUpdates);
    finish(error, added, updated);
  }

  function finish(err, added, updated) {
    setBusy(false);
    if (added || updated) onChanged();
    if (err) {
      const done = added || updated ? ` ${added} added and ${updated} updated before the error.` : "";
      setError(friendlyError(err, "import the employees") + done);
      // What was saved is gone from the plan after the reload; start over from the file.
      if (added || updated) setFile(null);
      return;
    }
    setResult({ added, updated });
  }

  const attDepts = file ? [...new Set(file.people.map((p) => p.department))] : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      <div className={BACKDROP} onClick={busy ? undefined : onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${DIALOG} sm:max-w-3xl rounded-t-3xl sm:rounded-2xl overflow-hidden max-h-[92dvh] sm:max-h-[90vh] flex flex-col max-sm:animate-sheet-up`}
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
              <Icon name="users" size={18} strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
                Import from biometric
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">
                {file ? file.name : "Update employees from an ATT2000 Excel export"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={`${BTN.ghost} ${BTN_SIZE.icon} -mr-2 -mt-1 shrink-0`}
            title="Close"
            aria-label="Close"
          >
            <Icon name="x" size={18} strokeWidth={2.25} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-6 py-5 overflow-y-auto overscroll-contain scroll-thin space-y-5 flex-1 min-h-0">
          {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

          {result ? (
            <div className="py-6 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-green-50 text-green-600 ring-1 ring-inset ring-green-600/15 grid place-items-center">
                <Icon name="check" size={24} strokeWidth={2.5} />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900">Import finished</p>
              <p className="mt-1 text-sm text-slate-600">
                {result.added} {result.added === 1 ? "employee" : "employees"} added,{" "}
                {result.updated} updated.
                {result.added > 0 && " Fill in the job titles of the new employees."}
              </p>
            </div>
          ) : !file ? (
            <FilePicker onChange={handleFile} />
          ) : (
            <>
              {!withBioNo && (
                <p className="rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-200 px-4 py-3 text-sm text-amber-900 leading-relaxed">
                  Biometric numbers aren't saved yet, so people are matched by name only. Run{" "}
                  <code className="font-mono text-xs bg-amber-100 rounded px-1 py-0.5">
                    supabase/proposed_biometric_no.sql
                  </code>{" "}
                  in Supabase → SQL Editor to remember them.
                </p>
              )}

              {/* Department mapping */}
              <section>
                <h3 className={EYEBROW}>Departments</h3>
                <p className="text-xs text-slate-500 mt-1 mb-2.5">
                  Where each biometric department goes in the app. People in a department set to
                  "Don't import" are left out.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  {attDepts.map((att) => (
                    <label
                      key={att}
                      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"
                    >
                      <span className="text-sm text-slate-700 truncate" title={att}>
                        {att || "(no department)"}
                      </span>
                      <Icon name="chevronRight" size={14} className="text-slate-400" />
                      <select
                        value={deptMap[att] ?? ""}
                        onChange={(e) => changeDept(att, e.target.value)}
                        className={`${INPUT_SM} ${deptMap[att] ? "" : "text-slate-500"}`}
                        aria-label={`App department for ${att || "no department"}`}
                      >
                        <option value="">Don't import</option>
                        {appDepartments.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>

              {/* Summary */}
              <div className="flex flex-wrap gap-2 text-xs font-medium">
                <Chip tone="green">{plan.inserts.length} new</Chip>
                <Chip tone="amber">{plan.updates.length} to update</Chip>
                <Chip>{plan.unchanged} already up to date</Chip>
                {plan.skipped.length > 0 && <Chip>{plan.skipped.length} not imported</Chip>}
              </div>

              {plan.inserts.length > 0 && (
                <section>
                  <h3 className={EYEBROW}>New employees</h3>
                  <ul className="mt-2 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-900/[0.06]">
                    {plan.inserts.map((i) => (
                      <Row key={i.key} item={i} checked={isChecked(i)} onToggle={() => toggle(i.key)} disabled={busy}>
                        <div className="text-sm font-semibold text-slate-900">{i.payload.name}</div>
                        <div className="text-xs text-slate-500">
                          {i.payload.department}
                          {i.person.bioNo && ` · Biometric No. ${i.person.bioNo}`}
                        </div>
                      </Row>
                    ))}
                  </ul>
                </section>
              )}

              {plan.updates.length > 0 && (
                <section>
                  <h3 className={EYEBROW}>Changes to existing employees</h3>
                  <ul className="mt-2 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-900/[0.06]">
                    {plan.updates.map((u) => (
                      <Row key={u.key} item={u} checked={isChecked(u)} onToggle={() => toggle(u.key)} disabled={busy}>
                        <div className="text-sm font-semibold text-slate-900">
                          {u.employee.name}
                          {u.person.bioNo && (
                            <span className="font-normal text-slate-500"> · Biometric No. {u.person.bioNo}</span>
                          )}
                        </div>
                        <ul className="mt-0.5 space-y-0.5">
                          {u.changes.map((c) => (
                            <li key={c.field} className="text-xs text-slate-600 break-words">
                              <span className="text-slate-500">{c.label}:</span>{" "}
                              <span className="line-through decoration-slate-400">{c.from || "—"}</span>{" "}
                              → <span className="font-semibold text-slate-900">{c.to || "—"}</span>
                            </li>
                          ))}
                        </ul>
                      </Row>
                    ))}
                  </ul>
                </section>
              )}

              {!plan.inserts.length && !plan.updates.length && (
                <p className="text-sm text-slate-600">Everyone in this file is already up to date.</p>
              )}

              {(plan.skipped.length > 0 || plan.missing.length > 0) && (
                <details className="text-sm text-slate-600">
                  <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500">
                    Not changed ({plan.skipped.length + plan.missing.length})
                  </summary>
                  {plan.skipped.length > 0 && (
                    <p className="mt-2 text-xs leading-relaxed">
                      <span className="font-semibold">Not imported (department set to "Don't import"):</span>{" "}
                      {plan.skipped.map((p) => p.rawName).join(", ")}
                    </p>
                  )}
                  {plan.missing.length > 0 && (
                    <p className="mt-2 text-xs leading-relaxed">
                      <span className="font-semibold">In the app but not in this file (left as they are):</span>{" "}
                      {plan.missing.map((e) => e.name).join(", ")}
                    </p>
                  )}
                </details>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 sm:px-6 py-3.5 sm:py-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] bg-slate-50/70 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 shrink-0">
          {result ? (
            <button type="button" onClick={onClose} className={`${BTN.primary} ${BTN_SIZE.lg} sm:h-10 w-full sm:w-auto`}>
              Done
            </button>
          ) : (
            <>
              {file && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  disabled={busy}
                  className={`${BTN.ghost} ${BTN_SIZE.lg} sm:h-10 w-full sm:w-auto sm:mr-auto`}
                >
                  Choose another file
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className={`${BTN.secondary} ${BTN_SIZE.lg} sm:h-10 w-full sm:w-auto`}
              >
                Cancel
              </button>
              {file && (
                <button
                  type="button"
                  onClick={apply}
                  disabled={busy || !chosenCount}
                  className={`${BTN.primary} ${BTN_SIZE.lg} sm:h-10 w-full sm:w-auto`}
                >
                  {busy ? (
                    <>
                      <span className={SPINNER_ON_BRAND} />
                      Saving…
                    </>
                  ) : (
                    `Apply ${chosenCount} ${chosenCount === 1 ? "change" : "changes"}`
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilePicker({ onChange }) {
  return (
    <div className="space-y-4">
      <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 hover:border-green-500 hover:bg-green-50/40 focus-within:border-green-600 px-4 py-10 text-center cursor-pointer transition-colors">
        <Icon name="folder" size={28} className="text-green-600" />
        <span className="text-sm font-semibold text-slate-900">Choose the Excel file (.xls)</span>
        <span className="text-xs text-slate-500">The punch or attendance report exported from ATT2000</span>
        <input type="file" accept=".xls,application/vnd.ms-excel" onChange={onChange} className="sr-only" />
      </label>
      <ul className="text-xs text-slate-500 space-y-1 leading-relaxed list-disc pl-5">
        <li>The biometric's names (last, first and middle) and departments replace the ones in the app. Job titles are kept.</li>
        <li>People not in the app yet are added. Nobody is deleted.</li>
        <li>You'll see every change before anything is saved.</li>
      </ul>
    </div>
  );
}

function Row({ item, checked, onToggle, disabled, children }) {
  return (
    <li>
      <label className="flex items-start gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-slate-50/80">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
          className="mt-1 h-4 w-4 shrink-0 accent-green-600"
        />
        <div className="min-w-0 flex-1">
          {children}
          {item.doubtful && (
            <p className="mt-1 text-xs text-amber-700">
              Check this one: the name has no comma in the biometric, so the last name is a guess.
            </p>
          )}
        </div>
      </label>
    </li>
  );
}

const CHIP_TONES = {
  green: "bg-green-50 text-green-800 ring-green-600/15",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  slate: "bg-slate-50 text-slate-600 ring-slate-900/10",
};

function Chip({ tone = "slate", children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 ring-1 ring-inset tabular-nums ${CHIP_TONES[tone]}`}>
      {children}
    </span>
  );
}
