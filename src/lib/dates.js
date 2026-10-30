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

/** (year, month) moved by `delta` months, as { year, month } (month 1–12). */
export function addMonths(year, month, delta) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
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

// How far the Scheduler can move from today's month: back for looking up and
// reprinting old schedules, ahead for planning.
export const MONTHS_BACK = 12;
export const MONTHS_AHEAD = 2;

// The first month the Scheduler shows: schedules start with its 1st period
// (27 Oct – 11 Nov 2026). Nothing before it can be opened.
export const FIRST_MONTH = { year: 2026, month: 11 };

/**
 * The payroll period a date falls in, as { year, month, half }:
 * 27th–31st → 1st period of the next month, 12th–26th → 2nd period,
 * 1st–11th → 1st period of the same month.
 */
export function periodContaining(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (d >= 27) return { ...addMonths(y, m, 1), half: 1 };
  return { year: y, month: m, half: d >= 12 ? 2 : 1 };
}

/** Periods as one comparable number (each month has two). */
export function periodIndex({ year, month, half }) {
  return (year * 12 + (month - 1)) * 2 + (half - 1);
}

/**
 * The oldest period that can still be edited on `today`: the previous one
 * (late corrections); everything before it is locked, since its payroll is
 * done. supabase/proposed_schedule_lock.sql enforces the same date.
 */
export function oldestEditablePeriod(today = new Date()) {
  const cur = periodContaining(today);
  return previousPeriod(cur.year, cur.month, cur.half);
}

export function isPeriodLocked(period, today = new Date()) {
  return periodIndex(period) < periodIndex(oldestEditablePeriod(today));
}
