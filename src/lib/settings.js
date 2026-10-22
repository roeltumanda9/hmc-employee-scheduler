import { createContext, useContext } from "react";
import { supabase } from "./supabase";
import { STATUSES, makeShift } from "./statuses";
import { FALLBACK_DEPARTMENTS, FALLBACK_PRINT } from "./departments";
import { friendlyError } from "./errors";

/**
 * App-wide department, print and shift settings (tables `departments`,
 * `print_settings` and `shift_types`, see supabase/proposed_settings.sql and
 * supabase/proposed_shift_types.sql). Loaded once after sign-in by App and
 * provided through SettingsContext.
 * `source` is "database" once departments load, "defaults" while loading or
 * on failure. `shiftsSource` is the same for shift types, which load on
 * their own so the app keeps working before that table exists.
 */
export const DEFAULT_SETTINGS = {
  departments: FALLBACK_DEPARTMENTS,
  print: FALLBACK_PRINT,
  shifts: STATUSES,
  source: "defaults",
  loadError: "",
  shiftsSource: "defaults",
  shiftsError: "",
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

function shiftsFrom(res) {
  if (res.error) {
    return {
      shifts: STATUSES,
      shiftsSource: "defaults",
      shiftsError: friendlyError(res.error, "load the shift types"),
    };
  }
  // An empty table means Step 2 of the SQL hasn't run; keep the built-ins.
  if (res.data.length === 0) {
    return {
      shifts: STATUSES,
      shiftsSource: "defaults",
      shiftsError: "The shift types table is empty, so built-in shifts are in use.",
    };
  }
  return {
    shifts: res.data.map((row) =>
      makeShift({ ...row, time: row.default_time }),
    ),
    shiftsSource: "database",
    shiftsError: "",
  };
}

export async function loadSettings() {
  const [depRes, printRes, shiftRes] = await Promise.all([
    supabase
      .from("departments")
      .select("*")
      .order("sort_order")
      .order("name"),
    supabase.from("print_settings").select("*").eq("id", 1).maybeSingle(),
    supabase
      .from("shift_types")
      .select("*")
      .order("sort_order")
      .order("code"),
  ]);

  const shiftSettings = shiftsFrom(shiftRes);

  const error = depRes.error || printRes.error;
  if (error) {
    return {
      ...DEFAULT_SETTINGS,
      ...shiftSettings,
      loadError: friendlyError(error, "load the department settings"),
    };
  }

  // An empty table means Step 2 of the SQL hasn't run; keep the built-ins.
  if (depRes.data.length === 0) {
    return {
      ...DEFAULT_SETTINGS,
      ...shiftSettings,
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
    ...shiftSettings,
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

// code → shift, cached per settings object (the grid looks up every cell).
const shiftMaps = new WeakMap();

/** The shift type for a code, or null if the app doesn't know it. */
export function findShift(settings, code) {
  let map = shiftMaps.get(settings);
  if (!map) {
    map = new Map(settings.shifts.map((s) => [s.code, s]));
    shiftMaps.set(settings, map);
  }
  return map.get(code) || null;
}

// A shift with this department's time override applied.
export function resolveShift(settings, code, departmentName) {
  const base = findShift(settings, code);
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
