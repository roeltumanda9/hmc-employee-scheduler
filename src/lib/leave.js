// Yearly leave limit: every leave type together (see isLeave / leaveChecker)
// counts toward one allowance per employee per calendar year. The database
// enforces the same number: supabase/proposed_leave_limit.sql.
export const MAX_LEAVE_DAYS_PER_YEAR = 5;

const yearOf = (iso) => Number(iso.slice(0, 4));

/**
 * Leave days used, keyed `${employeeId}|${year}`.
 * `saved`: leave rows from the database for the years in view.
 * `current`: the rows on screen for the open period (including unsaved edits).
 * Saved rows inside the period are replaced by `current`, so edits that move
 * or remove leave are counted correctly.
 */
export function countLeave({ saved = [], current = [], periodIsos, isLeave }) {
  const inPeriod = new Set(periodIsos);
  const counts = {};
  const add = (r) => {
    const key = `${r.employee_id}|${yearOf(r.date)}`;
    counts[key] = (counts[key] || 0) + 1;
  };
  for (const r of saved) {
    if (!inPeriod.has(r.date) && isLeave(r.status)) add(r);
  }
  for (const r of current) {
    if (inPeriod.has(r.date) && isLeave(r.status)) add(r);
  }
  return counts;
}

/**
 * Leave status for one cell: { year, used, limit, remaining, blocked }.
 * `blocked`: the employee has no leave left that year and this day isn't
 * already leave (changing one leave type to another adds no day).
 */
export function leaveStatusFor(counts, employeeId, iso, cellIsLeave) {
  const year = yearOf(iso);
  const used = counts[`${employeeId}|${year}`] || 0;
  const limit = MAX_LEAVE_DAYS_PER_YEAR;
  return {
    year,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    blocked: !cellIsLeave && used >= limit,
  };
}
