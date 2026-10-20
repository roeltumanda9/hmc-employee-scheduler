import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getPayrollPeriodDays } from "../lib/dates";
import { DEPARTMENTS } from "../lib/departments";
import ScheduleGrid from "../components/ScheduleGrid";

import {
  STATUS_MAP,
  STATUSES_BY_DEPARTMENT,
  resolveStatus,
} from "../lib/statuses";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
}

const DEPT_BANNERS = {
  Amysthetic: "/logo-banner-amystethic.png",
  "H Hotel": "/logo-banner-hhotel.png",
  "JA Grocery / Pharmacy": "/logo-banner-jagrocery.png",
  Wellness: "/logo-banner-wellness.png",
  Johanju: "/logo-banner-johanju.png",
  HMC: "/logo-banner.png",
  "HMC Laboratory": "/logo-banner.png",
  Hofitea: "/logo-banner-hofitea.png",
};

const DEFAULT_BANNER = "/logo-banner.png";

function bannerFor(deptLabel, isAll) {
  if (isAll) return DEFAULT_BANNER;
  return DEPT_BANNERS[deptLabel] || DEFAULT_BANNER;
}

const PREPARED_BY = {
  Amysthetic: { name: "VICARH-JENZEN CARDENAS", title: "Info Clerk" },
  "H Hotel": { name: "LORRAINE JANE L. DUNKEN", title: "OIC-Manager" },
  "JA Grocery / Pharmacy": { name: "BERNARD A. TABANAO", title: "Pharmacist" },
  Wellness: {
    name: "VALERIE MARIE CALLENERO",
    title: "Human Resource Manager",
  },
  Johanju: { name: "BERNARD A. TABANAO", title: "Pharmacist" },
  HMC: { name: "BERNARD A. TABANAO", title: "Pharmacist" },
  "HMC Laboratory": { name: "VALERY AYAWON", title: "MedTech" },
  Hofitea: { name: "BERNARD A. TABANAO", title: "Pharmacist" },
};

export default function SchedulerPage({ role }) {
  const canEdit = role === "super_admin" || role === "admin";

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;

  function monthOffset(delta) {
    let m = todayMonth + delta;
    let y = todayYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    if (m > 12) {
      m = 1;
      y += 1;
    }
    return { year: y, month: m };
  }

  const PREV = monthOffset(-1);
  const NEXT = monthOffset(1);

  function isAllowed(y, m) {
    const key = y * 100 + m;
    return (
      key >= PREV.year * 100 + PREV.month && key <= NEXT.year * 100 + NEXT.month
    );
  }

  const [confirmClear, setConfirmClear] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [pending, setPending] = useState({});

  const [month, setMonth] = useState(() => {
    const savedM = parseInt(localStorage.getItem("hmc_sched_month"), 10);
    const savedY = parseInt(localStorage.getItem("hmc_sched_year"), 10);
    if (
      savedM >= 1 &&
      savedM <= 12 &&
      savedY >= 2000 &&
      savedY <= 2100 &&
      isAllowed(savedY, savedM)
    ) {
      return savedM;
    }
    return todayMonth;
  });

  const [year, setYear] = useState(() => {
    const savedM = parseInt(localStorage.getItem("hmc_sched_month"), 10);
    const savedY = parseInt(localStorage.getItem("hmc_sched_year"), 10);
    if (
      savedM >= 1 &&
      savedM <= 12 &&
      savedY >= 2000 &&
      savedY <= 2100 &&
      isAllowed(savedY, savedM)
    ) {
      return savedY;
    }
    return todayYear;
  });

  const [half, setHalf] = useState(() => {
    const v = parseInt(localStorage.getItem("hmc_sched_half"), 10);
    return v === 2 ? 2 : 1;
  });

  const [dept, setDept] = useState(() => {
    const v = localStorage.getItem("hmc_sched_dept");
    return v || "all";
  });

  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const isAllDepts = dept === "all";

  const days = useMemo(
    () => getPayrollPeriodDays(year, month, half),
    [year, month, half],
  );

  const legendShifts = useMemo(() => {
    if (isAllDepts) return [];
    const codes = STATUSES_BY_DEPARTMENT[dept] || [];
    const resolved = codes
      .map((code) => resolveStatus(STATUS_MAP[code], dept))
      .filter(Boolean);

    const hasOff = resolved.some((s) => s.code === "OFF");
    if (!hasOff && STATUS_MAP["OFF"]) {
      resolved.push(STATUS_MAP["OFF"]);
    }
    return resolved;
  }, [dept, isAllDepts]);

  const visibleEmployees = useMemo(() => {
    if (isAllDepts) return employees;
    return employees.filter((e) => e.department === dept);
  }, [employees, dept, isAllDepts]);

  async function load() {
    setLoading(true);

    const firstIso = days[0]?.iso;
    const lastIso = days[days.length - 1]?.iso;

    const [empRes, schRes] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase
        .from("schedules")
        .select("*")
        .gte("date", firstIso)
        .lte("date", lastIso),
    ]);

    if (empRes.error) alert(empRes.error.message);
    else setEmployees(empRes.data);

    if (schRes.error) alert(schRes.error.message);
    else setSchedules(schRes.data);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [month, year, half]);

  useEffect(() => {
    localStorage.setItem("hmc_sched_month", String(month));
    localStorage.setItem("hmc_sched_year", String(year));
    localStorage.setItem("hmc_sched_half", String(half));
    localStorage.setItem("hmc_sched_dept", dept);

    if (editing && editSnapshot) setSchedules(editSnapshot);
    setEditing(false);
    setPending({});
    setEditSnapshot(null);
    // eslint-disable-next-line
  }, [month, year, half, dept]);

  useEffect(() => {
    if (!confirmClear) return;
    function onKey(e) {
      if (e.key === "Escape") setConfirmClear(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmClear]);

  useEffect(() => {
    if (!confirmClear) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [confirmClear]);

  function setStatus(employeeId, iso, status) {
    if (isAllDepts || !canEdit || !editing) return;

    const key = `${employeeId}|${iso}`;
    setPending((prev) => ({ ...prev, [key]: status ?? null }));

    setSchedules((prev) => {
      const existing = prev.find(
        (s) => s.employee_id === employeeId && s.date === iso,
      );

      if (!status) {
        return prev.filter((s) => s.id !== existing?.id);
      }

      if (existing) {
        return prev.map((s) => (s.id === existing.id ? { ...s, status } : s));
      }

      return [
        ...prev,
        {
          id: `pending-${key}`,
          employee_id: employeeId,
          date: iso,
          status,
          _pending: true,
        },
      ];
    });
  }

  function askClearHalf() {
    if (isAllDepts || !canEdit || !editing) return;
    const empIds = visibleEmployees.map((e) => e.id);
    if (empIds.length === 0 || days.length === 0) return;
    setConfirmClear(true);
  }

  function confirmClearHalf() {
    if (!canEdit || isAllDepts || !editing) return;
    setConfirmClear(false);

    const empIds = visibleEmployees.map((e) => e.id);
    if (empIds.length === 0 || days.length === 0) return;

    const empIdSet = new Set(empIds);
    const daySet = new Set(days.map((d) => d.iso));

    const newPending = { ...pending };
    for (const empId of empIds) {
      for (const iso of daySet) {
        newPending[`${empId}|${iso}`] = null;
      }
    }
    setPending(newPending);

    setSchedules((prev) =>
      prev.filter((s) => !(empIdSet.has(s.employee_id) && daySet.has(s.date))),
    );
  }

  function cancelEdit() {
    if (editSnapshot) setSchedules(editSnapshot);
    setPending({});
    setEditSnapshot(null);
    setEditing(false);
  }

  async function saveEdits() {
    if (!canEdit || isAllDepts || !editing || saving) return;
    setSaving(true);

    const entries = Object.entries(pending);

    for (const [key, status] of entries) {
      const [employeeId, iso] = key.split("|");

      const existing = editSnapshot?.find(
        (s) => s.employee_id === employeeId && s.date === iso,
      );

      if (status === null) {
        if (existing) {
          const { error } = await supabase
            .from("schedules")
            .delete()
            .eq("id", existing.id);
          if (error) {
            setSaving(false);
            alert("Save failed: " + error.message);
            return;
          }
        }
        continue;
      }

      if (existing) {
        const { error } = await supabase
          .from("schedules")
          .update({ status })
          .eq("id", existing.id);
        if (error) {
          setSaving(false);
          alert("Save failed: " + error.message);
          return;
        }
        continue;
      }

      const { error } = await supabase
        .from("schedules")
        .insert({ employee_id: employeeId, date: iso, status });
      if (error) {
        setSaving(false);
        alert("Save failed: " + error.message);
        return;
      }
    }

    setPending({});
    setEditSnapshot(null);
    setEditing(false);
    await load();
    setSaving(false);
  }

  function changeMonth(delta) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (!isAllowed(y, m)) return;
    setMonth(m);
    setYear(y);
  }

  function canGoPrev() {
    const current = year * 100 + month;
    return current > PREV.year * 100 + PREV.month;
  }

  function canGoNext() {
    const current = year * 100 + month;
    return current < NEXT.year * 100 + NEXT.month;
  }

  /* ---------------- PRINT ---------------- */
  function handlePrint() {
    const deptLabel = isAllDepts ? "All Departments" : dept;
    const banner = bannerFor(dept, isAllDepts);
const bannerUrl = new URL(banner, window.location.origin).href;

    // Build "September – October 2026" or "October 2026"
    const rangeTitle = (() => {
      const first = days[0];
      const last = days[days.length - 1];
      if (!first || !last) return `${months[month - 1]} ${year}`;
      const firstDate = new Date(first.iso);
      const lastDate = new Date(last.iso);
      const fm = firstDate.getMonth();
      const lm = lastDate.getMonth();
      const fy = firstDate.getFullYear();
      const ly = lastDate.getFullYear();
      if (fm === lm && fy === ly) return `${months[fm]} ${fy}`;
      if (fy === ly) return `${months[fm]} – ${months[lm]} ${fy}`;
      return `${months[fm]} ${fy} – ${months[lm]} ${ly}`;
    })();

    const lookup = {};
    for (const s of schedules) {
      lookup[`${s.employee_id}|${s.date}`] = s.status;
    }

    const dayHeaders = days
      .map(
        (d) => `
        <th class="day">
          <div class="weekday">${escapeHtml(d.weekday.toUpperCase())}</div>
          <div class="daynum">${d.day}</div>
        </th>`,
      )
      .join("");

    let grandPresent = 0;
    let grandOff = 0;
    let grandIL = 0;
    let grandTotalDays = 0;

    const rows = visibleEmployees
      .map((emp, i) => {
        let present = 0;
        let off = 0;
        let il = 0;

        const cells = days
          .map((d) => {
            const st = lookup[`${emp.id}|${d.iso}`];

            if (st === "IL") il++;
            else if (st && st !== "OFF") present++;
            else if (st === "OFF") off++;

            let cls = "cell";
            if (st) {
              const safe = st
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "")
                .replace(/^(\d)/, "n$1");
              cls += ` cell-${safe}`;
            }

            return `<td class="${cls}">${escapeHtml(st || "")}</td>`;
          })
          .join("");

        const total = present;
        grandPresent += present;
        grandOff += off;
        grandIL += il;
        grandTotalDays += total;

        return `
          <tr>
            <td class="num">${i + 1}</td>
            <td class="name">
  <div class="ename">${escapeHtml(emp.name)}</div>
  <div class="role">${escapeHtml(emp.role)}</div>
</td>
            ${cells}
            <td class="cell sum il">${il || ""}</td>
            <td class="cell sum present">${present || ""}</td>
            <td class="cell sum off">${off || ""}</td>
            <td class="cell sum total">${total || ""}</td>
          </tr>`;
      })
      .join("");

    const dailyTotals = days
      .map((d) => {
        let count = 0;
        for (const emp of visibleEmployees) {
          const st = lookup[`${emp.id}|${d.iso}`];
          if (st && st !== "OFF" && st !== "IL") count++;
        }
        return `<td class="cell total">${count}</td>`;
      })
      .join("");

    const halfLabel =
      half === 1 ? "1st Period (27 – 11)" : "2nd Period (12 – 26)";

    const DEFAULT_PREPARED = {
      name: "LORRAINE JANE L. DUNKEN",
      title: "OIC-Manager",
    };

    // ...inside handlePrint:
    const prepared = isAllDepts
      ? DEFAULT_PREPARED
      : PREPARED_BY[dept] || DEFAULT_PREPARED;

    const usedCodes = new Set();
    const halfDaySetLocal = new Set(days.map((d) => d.iso));
    const visibleIdsLocal = new Set(visibleEmployees.map((e) => e.id));
    for (const s of schedules) {
      if (!halfDaySetLocal.has(s.date)) continue;
      if (!visibleIdsLocal.has(s.employee_id)) continue;
      if (s.status) usedCodes.add(s.status);
    }

    const legendCodes = isAllDepts
      ? Array.from(usedCodes)
      : (() => {
          const codes = STATUSES_BY_DEPARTMENT[dept] || [];
          return Array.from(new Set([...codes, "OFF"]));
        })();

    const legendItems = legendCodes
      .map((code) => resolveStatus(STATUS_MAP[code], dept))
      .filter(Boolean);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Schedule — ${escapeHtml(deptLabel)} — ${months[month - 1]} ${year}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      color: #000;
      background: #fff;
      font-size: 10pt;
    }

    html, body, table, td, th, .header, .infobar, .signatures {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    .page { padding: 4mm 5mm; width: 100%; }

    .header { text-align: center; margin-bottom: 2mm; }
    .header img {
      display: block;
      margin: 0 auto;
      width: 100%;
      max-width: 320mm;
      max-height: 45mm;
      object-fit: contain;
    }

    .infobar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 3mm;
      padding: 2mm 0;
      border-top: 1.5px solid #15803d;
      border-bottom: 1.5px solid #15803d;
    }
    .legend-inline {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 1.5mm 4mm;
      padding: 0 4mm;
      flex: 1;
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 1.5mm;
      font-size: 8pt;
    }
    .legend-code {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 9mm;
      height: 5mm;
      padding: 0 1.5mm;
      border-radius: 1mm;
      font-weight: 800;
      font-size: 7pt;
      color: #111;
      border: 1px solid #cbd5e1;
    }
    .legend-text { color: #111; white-space: nowrap; }

    .month-title {
      font-size: 18pt;
      font-weight: 800;
      letter-spacing: 1px;
      color: #15803d;
      text-transform: uppercase;
      line-height: 1;
    }
    .info-right {
      text-align: right;
      line-height: 1.3;
      font-size: 9.5pt;
    }
    .info-right .line1 { font-weight: 700; font-size: 10pt; }
    .info-right .line2 { font-size: 9pt; font-weight: 700; }
    .info-right strong { color: #15803d; font-weight: 800; }
    .info-right .line2 strong { color: #111; }
    .info-right .line2 .value { color: #15803d; font-weight: 800; }

    table {
      border-collapse: collapse;
      table-layout: fixed;
      width: 100%;
    }
    th, td {
      border: 1px solid #111;
      text-align: center;
      padding: 1px 0;
      vertical-align: middle;
    }
    thead { display: table-header-group; }
    thead th { background: #e8f5e9; font-weight: 700; }
    th.day { padding: 1px; }
    th.day .weekday {
      font-size: 6.5pt; color: #555;
      font-weight: 600; letter-spacing: 0.3px;
    }
    th.day .daynum { font-size: 10pt; }

    th.num-h, td.num {
      background: #f1f5f1;
      font-weight: 700;
      font-size: 9pt;
    }
    th.name-h, td.name {
      text-align: left;
      padding-left: 5px;
      background: #fafdfa;
    }
    .ename {
      font-weight: 700;
      font-size: 9pt;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .role {
      font-size: 7.5pt;
      color: #555;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    td.cell {
      height: 20px;
      min-height: 20px;
      font-weight: 700;
      font-size: 9pt;
      background: #fff;
      color: #111;
    }

    td.cell.cell-duty { background: #7dd3fc !important; color: #0c4a6e !important; }
    td.cell.cell-am   { background: #93c5fd !important; color: #1e3a8a !important; }
    td.cell.cell-pm   { background: #fcd34d !important; color: #78350f !important; }
    td.cell.cell-ms   { background: #86efac !important; color: #14532d !important; }
    td.cell.cell-ns   { background: #a5b4fc !important; color: #1e1b4b !important; }
    td.cell.cell-g    { background: #cbd5e1 !important; color: #0f172a !important; }
    td.cell.cell-n96  { background: #fdba74 !important; color: #7c2d12 !important; }
    td.cell.cell-as   { background: #fda4af !important; color: #881337 !important; }
    td.cell.cell-rs   { background: #67e8f9 !important; color: #164e63 !important; }
    td.cell.cell-ls   { background: #c4b5fd !important; color: #3b0764 !important; }
    td.cell.cell-es   { background: #f0abfc !important; color: #581c87 !important; }
    td.cell.cell-off  { background: #e2e8f0 !important; color: #334155 !important; }
    td.cell.total     { background: #e8f5e9 !important; color: #166534 !important; }
    td.cell.cell-c3   { background: #5eead4 !important; color: #134e4a !important; }
    td.cell.cell-il   { background: #a7f3d0 !important; color: #064e3b !important; }

    .legend-code.cell-duty { background: #7dd3fc !important; color: #0c4a6e !important; }
    .legend-code.cell-am   { background: #93c5fd !important; color: #1e3a8a !important; }
    .legend-code.cell-pm   { background: #fcd34d !important; color: #78350f !important; }
    .legend-code.cell-ms   { background: #86efac !important; color: #14532d !important; }
    .legend-code.cell-ns   { background: #a5b4fc !important; color: #1e1b4b !important; }
    .legend-code.cell-g    { background: #cbd5e1 !important; color: #0f172a !important; }
    .legend-code.cell-n96  { background: #fdba74 !important; color: #7c2d12 !important; }
    .legend-code.cell-as   { background: #fda4af !important; color: #881337 !important; }
    .legend-code.cell-rs   { background: #67e8f9 !important; color: #164e63 !important; }
    .legend-code.cell-ls   { background: #c4b5fd !important; color: #3b0764 !important; }
    .legend-code.cell-es   { background: #f0abfc !important; color: #581c87 !important; }
    .legend-code.cell-off  { background: #e2e8f0 !important; color: #334155 !important; }
    .legend-code.cell-c3   { background: #5eead4 !important; color: #134e4a !important; }
    .legend-code.cell-il   { background: #a7f3d0 !important; color: #064e3b !important; }

    th.sum-h {
      font-weight: 800;
      font-size: 7pt;
      padding: 2px 2px;
      white-space: normal;
      line-height: 1.05;
      word-break: break-word;
    }
    td.sum { font-weight: 800; font-size: 9pt; padding: 1px 2px; }

    th.sum-h.il-h      { background: #d1fae5 !important; color: #065f46 !important; }
    th.sum-h.present-h { background: #dcfce7 !important; color: #166534 !important; }
    th.sum-h.off-h     { background: #ffe4e6 !important; color: #be123c !important; }
    th.sum-h.total-h   { background: #e2e8f0 !important; color: #1e293b !important; }

    td.sum.il      { background: #ecfdf5 !important; color: #065f46 !important; }
    td.sum.present { background: #f0fdf4 !important; color: #166534 !important; }
    td.sum.off     { background: #fff1f2 !important; color: #be123c !important; }
    td.sum.total   { background: #f1f5f9 !important; color: #1e293b !important; }

    tfoot { display: table-row-group; }
    tfoot td {
      background: #e8f5e9 !important;
      font-weight: 700;
      padding: 3px 2px;
    }
    tfoot td.num, tfoot td.name {
      text-align: right;
      font-size: 8.5pt;
      letter-spacing: 0.4px;
    }
    tfoot td.sum { background: #d1fae5 !important; font-weight: 800; }
    tfoot td.sum.il { background: #d1fae5 !important; }
    tfoot td.sum.off { background: #ffe4e6 !important; }
    tfoot td.sum.total { background: #e2e8f0 !important; }

    tr { page-break-inside: avoid; }

    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12mm;
      margin-top: 6mm;
      page-break-inside: avoid;
    }
    .sig { text-align: left; }
    .sig .label-top {
      font-size: 9pt;
      color: #111;
      margin-bottom: 0;
      white-space: nowrap;
    }
    .sig .sign-space { height: 22px; }
    .sig .name {
      font-weight: 800;
      font-size: 9pt;
      text-transform: uppercase;
      text-decoration: underline;
      text-underline-offset: 2px;
      text-decoration-thickness: 1px;
      color: #111;
      display: block;
      line-height: 1.2;
      white-space: normal;
      word-break: keep-all;
    }
    .sig .title {
      font-size: 8pt;
      color: #111;
      margin-top: 2px;
      font-weight: 500;
      white-space: nowrap;
    }

    @page { size: 13in 8.5in; margin: 6mm 5mm; }
    @media print {
      html, body { background: #fff; }
      .page { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
  <img
    src="${bannerUrl}"
    alt="${escapeHtml(deptLabel)}"
    onerror="this.style.display='none'; console.error('Print logo failed to load:', this.src);"
  />
</div>

    <div class="infobar">
      <div class="month-title">${escapeHtml(rangeTitle)}</div>

      <div class="legend-inline">
        ${legendItems
          .map(
            (s) => `
          <span class="legend-item">
            <span class="legend-code ${
              s.code === "DUTY"
                ? "cell-duty"
                : "cell-" +
                  s.code
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, "")
                    .replace(/^(\d)/, "n$1")
            }">${escapeHtml(s.code)}</span>
<span class="legend-text">
  ${escapeHtml(s.label)}${s.time ? ` — ${escapeHtml(s.time)}` : ""}
</span>
          </span>`,
          )
          .join("")}
      </div>

      <div class="info-right">
        <div class="line1">Department: <strong>${escapeHtml(deptLabel)}</strong></div>
        <div class="line2">
          <strong>Period:</strong> <span class="value">${escapeHtml(halfLabel)}</span>
          &nbsp;•&nbsp;
          <strong>Employees:</strong> <span class="value">${visibleEmployees.length}</span>
        </div>
      </div>
    </div>

    <table>
      <colgroup>
        <col style="width:3%" />
        <col style="width:13%" />
        ${days.map(() => `<col style="width:3%" />`).join("")}
        <col style="width:6%" />
        <col style="width:6%" />
        <col style="width:6%" />
        <col style="width:6%" />
      </colgroup>
      <thead>
        <tr>
          <th class="num-h">#</th>
          <th class="name-h">NAME</th>
          ${dayHeaders}
          <th class="sum-h il-h">INCENTIVE<br>LEAVE</th>
          <th class="sum-h present-h">PHYSICAL<br>PRESENT</th>
          <th class="sum-h off-h">PHYSICAL<br>OFF</th>
          <th class="sum-h total-h">TOTAL<br>WORKING<br>DAYS</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr>
          <td class="num"></td>
          <td class="name">TOTAL MANPOWER OF THE DAY</td>
          ${dailyTotals}
          <td class="sum il">${grandIL}</td>
          <td class="sum present">${grandPresent}</td>
          <td class="sum off">${grandOff}</td>
          <td class="sum total">${grandTotalDays}</td>
        </tr>
      </tfoot>
    </table>

    <div class="signatures">
      <div class="sig">
        <div class="label-top">Prepared by:</div>
        <div class="sign-space"></div>
        ${
          prepared
            ? `<div class="name">${escapeHtml(prepared.name)}</div>
             <div class="title">${escapeHtml(prepared.title)}</div>`
            : `<div class="name">&nbsp;</div>
             <div class="title">&nbsp;</div>`
        }
      </div>
      <div class="sig">
        <div class="label-top">Checked by:</div>
        <div class="sign-space"></div>
        <div class="name">VALERIE MARIE CALLENERO</div>
        <div class="title">Human Resource Manager</div>
      </div>
      <div class="sig">
        <div class="label-top">Approved by:</div>
        <div class="sign-space"></div>
        <div class="name">JOSE F. HOFILEÑA III, MD, MBA</div>
        <div class="title">Medical Director</div>
      </div>
    </div>
  </div>
</body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "1250px";
    iframe.style.height = "820px";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    const waitForImages = () =>
      Promise.all(
        Array.from(doc.images).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((res) => {
                img.onload = res;
                img.onerror = res;
              }),
        ),
      );

    const ready = () => {
      waitForImages().then(() => {
        setTimeout(() => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          } catch (e) {
            console.error("Print failed:", e);
            alert("Print failed. Please try again.");
          }
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2000);
        }, 300);
      });
    };

    if (doc.readyState === "complete") ready();
    else {
      iframe.onload = ready;
      setTimeout(ready, 800);
    }
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-3 sm:px-6 pt-2 pb-2 bg-slate-100/80 backdrop-blur border-b border-slate-200">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-3 sm:p-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-3">
          {/* MONTH */}
          <div className="flex flex-col items-center w-full sm:flex-1 sm:min-w-[300px] sm:w-auto">
            <div className="flex items-center justify-center gap-2 sm:gap-3 h-11 sm:h-12 w-full">
              <button
                onClick={() => changeMonth(-1)}
                disabled={!canGoPrev()}
                className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 grid place-items-center rounded-xl text-white bg-gradient-to-br from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 active:scale-95 shadow-sm shadow-green-200 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-400 shrink-0"
                title={
                  canGoPrev() ? "Previous month" : "No earlier months available"
                }
              >
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <div className="text-center flex-1 sm:flex-none sm:min-w-[200px]">
                <div className="text-lg sm:text-xl md:text-2xl font-black text-green-800 tracking-tight leading-none">
                  {(() => {
                    const first = days[0];
                    const last = days[days.length - 1];
                    if (!first || !last) return `${months[month - 1]} ${year}`;
                    const firstDate = new Date(first.iso);
                    const lastDate = new Date(last.iso);
                    const fm = firstDate.getMonth();
                    const lm = lastDate.getMonth();
                    const fy = firstDate.getFullYear();
                    const ly = lastDate.getFullYear();
                    if (fm === lm && fy === ly) return `${months[fm]} ${fy}`;
                    if (fy === ly) return `${months[fm]} – ${months[lm]} ${fy}`;
                    return `${months[fm]} ${fy} – ${months[lm]} ${ly}`;
                  })()}
                </div>
              </div>

              <button
                onClick={() => changeMonth(1)}
                disabled={!canGoNext()}
                className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 grid place-items-center rounded-xl text-white bg-gradient-to-br from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 active:scale-95 shadow-sm shadow-green-200 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-400 shrink-0"
                title={canGoNext() ? "Next month" : "No later months available"}
              >
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>

          <div className="hidden xl:block h-12 w-px bg-slate-200" />

          {/* PERIOD */}
          <div className="flex flex-col items-center w-full sm:w-auto">
            <div className="text-[10px] uppercase tracking-[0.2em] text-green-700 font-bold mb-1">
              Period
            </div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 h-11 sm:h-12 items-center shadow-inner w-full sm:w-auto justify-center">
              <button
                onClick={() => setHalf(1)}
                className={`px-3 sm:px-4 h-full text-xs sm:text-sm font-bold rounded-lg transition flex-1 sm:flex-none ${
                  half === 1
                    ? "bg-white text-green-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                1st · 27–11
              </button>
              <button
                onClick={() => setHalf(2)}
                className={`px-3 sm:px-4 h-full text-xs sm:text-sm font-bold rounded-lg transition flex-1 sm:flex-none ${
                  half === 2
                    ? "bg-white text-green-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                2nd · 12–26
              </button>
            </div>
          </div>

          <div className="hidden xl:block h-12 w-px bg-slate-200" />

          {/* ACTIONS */}
          {canEdit && !isAllDepts && (
            <div className="flex flex-col items-center w-full sm:w-auto">
              <div className="text-[10px] uppercase tracking-[0.2em] text-green-700 font-bold mb-1">
                {editing ? "Editing" : "Actions"}
              </div>

              {!editing ? (
                <button
                  onClick={() => {
                    setEditSnapshot(schedules);
                    setPending({});
                    setEditing(true);
                  }}
                  disabled={visibleEmployees.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 h-11 sm:h-12 w-full sm:w-auto text-xs sm:text-sm font-black text-white bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-500 hover:to-amber-700 active:scale-95 shadow-sm shadow-amber-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none rounded-xl transition"
                  title="Enable editing"
                >
                  <svg
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                  EDIT
                </button>
              ) : (
                <div className="flex items-center gap-2 h-11 sm:h-12 w-full sm:w-auto">
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 h-full flex-1 sm:flex-none text-xs sm:text-sm font-black text-slate-700 bg-white border-2 border-slate-200 hover:bg-slate-50 active:scale-95 disabled:opacity-40 rounded-xl transition"
                    title="Discard changes"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={saveEdits}
                    disabled={saving || Object.keys(pending).length === 0}
                    className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 h-full flex-1 sm:flex-none text-xs sm:text-sm font-black text-white bg-gradient-to-br from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 active:scale-95 shadow-sm shadow-green-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none rounded-xl transition"
                    title="Save changes"
                  >
                    {saving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        SAVING…
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        SAVE
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="hidden xl:block h-12 w-px bg-slate-200" />

          {/* DEPARTMENT */}
          <div className="flex flex-col items-center w-full sm:w-auto">
            <div className="text-[10px] uppercase tracking-[0.2em] text-green-700 font-bold mb-1">
              Department
            </div>
            <div className="h-11 sm:h-12 flex items-stretch w-full sm:w-auto">
              <DepartmentDropdown value={dept} onChange={setDept} />
            </div>
          </div>

          <div className="hidden xl:block h-12 w-px bg-slate-200" />

          {/* TOOLS */}
          <div className="flex flex-col items-center w-full sm:w-auto">
            <div className="text-[10px] uppercase tracking-[0.2em] text-green-700 font-bold mb-1">
              Tools
            </div>
            <div className="flex items-center gap-2 h-11 sm:h-12 w-full sm:w-auto">
              {canEdit && editing && (
                <button
                  onClick={askClearHalf}
                  disabled={isAllDepts || visibleEmployees.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 h-full flex-1 sm:flex-none text-xs sm:text-sm font-medium rounded-xl border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  title={
                    isAllDepts
                      ? "Not available in preview mode"
                      : "Clear this period"
                  }
                >
                  <svg
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                  Clear
                </button>
              )}

              {!editing && (
                <button
                  onClick={handlePrint}
                  disabled={visibleEmployees.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 h-full flex-1 sm:flex-none text-xs sm:text-sm font-semibold rounded-xl border border-green-200 text-green-700 bg-white hover:bg-green-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  title="Print this schedule"
                >
                  <svg
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Print
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <div className="bg-amber-50 ring-1 ring-amber-200 rounded-2xl px-3 sm:px-4 py-2 flex items-center gap-3 text-xs sm:text-sm text-amber-800 max-w-6xl mx-auto w-full">
          <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
          <span className="flex-1">
            <strong>Editing mode</strong> — changes aren't saved until you click{" "}
            <strong>Save</strong>.
          </span>
          <button
            onClick={cancelEdit}
            className="text-[11px] font-semibold text-amber-900 underline hover:no-underline"
          >
            Discard
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-col sm:flex-row items-stretch gap-3">
        <div className="w-full sm:w-[180px] sm:shrink-0 flex">
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 px-4 py-3 w-full flex flex-col items-center justify-center text-center">
            <div className="text-[10px] uppercase tracking-widest text-green-700 font-bold">
              Employees
            </div>
            <div className="mt-1 text-3xl sm:text-4xl font-black text-green-800 leading-none">
              {visibleEmployees.length}
            </div>
          </div>
        </div>

        {!isAllDepts && legendShifts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 px-4 py-3 sm:px-5 sm:py-4 flex-1">
            <div className="flex items-baseline justify-between mb-2 sm:mb-3">
              <div className="text-[10px] uppercase tracking-widest text-green-700 font-bold">
                Shifts
              </div>
              <div className="text-xs sm:text-sm font-bold text-slate-700">
                {dept}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-2">
              {legendShifts.map((s) => (
                <div key={s.code} className="inline-flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center min-w-[40px] sm:min-w-[48px] h-7 sm:h-8 rounded-md px-2 text-xs font-black tracking-wide shadow-sm ${s.classes}`}
                  >
                    {s.code}
                  </span>
                  <div className="flex flex-col leading-tight">
                    <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                      {s.label}
                    </span>
                    {s.time && (
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {s.time}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-12 text-center max-w-6xl mx-auto w-full">
          <div className="inline-block w-6 h-6 border-2 border-slate-300 border-t-green-600 rounded-full animate-spin" />
          <p className="mt-3 text-sm text-slate-500">Loading schedule…</p>
        </div>
      ) : visibleEmployees.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-12 text-center max-w-6xl mx-auto w-full">
          <div className="text-4xl">👥</div>
          <p className="mt-3 text-sm font-medium text-slate-700">
            No employees in {isAllDepts ? "any department" : dept}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Add employees first, then come back to schedule them.
          </p>
        </div>
      ) : (
        <ScheduleGrid
          employees={visibleEmployees}
          days={days}
          schedules={schedules}
          onSetStatus={setStatus}
          readOnly={isAllDepts || !canEdit || !editing}
        />
      )}

      {confirmClear && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ height: "100dvh", width: "100vw" }}
        >
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setConfirmClear(false)}
          />

          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden">
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-rose-50 ring-1 ring-rose-100 grid place-items-center shrink-0">
                  <svg
                    className="w-5 h-5 sm:w-6 sm:h-6 text-rose-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-800">
                    Clear this schedule?
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    You're about to clear all shifts for{" "}
                    <strong className="text-slate-700">{dept}</strong> on{" "}
                    <strong className="text-slate-700">
                      {months[month - 1]} {year}
                    </strong>{" "}
                    (
                    {half === 1
                      ? "1st Period (27 – 11)"
                      : "2nd Period (12 – 26)"}
                    ).
                  </p>
                  <p className="text-xs text-rose-600 font-medium mt-2">
                    Changes are still pending until you click Save.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmClear(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearHalf}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 active:scale-95 shadow-sm shadow-rose-200 transition"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
                Yes, clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------ Department dropdown ------------------ */
function DepartmentDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isAll = value === "all";
  const label = isAll ? "All departments" : value;

  const options = [
    { value: "all", label: "All departments", preview: true },
    ...[...DEPARTMENTS]
      .sort((a, b) => a.localeCompare(b))
      .map((d) => ({ value: d, label: d, preview: false })),
  ];

  return (
    <div ref={wrapRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-xl border px-3 sm:px-4 h-full text-xs sm:text-sm font-bold transition w-full sm:min-w-[200px] sm:w-auto justify-between ${
          open
            ? "border-green-500 ring-2 ring-green-100 bg-white"
            : "border-slate-200 bg-slate-50/60 hover:bg-white"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <svg
            className={isAll ? "text-green-600" : "text-slate-400"}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 21h18" />
            <path d="M5 21V7l7-4 7 4v14" />
            <path d="M9 21v-6h6v6" />
          </svg>
          <span
            className={`truncate ${isAll ? "text-green-700 font-semibold" : "text-slate-800"}`}
          >
            {label}
          </span>
        </span>

        <svg
          className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-40 top-full left-0 right-0 sm:right-auto mt-2 sm:w-72 bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 p-1.5">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            Select department
          </div>

          {options.map((opt) => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition ${
                  active
                    ? "bg-green-50 text-green-800"
                    : "hover:bg-slate-50 text-slate-700"
                }`}
              >
                <span className="flex-1 truncate font-medium">{opt.label}</span>

                {opt.preview && (
                  <span className="text-[10px] uppercase tracking-wider font-bold text-green-700 bg-green-50 ring-1 ring-green-100 rounded-full px-1.5 py-0.5 shrink-0">
                    Preview
                  </span>
                )}

                {active && (
                  <svg
                    className="text-green-600 shrink-0"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
