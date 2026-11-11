// UK (England and Wales) calendar arithmetic for Stage 4 (bookings and reminders).
// Copied from Stage 3 (not imported), so the stages stay independent.
// All dates are plain "YYYY-MM-DD" strings in UK local time; no clocks or time zones inside.

// England and Wales bank holidays (GOV.UK). Must be extended every year: a test fails from
// 1 December 2027 as a reminder, and the weekly health report warns too.
export const BANK_HOLIDAYS = new Set([
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
]);
export const HOLIDAYS_VALID_UNTIL = "2027-12-31";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function assertDate(d) {
  if (typeof d !== "string" || !DATE.test(d) || toUtc(d).toISOString().slice(0, 10) !== d) throw new Error(`bad-date:${d}`);
  return d;
}
function toUtc(d) { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); }
function fromUtc(dt) { return dt.toISOString().slice(0, 10); }

/** UK calendar date of a moment (e.g. when an email arrived), as YYYY-MM-DD. */
export function ukDateOf(isoOrMs) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(isoOrMs));
}

export function addDays(d, n) { const t = toUtc(assertDate(d)); t.setUTCDate(t.getUTCDate() + n); return fromUtc(t); }
export function daysBetween(a, b) { return Math.round((toUtc(assertDate(b)) - toUtc(assertDate(a))) / 864e5); }
export function isWeekend(d) { const w = toUtc(assertDate(d)).getUTCDay(); return w === 0 || w === 6; }
export function isWorkingDay(d) { return !isWeekend(d) && !BANK_HOLIDAYS.has(d); }
export function holidaysCover(d) { return assertDate(d) <= HOLIDAYS_VALID_UNTIL; }

/** The same day if it's a working day, otherwise the next working day. */
export function onOrNextWorkingDay(d) {
  let x = assertDate(d);
  while (!isWorkingDay(x)) x = addDays(x, 1);
  return x;
}

/** n working days after d (d itself doesn't count). */
export function addWorkingDays(d, n) {
  let x = assertDate(d), left = n;
  while (left > 0) { x = addDays(x, 1); if (isWorkingDay(x)) left--; }
  return x;
}

/** n working days before d. */
export function subtractWorkingDays(d, n) {
  let x = assertDate(d), left = n;
  while (left > 0) { x = addDays(x, -1); if (isWorkingDay(x)) left--; }
  return x;
}

/**
 * Calendar months, ICO method: the corresponding calendar date in the later month; if that
 * month has no such date (e.g. 31 Jan + 1 month), the last day of that month.
 */
export function addCalendarMonths(d, n) {
  const [y, m, dd] = assertDate(d).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(dd, lastDay));
  return fromUtc(target);
}
