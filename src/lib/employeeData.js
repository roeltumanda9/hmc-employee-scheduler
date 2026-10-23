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
