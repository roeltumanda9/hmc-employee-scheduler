import { describe, expect, it } from "vitest";
import {
  COMPACT_SIZES,
  MIN_FIT_DAY,
  SCROLL_SIZES,
  computeLayout,
} from "./gridLayout";

const tableWidth = (z, days) => z.empW + days * z.dayW + 4 * z.summaryW;

describe("computeLayout", () => {
  it("fits a 16-day period with no horizontal scroll on a 1280px laptop", () => {
    const z = computeLayout(928, 16, false); // grid pane width at 1280px
    expect(z.fit).toBe(true);
    expect(z.dayW).toBeGreaterThanOrEqual(MIN_FIT_DAY);
    expect(tableWidth(z, 16)).toBeLessThanOrEqual(928);
  });

  it("never makes the table wider than the pane when it fits", () => {
    for (let pane = 700; pane <= 2600; pane += 3) {
      for (const days of [13, 14, 15, 16]) {
        const z = computeLayout(pane, days, false);
        if (z.fit) expect(tableWidth(z, days)).toBeLessThanOrEqual(pane);
      }
    }
  });

  it("fills the pane edge to edge (no empty strip on the right)", () => {
    for (const pane of [928, 1014, 1088, 1568]) {
      const z = computeLayout(pane, 15, false);
      expect(pane - tableWidth(z, 15)).toBeLessThan(1); // under 1px of rounding
    }
  });

  it("a vertical scrollbar only narrows the day columns, never the tier", () => {
    for (let outer = 920; outer <= 2000; outer += 7) {
      const inner = outer - 12; // classic scrollbar
      const without = computeLayout(outer, 15, false, outer);
      const withBar = computeLayout(inner, 15, false, outer);
      expect(withBar.fit).toBe(without.fit);
      if (!without.fit) continue;
      expect(withBar.cellH).toBe(without.cellH);
      expect(withBar.empW).toBe(without.empW);
      expect(withBar.summaryW).toBe(without.summaryW);
      expect(tableWidth(withBar, 15)).toBeLessThanOrEqual(inner);
      expect(inner - tableWidth(withBar, 15)).toBeLessThan(1);
    }
  });

  it("scrolls on narrow panes (small windows, tablets)", () => {
    expect(computeLayout(672, 15, false)).toEqual({ ...SCROLL_SIZES, fit: false });
  });

  it("uses phone sizes on phones regardless of width", () => {
    expect(computeLayout(1200, 15, true)).toEqual({ ...COMPACT_SIZES, fit: false });
  });

  it("scrolls until the pane has been measured", () => {
    expect(computeLayout(0, 15, false).fit).toBe(false);
  });

  it("uses larger type on wider screens", () => {
    const small = computeLayout(928, 15, false);
    const large = computeLayout(1568, 15, false);
    expect(large.cellH).toBeGreaterThan(small.cellH);
    expect(large.empW).toBeGreaterThan(small.empW);
  });
});
