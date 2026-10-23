import { createClient } from "@supabase/supabase-js";
import { buildFullName } from "../src/lib/format.js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, SUPER_ADMIN } from "./env.js";

/**
 * Test data in the live database. Everything the tests create is tied to
 * TEST_DEPARTMENT or has last name TEST_LAST_NAME, and cleanup() removes
 * exactly that: its schedules, its employees, then the department.
 */
export const TEST_DEPARTMENT = "E2E Test";
export const TEST_LAST_NAME = "E2E";

// Seeded employees. Their numbers aren't numeric, so they never change the
// app's "next employee number" (highest numeric + 1).
const SEED = [
  { first_name: "ALPHA", number: "E2E-1" },
  { first_name: "BRAVO", number: "E2E-2" },
];

export const fullName = (first_name) =>
  buildFullName({ first_name, middle_name: "", last_name: TEST_LAST_NAME });

let client;

/** A Supabase client signed in as the E2E super admin (RLS applies). */
export async function db() {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing (.env).");
  }
  if (!SUPER_ADMIN) {
    throw new Error(
      "E2E_SUPER_ADMIN_EMAIL / E2E_SUPER_ADMIN_PASSWORD missing. Copy e2e/env.e2e.example to .env.e2e (project root) and fill it in.",
    );
  }
  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword(SUPER_ADMIN);
  if (error) throw new Error(`E2E super admin sign-in failed: ${error.message}`);
  client = c;
  return c;
}

function check({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

/** Ids of every test employee (in the test department or named E2E). */
export async function testEmployeeIds() {
  const c = await db();
  const rows = check(
    await c
      .from("employees")
      .select("id")
      .or(`department.eq."${TEST_DEPARTMENT}",last_name.eq.${TEST_LAST_NAME}`),
    "List test employees",
  );
  return rows.map((r) => r.id);
}

export const historyMissing = (error) => error?.code === "PGRST205" || error?.code === "42P01";

/** True once supabase/proposed_schedule_history.sql has been run. */
export async function historyInstalled() {
  const c = await db();
  const { error } = await c.from("schedule_history").select("id").limit(1);
  return !historyMissing(error);
}

/** Removes all test data. Safe to run when there is none. */
export async function cleanup() {
  const c = await db();
  const ids = await testEmployeeIds();
  if (ids.length) {
    check(await c.from("schedules").delete().in("employee_id", ids), "Delete test schedules");
    check(await c.from("employees").delete().in("id", ids), "Delete test employees");
  }
  // History of the test employees (only these rows may be deleted, see
  // supabase/proposed_schedule_history.sql). Skipped while the table is missing.
  const history = await c
    .from("schedule_history")
    .delete()
    .like("employee_name", `${TEST_LAST_NAME}, %`);
  if (history.error && !historyMissing(history.error)) {
    check(history, "Delete test history");
  }
  check(await c.from("departments").delete().eq("name", TEST_DEPARTMENT), "Delete test department");
}

const DEFAULT_LEAVE = ["SL", "ML", "PL", "IL", "UL", "OL"];

// The shift codes the tests use, from the live shift_types table.
async function pickCodes() {
  const c = await db();
  const { data } = await c.from("shift_types").select("*").order("sort_order");
  const rows = data?.length ? data : [{ code: "AM" }, { code: "OFF" }, { code: "SL" }];
  const isLeave = (r) => ("is_leave" in r ? r.is_leave : DEFAULT_LEAVE.includes(r.code));
  const work = rows.filter((r) => !isLeave(r) && r.code !== "OFF");
  const leave = rows.filter(isLeave);
  return {
    work: (work.find((r) => r.code === "AM") || work[0]).code,
    leave: (leave.find((r) => r.code === "SL") || leave[0])?.code,
  };
}

/** Creates the test department and its employees (after cleanup). */
export async function seed() {
  const c = await db();
  const codes = await pickCodes();
  check(
    await c.from("departments").insert({
      name: TEST_DEPARTMENT,
      sort_order: 9999,
      active: true,
      shifts: [codes.work, "OFF"],
    }),
    "Create test department",
  );
  check(
    await c.from("employees").insert(
      SEED.map((e) => ({
        ...e,
        middle_name: "",
        last_name: TEST_LAST_NAME,
        name: fullName(e.first_name),
        department: TEST_DEPARTMENT,
        role: "TESTER",
      })),
    ),
    "Create test employees",
  );
  return codes;
}

/** { work, leave } shift codes and the seeded employees by first name. */
export async function fixture() {
  const c = await db();
  const dept = check(
    await c.from("departments").select("shifts").eq("name", TEST_DEPARTMENT).single(),
    "Read test department",
  );
  const { leave } = await pickCodes();
  const employees = check(
    await c.from("employees").select("*").eq("department", TEST_DEPARTMENT),
    "Read test employees",
  );
  const byFirst = Object.fromEntries(employees.map((e) => [e.first_name, e]));
  return { work: dept.shifts[0], leave, alpha: byFirst.ALPHA, bravo: byFirst.BRAVO };
}

/** Replaces one test employee's schedule rows with `rows` ({ date, status }). */
export async function setSchedule(employeeId, rows) {
  const c = await db();
  check(await c.from("schedules").delete().eq("employee_id", employeeId), "Clear test schedule");
  if (rows.length) {
    check(
      await c.from("schedules").insert(rows.map((r) => ({ ...r, employee_id: employeeId }))),
      "Seed test schedule",
    );
  }
}

/** The saved status of one cell, or null. */
export async function savedStatus(employeeId, iso) {
  const c = await db();
  const rows = check(
    await c.from("schedules").select("status").eq("employee_id", employeeId).eq("date", iso),
    "Read test schedule",
  );
  return rows[0]?.status ?? null;
}
