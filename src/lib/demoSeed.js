import { getPayrollPeriodDays, periodContaining, previousPeriod } from "./dates";
import { buildFullName } from "./format";

/**
 * Made-up data for the portfolio demo (src/lib/demoClient.js). Every name
 * here is fictional. Schedules are generated relative to `today`, so the
 * demo never looks stale: the previous and current payroll periods are
 * filled and the next one is left empty to try "Copy previous period".
 */

const SHIFT_TYPES = [
  ["AM", "AM Shift", "6:00 AM – 2:00 PM", "blue"],
  ["PM", "PM Shift", "2:00 PM – 10:00 PM", "amber"],
  ["NS", "Night Shift", "10:00 PM – 6:00 AM", "indigo"],
  ["DUTY", "Duty", "8:00 AM – 5:00 PM", "sky"],
  ["MS", "Mid Shift", "10:00 AM – 7:00 PM", "emerald"],
  ["OFF", "Day Off", "", "gray"],
  ["SL", "Sick Leave", "", "red", true],
  ["ML", "Maternity Leave", "", "pink", true],
  ["PL", "Paternity Leave", "", "purple", true],
  ["IL", "Incentive Leave", "", "mint", true],
  ["UL", "Unpaid Leave", "", "stone", true],
].map(([code, label, default_time, color, is_leave = false], i) => ({
  code,
  label,
  default_time,
  color,
  is_leave,
  sort_order: i + 1,
}));

const DEPARTMENTS = [
  { name: "Outpatient Clinic", shifts: ["DUTY", "MS", "OFF"], prepared_by_name: "DR. ANA REYES", prepared_by_title: "Clinic Head" },
  { name: "Nursing", shifts: ["AM", "PM", "NS", "OFF"], prepared_by_name: "MARIA SANTOS, RN", prepared_by_title: "Chief Nurse" },
  { name: "Laboratory", shifts: ["AM", "DUTY", "OFF"], prepared_by_name: "JOSE CRUZ, RMT", prepared_by_title: "Lab Supervisor" },
  { name: "Pharmacy", shifts: ["AM", "PM", "OFF"], prepared_by_name: "", prepared_by_title: "" },
].map((d, i) => ({
  ...d,
  sort_order: i + 1,
  active: true,
  banner_url: "/banner.svg",
  shift_times: {},
}));

const PRINT_SETTINGS = {
  id: 1,
  default_banner_url: "/banner.svg",
  default_prepared_by_name: "HR OFFICE",
  default_prepared_by_title: "Human Resources",
  checked_by_name: "LUIS MENDOZA",
  checked_by_title: "Operations Manager",
  approved_by_name: "DR. CARMEN VILLANUEVA",
  approved_by_title: "Medical Director",
};

// [first, middle, last, department, job title]
const PEOPLE = [
  ["Andrea", "Lopez", "Bautista", "Outpatient Clinic", "Physician"],
  ["Mark", "Diaz", "Castillo", "Outpatient Clinic", "Physician"],
  ["Joy", "", "Ramos", "Outpatient Clinic", "Clinic Assistant"],
  ["Paolo", "Garcia", "Navarro", "Outpatient Clinic", "Receptionist"],
  ["Grace", "Torres", "Dela Cruz", "Nursing", "Staff Nurse"],
  ["Kevin", "Morales", "Aquino", "Nursing", "Staff Nurse"],
  ["Liza", "", "Fernandez", "Nursing", "Staff Nurse"],
  ["Ramon", "Flores", "Gonzales", "Nursing", "Nursing Aide"],
  ["Bea", "Rivera", "Salazar", "Nursing", "Staff Nurse"],
  ["Nico", "Herrera", "Domingo", "Nursing", "Nursing Aide"],
  ["Clarisse", "Ocampo", "Valdez", "Laboratory", "Medical Technologist"],
  ["Jerome", "", "Pascual", "Laboratory", "Medical Technologist"],
  ["Trisha", "Mercado", "Santiago", "Laboratory", "Phlebotomist"],
  ["Dennis", "Robles", "Manalo", "Pharmacy", "Pharmacist"],
  ["Kim", "Soriano", "Tolentino", "Pharmacy", "Pharmacy Assistant"],
  ["Arvin", "", "Galang", "Pharmacy", "Pharmacy Assistant"],
];

const EMPLOYEES = PEOPLE.map(([first, middle, last, department, role], i) => {
  const names = {
    first_name: first.toUpperCase(),
    middle_name: middle.toUpperCase(),
    last_name: last.toUpperCase(),
  };
  return {
    id: i + 1,
    ...names,
    name: buildFullName(names),
    number: String(1001 + i),
    biometric_no: String(101 + i),
    department,
    role: role.toUpperCase(),
  };
});

// Shift for an employee on a day: a weekly rotation per department with one
// day off a week, staggered so the day totals vary.
function shiftFor(emp, index, date) {
  const dept = DEPARTMENTS.find((d) => d.name === emp.department);
  const work = dept.shifts.filter((c) => c !== "OFF");
  const weekday = date.getDay();
  if (weekday === index % 7) return "OFF";
  const week = Math.floor(date.getTime() / (7 * 86400000));
  return work[(week + index) % work.length];
}

function periodDays(p) {
  return getPayrollPeriodDays(p.year, p.month, p.half);
}

function buildSchedules(today) {
  const cur = periodContaining(today);
  const prev = previousPeriod(cur.year, cur.month, cur.half);
  const prevDays = periodDays(prev);
  const days = [...prevDays, ...periodDays(cur)];

  const rows = [];
  EMPLOYEES.forEach((emp, index) => {
    for (const { iso } of days) {
      const date = new Date(`${iso}T00:00:00`);
      rows.push({ employee_id: emp.id, date: iso, status: shiftFor(emp, index, date) });
    }
  });

  // A little leave in the current period, so the Leave totals and the yearly
  // limit have something to show. [employee id, day of the period, code]
  const leave = [
    [5, 3, "SL"],
    [12, 6, "IL"],
    [14, 9, "SL"],
    [14, 10, "SL"],
    [2, 1, "SL"],
  ];
  for (const [empId, dayIndex, code] of leave) {
    const iso = days[prevDays.length + dayIndex]?.iso;
    const row = rows.find((r) => r.employee_id === empId && r.date === iso);
    if (row) row.status = code;
  }

  return rows.map((r, i) => ({ id: i + 1, ...r }));
}

export function buildDemoData(today = new Date()) {
  return {
    seededAt: today.toISOString(),
    profiles: [],
    employees: EMPLOYEES.map((e) => ({ ...e })),
    departments: DEPARTMENTS.map((d) => ({ ...d, shifts: [...d.shifts] })),
    shift_types: SHIFT_TYPES.map((s) => ({ ...s })),
    print_settings: [{ ...PRINT_SETTINGS }],
    schedules: buildSchedules(today),
    schedule_history: [],
  };
}

// Demo sign-ins, one per role (no passwords: the login page shows buttons).
export const DEMO_USERS = [
  { id: "demo-super-admin", email: "superadmin@demo.example.com", role: "super_admin" },
  { id: "demo-admin", email: "admin@demo.example.com", role: "admin" },
  { id: "demo-user", email: "viewer@demo.example.com", role: "user" },
];
