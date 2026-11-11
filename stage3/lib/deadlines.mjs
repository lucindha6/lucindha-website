// Deadline rules for Stage 3 cases. Every result is a plain date (YYYY-MM-DD) plus a short
// explanation of how it was worked out, so you can check it yourself.
//
// COMPLAINTS (your published complaints procedure):
//   - acknowledge in writing within 5 working days of receipt (the day it arrives doesn't count);
//   - full written response within 4 weeks of the acknowledgement.
//
// PRIVACY REQUESTS (UK GDPR Art. 12(3) and Art. 12A, as amended by the Data (Use and Access) Act
// 2025, in force 5 Feb 2026; see lib/rights.mjs for each right):
//   - "without undue delay and at the latest within one month" of the RELEVANT TIME: the latest of
//     receipt of the request, receipt of ID you asked for, and payment of any fee;
//   - ID only moves the start where you have REASONABLE DOUBTS about identity (Art. 12(6)), or need
//     evidence that someone acting for the person is authorised: the reason must be recorded,
//     otherwise the deadline is NOT moved;
//   - a fee only moves the start for a MANIFESTLY UNFOUNDED OR EXCESSIVE request (Art. 12(5));
//   - the clarification pause applies ONLY to subject access (Art. 15) and only where you
//     reasonably require the information to find what's wanted (Art. 12A(5)-(6)): the period from
//     the day you ask to the day you receive the answer doesn't count;
//   - one calendar month = the corresponding date in the next month, or the last day of that month
//     if there's none; a weekend or bank holiday moves it to the next working day (ICO practice);
//   - extension by two further months (complex or numerous requests) only if you tell the person,
//     with reasons, within the first month;
//   - DATA PROTECTION COMPLAINTS (DPA 2018 s.164A, in force 19 June 2026): acknowledge within 30
//     days of receipt; outcome without undue delay, keeping the person informed.
//   - requests can arrive by ANY channel and needn't name the right: the receipt date is when it
//     reached you, however it came.
// Every result records the ORIGINAL deadline, each ADJUSTMENT with its legal basis, and the
// RESULTING deadline, so you can check the working.
//
// These are planning aids. Your professional and legal judgement decides each case.
import { addCalendarMonths, addDays, addWorkingDays, assertDate, daysBetween, onOrNextWorkingDay, subtractWorkingDays, holidaysCover } from "./calendar.mjs";

export const COMPLAINT_ACK_WORKING_DAYS = 5;
export const COMPLAINT_RESPONSE_DAYS = 28; // 4 weeks
export const REMIND_WORKING_DAYS_BEFORE = 2;

export function complaintDeadlines({ received, acknowledged = null }) {
  assertDate(received);
  const ackDue = addWorkingDays(received, COMPLAINT_ACK_WORKING_DAYS);
  if (acknowledged && assertDate(acknowledged) < received) throw new Error("acknowledged-before-received");
  const from = acknowledged ? acknowledged : ackDue;
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
    warnings: holidaysCover(responseDue) ? [] : [`The bank holiday list doesn't cover ${responseDue} yet: check the dates by hand and update the list.`],
  };
}
const onWorkday = (d) => onOrNextWorkingDay(d) === d;

export const ID_REASONS = {
  "reasonable-doubts": "reasonable doubts about the requester's identity (Art. 12(6))",
  "third-party-authority": "evidence that the person acting for them is authorised",
};
export const CLARIFICATION_REASONS = {
  "large-volume": "you hold a large amount of information about them and need to know what they want (Art. 12A(6))",
  "unclear-scope": "you reasonably need more information to identify the information or processing they mean (Art. 12A(5))",
};
export const FEE_REASONS = {
  "manifestly-unfounded": "manifestly unfounded request (Art. 12(5))",
  "manifestly-excessive": "manifestly excessive request, e.g. repetitive (Art. 12(5))",
};

/**
 * @param {object} p
 * @param {string} p.received            date the request reached you (any channel)
 * @param {string[]} [p.rights]          keys from lib/rights.mjs (default "unclear")
 * @param {boolean} [p.idNeeded]         you asked for ID
 * @param {string|null} [p.idReason]     why (ID_REASONS); without one the deadline isn't moved
 * @param {string|null} [p.idRequested]  date you asked for ID
 * @param {string|null} [p.idReceived]   date ID arrived
 * @param {{requested:string, received?:string|null, reason?:string}[]} [p.clarifications]
 * @param {{requested?:string|null, paid?:string|null, reason?:string|null}|null} [p.fee]
 * @param {boolean} [p.extended]         you have decided to extend (complex or numerous)
 * @param {string|null} [p.extensionNotified] date you told the person about the extension
 */
export function privacyRequestDeadlines({ answered = [], received, rights = ["unclear"], idNeeded = false, idReason = null, idRequested = null, idReceived = null, clarifications = [], fee = null, extended = false, extensionNotified = null }) {
  assertDate(received);
  const notes = [];
  const warnings = [];
  const adjustments = [];
  const original = onOrNextWorkingDay(addCalendarMonths(received, 1));
  const rightsList = rights.length ? rights : ["unclear"];
  const onlyComplaint = rightsList.every((r) => r === "dp-complaint");
  const out = (o) => ({ type: "privacy", rights: rightsList, original, adjustments, notes, warnings, ...complaintPart(received, rightsList), ...o, resulting: o.due ?? null });

  // 1. When does the clock start? The latest of receipt, ID received (if validly requested), fee paid.
  let start = received;
  const idValid = idNeeded && Object.hasOwn(ID_REASONS, idReason || "");
  if (idNeeded && !idValid) warnings.push("ID was asked for without a recorded reason (reasonable doubts about identity, or someone acting for them). It does NOT move the deadline. Only ask for ID where it's justified, and proportionately.");
  if (idValid) {
    if (!idRequested) warnings.push("ID is needed but the request date isn't recorded: ask promptly.");
    if (idRequested && daysBetween(received, idRequested) > 5) warnings.push("ID was requested more than 5 days after the request arrived: the ICO expects you to ask promptly.");
    if (!idReceived) return out({ status: "waiting-for-id", clockStarts: null, due: null, notes: [...notes, "Waiting for ID: the clock hasn't started."] });
    assertDate(idReceived);
    if (idReceived > start) {
      adjustments.push({ change: `start moved from ${start} to ${idReceived} (ID received)`, basis: "UK GDPR Art. 12(6) and 12A(2)(b)", reason: ID_REASONS[idReason] });
      start = idReceived;
    }
  }
  if (fee && (fee.requested || fee.paid)) {
    if (!Object.hasOwn(FEE_REASONS, fee.reason || "")) warnings.push("A fee can only be charged for a manifestly unfounded or excessive request, with the reason recorded. It does NOT move the deadline.");
    else if (!fee.paid) return out({ status: "waiting-for-fee", clockStarts: null, due: null, notes: [...notes, "Waiting for the fee: the clock hasn't started. Explain your reasons and their right to complain to the ICO."] });
    else if (assertDate(fee.paid) > start) {
      adjustments.push({ change: `start moved from ${start} to ${fee.paid} (fee paid)`, basis: "UK GDPR Art. 12(5) and 12A(2)(c)", reason: FEE_REASONS[fee.reason] });
      start = fee.paid;
    }
  }
  notes.push(start === received ? `Clock starts ${start}, the day the request reached you.` : `Clock starts ${start}.`);

  // 2. Clarification pauses: subject access only, with a recorded reason. Overlaps merged; a pause
  //    asked for after the deadline had passed doesn't move it.
  const accessOnlyPause = rightsList.includes("access");
  for (const c of clarifications) {
    assertDate(c.requested);
    if (c.received) {
      assertDate(c.received);
      if (c.received < c.requested) throw new Error("clarification-received-before-requested");
    }
    if (c.requested < start) warnings.push(`Clarification requested ${c.requested} before the clock started; it doesn't change the deadline.`);
  }
  const usable = clarifications.filter((c) => c.requested >= start && accessOnlyPause && Object.hasOwn(CLARIFICATION_REASONS, c.reason || ""));
  if (clarifications.length && !accessOnlyPause) warnings.push("Clarification doesn't pause the clock for this kind of request: the pause applies to subject access only (Art. 12A(5)). The deadline is unchanged.");
  else if (clarifications.some((c) => !Object.hasOwn(CLARIFICATION_REASONS, c.reason || ""))) warnings.push("A clarification without a recorded reason doesn't pause the clock (it must be reasonably required to find what's wanted).");
  const pending = usable.find((c) => !c.received);
  const spans = usable.filter((c) => c.received).map((c) => [c.requested, c.received, c.reason]).sort((x, y) => (x[0] < y[0] ? -1 : 1));
  let paused = 0;
  let mergedEnd = null;
  let dueSoFar = addCalendarMonths(start, 1);
  for (const [from, to, reason] of spans) {
    if (from > onOrNextWorkingDay(dueSoFar)) { warnings.push(`Clarification asked on ${from}, after the deadline (${onOrNextWorkingDay(dueSoFar)}) had passed: it doesn't extend it.`); continue; }
    const effFrom = mergedEnd && from <= mergedEnd ? addDays(mergedEnd, 1) : from;
    if (effFrom <= to) {
      const days = daysBetween(effFrom, to) + 1; // from the day asked to the day received
      paused += days;
      adjustments.push({ change: `subject access part paused ${days} day(s), ${effFrom} to ${to} (clarification)`, basis: "UK GDPR Art. 12A(5)", reason: CLARIFICATION_REASONS[reason] });
      mergedEnd = mergedEnd && mergedEnd > to ? mergedEnd : to;
      dueSoFar = addDays(addCalendarMonths(start, 1), paused);
    }
  }
  // Rights other than access are NEVER paused by clarification: they keep their own deadline.
  const otherRights = rightsList.filter((r) => r !== "access" && r !== "dp-complaint");
  const pendingLive = pending && pending.requested <= onOrNextWorkingDay(dueSoFar);
  if (pending && !pendingLive) warnings.push(`Clarification asked on ${pending.requested}, after the deadline (${onOrNextWorkingDay(dueSoFar)}) had passed: the request is overdue.`);
  if (pendingLive && !otherRights.length) return out({ status: "paused", clockStarts: start, due: null, pausedDays: paused, notes: [...notes, `Paused since ${pending.requested} while you wait for clarification.`] });
  if (paused && otherRights.length) notes.push(`The subject access part was paused for ${paused} day(s); the other part(s) (${otherRights.join(", ")}) were NOT paused and keep their own deadline.`);
  else if (paused) notes.push(`Paused for ${paused} day(s) while waiting for clarification, so the deadline moves on by ${paused} day(s).`);

  if (onlyComplaint) return out({ status: "complaint-only", clockStarts: start, due: null, pausedDays: 0, notes: [...notes, "Data protection complaint: no one-month deadline, but acknowledge within 30 days and give the outcome without undue delay."] });

  // 3. One calendar month (or the extended period, if VALIDLY extended), rolled to a working day.
  //    Legal date (ICO "Time limits for responding" page, checked 11 Nov 2026): the month ends on the
  //    corresponding date, or the last day of the month; a weekend or bank holiday moves it to the
  //    next working day; an extended period is three calendar months from the start.
  //    INTERNAL TARGET: never later than the calendar date (the working day on or before it), and where
  //    another reading of the extension gives an earlier date, that earlier date, flagged for review.
  const part = (p) => {
    const oneMonth = addDays(addCalendarMonths(start, 1), p);
    const normal = onOrNextWorkingDay(oneMonth);
    const a = addDays(addCalendarMonths(start, 3), p);
    const b = addCalendarMonths(oneMonth, 2);
    return { oneMonth, normal, threeCal: a, three: onOrNextWorkingDay(a), altThree: b };
  };
  const access = rightsList.includes("access") ? part(paused) : null;
  const other = otherRights.length ? part(0) : null;
  const parts = [access, other].filter(Boolean);
  const normalDue = parts.map((x) => x.normal).sort()[0]; // extension notice must reach the person by the EARLIEST first-month end
  for (const x of parts) if (x.normal !== x.oneMonth) notes.push(`${x.oneMonth} isn't a working day, so the deadline is the next working day, ${x.normal}.`);
  let validExt = false;
  let extensionNoticeRemind = null;
  if (extended) {
    if (extensionNotified && assertDate(extensionNotified) <= normalDue) {
      validExt = true;
      adjustments.push({ change: `extended by two further months`, basis: "UK GDPR Art. 12A(3)-(4)", reason: `complex or numerous requests; notified with reasons on ${extensionNotified}` });
    } else if (extensionNotified) {
      warnings.push(`The extension was notified on ${extensionNotified}, after the first month ended (${normalDue}), so it isn't valid: the deadline stays ${normalDue}.`);
    } else {
      warnings.push(`Extension not yet valid: you must tell the person, with reasons, by ${normalDue}. Until then the normal deadline stands.`);
      extensionNoticeRemind = subtractWorkingDays(normalDue, 5);
    }
  }
  const done = new Set(answered);
  const perRight = {};
  const internal = {};
  const uncertain = [];
  const target = (x) => {
    if (!validExt) return onOrBefore(x.oneMonth);
    if (x.altThree < x.threeCal) {
      uncertain.push(`Extended deadline: ICO counts three calendar months from the start (${x.three}); the Act's wording could be read as two months after the first month ends (${x.altThree}). Manual review: aim for the earlier date.`);
      return onOrBefore(x.altThree);
    }
    return onOrBefore(x.threeCal);
  };
  if (access) { perRight.access = done.has("access") ? "answered" : pendingLive ? "paused" : validExt ? access.three : access.normal; if (!done.has("access") && !pendingLive) internal.access = target(access); }
  for (const r of otherRights) { perRight[r] = done.has(r) ? "answered" : validExt ? other.three : other.normal; if (!done.has(r)) internal[r] = target(other); }
  const dated = Object.values(perRight).filter((d) => d !== "paused" && d !== "answered").sort();
  const due = dated[0] ?? null;
  const internalTarget = Object.values(internal).sort()[0] ?? null;
  if (!due) return out({ status: perRight.access === "paused" ? "paused" : "all-parts-answered", clockStarts: start, due: null, perRight, pausedDays: paused, internalTarget: null, uncertain });
  if (validExt) notes.push(`Extended by two months (complex or numerous request), notified ${extensionNotified}: due ${due}.`);
  if (Object.keys(perRight).length > 1) notes.push(`Each part has its own deadline: ${Object.entries(perRight).map(([r, d]) => `${r} ${d}`).join("; ")}. The earliest is shown as the deadline.`);
  if (rightsList.some((r) => r === "direct-marketing-objection" || r === "consent-withdrawal")) warnings.push("Act on this straight away (stop the marketing or the consent-based processing); the one month is only for confirming what you've done.");
  if (!holidaysCover(due)) warnings.push(`The bank holiday list doesn't cover ${due} yet: check the date by hand and update the list.`);
  return out({
    status: "running",
    clockStarts: start,
    pausedDays: paused,
    due,
    perRight,
    extensionNoticeBy: normalDue,
    extensionNoticeRemind,
    internalTarget,
    uncertain: [...new Set(uncertain)],
    remind: subtractWorkingDays(internalTarget || due, 5),
    calendarCovered: holidaysCover(due),
  });
}

/** The working day on or before a date (internal targets are never later than the calendar date). */
function onOrBefore(d) { return onWorkday(d) ? d : subtractWorkingDays(d, 1); }

/**
 * Data protection complaint part. Legal limit (DPA 2018 s.164A): acknowledge within 30 days of
 * receipt. Your complaints policy (agreed in principle 11 Nov 2026) is stricter and applies first:
 * acknowledge within 5 working days, full response within 4 weeks of the acknowledgement, with
 * progress updates if it takes longer.
 */
function complaintPart(received, rights) {
  if (!rights.includes("dp-complaint")) return {};
  const legal = addDays(received, 30);
  const policy = addWorkingDays(received, COMPLAINT_ACK_WORKING_DAYS);
  return { dpComplaintAckLegal: legal, dpComplaintAckDue: policy < legal ? policy : onOrBefore(legal), dpComplaintAckRemind: subtractWorkingDays(policy < legal ? policy : onOrBefore(legal), 2) };
}

/** Media enquiries have no legal deadline: your usual 2-working-day reply target. */
export function mediaDeadlines({ received }) {
  const replyBy = addWorkingDays(assertDate(received), 2);
  return { type: "media", replyBy, notes: [`Reply target ${replyBy}: your usual 2 working days (not a legal deadline).`] };
}
