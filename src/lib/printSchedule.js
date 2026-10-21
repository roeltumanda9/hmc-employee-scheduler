import { MONTHS, periodTitle } from "./dates";
import { findDepartment, resolveShift } from "./settings";

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

/**
 * Builds the printable schedule sheet as a standalone HTML document, writes
 * it into an off-screen iframe, waits for the banner images, and opens the
 * browser's print dialog. User data goes through escapeHtml.
 * Banners and signatures come from `settings` (see src/lib/settings.js).
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

  // The department's own signatory, else the "All departments" default.
  const prepared = deptConfig?.prepared_by_name
    ? { name: deptConfig.prepared_by_name, title: deptConfig.prepared_by_title }
    : sig.default_prepared_by_name
      ? { name: sig.default_prepared_by_name, title: sig.default_prepared_by_title }
      : null;

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
        const codes = deptConfig?.shifts || [];
        return Array.from(new Set([...codes, "OFF"]));
      })();

  const legendItems = legendCodes
    .map((code) => resolveShift(settings, code, dept))
    .filter(Boolean);

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Schedule — ${escapeHtml(deptLabel)} — ${MONTHS[month - 1]} ${year}</title>
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
      <div class="name">${escapeHtml(sig.checked_by_name) || "&nbsp;"}</div>
      <div class="title">${escapeHtml(sig.checked_by_title) || "&nbsp;"}</div>
    </div>
    <div class="sig">
      <div class="label-top">Approved by:</div>
      <div class="sign-space"></div>
      <div class="name">${escapeHtml(sig.approved_by_name) || "&nbsp;"}</div>
      <div class="title">${escapeHtml(sig.approved_by_title) || "&nbsp;"}</div>
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
