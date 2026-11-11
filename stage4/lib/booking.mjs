// Booking REQUESTS for the free 20-minute introductory chat (DEVELOPMENT ONLY).
//
// Nobody books themselves in. A person asks for up to three times; this code checks them against
// your published availability and your existing commitments, and prepares a DRAFT reply for you:
// either offering one of their times or suggesting others. You decide and send it. A chat is
// "confirmed" only when YOU record it, after the person has agreed. Nothing is written to a calendar.
//
// All times are UK local times ("YYYY-MM-DD" + "HH:MM").
import { assertDate, addDays, addWorkingDays, isWorkingDay, BANK_HOLIDAYS, ukDateOf } from "./calendar.mjs";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const dayName = (d) => WEEKDAY[new Date(`${assertDate(d)}T12:00:00Z`).getUTCDay()];

/** Why a requested slot can't be offered, or null if it can. `book` = your confirmed + tentatively offered chats. */
export function slotProblem(slot, { availability, book, today }) {
  if (!slot || typeof slot.time !== "string" || !TIME.test(slot.time)) return "not a valid time";
  try { assertDate(slot.date); } catch { return "not a valid date"; }
  const earliest = addWorkingDays(today, availability.minNoticeWorkingDays);
  if (slot.date < earliest) return `too soon (earliest ${earliest})`;
  if (slot.date > addDays(today, availability.maxWeeksAhead * 7)) return "too far ahead";
  if (availability.skipBankHolidays && BANK_HOLIDAYS.has(slot.date)) return "bank holiday";
  const times = availability.weekly[dayName(slot.date)] || [];
  if (!times.includes(slot.time)) return `outside your published times for ${dayName(slot.date)}`;
  const sameDay = book.filter((b) => b.date === slot.date && ["confirmed", "offered", "proposed"].includes(b.status));
  if (sameDay.some((b) => b.time === slot.time)) return "already taken";
  if (sameDay.length >= availability.maxChatsPerDay) return "that day is full";
  return null;
}

/** Next free published slots after the minimum notice, for suggesting alternatives. */
export function nextFreeSlots({ availability, book, today, count = 3 }) {
  const out = [];
  let d = addWorkingDays(today, availability.minNoticeWorkingDays);
  const last = addDays(today, availability.maxWeeksAhead * 7);
  while (d <= last && out.length < count) {
    for (const time of availability.weekly[dayName(d)] || []) {
      if (out.length >= count) break;
      if (!slotProblem({ date: d, time }, { availability, book: [...book, ...out.map((o) => ({ ...o, status: "proposed" }))], today })) out.push({ date: d, time });
    }
    d = addDays(d, 1);
  }
  return out;
}

const pretty = (s) => `${dayName(s.date)} ${s.date} at ${s.time}`;

/**
 * Assess a request and prepare a DRAFT reply for you. Holds the offered slot tentatively (status
 * "proposed") so two people aren't offered the same time; the hold lapses after proposalHoldDays
 * unless you send it.
 * request: { ref, slots: [{date, time}] (max 3), communication }
 */
export function assessRequest(request, { availability, book, today }) {
  assertDate(today);
  const slots = (request.slots || []).slice(0, 3);
  const comm = availability.communication.includes(request.communication) ? request.communication : null;
  const live = book.filter((b) => !(b.status === "proposed" && b.holdUntil && b.holdUntil < today));
  const checked = slots.map((s) => ({ slot: s, problem: slotProblem(s, { availability, book: live, today }) }));
  const ok = checked.find((c) => !c.problem);
  const flags = [];
  if (!availability.approved) flags.push("Availability is still PROPOSED, not approved.");
  if (!comm) flags.push("Communication preference not given or not recognised: ask how they'd like to communicate.");
  if (comm === "Face to face") flags.push("Face to face requested: decide the place, or offer video instead.");
  if ((request.slots || []).length > 3) flags.push("More than three times were sent; only the first three were checked.");
  if (ok) {
    const hold = { ref: request.ref, ...ok.slot, status: "proposed", holdUntil: addDays(today, availability.proposalHoldDays), communication: comm };
    return {
      outcome: "offer-draft",
      hold,
      checked,
      flags,
      draft: [
        "Hello,",
        `Thank you for asking for a free 20-minute introductory chat. I can offer ${pretty(ok.slot)}${comm ? ` (${comm[0].toLowerCase()}${comm.slice(1)})` : ""}.`,
        "Please reply to let me know if that still suits you, and I'll confirm the details.",
        "[Your sign-off]",
      ].join("\n\n"),
    };
  }
  const alternatives = nextFreeSlots({ availability, book: live, today });
  return {
    outcome: "alternatives-draft",
    hold: null,
    checked,
    alternatives,
    flags,
    draft: [
      "Hello,",
      "Thank you for asking for a free 20-minute introductory chat. I'm afraid the times you suggested aren't available.",
      alternatives.length ? `Could any of these work instead?\n${alternatives.map((s) => `- ${pretty(s)}`).join("\n")}` : "Please send me a few other evenings or Saturday mornings that suit you.",
      "[Your sign-off]",
    ].join("\n\n"),
  };
}

/** Status changes YOU make. Only you can mark "offered" (you sent it) and "confirmed" (they agreed). */
export function updateBooking(book, ref, to, { by, date }) {
  if (by !== "Lucindha") throw new Error("only-lucindha-changes-bookings");
  assertDate(date);
  const allowed = { proposed: ["offered", "released"], offered: ["confirmed", "released"], confirmed: ["held", "cancelled"] };
  const b = book.find((x) => x.ref === ref && !["released", "cancelled", "held"].includes(x.status));
  if (!b) throw new Error("no-such-booking");
  if (!(allowed[b.status] || []).includes(to)) throw new Error(`cannot-${b.status}-to-${to}`);
  return book.map((x) => (x === b ? { ...x, status: to, [`${to}On`]: date, holdUntil: null } : x));
}

export { ukDateOf };
