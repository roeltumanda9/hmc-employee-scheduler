import { supabase } from "./supabase";

/**
 * Reads and writes of the `employees` table. Functions return Supabase's
 * `{ data, error }` (or `{ error }` for writes).
 */

export const FIRST_EMPLOYEE_NUMBER = 1001;

export function fetchEmployees() {
  return supabase.from("employees").select("*").order("name");
}

export function insertEmployee(payload) {
  return supabase.from("employees").insert(payload);
}

export function updateEmployee(id, payload) {
  return supabase.from("employees").update(payload).eq("id", id);
}

export function deleteEmployee(id) {
  return supabase.from("employees").delete().eq("id", id);
}

// The next employee number: highest numeric one + 1, starting at 1001.
export function nextNumberFrom(numbers) {
  const nums = numbers.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
  return String(nums.length ? Math.max(...nums) + 1 : FIRST_EMPLOYEE_NUMBER);
}

export async function getNextEmployeeNumber() {
  const { data, error } = await supabase.from("employees").select("number");
  if (error || !data) return String(FIRST_EMPLOYEE_NUMBER);
  return nextNumberFrom(data.map((r) => r.number));
}

// Employees by employee number; ones without a numeric number go last.
export function sortByNumber(employees) {
  return [...employees].sort((a, b) => {
    const na = parseInt(a.number, 10);
    const nb = parseInt(b.number, 10);
    if (isNaN(na) && isNaN(nb)) return 0;
    if (isNaN(na)) return 1;
    if (isNaN(nb)) return -1;
    return na - nb;
  });
}

/**
 * Saves an import from the biometric (see biometricImport.js planImport):
 * `inserts` / `updates` are plan items. New employees go in one insert,
 * renumbered and retried if someone took their numbers meanwhile; updates
 * go one by one. Stops at the first error.
 * Returns { added, updated, error }.
 */
export async function saveEmployeeImport(inserts, updates) {
  let added = 0;
  let updated = 0;

  if (inserts.length) {
    const rows = inserts.map((i) => ({ ...i.payload }));
    let { error } = await insertEmployee(rows);
    for (let attempt = 0; attempt < 3 && isNumberTaken(error); attempt++) {
      let n = Number(await getNextEmployeeNumber());
      for (const r of rows) r.number = String(n++);
      ({ error } = await insertEmployee(rows));
    }
    if (error) return { added, updated, error };
    added = rows.length;
  }

  for (const u of updates) {
    const { error } = await updateEmployee(u.employee.id, u.payload);
    if (error) return { added, updated, error };
    updated++;
  }
  return { added, updated, error: null };
}

// Another admin took this employee number first (employees_number_key).
export function isNumberTaken(error) {
  return (
    error?.code === "23505" &&
    /number/i.test(`${error.message} ${error.details || ""}`)
  );
}
