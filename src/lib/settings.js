import { createContext, useContext } from "react";
import { supabase } from "./supabase";
import { STATUS_MAP } from "./statuses";
import { FALLBACK_DEPARTMENTS, FALLBACK_PRINT } from "./departments";
import { friendlyError } from "./errors";

/**
 * App-wide department & print settings (tables `departments` and
 * `print_settings`, see supabase/proposed_settings.sql). Loaded once after
 * sign-in by App and provided through SettingsContext.
 * `source` is "database" once loaded, "defaults" while loading or on failure.
 */
export const DEFAULT_SETTINGS = {
  departments: FALLBACK_DEPARTMENTS,
  print: FALLBACK_PRINT,
  source: "defaults",
  loadError: "",
};

export const SettingsContext = createContext(DEFAULT_SETTINGS);

export function useSettings() {
  return useContext(SettingsContext);
}

function normalizeDepartment(row) {
  return {
    ...row,
    banner_url: row.banner_url || "",
    prepared_by_name: row.prepared_by_name || "",
    prepared_by_title: row.prepared_by_title || "",
    shifts: row.shifts?.length ? row.shifts : ["OFF"],
    shift_times: row.shift_times || {},
  };
}

export async function loadSettings() {
  const [depRes, printRes] = await Promise.all([
    supabase
      .from("departments")
      .select("*")
      .order("sort_order")
      .order("name"),
    supabase.from("print_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  const error = depRes.error || printRes.error;
  if (error) {
    return {
      ...DEFAULT_SETTINGS,
      loadError: friendlyError(error, "load the department settings"),
    };
  }

  // An empty table means Step 2 of the SQL hasn't run; keep the built-ins.
  if (depRes.data.length === 0) {
    return {
      ...DEFAULT_SETTINGS,
      loadError: "The departments table is empty, so built-in defaults are in use.",
    };
  }

  const print = { ...FALLBACK_PRINT };
  for (const [key, value] of Object.entries(printRes.data || {})) {
    if (value != null) print[key] = value;
  }

  return {
    departments: depRes.data.map(normalizeDepartment),
    print,
    source: "database",
    loadError: "",
  };
}

export function findDepartment(settings, name) {
  return settings.departments.find((d) => d.name === name) || null;
}

// Department names. `activeOnly` hides departments switched off on the
// Settings page, but `keep` stays listed (e.g. an employee's current one).
export function departmentNames(settings, { activeOnly = false, keep } = {}) {
  return settings.departments
    .filter((d) => !activeOnly || d.active || d.name === keep)
    .map((d) => d.name);
}

// A shift with this department's time override applied.
export function resolveShift(settings, code, departmentName) {
  const base = STATUS_MAP[code];
  if (!base) return null;
  const time = findDepartment(settings, departmentName)?.shift_times?.[code];
  return time ? { ...base, time } : base;
}

// The shifts a department may use, in its configured order.
export function shiftsForDepartment(settings, departmentName) {
  const codes = findDepartment(settings, departmentName)?.shifts || ["OFF"];
  return codes
    .map((code) => resolveShift(settings, code, departmentName))
    .filter(Boolean);
}
