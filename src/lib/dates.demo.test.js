import { afterEach, describe, expect, it, vi } from "vitest";

// The portfolio demo (VITE_DEMO=true) uses plain half-months.
async function demoDates() {
  vi.resetModules();
  vi.stubEnv("VITE_DEMO", "true");
  return import("./dates");
}

describe("demo payroll periods", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("splits a month into 1–15 and 16–end", async () => {
    const { getPayrollPeriodDays } = await demoDates();
    const first = getPayrollPeriodDays(2026, 2, 1);
    expect(first[0].iso).toBe("2026-02-01");
    expect(first.at(-1).iso).toBe("2026-02-15");
    const second = getPayrollPeriodDays(2026, 2, 2);
    expect(second[0].iso).toBe("2026-02-16");
    expect(second.at(-1).iso).toBe("2026-02-28");
    expect(getPayrollPeriodDays(2026, 12, 2).at(-1).iso).toBe("2026-12-31");
  });

  it("finds the period containing a date", async () => {
    const { periodContaining } = await demoDates();
    expect(periodContaining(new Date(2026, 10, 15))).toEqual({ year: 2026, month: 11, half: 1 });
    expect(periodContaining(new Date(2026, 10, 16))).toEqual({ year: 2026, month: 11, half: 2 });
    expect(periodContaining(new Date(2026, 11, 31))).toEqual({ year: 2026, month: 12, half: 2 });
  });
});
