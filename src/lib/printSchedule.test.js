import { describe, expect, it, vi } from "vitest";
import { groupByRole } from "./printSchedule";

vi.mock("./supabase", () => ({ supabase: {} }));

const emp = (name, role) => ({ id: name, name, role });

describe("groupByRole", () => {
  it("groups by job title A–Z, keeping each group's order, no title last", () => {
    const groups = groupByRole([
      emp("BENITEZ", "ACCOUNTING"),
      emp("DAAN", "IT"),
      emp("NEW", ""),
      emp("PACATANG", "Accounting "),
      emp("TUMANDA", "IT"),
    ]);
    expect(groups.map((g) => [g.role, g.employees.map((e) => e.name)])).toEqual([
      ["ACCOUNTING", ["BENITEZ", "PACATANG"]],
      ["IT", ["DAAN", "TUMANDA"]],
      ["", ["NEW"]],
    ]);
  });

  it("is empty for no employees", () => {
    expect(groupByRole([])).toEqual([]);
  });
});
