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

function toIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The payroll period before (year, month, half), as { year, month, half }. */
export function previousPeriod(year, month, half) {
  if (half === 2) return { year, month, half: 1 };
  return month === 1
    ? { year: year - 1, month: 12, half: 2 }
    : { year, month: month - 1, half: 2 };
}

/**
 * For "copy previous period": the same weekday two weeks earlier; three weeks
 * when two weeks back is still inside the current period (the last day or two
 * of a 15–16 day period); one week when the previous period is short (the
 * 13-day period after February). Returns the ISO date if it falls in
 * `prevDays`, else null. Matching weekdays keeps weekly rest-day patterns.
 */
export function sameWeekdayIn(iso, prevDays) {
  const inPrev = new Set(prevDays.map((d) => d.iso));
  const [y, m, d] = iso.split("-").map(Number);
  for (const back of [14, 21, 7]) {
    const source = toIso(new Date(y, m - 1, d - back));
    if (inPrev.has(source)) return source;
  }
  return null;
}
