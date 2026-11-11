// Deadline rules for Stage 3 cases. Every result is a plain date (YYYY-MM-DD) plus a short
// explanation of how it was worked out, so you can check it yourself.
//
// COMPLAINTS (your published complaints procedure):
//   - acknowledge in writing within 5 working days of receipt (the day it arrives doesn't count);
//   - full written response within 4 weeks of the acknowledgement.
//
// PRIVACY / SUBJECT ACCESS REQUESTS (ICO right of access guidance, UK GDPR Art. 12(3)):
//   - "without undue delay and at the latest within one month of receipt";
//   - the clock does not start until any ID you reasonably asked for has been received;
//   - it pauses on the day you ask for clarification of what's wanted and restarts the day after
//     the answer arrives; the due date moves on by the number of days paused (counted in days);
//   - one calendar month = the corresponding date in the next month, or the last day of that month
//     if there's no corresponding date;
//   - if the due date falls on a weekend or bank holiday, it moves to the next working day;
//   - for complex or numerous requests it can be extended by up to two further months, but you
//     must tell the person, with reasons, within the first month;
//   - requests can arrive by ANY channel (verbal, letter, social media, any mailbox) and needn't use
//     the words "subject access": the receipt date is when it reached you, however it came.
//
// These are planning aids. Your professional and legal judgement decides each case.
import { addCalendarMonths, addDays, addWorkingDays, assertDate, daysBetween, onOrNextWorkingDay, subtractWorkingDays, holidaysCover } from "./calendar.mjs";

export const COMPLAINT_ACK_WORKING_DAYS = 5;
export const COMPLAINT_RESPONSE_DAYS = 28; // 4 weeks
export const REMIND_WORKING_DAYS_BEFORE = 2;

export function complaintDeadlines({ received, acknowledged = null }) {
  assertDate(received);
  const ackDue = addWorkingDays(received, COMPLAINT_ACK_WORKING_DAYS);
  const from = acknowledged ? assertDate(acknowledged) : ackDue;
  const responseDue = addDays(from, COMPLAINT_RESPONSE_DAYS);
  const notes = [
    `Acknowledge by ${ackDue}: 5 working days after ${received} (weekends and bank holidays skipped).`,
    acknowledged
      ? `Full response by ${responseDue}: 4 weeks after the acknowledgement on ${acknowledged}.`
      : `Full response by ${responseDue} at the latest (4 weeks after the latest acknowledgement date); this moves earlier if you acknowledge sooner.`,
  ];
  if (!onWorkday(responseDue)) notes.push(`${responseDue} isn't a working day: aim for ${subtractWorkingDays(addDays(responseDue, 1), 1)}, the working day before.`);
  return {
    type: "complaint",
    ackDue,
    ackRemind: subtractWorkingDays(ackDue, REMIND_WORKING_DAYS_BEFORE),
    responseDue,
    responseRemind: subtractWorkingDays(responseDue, REMIND_WORKING_DAYS_BEFORE + 3),
    calendarCovered: holidaysCover(responseDue),
    notes,
  };
}
const onWorkday = (d) => onOrNextWorkingDay(d) === d;

/**
 * @param {object} p
 * @param {string} p.received            date the request reached you (any channel)
 * @param {boolean} [p.idNeeded]         you have reasonable doubts about identity
 * @param {string|null} [p.idRequested]  date you asked for ID
 * @param {string|null} [p.idReceived]   date ID arrived
 * @param {{requested:string, received?:string|null}[]} [p.clarifications]
 * @param {boolean} [p.extended]         you have decided to extend (complex or numerous)
 * @param {string|null} [p.extensionNotified] date you told the person about the extension
 */
export function privacyRequestDeadlines({ received, idNeeded = false, idRequested = null, idReceived = null, clarifications = [], extended = false, extensionNotified = null }) {
  assertDate(received);
  const notes = [];
  const warnings = [];

  // 1. When does the clock start?
  if (idNeeded && !idReceived) {
    if (!idRequested) warnings.push("ID is needed but hasn't been requested: ask promptly. The one-month clock doesn't start until it arrives.");
    return { type: "privacy", status: "waiting-for-id", clockStarts: null, due: null, notes: ["Waiting for ID: the clock hasn't started."], warnings };
  }
  const start = idNeeded ? assertDate(idReceived) : received;
  if (idNeeded) notes.push(`Clock starts ${start}, when the ID you asked for arrived.`);
  else notes.push(`Clock starts ${start}, the day the request reached you.`);
  if (idNeeded && idRequested && daysBetween(received, idRequested) > 5) warnings.push("ID was requested more than 5 days after the request arrived: the ICO expects you to ask promptly.");

  // 2. Pauses for clarification (counted in whole days).
  let paused = 0;
  let open = null;
  for (const c of clarifications) {
    assertDate(c.requested);
    if (c.requested < start) warnings.push(`Clarification requested ${c.requested} before the clock started; it doesn't change the deadline.`);
    if (!c.received) { open = c; continue; }
    assertDate(c.received);
    if (c.received < c.requested) throw new Error("clarification-received-before-requested");
    if (c.requested >= start) paused += daysBetween(c.requested, c.received) + 1; // paused on the day asked, restarts the day after the answer
  }
  if (open) {
    return { type: "privacy", status: "paused", clockStarts: start, due: null, pausedDays: paused, notes: [...notes, `Paused since ${open.requested} while you wait for clarification.`], warnings };
  }
  if (paused) notes.push(`Paused for ${paused} day(s) while waiting for clarification, so the deadline moves on by ${paused} day(s).`);

  // 3. One calendar month (or three, if extended), plus pauses, rolled to a working day.
  const oneMonth = addDays(addCalendarMonths(start, 1), paused);
  const normalDue = onOrNextWorkingDay(oneMonth);
  if (normalDue !== oneMonth) notes.push(`${oneMonth} isn't a working day, so the deadline is the next working day, ${normalDue}.`);
  let due = normalDue;
  if (extended) {
    const threeMonths = addDays(addCalendarMonths(start, 3), paused);
    due = onOrNextWorkingDay(threeMonths);
    notes.push(`Extended by two months (complex or numerous request): due ${due}.`);
    if (!extensionNotified) warnings.push(`You must tell the person about the extension, with reasons, by ${normalDue}.`);
    else if (assertDate(extensionNotified) > normalDue) warnings.push(`The extension was notified on ${extensionNotified}, after the first month ended (${normalDue}): the extension may not be valid.`);
  }
  return {
    type: "privacy",
    status: "running",
    clockStarts: start,
    pausedDays: paused,
    due,
    extensionNoticeBy: normalDue,
    remind: subtractWorkingDays(due, 5),
    calendarCovered: holidaysCover(due),
    notes,
    warnings,
  };
}

/** Media enquiries have no legal deadline: your usual 2-working-day reply target. */
export function mediaDeadlines({ received }) {
  const replyBy = addWorkingDays(assertDate(received), 2);
  return { type: "media", replyBy, notes: [`Reply target ${replyBy}: your usual 2 working days (not a legal deadline).`] };
}
