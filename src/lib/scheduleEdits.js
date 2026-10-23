import { sameWeekdayIn } from "./dates";
import { leaveStatusFor } from "./leave";

/**
 * Pure helpers behind the Scheduler's edit / save / copy flow. Cells are
 * keyed "employeeId|iso"; `pending` maps those keys to a status code, or
 * null for "clear this cell".
 */

export const cellKey = (employeeId, iso) => `${employeeId}|${iso}`;

// rows → { "employeeId|iso": [row, ...] } (more than one row per cell are
// leftovers of old duplicate saves).
export function rowsByKey(rows) {
  const map = {};
  for (const s of rows || []) {
    const key = cellKey(s.employee_id, s.date);
    if (!map[key]) map[key] = [];
    map[key].push(s);
  }
  return map;
}

// The optimistic row shown for an unsaved shift.
export function pendingRow(employeeId, iso, status) {
  return {
    id: `pending-${cellKey(employeeId, iso)}`,
    employee_id: employeeId,
    date: iso,
    status,
    _pending: true,
  };
}

// Schedule rows with one cell set to `status` (falsy = cleared).
export function applyStatus(rows, employeeId, iso, status) {
  const existing = rows.find((s) => s.employee_id === employeeId && s.date === iso);
  if (!status) return existing ? rows.filter((s) => s !== existing) : rows;
  if (existing) return rows.map((s) => (s === existing ? { ...s, status } : s));
  return [...rows, pendingRow(employeeId, iso, status)];
}

// `pending` → [{ employee_id, date, status }] for saving.
export function pendingToChanges(pending) {
  return Object.entries(pending).map(([key, status]) => {
    const [employee_id, date] = key.split("|");
    return { employee_id, date, status };
  });
}

/**
 * How many pending cells another user changed on the server since the edit
 * session started (`snapshot` = rows when editing began).
 */
export function countConflicts(pending, snapshot, serverRows) {
  const before = rowsByKey(snapshot);
  const now = rowsByKey(serverRows);
  return Object.keys(pending).filter(
    (key) => (before[key]?.[0]?.status ?? null) !== (now[key]?.[0]?.status ?? null),
  ).length;
}

/**
 * The writes the non-atomic fallback save needs, worked out from fresh
 * server rows so a retry never inserts a second row for the same cell.
 * Returns { deleteIds, updates: { status: [ids] }, inserts }.
 */
export function planBatchSave(changes, serverRows) {
  const byKey = rowsByKey(serverRows);
  const deleteIds = [];
  const updates = {};
  const inserts = [];

  for (const { employee_id, date, status } of changes) {
    const [keep, ...extra] = byKey[cellKey(employee_id, date)] || [];
    deleteIds.push(...extra.map((s) => s.id));

    if (status === null) {
      if (keep) deleteIds.push(keep.id);
    } else if (!keep) {
      inserts.push({ employee_id, date, status });
    } else if (keep.status !== status) {
      if (!updates[status]) updates[status] = [];
      updates[status].push(keep.id);
    }
  }
  return { deleteIds, updates, inserts };
}

/**
 * "Copy previous period": shifts for this period's empty cells, taken from
 * the same weekday of the previous period (see sameWeekdayIn). Never fills a
 * cell that already has a shift or was changed in this edit session, and
 * skips leave that would go over the yearly limit (`leaveCounts` from
 * countLeave). Returns { fills: [{ employeeId, iso, status }], leaveSkipped }.
 */
export function planCopy({
  employeeIds,
  days,
  prevDays,
  sourceRows,
  currentRows,
  pending,
  leaveCounts,
  isLeave,
}) {
  const source = {};
  for (const r of sourceRows) if (r.status) source[cellKey(r.employee_id, r.date)] = r.status;
  const taken = new Set(
    currentRows.filter((s) => s.status).map((s) => cellKey(s.employee_id, s.date)),
  );

  const fills = [];
  const counts = { ...leaveCounts };
  let leaveSkipped = 0;
  for (const employeeId of employeeIds) {
    for (const d of days) {
      const key = cellKey(employeeId, d.iso);
      if (taken.has(key) || key in pending) continue;
      const from = sameWeekdayIn(d.iso, prevDays);
      const status = from && source[cellKey(employeeId, from)];
      if (!status) continue;
      if (isLeave(status)) {
        if (leaveStatusFor(counts, employeeId, d.iso, false).blocked) {
          leaveSkipped++;
          continue;
        }
        const ck = `${employeeId}|${d.iso.slice(0, 4)}`;
        counts[ck] = (counts[ck] || 0) + 1;
      }
      fills.push({ employeeId, iso: d.iso, status });
    }
  }
  return { fills, leaveSkipped };
}
