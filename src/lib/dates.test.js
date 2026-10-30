import { describe, expect, it } from "vitest";
import {
  addMonths,
  getPayrollPeriodDays,
  isPeriodLocked,
  oldestEditablePeriod,
  periodContaining,
  periodIndex,
  periodTitle,
  previousPeriod,
  sameWeekdayIn,
} from "./dates";

const isos = (days) => days.map((d) => d.iso);

describe("getPayrollPeriodDays", () => {
  it("period 1 runs from the 27th of the previous month to the 11th", () => {
    const days = getPayrollPeriodDays(2026, 10, 1);
    expect(days[0]).toEqual({ day: 27, iso: "2026-09-27", weekday: "Sun" });
    expect(days.at(-1).iso).toBe("2026-10-11");
    expect(days).toHaveLength(15);
  });

  it("period 2 runs from the 12th to the 26th", () => {
    const days = getPayrollPeriodDays(2026, 10, 2);
    expect(days[0].iso).toBe("2026-10-12");
    expect(days.at(-1).iso).toBe("2026-10-26");
    expect(days).toHaveLength(15);
  });

  it("crosses the year in January", () => {
    const days = getPayrollPeriodDays(2027, 1, 1);
    expect(days[0].iso).toBe("2026-12-27");
    expect(days.at(-1).iso).toBe("2027-01-11");
    expect(days).toHaveLength(16);
  });

  it("is 13 days after a 28-day February", () => {
    expect(isos(getPayrollPeriodDays(2027, 3, 1))[0]).toBe("2027-02-27");
    expect(getPayrollPeriodDays(2027, 3, 1)).toHaveLength(13);
    expect(getPayrollPeriodDays(2028, 3, 1)).toHaveLength(14); // leap year
  });

  it("lists consecutive days with no gaps", () => {
    for (let m = 1; m <= 12; m++) {
      for (const half of [1, 2]) {
        const days = getPayrollPeriodDays(2026, m, half);
        for (let i = 1; i < days.length; i++) {
          const a = new Date(days[i - 1].iso + "T12:00:00");
          const b = new Date(days[i].iso + "T12:00:00");
          expect(Math.round((b - a) / 86400000)).toBe(1);
        }
      }
    }
  });
});

describe("periodTitle", () => {
  it("names both months when the period spans two", () => {
    const days = getPayrollPeriodDays(2026, 10, 1);
    expect(periodTitle(days, 10, 2026)).toBe("September – October 2026");
  });

  it("names one month for period 2", () => {
    expect(periodTitle(getPayrollPeriodDays(2026, 10, 2), 10, 2026)).toBe("October 2026");
  });

  it("names both years across New Year", () => {
    expect(periodTitle(getPayrollPeriodDays(2027, 1, 1), 1, 2027)).toBe(
      "December 2026 – January 2027",
    );
  });
});

describe("previousPeriod", () => {
  it("goes from period 2 to period 1 of the same month", () => {
    expect(previousPeriod(2026, 10, 2)).toEqual({ year: 2026, month: 10, half: 1 });
  });

  it("goes from period 1 to period 2 of the previous month", () => {
    expect(previousPeriod(2026, 10, 1)).toEqual({ year: 2026, month: 9, half: 2 });
    expect(previousPeriod(2027, 1, 1)).toEqual({ year: 2026, month: 12, half: 2 });
  });

  it("ends the day before the current period starts", () => {
    for (let m = 1; m <= 12; m++) {
      for (const half of [1, 2]) {
        const current = getPayrollPeriodDays(2027, m, half);
        const p = previousPeriod(2027, m, half);
        const prev = getPayrollPeriodDays(p.year, p.month, p.half);
        const lastPrev = new Date(prev.at(-1).iso + "T12:00:00");
        const firstCur = new Date(current[0].iso + "T12:00:00");
        expect(Math.round((firstCur - lastPrev) / 86400000)).toBe(1);
      }
    }
  });
});

describe("sameWeekdayIn (copy previous period)", () => {
  const weekday = (iso) => new Date(iso + "T12:00:00").getDay();

  it("copies two weeks back where possible", () => {
    const prev = getPayrollPeriodDays(2026, 9, 2); // Sep 12–26
    expect(sameWeekdayIn("2026-09-27", prev)).toBe("2026-09-13");
  });

  it("uses three weeks back at the end of a long period", () => {
    const prev = getPayrollPeriodDays(2026, 9, 2); // Sep 12–26
    // Oct 11 − 14 days = Sep 27, which is in the current period.
    expect(sameWeekdayIn("2026-10-11", prev)).toBe("2026-09-20");
  });

  it("maps every day of every period to the same weekday in the previous period", () => {
    for (const year of [2026, 2027, 2028]) {
      for (let m = 1; m <= 12; m++) {
        for (const half of [1, 2]) {
          const current = getPayrollPeriodDays(year, m, half);
          const p = previousPeriod(year, m, half);
          const prev = getPayrollPeriodDays(p.year, p.month, p.half);
          const prevSet = new Set(isos(prev));
          for (const d of current) {
            const from = sameWeekdayIn(d.iso, prev);
            expect(from, `${d.iso} (${year}-${m} p${half})`).not.toBeNull();
            expect(prevSet.has(from)).toBe(true);
            expect(weekday(from)).toBe(weekday(d.iso));
          }
        }
      }
    }
  });
});

describe("addMonths", () => {
  it("moves within a year and across year ends", () => {
    expect(addMonths(2026, 10, 1)).toEqual({ year: 2026, month: 11 });
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
  });
});

describe("periodContaining", () => {
  it("puts the 27th onwards in the next month's 1st period", () => {
    expect(periodContaining(new Date(2026, 9, 30))).toEqual({ year: 2026, month: 11, half: 1 });
    expect(periodContaining(new Date(2026, 11, 27))).toEqual({ year: 2027, month: 1, half: 1 });
  });

  it("splits the rest at the 12th", () => {
    expect(periodContaining(new Date(2026, 9, 11))).toEqual({ year: 2026, month: 10, half: 1 });
    expect(periodContaining(new Date(2026, 9, 12))).toEqual({ year: 2026, month: 10, half: 2 });
    expect(periodContaining(new Date(2026, 9, 26))).toEqual({ year: 2026, month: 10, half: 2 });
  });

  it("agrees with getPayrollPeriodDays for every day of a year", () => {
    for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
      const p = periodContaining(d);
      const iso = `2026-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      expect(isos(getPayrollPeriodDays(p.year, p.month, p.half))).toContain(iso);
    }
  });
});

describe("period lock", () => {
  const today = new Date(2026, 9, 30); // in Nov 1st period (Oct 27 – Nov 11)

  it("keeps the previous period editable and locks older ones", () => {
    expect(oldestEditablePeriod(today)).toEqual({ year: 2026, month: 10, half: 2 });
    expect(isPeriodLocked({ year: 2026, month: 10, half: 2 }, today)).toBe(false);
    expect(isPeriodLocked({ year: 2026, month: 10, half: 1 }, today)).toBe(true);
    expect(isPeriodLocked({ year: 2026, month: 12, half: 2 }, today)).toBe(false);
  });

  it("orders periods across years", () => {
    expect(periodIndex({ year: 2027, month: 1, half: 1 })).toBe(periodIndex({ year: 2026, month: 12, half: 2 }) + 1);
  });
});
