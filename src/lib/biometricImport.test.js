import { describe, expect, it } from "vitest";
import {
  departmentMapFor,
  editDistance,
  matchPeople,
  normalizeBioNo,
  parseAttendance,
  planImport,
  splitName,
  suggestDepartments,
} from "./biometricImport";

const HEADER = ["Department", "Name", "No.", "Date/Time", "Location ID", "ID Number", "VerifyCode", "CardNo"];
const punch = (dept, name, no) => [dept, name, no, "10/26/2026 7:50:04 AM", "1", "", "FP", ""];

const emp = (id, last_name, first_name, department, extra = {}) => ({
  id,
  last_name,
  first_name,
  middle_name: "",
  name: `${last_name}, ${first_name}`,
  number: String(1000 + id),
  department,
  role: "STAFF",
  ...extra,
});

describe("splitName", () => {
  it("splits LAST, FIRST and a trailing middle initial", () => {
    expect(splitName("vicada, mae hazel b.")).toEqual({ last: "VICADA", first: "MAE HAZEL", middle: "B", ordered: true });
    expect(splitName("GALVEZ,  COURTNEY GAL")).toMatchObject({ last: "GALVEZ", first: "COURTNEY GAL" });
  });

  it("accepts a period in place of the comma", () => {
    expect(splitName("MAG-USARA. HAZEL KATE")).toMatchObject({ last: "MAG-USARA", first: "HAZEL KATE", ordered: true });
  });

  it("guesses FIRST LAST without a separator, and says so", () => {
    expect(splitName("BERNARD A. TABANAO")).toEqual({ last: "TABANAO", first: "BERNARD", middle: "A", ordered: false });
    expect(splitName("MJ")).toEqual({ last: "", first: "MJ", middle: "", ordered: false });
  });
});

describe("normalizeBioNo / editDistance", () => {
  it("drops leading zeros", () => {
    expect(normalizeBioNo("0016")).toBe("16");
    expect(normalizeBioNo(" 162 ")).toBe("162");
    expect(normalizeBioNo(null)).toBe("");
  });

  it("counts an adjacent swap as one edit", () => {
    expect(editDistance("JUHNRY", "JHUNRY")).toBe(1);
    expect(editDistance("CARFENTEROS", "CARPENTEROS")).toBe(1);
    expect(editDistance("AYAWON", "AWAYON")).toBe(2);
  });
});

describe("parseAttendance", () => {
  it("gives one person per biometric number, with the last row's values", () => {
    const people = parseAttendance([
      HEADER,
      punch("H-HOTEL", "PANES, JOZER", "8"),
      punch("H-HOTEL", "PANES, JOZER", "8"),
      punch("WELLNESS", "PANES, JOZER", "8"),
      punch("ADMIN", "TUMANDA, ROEL", "10"),
    ]);
    expect(people).toHaveLength(2);
    expect(people[0]).toMatchObject({ bioNo: "8", last: "PANES", department: "WELLNESS", rows: 3 });
  });

  it("finds the AC-No. column of the attendance report", () => {
    const people = parseAttendance([
      ["Emp No.", "AC-No.", "No.", "Name", "Department"],
      ["213", "1", "", "VICADA, MAE HAZEL B.", "JA PHARMACY"],
    ]);
    expect(people[0]).toMatchObject({ bioNo: "1", first: "MAE HAZEL", middle: "B" });
  });

  it("explains a file without a Name column", () => {
    expect(() => parseAttendance([["A", "B"], ["1", "2"]])).toThrow(/Name/);
  });
});

describe("matchPeople", () => {
  const employees = [
    emp(1, "CARFENTEROS", "NICE", "H Hotel"),
    emp(2, "NAJRA", "MUSA", "JA Grocery / Pharmacy"),
    emp(3, "AYAWON", "VALERY", "HMC Laboratory"),
    emp(4, "BENITEZ", "RITCHIE JEAN JIE LIZZA", "HMC", { middle_name: "D" }),
    emp(5, "SOLIS", "LYNHYL MEI", "HMC", { biometric_no: "6" }),
  ];

  it("matches typos, swapped order, extra or missing words", () => {
    const people = parseAttendance([
      HEADER,
      punch("H-HOTEL", "CARPENTEROS, NICE", "133"),
      punch("JA", "MUSA, NAJRA", "114"),
      punch("LABORATORY", "AWAYON, ROSE ANN VALERY", "82"),
      punch("ADMIN", "BENITEZ, RITCHIE", "159"),
      punch("H-HOTEL", "DUPIO, CHERRY ANN", "5"),
    ]);
    const m = matchPeople(people, employees);
    expect(people.map((p) => m.get(p)?.id)).toEqual([1, 2, 3, 4, undefined]);
  });

  it("prefers the stored biometric number over the name", () => {
    const [p] = parseAttendance([HEADER, punch("ADMIN", "SOLIS, LINEL", "6")]);
    expect(matchPeople([p], employees).get(p).id).toBe(5);
  });

  it("does not match on a single shared word", () => {
    const [p] = parseAttendance([HEADER, punch("H-HOTEL", "NICE", "1")]);
    expect(matchPeople([p], employees).size).toBe(0);
  });
});

describe("suggestDepartments", () => {
  const app = ["Amysthetic", "H Hotel", "JA Grocery / Pharmacy", "HMC", "HMC Laboratory"];

  it("maps by name, acronym or typo, and skips resigned staff", () => {
    const people = parseAttendance([
      HEADER,
      punch("H-HOTEL", "A, B", "1"),
      punch("JA PHARMACY & GROCERY", "C, D", "2"),
      punch("HOFILEÑA MEDICAL CENTRUM", "E, F", "3"),
      punch("AMYSTHETHIC", "G, H", "4"),
      punch("RESIGNED", "MJ", "5"),
      punch("CANTEEN", "I, J", "6"),
    ]);
    expect(suggestDepartments(people, new Map(), app)).toEqual({
      "H-HOTEL": "H Hotel",
      "JA PHARMACY & GROCERY": "JA Grocery / Pharmacy",
      "HOFILEÑA MEDICAL CENTRUM": "HMC",
      AMYSTHETHIC: "Amysthetic",
      RESIGNED: "",
      CANTEEN: "",
    });
  });

  it("follows where matched employees already are", () => {
    const employees = [emp(1, "TUMANDA", "ROEL", "HMC")];
    const people = parseAttendance([HEADER, punch("ADMIN", "TUMANDA, ROEL", "10")]);
    expect(suggestDepartments(people, matchPeople(people, employees), app)).toEqual({ ADMIN: "HMC" });
  });
});

describe("planImport", () => {
  const employees = [
    emp(1, "CARFENTEROS", "NICE", "H Hotel"),
    emp(2, "NAJRA", "MUSA", "JA Grocery / Pharmacy"),
    emp(3, "CALLENERO", "VALLERIE MARIE", "Wellness"),
    emp(4, "TUMANDA", "ROEL", "HMC", { middle_name: "A" }),
    emp(5, "ESTRADA", "BERLYN", "H Hotel"),
  ];
  const deptMap = { "H-HOTEL": "H Hotel", JA: "JA Grocery / Pharmacy", WELLNESS: "Wellness", ADMIN: "HMC", "HOFILEÑA MEDICAL CENTRUM": "HMC", RESIGNED: "" };

  function plan(rows, withBioNo = true) {
    const people = parseAttendance([HEADER, ...rows]);
    return planImport({ people, employees, matches: matchPeople(people, employees), deptMap, withBioNo, firstNumber: "1053" });
  }

  it("replaces last, first and middle name with the biometric's, stores the number", () => {
    const p = plan([
      punch("H-HOTEL", "CARPENTEROS, NICE", "133"),
      punch("WELLNESS", "CALLENERO, VALLERIE MARI", "141"),
      punch("ADMIN", "TUMANDA, ROEL", "10"),
    ]);
    const byId = Object.fromEntries(p.updates.map((u) => [u.employee.id, u]));
    expect(byId[1].payload).toEqual({ last_name: "CARPENTEROS", biometric_no: "133", name: "CARPENTEROS, NICE" });
    expect(byId[1].doubtful).toBe(false);
    expect(byId[3].payload).toEqual({ first_name: "VALLERIE MARI", biometric_no: "141", name: "CALLENERO, VALLERIE MARI" });
    expect(byId[4].payload).toEqual({ middle_name: "", biometric_no: "10", name: "TUMANDA, ROEL" });
  });

  it("moves departments and leaves the number out until the column exists", () => {
    const p = plan([punch("WELLNESS", "CARFENTEROS, NICE", "133")], false);
    expect(p.updates[0].changes).toEqual([
      { field: "department", label: "Department", from: "H Hotel", to: "Wellness" },
    ]);
    expect(p.updates[0].payload).not.toHaveProperty("biometric_no");
  });

  it("applies a first/last swap and a typo fix (both ticked)", () => {
    const p = plan([punch("JA", "MUSA, NAJRA", "114")]);
    expect(p.updates[0]).toMatchObject({ doubtful: false, payload: { last_name: "MUSA", first_name: "NAJRA" } });
    const people = parseAttendance([HEADER, punch("A", "DIAPERA, JULIET", "147")]);
    const employees = [emp(9, "DIAPERA", "JUILET", "Amysthetic")];
    const typo = planImport({
      people,
      employees,
      matches: matchPeople(people, employees),
      deptMap: { A: "Amysthetic" },
      withBioNo: false,
      firstNumber: "1053",
    });
    expect(typo.updates[0]).toMatchObject({ doubtful: false, payload: { first_name: "JULIET" } });
  });

  it("adds new people with the next numbers, skips unmapped ones, lists the rest", () => {
    const p = plan([
      punch("HOFILEÑA MEDICAL CENTRUM", "FIEL, GARRY", "162"),
      punch("H-HOTEL", "DUPIO, CHERRY ANN", "5"),
      punch("RESIGNED", "MJ", "113"),
      punch("ADMIN", "TUMANDA, ROEL", "10"),
    ]);
    expect(p.inserts.map((i) => i.payload)).toEqual([
      { first_name: "GARRY", middle_name: "", last_name: "FIEL", name: "FIEL, GARRY", number: "1053", department: "HMC", role: "", biometric_no: "162" },
      { first_name: "CHERRY ANN", middle_name: "", last_name: "DUPIO", name: "DUPIO, CHERRY ANN", number: "1054", department: "H Hotel", role: "", biometric_no: "5" },
    ]);
    expect(p.skipped.map((s) => s.rawName)).toEqual(["MJ"]);
    expect(p.missing.map((e) => e.id)).toEqual([1, 2, 3, 5]);
  });

  it("counts employees that are already up to date", () => {
    const p = plan([punch("H-HOTEL", "CARFENTEROS, NICE", "133")], false);
    expect(p).toMatchObject({ updates: [], inserts: [], unchanged: 1 });
  });

  it("renames from a name without a comma only as a doubtful (unticked) change", () => {
    const p = plan([punch("H-HOTEL", "NICE CARPENTEROS", "133")], false);
    expect(p.updates[0]).toMatchObject({ doubtful: true, payload: { last_name: "CARPENTEROS", name: "CARPENTEROS, NICE" } });
  });
});

describe("departmentMapFor", () => {
  const app = ["H Hotel", "HMC"];
  const people = parseAttendance([HEADER, punch("H-HOTEL", "A, B", "1"), punch("ADMIN", "C, D", "2")]);

  it("uses earlier choices over suggestions, if they still exist", () => {
    expect(departmentMapFor(people, new Map(), app, { ADMIN: "HMC", "H-HOTEL": "Gone Dept" })).toEqual({
      "H-HOTEL": "H Hotel",
      ADMIN: "HMC",
    });
    expect(departmentMapFor(people, new Map(), app, { "H-HOTEL": "" })).toEqual({ "H-HOTEL": "", ADMIN: "" });
  });
});
