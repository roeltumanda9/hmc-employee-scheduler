import { useEffect, useRef, useState } from "react";
import {
  departmentMapFor,
  isInactiveDepartment,
  loadDeptMap,
  matchPeople,
  planImport,
  readAttendanceFile,
} from "../lib/biometricImport";
import { nextNumberFrom, saveEmployeeImport } from "../lib/employeeData";
import { friendlyError } from "../lib/errors";
import { departmentNames, useSettings } from "../lib/settings";
import { BTN, BTN_SIZE, SPINNER } from "../lib/ui";
import ErrorBanner from "./ErrorBanner";
import Icon from "./Icon";

const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");

/**
 * Employees page: drop (or choose) a new ATT2000 export and the names and
 * departments update straight away, without the review window. Changes the
 * import isn't sure about (a name without a comma, a department that isn't
 * linked yet) are left out and listed, with a way to open the review.
 */
export default function BiometricDropZone({ employees, disabled, onChanged, onReview }) {
  const settings = useSettings();
  const [dragDepth, setDragDepth] = useState(0);
  const [working, setWorking] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  // A file dropped next to the zone would make the browser open it and leave the app.
  useEffect(() => {
    const block = (e) => {
      if (hasFiles(e)) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  async function importFile(file) {
    if (!file || disabled || working) return;
    setError("");
    setResult(null);
    setWorking(file.name);
    try {
      const appDepartments = departmentNames(settings, { activeOnly: true });
      const people = await readAttendanceFile(file);
      const matches = matchPeople(people, employees);
      const deptMap = departmentMapFor(people, matches, appDepartments, loadDeptMap());
      const plan = planImport({
        people,
        employees,
        matches,
        deptMap,
        withBioNo: employees.some((e) => "biometric_no" in e),
        firstNumber: nextNumberFrom(employees.map((e) => e.number)),
      });
      const inserts = plan.inserts.filter((i) => !i.doubtful);
      const updates = plan.updates.filter((u) => !u.doubtful);
      const { added, updated, error } = await saveEmployeeImport(inserts, updates);
      if (added || updated) onChanged();
      if (error) {
        const done = added || updated ? ` ${added} added and ${updated} updated before the error.` : "";
        setError(friendlyError(error, "update the employees from the biometric") + done);
        return;
      }
      setResult({
        fileName: file.name,
        added: inserts,
        updated: updates,
        unchanged: plan.unchanged,
        doubtful: [...plan.inserts, ...plan.updates].filter((i) => i.doubtful),
        unlinked: [...new Set(plan.skipped.map((p) => p.department))].filter(
          (d) => !isInactiveDepartment(d),
        ),
      });
    } catch (err) {
      setError(err.message || "Couldn't read this file.");
    } finally {
      setWorking("");
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragDepth(0);
    importFile(e.dataTransfer.files?.[0]);
  }

  const dragging = dragDepth > 0;

  return (
    <div className="space-y-3">
      <div
        onDragEnter={(e) => hasFiles(e) && setDragDepth((d) => d + 1)}
        onDragLeave={(e) => hasFiles(e) && setDragDepth((d) => Math.max(0, d - 1))}
        onDragOver={(e) => hasFiles(e) && e.preventDefault()}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${
          dragging
            ? "border-green-500 bg-green-50"
            : "border-slate-200 bg-white/60 hover:border-slate-300"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="w-10 h-10 rounded-xl bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/15 grid place-items-center shrink-0"
            aria-hidden="true"
          >
            {working ? <span className={`${SPINNER} w-5 h-5`} /> : <Icon name="folder" size={18} strokeWidth={2.25} />}
          </div>
          <div className="min-w-0" aria-live="polite">
            <p className="text-sm font-semibold text-slate-900">
              {working
                ? `Updating employees from ${working}…`
                : dragging
                  ? "Drop it here"
                  : "Drop the biometric export (data.xls) here"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Names and departments update straight away. New people are added; nobody is deleted.
            </p>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || Boolean(working)}
            className={`${BTN.primary} ${BTN_SIZE.md} flex-1 sm:flex-initial`}
          >
            Choose file
          </button>
          <button
            type="button"
            onClick={onReview}
            disabled={disabled || Boolean(working)}
            className={`${BTN.secondary} ${BTN_SIZE.md} flex-1 sm:flex-initial`}
            title="See every change and choose which to save"
          >
            Review first
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xls,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              importFile(f);
            }}
          />
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {result && <ResultPanel result={result} onReview={onReview} onDismiss={() => setResult(null)} />}
    </div>
  );
}

function ResultPanel({ result, onReview, onDismiss }) {
  const { fileName, added, updated, unchanged, doubtful, unlinked } = result;
  const nothing = !added.length && !updated.length;

  return (
    <div role="status" className="rounded-2xl bg-white ring-1 ring-green-600/20 shadow-card px-4 sm:px-5 py-3.5">
      <div className="flex items-start gap-3">
        <Icon name="check" size={18} strokeWidth={2.5} className="text-green-600 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-slate-900">
            {nothing ? `Everyone in ${fileName} is already up to date.` : `Updated from ${fileName}`}
          </p>
          {!nothing && (
            <p className="text-slate-600 mt-0.5">
              {added.length} added, {updated.length} updated, {unchanged} already up to date.
              {added.length > 0 && " Fill in the job titles of the new employees."}
            </p>
          )}

          {(doubtful.length > 0 || unlinked.length > 0) && (
            <div className="mt-2 text-xs text-amber-800 bg-amber-50 ring-1 ring-inset ring-amber-200 rounded-xl px-3 py-2 leading-relaxed">
              {doubtful.length > 0 && (
                <p>
                  Not changed, name order unclear (no comma in the biometric):{" "}
                  {doubtful.map((i) => i.person.rawName).join(", ")}.
                </p>
              )}
              {unlinked.length > 0 && (
                <p>
                  Not imported, department not linked yet: {unlinked.join(", ")}.
                </p>
              )}
              <button type="button" onClick={onReview} className="mt-1 font-semibold underline underline-offset-2">
                Open the review to handle these
              </button>
            </div>
          )}

          {!nothing && (
            <details className="mt-2">
              <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500">
                Show what changed
              </summary>
              <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                {added.map((i) => (
                  <li key={i.key}>
                    <span className="font-semibold text-green-700">New:</span> {i.payload.name} ({i.payload.department})
                  </li>
                ))}
                {updated.map((u) => (
                  <li key={u.key} className="break-words">
                    <span className="font-semibold text-slate-800">{u.employee.name}:</span>{" "}
                    {u.changes.map((c) => `${c.label} ${c.from || "—"} → ${c.to || "—"}`).join("; ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className={`${BTN.ghost} ${BTN_SIZE.iconSm} -mr-1.5 -mt-1 shrink-0`}
          title="Dismiss"
          aria-label="Dismiss"
        >
          <Icon name="x" size={16} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
