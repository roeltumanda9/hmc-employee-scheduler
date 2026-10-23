import { describe, expect, it } from "vitest";
import { getPayrollPeriodDays } from "./dates";
import { MAX_LEAVE_DAYS_PER_YEAR } from "./leave";
import {
  applyStatus,
  countConflicts,
  pendingToChanges,
  planBatchSave,
  planCopy,
  rowsByKey,
} from "./scheduleEdits";

const row = (id, employee_id, date, status) => ({ id, employee_id, date, status });

describe("rowsByKey", () => {
  it("groups rows per cell, keeping duplicates", () => {
    const map = rowsByKey([
      row(1, "a", "2026-10-12", "AM"),
      row(2, "a", "2026-10-12", "PM"),
      row(3, "b", "2026-10-12", "OFF"),
    ]);
    expect(map["a|2026-10-12"].map((r) => r.id)).toEqual([1, 2]);
    expect(map["b|2026-10-12"]).toHaveLength(1);
  });

  it("accepts null", () => {
    expect(rowsByKey(null)).toEqual({});
  });
});

describe("applyStatus", () => {
  const rows = [row(1, "a", "2026-10-12", "AM")];

  it("changes an existing cell without touching the original array", () => {
    const next = applyStatus(rows, "a", "2026-10-12", "PM");
    expect(next[0]).toMatchObject({ id: 1, status: "PM" });
    expect(rows[0].status).toBe("AM");
  });

  it("adds a pending row for an empty cell", () => {
    const next = applyStatus(rows, "b", "2026-10-12", "OFF");
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({
      id: "pending-b|2026-10-12",
      employee_id: "b",
      status: "OFF",
      _pending: true,
    });
  });

  it("clears a cell, and ignores clearing an empty one", () => {
    expect(applyStatus(rows, "a", "2026-10-12", null)).toEqual([]);
    expect(applyStatus(rows, "b", "2026-10-12", null)).toBe(rows);
  });
});

describe("pendingToChanges", () => {
  it("splits keys back into employee and date", () => {
    expect(pendingToChanges({ "a|2026-10-12": "AM", "b|2026-10-13": null })).toEqual([
      { employee_id: "a", date: "2026-10-12", status: "AM" },
      { employee_id: "b", date: "2026-10-13", status: null },
    ]);
  });
});

describe("countConflicts", () => {
  const snapshot = [row(1, "a", "2026-10-12", "AM"), row(2, "b", "2026-10-12", "PM")];

  it("is 0 when the server still matches the snapshot", () => {
    expect(countConflicts({ "a|2026-10-12": "OFF" }, snapshot, snapshot)).toBe(0);
  });

  it("counts edited cells someone else changed, added or cleared", () => {
    const server = [row(1, "a", "2026-10-12", "NS"), row(9, "c", "2026-10-12", "AM")];
    const pending = { "a|2026-10-12": "OFF", "b|2026-10-12": "OFF", "c|2026-10-12": "OFF" };
    expect(countConflicts(pending, snapshot, server)).toBe(3);
  });

  it("ignores changes to cells this session didn't edit", () => {
    const server = [row(1, "a", "2026-10-12", "AM"), row(2, "b", "2026-10-12", "NS")];
    expect(countConflicts({ "a|2026-10-12": "OFF" }, snapshot, server)).toBe(0);
  });
});

describe("planBatchSave", () => {
  it("works out deletes, grouped updates and inserts from server rows", () => {
    const server = [
      row(1, "a", "2026-10-12", "AM"),
      row(2, "a", "2026-10-12", "AM"), // duplicate left by an old save
      row(3, "b", "2026-10-12", "PM"),
      row(4, "c", "2026-10-12", "AM"),
      row(5, "d", "2026-10-12", "OFF"),
    ];
    const plan = planBatchSave(
      [
        { employee_id: "a", date: "2026-10-12", status: "OFF" },
        { employee_id: "b", date: "2026-10-12", status: null },
        { employee_id: "c", date: "2026-10-12", status: "OFF" },
        { employee_id: "d", date: "2026-10-12", status: "OFF" }, // unchanged
        { employee_id: "e", date: "2026-10-12", status: "AM" },
      ],
      server,
    );
    expect(plan.deleteIds.sort()).toEqual([2, 3]);
    expect(plan.updates).toEqual({ OFF: [1, 4] });
    expect(plan.inserts).toEqual([{ employee_id: "e", date: "2026-10-12", status: "AM" }]);
  });

  it("never inserts a second row for a cell that already has one", () => {
    const plan = planBatchSave(
      [{ employee_id: "a", date: "2026-10-12", status: "AM" }],
      [row(1, "a", "2026-10-12", "AM")],
    );
    expect(plan).toEqual({ deleteIds: [], updates: {}, inserts: [] });
  });
});

describe("planCopy", () => {
  // Period 2 of Oct 2026 (Oct 12–26) copies from period 1 (Sep 27–Oct 11).
  const days = getPayrollPeriodDays(2026, 10, 2);
  const prevDays = getPayrollPeriodDays(2026, 10, 1);
  const isLeave = (c) => c === "SL";
  const base = {
    employeeIds: ["a"],
    days,
    prevDays,
    currentRows: [],
    pending: {},
    leaveCounts: {},
    isLeave,
  };

  it("copies from the same weekday two weeks earlier", () => {
    // Mon Oct 12 ← Mon Sep 28.
    const { fills } = planCopy({ ...base, sourceRows: [row(1, "a", "2026-09-28", "AM")] });
    expect(fills).toEqual([{ employeeId: "a", iso: "2026-10-12", status: "AM" }]);
  });

  it("skips cells that have a shift or were edited this session", () => {
    const { fills } = planCopy({
      ...base,
      sourceRows: [row(1, "a", "2026-09-28", "AM"), row(2, "a", "2026-09-29", "PM")],
      currentRows: [row(3, "a", "2026-10-12", "OFF")],
      pending: { "a|2026-10-13": null },
    });
    expect(fills).toEqual([]);
  });

  it("skips leave past the yearly limit and reports it", () => {
    const { fills, leaveSkipped } = planCopy({
      ...base,
      sourceRows: [row(1, "a", "2026-09-28", "SL"), row(2, "a", "2026-09-29", "SL")],
      leaveCounts: { "a|2026": MAX_LEAVE_DAYS_PER_YEAR - 1 },
    });
    expect(fills).toEqual([{ employeeId: "a", iso: "2026-10-12", status: "SL" }]);
    expect(leaveSkipped).toBe(1);
  });
});
