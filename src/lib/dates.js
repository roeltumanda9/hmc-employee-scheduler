/**
 * Returns the days for a payroll period.
 * @param {number} year   Anchor year (the month the period ends in)
 * @param {number} month  1-12 (the month the period ends in)
 * @param {1|2}    period 1 = prev 27 → this 11
 *                        2 = this 12 → this 26
 */
export function getPayrollPeriodDays(year, month, period) {
  let start, end;

  if (period === 1) {
    // Start = 27th of the previous month
    let pM = month - 1;
    let pY = year;
    if (pM < 1) { pM = 12; pY -= 1; }
    start = new Date(pY, pM - 1, 27);
    // End = 11th of the current month
    end = new Date(year, month - 1, 11);
  } else {
    // 2nd period: 12 → 26 of the current month
    start = new Date(year, month - 1, 12);
    end = new Date(year, month - 1, 26);
  }

  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    const d = cur.getDate();
    days.push({
      day: d,
      iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      weekday: cur.toLocaleDateString("en-US", { weekday: "short" }),
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export const MONTHS = [
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

// "September – October 2026" or "October 2026". Reads the ISO parts directly:
// `new Date("YYYY-MM-DD")` is UTC and can land on the previous day west of UTC.
export function periodTitle(days, month, year) {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return `${MONTHS[month - 1]} ${year}`;
  const [fy, fm] = first.iso.split("-").map(Number);
  const [ly, lm] = last.iso.split("-").map(Number);
  if (fm === lm && fy === ly) return `${MONTHS[fm - 1]} ${fy}`;
  if (fy === ly) return `${MONTHS[fm - 1]} – ${MONTHS[lm - 1]} ${fy}`;
  return `${MONTHS[fm - 1]} ${fy} – ${MONTHS[lm - 1]} ${ly}`;
}
