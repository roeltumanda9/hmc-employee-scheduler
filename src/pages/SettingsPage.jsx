import { useId, useState } from "react";
import { supabase } from "../lib/supabase";
import { STATUSES, STATUS_MAP } from "../lib/statuses";
import { useSettings } from "../lib/settings";
import { canManageEmployees } from "../lib/auth";
import { friendlyError } from "../lib/errors";
import { formatName } from "../lib/format";
import ConfirmModal from "../components/ConfirmModal";
import ErrorBanner from "../components/ErrorBanner";
import Icon from "../components/Icon";
import {
  BTN,
  BTN_SIZE,
  CARD,
  CARD_FOOTER,
  HINT,
  INPUT,
  INPUT_SM,
  LABEL,
  SPINNER_ON_BRAND,
} from "../lib/ui";

const BLANK_DEPARTMENT = {
  name: "",
  sort_order: 0,
  active: true,
  banner_url: "",
  prepared_by_name: "",
  prepared_by_title: "",
  shifts: ["OFF"],
  shift_times: {},
};

export default function SettingsPage({ role, onSaved }) {
  const settings = useSettings();
  const [adding, setAdding] = useState(false);

  if (!canManageEmployees(role)) {
    return (
      <div className={`${CARD} p-6 flex items-center gap-3 text-sm text-slate-600`}>
        <Icon name="lock" size={18} className="text-slate-400 shrink-0" />
        Only super admins can change settings.
      </div>
    );
  }

  if (settings.source !== "database") {
    return (
      <div className="rounded-2xl bg-amber-50 ring-1 ring-inset ring-amber-200/80 p-5 text-sm text-amber-900 flex items-start gap-3 max-w-3xl">
        <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 grid place-items-center shrink-0" aria-hidden="true">
          <Icon name="alert" size={16} strokeWidth={2.25} />
        </span>
        <div className="space-y-2 min-w-0 leading-relaxed">
          <p className="font-semibold">Settings aren't available yet</p>
          <p>{settings.loadError || "Loading settings…"}</p>
          <p>
            If the settings tables haven't been created, run{" "}
            <code className="font-mono text-xs bg-amber-100/80 rounded px-1 py-0.5">supabase/proposed_settings.sql</code>{" "}
            in the Supabase SQL Editor, then reload this page.
          </p>
        </div>
      </div>
    );
  }

  const nextOrder =
    Math.max(0, ...settings.departments.map((d) => d.sort_order || 0)) + 1;

  // Banner paths already in use, offered as suggestions.
  const bannerSuggestions = Array.from(
    new Set(
      [
        settings.print.default_banner_url,
        ...settings.departments.map((d) => d.banner_url),
      ].filter(Boolean),
    ),
  );

  return (
    <div className="space-y-8 sm:space-y-10 max-w-4xl">
      <datalist id="banner-suggestions">
        {bannerSuggestions.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>

      <section className="space-y-3">
        <SectionHeading
          title="Print signatures"
          description="Shown at the bottom of every printed schedule. The “Prepared by” here is used for “All departments” and for departments without their own."
        />
        <PrintSettingsCard
          key={settings.print.updated_at || "print"}
          print={settings.print}
          onSaved={onSaved}
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <SectionHeading
            title="Departments"
            description="Which shifts each department uses, its print banner and its “Prepared by” signatory. Renaming a department also renames it on its employees."
          />
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={adding}
            className={`${BTN.primary} ${BTN_SIZE.md} shrink-0`}
          >
            <Icon name="plus" size={16} strokeWidth={2.5} />
            Add department
          </button>
        </div>

        {adding && (
          <DepartmentCard
            isNew
            department={{ ...BLANK_DEPARTMENT, sort_order: nextOrder }}
            onCancel={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await onSaved();
            }}
          />
        )}

        {settings.departments.map((d) => (
          <DepartmentCard
            key={`${d.name}|${d.updated_at}`}
            department={d}
            onSaved={onSaved}
          />
        ))}
      </section>
    </div>
  );
}

function SectionHeading({ title, description }) {
  return (
    <div>
      <h2 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">{title}</h2>
      <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">{description}</p>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      {children}
      {hint && <span className={HINT}>{hint}</span>}
    </label>
  );
}

function SaveBar({ dirty, saving, onSave, onReset, extra }) {
  return (
    <div className={`${CARD_FOOTER} sm:px-5 flex flex-col-reverse sm:flex-row sm:items-center gap-2`}>
      {extra}
      <div className="sm:ml-auto flex flex-col-reverse sm:flex-row gap-2">
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty || saving}
            className={`${BTN.ghost} ${BTN_SIZE.md} w-full sm:w-auto`}
          >
            Undo changes
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className={`${BTN.primary} ${BTN_SIZE.md} px-5 w-full sm:w-auto`}
        >
          {saving && <span className={SPINNER_ON_BRAND} />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/* ------------------ Print signatures ------------------ */
const PRINT_FIELDS = [
  "default_banner_url",
  "default_prepared_by_name",
  "default_prepared_by_title",
  "checked_by_name",
  "checked_by_title",
  "approved_by_name",
  "approved_by_title",
];

function printPayload(form) {
  const out = { id: 1 };
  for (const f of PRINT_FIELDS) out[f] = String(form[f] ?? "").trim() || null;
  return out;
}

function PrintSettingsCard({ print, onSaved }) {
  const initial = Object.fromEntries(PRINT_FIELDS.map((f) => [f, print[f] || ""]));
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty =
    JSON.stringify(printPayload(form)) !== JSON.stringify(printPayload(initial));

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setError("");
    const { data, error } = await supabase
      .from("print_settings")
      .upsert(printPayload(form))
      .select();
    setSaving(false);
    if (error) return setError(friendlyError(error, "save the print signatures"));
    if (!data?.length) {
      return setError("Nothing was saved. You may not have permission to change settings.");
    }
    await onSaved();
  }

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="p-4 sm:p-6 space-y-4">
        <ErrorBanner message={error} onDismiss={() => setError("")} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="“Prepared by” name (default)">
            <input className={`${INPUT} uppercase`} value={form.default_prepared_by_name} onChange={(e) => update("default_prepared_by_name", formatName(e.target.value))} />
          </Field>
          <Field label="“Prepared by” title (default)">
            <input className={INPUT} value={form.default_prepared_by_title} onChange={(e) => update("default_prepared_by_title", e.target.value)} />
          </Field>
          <Field label="“Checked by” name">
            <input className={`${INPUT} uppercase`} value={form.checked_by_name} onChange={(e) => update("checked_by_name", formatName(e.target.value))} />
          </Field>
          <Field label="“Checked by” title">
            <input className={INPUT} value={form.checked_by_title} onChange={(e) => update("checked_by_title", e.target.value)} />
          </Field>
          <Field label="“Approved by” name">
            <input className={`${INPUT} uppercase`} value={form.approved_by_name} onChange={(e) => update("approved_by_name", formatName(e.target.value))} />
          </Field>
          <Field label="“Approved by” title">
            <input className={INPUT} value={form.approved_by_title} onChange={(e) => update("approved_by_title", e.target.value)} />
          </Field>
          <Field
            label="Default banner image"
            hint="Used for “All departments” and departments without their own banner. A path to an image in the app's public folder, e.g. /logo-banner.png"
          >
            <input className={INPUT} list="banner-suggestions" value={form.default_banner_url} onChange={(e) => update("default_banner_url", e.target.value)} placeholder="/logo-banner.png" />
          </Field>
          <BannerPreview src={form.default_banner_url} />
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setForm(initial)} />
    </div>
  );
}

function BannerPreview({ src }) {
  const [failedSrc, setFailedSrc] = useState(null);
  if (!src) return <div className="hidden sm:block" />;
  return (
    <div className="flex items-end">
      {failedSrc === src ? (
        <p className="text-xs text-rose-600 flex items-center gap-1.5">
          <Icon name="alertCircle" size={14} className="shrink-0" />
          No image found at {src}
        </p>
      ) : (
        <div className="w-full rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-900/[0.05] p-2">
          <img
            src={src}
            alt="Banner preview"
            onError={() => setFailedSrc(src)}
            className="max-h-16 max-w-full mx-auto rounded-md bg-white object-contain"
          />
        </div>
      )}
    </div>
  );
}

/* ------------------ Department card ------------------ */
function toForm(d) {
  return {
    name: d.name || "",
    sort_order: String(d.sort_order ?? 0),
    active: d.active !== false,
    banner_url: d.banner_url || "",
    prepared_by_name: d.prepared_by_name || "",
    prepared_by_title: d.prepared_by_title || "",
    shifts: [...(d.shifts || [])],
    shift_times: { ...(d.shift_times || {}) },
  };
}

function toPayload(form) {
  return {
    name: form.name.trim(),
    sort_order: parseInt(form.sort_order, 10) || 0,
    active: form.active,
    banner_url: form.banner_url.trim() || null,
    prepared_by_name: form.prepared_by_name.trim() || null,
    prepared_by_title: form.prepared_by_title.trim() || null,
    shifts: form.shifts,
    // Kept for every code (not only selected ones) so unticking a shift and
    // ticking it again doesn't lose its time.
    shift_times: Object.fromEntries(
      Object.entries(form.shift_times)
        .map(([code, t]) => [code, String(t ?? "").trim()])
        .filter(([, t]) => t),
    ),
  };
}

function DepartmentCard({ department, isNew = false, onSaved, onCancel }) {
  const [form, setForm] = useState(() => toForm(department));
  const [open, setOpen] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelId = useId();

  const initialPayload = JSON.stringify(toPayload(toForm(department)));
  const dirty = isNew || JSON.stringify(toPayload(form)) !== initialPayload;
  const renamed = !isNew && form.name.trim() !== department.name;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleShift(code) {
    setForm((f) => ({
      ...f,
      shifts: f.shifts.includes(code)
        ? f.shifts.filter((c) => c !== code)
        : [...f.shifts, code],
    }));
  }

  function moveShift(code, delta) {
    setForm((f) => {
      const list = [...f.shifts];
      const i = list.indexOf(code);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return f;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...f, shifts: list };
    });
  }

  async function save() {
    const payload = toPayload(form);
    if (!payload.name) return setError("Enter a department name.");
    if (payload.shifts.length === 0) return setError("Choose at least one shift.");

    setSaving(true);
    setError("");
    const { data, error } = isNew
      ? await supabase.from("departments").insert(payload).select()
      : await supabase
          .from("departments")
          .update(payload)
          .eq("name", department.name)
          .select();
    setSaving(false);

    if (error) {
      return setError(
        friendlyError(error, isNew ? "add this department" : "save this department"),
      );
    }
    if (!data?.length) {
      return setError("Nothing was saved. You may not have permission to change settings.");
    }
    await onSaved();
  }

  async function remove() {
    setConfirmDelete(false);
    setSaving(true);
    setError("");
    const { data, error } = await supabase
      .from("departments")
      .delete()
      .eq("name", department.name)
      .select();
    setSaving(false);

    if (error?.code === "23503") {
      return setError(
        "This department still has employees. Move them to another department first, or untick “Active” to hide it instead.",
      );
    }
    if (error) return setError(friendlyError(error, "delete this department"));
    if (!data?.length) {
      return setError("Nothing was deleted. You may not have permission to change settings.");
    }
    await onSaved();
  }

  return (
    <div
      className={`bg-white rounded-2xl shadow-card overflow-hidden transition-shadow ${
        isNew
          ? "ring-2 ring-green-600/40 animate-pop-in"
          : open
            ? "ring-1 ring-slate-900/[0.08] shadow-raised"
            : "ring-1 ring-slate-900/[0.06]"
      }`}
    >
      {/* Summary row */}
      {!isNew && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="w-full px-4 sm:px-5 py-4 flex items-center gap-3 text-left hover:bg-slate-50/80 transition-colors"
        >
          <span
            className={`hidden sm:grid w-10 h-10 rounded-xl place-items-center shrink-0 ring-1 ring-inset ${
              department.active
                ? "bg-green-50 text-green-700 ring-green-600/15"
                : "bg-slate-50 text-slate-400 ring-slate-900/[0.06]"
            }`}
            aria-hidden="true"
          >
            <Icon name="building" size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 truncate">{department.name}</span>
              {!department.active && (
                <span className="shrink-0 text-[0.625rem] uppercase tracking-wider font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                  Inactive
                </span>
              )}
            </span>
            <span className="mt-1.5 flex flex-wrap gap-1">
              {department.shifts.map((code) => (
                <span
                  key={code}
                  className={`text-[0.625rem] font-bold rounded-md px-1.5 py-0.5 ${STATUS_MAP[code]?.classes || "bg-slate-100 text-slate-600"}`}
                >
                  {code}
                </span>
              ))}
            </span>
          </span>
          <span className="hidden sm:block text-xs text-slate-500 text-right shrink-0 max-w-[40%] truncate">
            {department.prepared_by_name || "No “Prepared by” set"}
          </span>
          <Icon
            name="chevronDown"
            size={18}
            className={`text-slate-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {open && (
        <div id={panelId} className={isNew ? "" : "border-t border-slate-100 animate-fade-in"}>
          <div className="p-4 sm:p-6 space-y-6">
            {isNew && (
              <h3 className="text-base font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-green-50 text-green-700 grid place-items-center" aria-hidden="true">
                  <Icon name="plus" size={14} strokeWidth={2.5} />
                </span>
                New department
              </h3>
            )}
            <ErrorBanner message={error} onDismiss={() => setError("")} />

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem] gap-4">
              <Field
                label="Department name"
                hint={renamed ? "Saving will also rename this department on all its employees." : undefined}
              >
                <input className={INPUT} required value={form.name} onChange={(e) => update("name", e.target.value)} />
              </Field>
              <Field label="Order" hint="Position in the employee form.">
                <input className={INPUT} type="number" min="0" inputMode="numeric" value={form.sort_order} onChange={(e) => update("sort_order", e.target.value)} />
              </Field>
            </div>

            <label className="flex items-start gap-3 cursor-pointer rounded-xl bg-slate-50/80 ring-1 ring-inset ring-slate-900/[0.05] p-3.5 hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => update("active", e.target.checked)}
                className="mt-0.5 w-[1.125rem] h-[1.125rem] accent-green-600 shrink-0"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Active</span>
                <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Inactive departments are hidden from the Scheduler and from new employees. Existing employees keep it.
                </span>
              </span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="“Prepared by” name">
                <input className={`${INPUT} uppercase`} value={form.prepared_by_name} onChange={(e) => update("prepared_by_name", formatName(e.target.value))} placeholder="Uses the default if empty" />
              </Field>
              <Field label="“Prepared by” title">
                <input className={INPUT} value={form.prepared_by_title} onChange={(e) => update("prepared_by_title", e.target.value)} />
              </Field>
              <Field label="Print banner image" hint="Path to an image in the app's public folder. Empty uses the default banner.">
                <input className={INPUT} list="banner-suggestions" value={form.banner_url} onChange={(e) => update("banner_url", e.target.value)} placeholder="/logo-banner.png" />
              </Field>
              <BannerPreview src={form.banner_url} />
            </div>

            <ShiftEditor
              shifts={form.shifts}
              times={form.shift_times}
              onToggle={toggleShift}
              onMove={moveShift}
              onTime={(code, value) =>
                setForm((f) => ({ ...f, shift_times: { ...f.shift_times, [code]: value } }))
              }
            />
          </div>

          <SaveBar
            dirty={dirty}
            saving={saving}
            onSave={save}
            onReset={isNew ? undefined : () => setForm(toForm(department))}
            extra={
              isNew ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className={`${BTN.ghost} ${BTN_SIZE.md} w-full sm:w-auto`}
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                  className={`${BTN.destructiveGhost} ${BTN_SIZE.md} w-full sm:w-auto`}
                >
                  <Icon name="trash" size={15} />
                  Delete department
                </button>
              )
            }
          />
        </div>
      )}

      <ConfirmModal
        open={confirmDelete}
        title={`Delete ${department.name}?`}
        message="This only works if no employees are in this department. To keep its history, untick “Active” instead."
        confirmLabel="Yes, delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function ShiftEditor({ shifts, times, onToggle, onMove, onTime }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold text-slate-700 mb-3">Shifts this department can use</legend>

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => {
          const on = shifts.includes(s.code);
          return (
            <button
              key={s.code}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(s.code)}
              title={s.label}
              className={`min-w-[3.25rem] h-9 px-2.5 rounded-lg text-xs font-bold tracking-tight transition active:scale-95 ${
                on
                  ? `${s.classes} shadow-[inset_0_0_0_1px_rgb(15_23_42/0.08)]`
                  : "bg-white text-slate-400 ring-1 ring-inset ring-slate-200 hover:text-slate-700 hover:ring-slate-300"
              }`}
            >
              {s.code}
            </button>
          );
        })}
      </div>

      {shifts.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-inset ring-slate-900/[0.07] overflow-hidden">
          {shifts.map((code, i) => {
            const s = STATUS_MAP[code];
            if (!s) return null;
            return (
              <li key={code} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 px-3 py-2.5 bg-white">
                <span className="w-6 text-right text-xs font-medium text-slate-400 tabular-nums" aria-hidden="true">
                  {i + 1}
                </span>
                <span className={`min-w-[3rem] text-center px-2 py-1 rounded-md text-xs font-bold ${s.classes}`}>
                  {code}
                </span>
                <span className="flex-1 min-w-[6rem] text-sm font-medium text-slate-800">{s.label}</span>
                <input
                  className={`${INPUT_SM} sm:w-56 order-last sm:order-none basis-full sm:basis-auto`}
                  value={times[code] || ""}
                  onChange={(e) => onTime(code, e.target.value)}
                  placeholder={s.time || "No time"}
                  aria-label={`${s.label} time for this department`}
                />
                <span className="flex gap-0.5">
                  <button type="button" onClick={() => onMove(code, -1)} disabled={i === 0} aria-label={`Move ${code} up`} className={`${BTN.ghost} ${BTN_SIZE.iconSm}`}>
                    <Icon name="chevronUp" size={15} strokeWidth={2.5} />
                  </button>
                  <button type="button" onClick={() => onMove(code, 1)} disabled={i === shifts.length - 1} aria-label={`Move ${code} down`} className={`${BTN.ghost} ${BTN_SIZE.iconSm}`}>
                    <Icon name="chevronDown" size={15} strokeWidth={2.5} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-slate-500 leading-relaxed">
        Leave a time empty to use the shift's standard time (shown in grey). The order here is the order in the shift picker.
      </p>
    </fieldset>
  );
}
