import { supabase } from "./supabase";
import { planBatchSave } from "./scheduleEdits";

/**
 * Reads and writes of the `schedules` table. Every function returns
 * Supabase's `{ data, error }` (or just an error for writes) so pages keep
 * their own messages via friendlyError.
 */

// Supabase returns at most 1000 rows per request by default, so page through.
const PAGE_SIZE = 1000;

async function fetchAllPages(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...data);
    if (data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

// All schedule rows between two ISO dates, optionally for some employees.
export function fetchSchedules(firstIso, lastIso, employeeIds) {
  return fetchAllPages(() => {
    let q = supabase
      .from("schedules")
      .select("*")
      .gte("date", firstIso)
      .lte("date", lastIso)
      .order("id");
    if (employeeIds) q = q.in("employee_id", employeeIds);
    return q;
  });
}

// Leave rows (status in `codes`) between two dates, optionally for some
// employees, oldest first.
export function fetchLeaveRows(fromIso, toIso, codes, employeeIds) {
  return fetchAllPages(() => {
    let q = supabase
      .from("schedules")
      .select("employee_id, date, status")
      .gte("date", fromIso)
      .lte("date", toIso)
      .in("status", codes)
      .order("date")
      .order("id");
    if (employeeIds) q = q.in("employee_id", employeeIds);
    return q;
  });
}

export const HISTORY_LIMIT = 500;

/**
 * Change history (supabase/proposed_schedule_history.sql) for shifts dated
 * between two ISO dates, optionally for some employees; newest change first,
 * at most HISTORY_LIMIT rows. `missing` is true while the table isn't
 * installed yet.
 */
export async function fetchScheduleHistory(firstIso, lastIso, employeeIds) {
  let q = supabase
    .from("schedule_history")
    .select("*")
    .gte("date", firstIso)
    .lte("date", lastIso)
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (employeeIds) q = q.in("employee_id", employeeIds);
  const { data, error } = await q;
  // PGRST205 / 42P01: the table doesn't exist (SQL not run yet).
  const missing = error?.code === "PGRST205" || error?.code === "42P01";
  return { data, error: missing ? null : error, missing };
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Fallback save used until the `save_schedule_changes` database function is
 * installed. Not atomic: returns the first error, after which earlier
 * batches are saved.
 */
async function saveInBatches(changes, serverRows) {
  const { deleteIds, updates, inserts } = planBatchSave(changes, serverRows);

  // 100 ids per request keeps the URL well under length limits.
  for (const ids of chunk(deleteIds, 100)) {
    const { error } = await supabase.from("schedules").delete().in("id", ids);
    if (error) return error;
  }
  for (const [status, allIds] of Object.entries(updates)) {
    for (const ids of chunk(allIds, 100)) {
      const { error } = await supabase.from("schedules").update({ status }).in("id", ids);
      if (error) return error;
    }
  }
  for (const rows of chunk(inserts, 500)) {
    const { error } = await supabase.from("schedules").insert(rows);
    if (error) return error;
  }
  return null;
}

/**
 * Saves `changes` ([{ employee_id, date, status }], null status = clear).
 * Atomic path: `save_schedule_changes` from supabase/proposed_integrity.sql.
 * PGRST202 means it isn't installed yet, so fall back to batched writes
 * worked out from `serverRows` (fresh rows for the cells being saved).
 * Returns the error, or null.
 */
export async function saveScheduleChanges(changes, serverRows) {
  const { error } = await supabase.rpc("save_schedule_changes", { changes });
  if (error?.code === "PGRST202") return saveInBatches(changes, serverRows);
  return error;
}
