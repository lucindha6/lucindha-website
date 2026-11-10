// Working days for the "no reply after 2 working days" reminder.
// England and Wales bank holidays from GOV.UK. This list must be updated each year
// (a test fails from 1 December 2027 as a reminder).
export const BANK_HOLIDAYS = new Set([
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
]);
export const HOLIDAYS_VALID_UNTIL = "2027-12-31";

const ukDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d); // YYYY-MM-DD
const ukWeekday = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(d);

export function isWorkingDay(d) {
  const wd = ukWeekday(d);
  return wd !== "Sat" && wd !== "Sun" && !BANK_HOLIDAYS.has(ukDate(d));
}

/** Number of whole working days that have ended since `fromIso` (the arrival day itself doesn't count). */
export function workingDaysSince(fromIso, now) {
  const start = new Date(fromIso);
  let count = 0;
  const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1, 12));
  const end = new Date(now);
  while (ukDate(day) < ukDate(end)) {
    if (isWorkingDay(day)) count++;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return count;
}
