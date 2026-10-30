import { MONTHS, periodTitle } from "./dates";
import { findDepartment, leaveChecker, resolveShift } from "./settings";
import { isWorking, tallyDays } from "./statuses";

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

const shortMonth = (m) => MONTHS[m - 1].slice(0, 3);

// "Oct 27 – Nov 11, 2026" (years shown on both ends when they differ).
function dateRange(days) {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return "";
  const [fy, fm, fd] = first.iso.split("-").map(Number);
  const [ly, lm, ld] = last.iso.split("-").map(Number);
  return fy === ly
    ? `${shortMonth(fm)} ${fd} – ${shortMonth(lm)} ${ld}, ${ly}`
    : `${shortMonth(fm)} ${fd}, ${fy} – ${shortMonth(lm)} ${ld}, ${ly}`;
}

const isWeekend = (d) => d.weekday === "Sat" || d.weekday === "Sun";

/**
 * Builds the printable schedule sheet as a standalone HTML document, writes
 * it into an off-screen iframe, waits for the banner images, and opens the
 * browser's print dialog. User data goes through escapeHtml.
 * Banners and signatures come from `settings` (see src/lib/settings.js).
 *
 * The page only asks for landscape, not a paper size: columns are sized in
 * percentages, so the sheet fits whichever paper is picked in the dialog
 * (short, long, A4).
 */
export function printSchedule({
  dept,
  isAllDepts,
  days,
  month,
  year,
  half,
  schedules,
  visibleEmployees,
  settings,
  onError,
}) {
  const deptLabel = isAllDepts ? "All Departments" : dept;
  const deptConfig = isAllDepts ? null : findDepartment(settings, dept);
  const sig = settings.print;
  const banner =
    deptConfig?.banner_url || sig.default_banner_url || "/logo-banner.png";
  const bannerUrl = new URL(banner, window.location.origin).href;

  const rangeTitle = periodTitle(days, month, year);
  const rangeDates = dateRange(days);
  const halfLabel = half === 1 ? "1st period" : "2nd period";
  const halfDays = half === 1 ? "27th – 11th" : "12th – 26th";

  // One CSS class per shift type, colored from its palette entry (trusted
  // values from src/lib/statuses.js). Indexed rather than derived from the
  // code, so codes like "9-6" and "96" can't collide.
  const shiftClass = new Map(
    settings.shifts.map((s, i) => [s.code, `shift-${i}`]),
  );
  const shiftCss = settings.shifts
    .map(
      (s, i) =>
        `  td.cell.shift-${i}, .swatch.shift-${i} { background: ${s.print[0]} !important; color: ${s.print[1]} !important; }`,
    )
    .join("\n");

  const lookup = {};
  for (const s of schedules) {
    lookup[`${s.employee_id}|${s.date}`] = s.status;
  }

  // Column widths in % of the paper width: fixed name/totals, days share the rest.
  const NUM_W = 2.6;
  const NAME_W = 15;
  const SUM_W = 4.4;
  const dayW = (100 - NUM_W - NAME_W - 4 * SUM_W) / Math.max(days.length, 1);

  // Consecutive days of the same month, for the month band above the dates.
  const monthGroups = [];
  for (const d of days) {
    const m = Number(d.iso.split("-")[1]);
    const last = monthGroups[monthGroups.length - 1];
    if (last && last.month === m) last.span++;
    else monthGroups.push({ month: m, span: 1 });
  }

  const monthHeaders = monthGroups
    .map(
      (g) =>
        `<th class="month" colspan="${g.span}">${g.span >= 3 ? MONTHS[g.month - 1] : shortMonth(g.month)}</th>`,
    )
    .join("");

  const dayHeaders = days
    .map(
      (d) => `
        <th class="day${isWeekend(d) ? " we" : ""}">
          <span class="weekday">${escapeHtml(d.weekday.slice(0, 2).toUpperCase())}</span>
          <span class="daynum">${d.day}</span>
        </th>`,
    )
    .join("");

  // Only Leave gets a total in the manpower row.
  let grandLeave = 0;
  const isLeave = leaveChecker(settings);

  const rows = visibleEmployees
    .map((emp) => {
      const { present, off, leave } = tallyDays(
        days.map((d) => lookup[`${emp.id}|${d.iso}`]),
        isLeave,
      );

      const cells = days
        .map((d) => {
          const st = lookup[`${emp.id}|${d.iso}`];

          let cls = "cell";
          if (isWeekend(d)) cls += " we";
          if (st && shiftClass.has(st)) cls += ` ${shiftClass.get(st)}`;

          return `<td class="${cls}">${escapeHtml(st || "")}</td>`;
        })
        .join("");

      const total = present;
      grandLeave += leave;

      return `
        <tr>
          <td class="num">${escapeHtml(emp.biometric_no || "")}</td>
          <td class="name">
            <div class="ename">${escapeHtml(emp.name)}</div>
            ${emp.role ? `<div class="role">${escapeHtml(emp.role)}</div>` : ""}
          </td>
          ${cells}
          <td class="sum first leave">${leave || ""}</td>
          <td class="sum present">${present || ""}</td>
          <td class="sum off">${off || ""}</td>
          <td class="sum total">${total || ""}</td>
        </tr>`;
    })
    .join("");

  const dailyTotals = days
    .map((d) => {
      let count = 0;
      for (const emp of visibleEmployees) {
        const st = lookup[`${emp.id}|${d.iso}`];
        if (isWorking(st, isLeave)) count++;
      }
      return `<td class="count${isWeekend(d) ? " we" : ""}">${count}</td>`;
    })
    .join("");

  // The department's own signatory, else the "All departments" default.
  const prepared = deptConfig?.prepared_by_name
    ? { name: deptConfig.prepared_by_name, title: deptConfig.prepared_by_title }
    : sig.default_prepared_by_name
      ? { name: sig.default_prepared_by_name, title: sig.default_prepared_by_title }
      : null;

  const signers = [
    { role: "Prepared by", name: prepared?.name, title: prepared?.title },
    { role: "Checked by", name: sig.checked_by_name, title: sig.checked_by_title },
    { role: "Approved by", name: sig.approved_by_name, title: sig.approved_by_title },
  ];

  const signoff = signers
    .map(
      (s) => `
      <div class="sig">
        <div class="sig-role">${s.role}:</div>
        <div class="sig-line"></div>
        <div class="sig-name">${s.name ? escapeHtml(s.name) : "&nbsp;"}</div>
        <div class="sig-title">${
          s.title
            ? escapeHtml(s.title)
            : s.name
              ? "&nbsp;"
              : "Signature over printed name"
        }</div>
      </div>`,
    )
    .join("");

  const usedCodes = new Set();
  const halfDaySetLocal = new Set(days.map((d) => d.iso));
  const visibleIdsLocal = new Set(visibleEmployees.map((e) => e.id));
  for (const s of schedules) {
    if (!halfDaySetLocal.has(s.date)) continue;
    if (!visibleIdsLocal.has(s.employee_id)) continue;
    if (s.status) usedCodes.add(s.status);
  }

  // A department's own shifts and OFF, plus whichever leave types were used
  // this period (every department can use every leave type).
  const legendCodes = isAllDepts
    ? Array.from(usedCodes)
    : (() => {
        const codes = (deptConfig?.shifts || []).filter((c) => !isLeave(c));
        const usedLeave = Array.from(usedCodes).filter((c) => isLeave(c));
        return Array.from(new Set([...codes, "OFF", ...usedLeave]));
      })();

  const legendItems = legendCodes
    .map((code) => resolveShift(settings, code, dept))
    .filter(Boolean);

  const legend = legendItems
    .map(
      (s) => `
        <span class="chip">
          <span class="swatch ${shiftClass.get(s.code) || ""}">${escapeHtml(s.code)}</span>
          <span class="chip-text">
            <span class="chip-label">${escapeHtml(s.label)}</span>${
              s.time ? `<span class="chip-time">${escapeHtml(s.time)}</span>` : ""
            }
          </span>
        </span>`,
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Work Schedule — ${escapeHtml(deptLabel)} — ${escapeHtml(rangeDates || `${MONTHS[month - 1]} ${year}`)}</title>
<style>
  /* Landscape on whatever paper is chosen. */
  @page {
    size: landscape;
    margin: 8mm 7mm;
  }

  :root {
    --ink: #111827;
    --muted: #4b5563;
    --faint: #6b7280;
    --line: #c3c8cf;
    --grid: #8b94a1;
    --frame: #1f2937;
    --brand: #166534;
    --brand-soft: #ecfdf3;
    --weekend: #f4f5f7;
  }

  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: var(--ink);
    font-family: "Segoe UI", "Helvetica Neue", Arial, "Liberation Sans", sans-serif;
    font-size: 8pt;
    line-height: 1.25;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* ---------- Banner + title block ---------- */
  .banner { text-align: center; margin-bottom: 2.5mm; }
  .banner img {
    display: block;
    margin: 0 auto;
    max-width: 100%;
    max-height: 22mm;
    object-fit: contain;
  }

  .doc-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8mm;
    padding-bottom: 2mm;
    border-bottom: 1.5pt solid var(--brand);
  }
  .eyebrow {
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--brand);
  }
  .doc-title {
    margin: 0.6mm 0 0;
    font-size: 17pt;
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1.05;
  }
  .doc-sub {
    margin-top: 0.8mm;
    font-size: 9pt;
    color: var(--muted);
  }
  .doc-sub strong { color: var(--ink); font-weight: 700; }

  .meta {
    display: flex;
    margin: 0;
    border: 1pt solid var(--frame);
    border-radius: 1.5mm;
  }
  .meta div { padding: 1.4mm 3.5mm; }
  .meta div + div { border-left: 0.75pt solid var(--grid); }
  .meta dt {
    font-size: 6pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .meta dd {
    margin: 0.3mm 0 0;
    font-size: 10pt;
    font-weight: 800;
    white-space: nowrap;
  }

  /* ---------- Legend ---------- */
  .legend {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1.5mm 4.5mm;
    padding: 2mm 0;
    margin-bottom: 2mm;
    border-bottom: 0.75pt solid var(--line);
  }
  .legend-title {
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--faint);
    margin-right: 1mm;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 1.5mm;
    white-space: nowrap;
  }
  .swatch {
    display: inline-block;
    min-width: 8mm;
    padding: 0.5mm 1.2mm;
    border-radius: 1mm;
    text-align: center;
    font-size: 7pt;
    font-weight: 800;
    background: #f3f4f6;
    color: var(--ink);
  }
  .chip-label { font-size: 7.5pt; font-weight: 600; }
  .chip-time { font-size: 7pt; color: var(--faint); margin-left: 1.2mm; }

  /* ---------- Schedule table ---------- */
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    border: 1.5pt solid var(--frame);
  }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }

  th, td {
    border: 0.75pt solid var(--grid);
    padding: 0;
    text-align: center;
    vertical-align: middle;
  }

  thead th { background: #fff; font-weight: 700; }
  th.corner {
    font-size: 6.5pt;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    vertical-align: bottom;
    padding-bottom: 1mm;
  }
  th.corner.name-h { text-align: left; padding-left: 1.6mm; }
  th.month {
    font-size: 6.5pt;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-align: left;
    padding: 0.7mm 1.2mm;
    color: var(--brand);
  }
  th.day { padding: 0.6mm 0 0.8mm; }
  th.day .weekday {
    display: block;
    font-size: 5.5pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--faint);
  }
  th.day .daynum {
    display: block;
    font-size: 9.5pt;
    font-weight: 800;
    line-height: 1.1;
  }
  th.day.we { background: var(--weekend); }
  th.day.we .weekday { color: #b91c1c; }

  td.num {
    font-size: 6.5pt;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  td.name {
    text-align: left;
    padding: 0.6mm 1.6mm;
    overflow: hidden;
  }
  .ename, .role {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ename { font-size: 7.8pt; font-weight: 700; line-height: 1.15; }
  .role { font-size: 6pt; color: var(--faint); line-height: 1.15; }

  td.cell {
    height: 6mm;
    font-size: 7.5pt;
    font-weight: 800;
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    background: #fff;
  }
  td.cell.we { background: var(--weekend); }
${shiftCss}

  /* Totals: same colors as the scheduler grid (ScheduleGrid SUMMARY):
     tinted headers and footer, colored numbers on white. */
  th.sum-h {
    font-size: 5.5pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    line-height: 1.1;
    text-transform: uppercase;
    padding: 0.8mm 0.5mm;
  }
  th.sum-h.leave   { background: #ecfdf5; color: #065f46; }
  th.sum-h.present { background: #f0fdf4; color: #166534; }
  th.sum-h.off     { background: #fff1f2; color: #be123c; }
  th.sum-h.total   { background: #f1f5f9; color: #334155; }
  td.sum {
    font-size: 7.5pt;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  /* Each totals column keeps its heading's fill down to the footer. */
  td.sum.leave   { color: #065f46; background: #ecfdf5; }
  td.sum.present { color: #15803d; background: #f0fdf4; }
  td.sum.off     { color: #e11d48; background: #fff1f2; }
  td.sum.total   { color: #0f172a; font-weight: 800; background: #f1f5f9; }

  /* Daily manpower: the summary row. */
  tr.manpower td {
    background: var(--brand-soft);
    border-top: 1.25pt solid var(--brand);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    padding: 1mm 0;
  }
  tr.manpower td.label {
    text-align: left;
    padding-left: 1.6mm;
    font-size: 6.5pt;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--brand);
  }
  tr.manpower td.count { font-size: 8pt; color: var(--brand); }
  tr.manpower td.sum { font-size: 8pt; }
  tr.manpower td.sum.leave   { background: #ecfdf5; color: #065f46; }
  tr.manpower td.sum.present { background: #f0fdf4; }
  tr.manpower td.sum.off     { background: #fff1f2; }
  tr.manpower td.sum.total   { background: #f1f5f9; }

  /* ---------- Sign-off ---------- */
  .signoff {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14mm;
    margin-top: 7mm;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .sig-role {
    font-size: 9pt;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink);
  }
  .sig-line { height: 11mm; border-bottom: 0.75pt solid var(--ink); }
  .sig-name {
    margin-top: 1mm;
    font-size: 8.5pt;
    font-weight: 800;
    text-transform: uppercase;
    text-align: center;
  }
  .sig-title {
    font-size: 7pt;
    color: var(--muted);
    text-align: center;
  }
</style>
</head>
<body>
  <div class="banner">
    <img
      src="${bannerUrl}"
      alt="${escapeHtml(deptLabel)}"
      onerror="this.parentNode.style.display='none'; console.error('Print logo failed to load:', this.src);"
    />
  </div>

  <header class="doc-head">
    <div>
      <div class="eyebrow">Employee Work Schedule</div>
      <h1 class="doc-title">${escapeHtml(rangeTitle)}</h1>
      <div class="doc-sub"><strong>${escapeHtml(rangeDates)}</strong> · ${halfLabel} (${halfDays})</div>
    </div>
    <dl class="meta">
      <div><dt>Department</dt><dd>${escapeHtml(deptLabel)}</dd></div>
      <div><dt>Period</dt><dd>${half === 1 ? "1st" : "2nd"}</dd></div>
      <div><dt>Employees</dt><dd>${visibleEmployees.length}</dd></div>
    </dl>
  </header>

  ${legendItems.length ? `<div class="legend"><span class="legend-title">Legend</span>${legend}</div>` : ""}

  <table>
    <colgroup>
      <col style="width:${NUM_W}%" />
      <col style="width:${NAME_W}%" />
      ${days.map(() => `<col style="width:${dayW.toFixed(3)}%" />`).join("")}
      <col style="width:${SUM_W}%" />
      <col style="width:${SUM_W}%" />
      <col style="width:${SUM_W}%" />
      <col style="width:${SUM_W}%" />
    </colgroup>
    <thead>
      <tr>
        <th class="corner" rowspan="2" title="Biometric number">No.</th>
        <th class="corner name-h" rowspan="2">Employee</th>
        ${monthHeaders}
        <th class="sum-h first leave" rowspan="2">Leave</th>
        <th class="sum-h present" rowspan="2">Physical<br>Present</th>
        <th class="sum-h off" rowspan="2">Physical<br>Off</th>
        <th class="sum-h total" rowspan="2">Total<br>Working<br>Days</th>
      </tr>
      <tr>${dayHeaders}</tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr class="manpower">
        <td class="label" colspan="2">Total manpower per day</td>
        ${dailyTotals}
        <td class="sum first leave">${grandLeave}</td>
        <td class="sum present"></td>
        <td class="sum off"></td>
        <td class="sum total"></td>
      </tr>
    </tfoot>
  </table>

  <section class="signoff">${signoff}</section>
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

  // Runs once: both the load event and the fallback timer can call it.
  let started = false;
  const ready = () => {
    if (started) return;
    started = true;
    waitForImages().then(() => {
      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (e) {
          console.error("Print failed:", e);
          onError("Couldn't open the print dialog. Please try again.");
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
