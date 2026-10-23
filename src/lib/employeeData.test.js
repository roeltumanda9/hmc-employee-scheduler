import { describe, expect, it, vi } from "vitest";
import { FIRST_EMPLOYEE_NUMBER, nextNumberFrom, sortByNumber } from "./employeeData";

vi.mock("./supabase", () => ({ supabase: {} }));

describe("nextNumberFrom", () => {
  it("is one more than the highest number", () => {
    expect(nextNumberFrom(["1001", "1007", "1003"])).toBe("1008");
  });

  it("ignores non-numeric numbers and starts at 1001", () => {
    expect(nextNumberFrom([])).toBe(String(FIRST_EMPLOYEE_NUMBER));
    expect(nextNumberFrom(["", null, "abc"])).toBe("1001");
  });
});

describe("sortByNumber", () => {
  it("sorts numerically, with missing numbers last", () => {
    const sorted = sortByNumber([
      { number: "1010" },
      { number: "" },
      { number: "999" },
      { number: "1002" },
    ]);
    expect(sorted.map((e) => e.number)).toEqual(["999", "1002", "1010", ""]);
  });
});
