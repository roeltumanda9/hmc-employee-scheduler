import { describe, expect, it } from "vitest";
import { MAX_LEAVE_DAYS_PER_YEAR, countLeave, leaveStatusFor } from "./leave";

const isLeave = (c) => ["SL", "IL", "ML"].includes(c);
const period = ["2026-10-12", "2026-10-13", "2026-10-14"];
const row = (employee_id, date, status) => ({ employee_id, date, status });

describe("countLeave", () => {
  it("adds saved leave outside the period to on-screen leave inside it", () => {
    const counts = countLeave({
      saved: [row("a", "2026-03-01", "SL"), row("a", "2026-05-02", "IL")],
      current: [row("a", "2026-10-12", "ML"), row("a", "2026-10-13", "AM")],
      periodIsos: period,
      isLeave,
    });
    expect(counts["a|2026"]).toBe(3);
  });

  it("uses on-screen edits, not stale saved rows, for days in the period", () => {
    // Saved as SL, changed to AM in this edit session: no longer leave.
    const counts = countLeave({
      saved: [row("a", "2026-10-12", "SL")],
      current: [row("a", "2026-10-12", "AM")],
      periodIsos: period,
      isLeave,
    });
    expect(counts["a|2026"]).toBeUndefined();
  });

  it("counts per employee and per calendar year", () => {
    const counts = countLeave({
      saved: [row("a", "2025-12-30", "SL"), row("b", "2026-01-05", "IL")],
      current: [],
      periodIsos: period,
      isLeave,
    });
    expect(counts["a|2025"]).toBe(1);
    expect(counts["b|2026"]).toBe(1);
    expect(counts["a|2026"]).toBeUndefined();
  });
});

describe("leaveStatusFor", () => {
  const full = { "a|2026": MAX_LEAVE_DAYS_PER_YEAR };

  it("blocks new leave once the yearly limit is used", () => {
    const s = leaveStatusFor(full, "a", "2026-10-12", false);
    expect(s).toMatchObject({ year: 2026, used: 5, limit: 5, remaining: 0, blocked: true });
  });

  it("still allows changing an existing leave day to another leave type", () => {
    expect(leaveStatusFor(full, "a", "2026-10-12", true).blocked).toBe(false);
  });

  it("allows leave below the limit and in a new year", () => {
    expect(leaveStatusFor({ "a|2026": 4 }, "a", "2026-10-12", false).blocked).toBe(false);
    expect(leaveStatusFor(full, "a", "2027-01-02", false)).toMatchObject({ used: 0, remaining: 5 });
  });
});
