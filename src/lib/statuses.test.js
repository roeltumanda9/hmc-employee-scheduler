import { describe, expect, it } from "vitest";
import {
  SHIFT_COLORS,
  STATUSES,
  isWorking,
  makeShift,
  tallyDays,
  unknownShift,
} from "./statuses";

describe("tallyDays (grid + print totals)", () => {
  it("counts every leave type in the leave total", () => {
    expect(tallyDays(["SL", "ML", "PL", "IL", "UL", "OL", "AM"])).toEqual({
      present: 1,
      off: 0,
      leave: 6,
    });
  });

  it("uses the leave rule it is given (from settings)", () => {
    const isLeave = (c) => c === "VL";
    expect(tallyDays(["VL", "IL", "OFF"], isLeave)).toEqual({ present: 1, off: 1, leave: 1 });
  });

  it("counts present, off and incentive leave, ignoring empty days", () => {
    expect(tallyDays(["AM", "PM", "OFF", "IL", undefined, null, "", "DUTY"])).toEqual({
      present: 3,
      off: 1,
      leave: 1,
    });
  });

  it("counts any shift other than OFF / IL as present, including new ones", () => {
    expect(tallyDays(["NS2", "9-6", "C3"])).toEqual({ present: 3, off: 0, leave: 0 });
  });

  it("is zero for an empty period", () => {
    expect(tallyDays([])).toEqual({ present: 0, off: 0, leave: 0 });
  });
});

describe("isWorking (daily manpower)", () => {
  it("is true for shifts and false for OFF, IL and empty days", () => {
    expect(isWorking("AM")).toBe(true);
    expect(isWorking("OFF")).toBe(false);
    expect(isWorking("IL")).toBe(false);
    expect(isWorking("SL")).toBe(false);
    expect(isWorking(undefined)).toBe(false);
  });
});

describe("makeShift", () => {
  it("marks leave from the database flag, else from the built-in leave codes", () => {
    expect(makeShift({ code: "VL", is_leave: true }).isLeave).toBe(true);
    expect(makeShift({ code: "SL", is_leave: false }).isLeave).toBe(false);
    expect(makeShift({ code: "SL" }).isLeave).toBe(true);
    expect(makeShift({ code: "AM" }).isLeave).toBe(false);
  });

  it("applies the palette color", () => {
    const s = makeShift({ code: "NS2", label: "Night 2", time: "7–7", color: "purple" });
    expect(s.classes).toBe(SHIFT_COLORS.purple.classes);
    expect(s.print).toEqual(SHIFT_COLORS.purple.print);
  });

  it("falls back to gray for an unknown color and to the code for a missing label", () => {
    const s = makeShift({ code: "X", color: "neon" });
    expect(s.color).toBe("gray");
    expect(s.label).toBe("X");
  });

  it("built-in shifts all use palette colors", () => {
    for (const s of STATUSES) expect(SHIFT_COLORS[s.color]).toBeDefined();
  });
});

describe("unknownShift", () => {
  it("shows the code without a palette color", () => {
    const s = unknownShift("ZZ");
    expect(s.label).toBe("ZZ");
    expect(s.classes).not.toBe(SHIFT_COLORS.gray.classes);
  });
});
