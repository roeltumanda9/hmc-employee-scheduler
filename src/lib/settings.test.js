import { describe, expect, it, vi } from "vitest";

// settings.js imports the Supabase client, which needs a browser; these
// helpers never call it.
vi.mock("./supabase", () => ({ supabase: {} }));

const {
  departmentNames,
  findShift,
  leaveChecker,
  leaveTypes,
  resolveShift,
  shiftsForDepartment,
} = await import("./settings");
const { makeShift } = await import("./statuses");

const settings = {
  departments: [
    { name: "H Hotel", active: true, shifts: ["PM", "AM", "GONE", "IL", "OFF"], shift_times: {} },
    { name: "Wellness", active: false, shifts: ["DUTY", "OFF"], shift_times: { DUTY: "8:00 AM – 5:00 PM" } },
  ],
  shifts: [
    makeShift({ code: "AM", label: "AM Shift", time: "6:00 AM – 2:00 PM", color: "blue" }),
    makeShift({ code: "PM", label: "PM Shift", time: "2:00 PM – 10:00 PM", color: "amber" }),
    makeShift({ code: "DUTY", label: "Duty", time: "10:00 AM – 7:00 PM", color: "sky" }),
    makeShift({ code: "OFF", label: "Day Off", color: "gray" }),
    makeShift({ code: "SL", label: "Sick Leave", color: "red", is_leave: true }),
    makeShift({ code: "IL", label: "Incentive Leave", color: "mint", is_leave: true }),
  ],
};

describe("leave types", () => {
  it("lists every leave type for the Leave picker", () => {
    expect(leaveTypes(settings).map((s) => s.code)).toEqual(["SL", "IL"]);
  });

  it("checks codes against the leave flag; unknown codes aren't leave", () => {
    const isLeave = leaveChecker(settings);
    expect(isLeave("SL")).toBe(true);
    expect(isLeave("AM")).toBe(false);
    expect(isLeave("NOPE")).toBe(false);
  });
});

describe("findShift", () => {
  it("finds a shift by code", () => {
    expect(findShift(settings, "PM").label).toBe("PM Shift");
  });

  it("returns null for an unknown code", () => {
    expect(findShift(settings, "NOPE")).toBeNull();
  });
});

describe("resolveShift", () => {
  it("applies the department's time override", () => {
    expect(resolveShift(settings, "DUTY", "Wellness").time).toBe("8:00 AM – 5:00 PM");
  });

  it("keeps the standard time without an override", () => {
    expect(resolveShift(settings, "DUTY", "H Hotel").time).toBe("10:00 AM – 7:00 PM");
  });
});

describe("shiftsForDepartment (shift picker)", () => {
  it("keeps the department's order and skips deleted codes and leave (offered separately)", () => {
    expect(shiftsForDepartment(settings, "H Hotel").map((s) => s.code)).toEqual([
      "PM",
      "AM",
      "OFF",
    ]);
  });

  it("offers only OFF for an unknown department", () => {
    expect(shiftsForDepartment(settings, "Nowhere").map((s) => s.code)).toEqual(["OFF"]);
  });
});

describe("departmentNames", () => {
  it("hides inactive departments when asked, except one being kept", () => {
    expect(departmentNames(settings, { activeOnly: true })).toEqual(["H Hotel"]);
    expect(departmentNames(settings, { activeOnly: true, keep: "Wellness" })).toEqual([
      "H Hotel",
      "Wellness",
    ]);
  });
});
