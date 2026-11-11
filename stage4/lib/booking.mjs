// Booking REQUESTS for the free 20-minute introductory chat (DEVELOPMENT ONLY, fictional data).
//
// Decision (11 Nov 2026): request-based only. Nobody books themselves in. A person asks for up to
// three times; this code checks them against your published availability, your own busy times and
// existing chats, and prepares a DRAFT reply for you, either offering one of their times or
// suggesting others. You decide and send it yourself. A chat is "confirmed" only when YOU record
// it, personally, after the person has agreed. Nothing is written to a calendar and nothing is sent.
//
// Provisional hold: the offered slot is held INTERNALLY for `holdHours` (24, configurable) so two
// people aren't offered the same time. When the hold expires, only that internal hold is released:
// no enquiry is declined, no message is sent, no calendar is touched.
//
// Times are UK local ("YYYY-MM-DD" + "HH:MM"). `now` is a moment (ms or ISO) for hold expiry.
import { assertDate, addDays, addWorkingDays, BANK_HOLIDAYS, holidaysCover, ukDateOf } from "./calendar.mjs";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const dayName = (d) => WEEKDAY[new Date(`${assertDate(d)}T12:00:00Z`).getUTCDay()];
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const ms = (now) => { const v = typeof now === "number" ? now : Date.parse(now); if (!Number.isFinite(v)) throw new Error("bad-now"); return v; };
const ACTIVE = ["proposed", "offered", "confirmed"];
const slotLength = (a) => (Number.isInteger(a.slotMinutes) && a.slotMinutes > 0 ? a.slotMinutes : 20);
const holdHoursOf = (a) => { if (!(Number.isFinite(a.holdHours) && a.holdHours > 0 && a.holdHours <= 24 * 14)) throw new Error("hold-hours-not-set"); return a.holdHours; };

/** A tentative hold that has passed its expiry no longer blocks anything. */
export const holdLapsed = (b, now) => b.status === "proposed" && b.holdUntil != null && Date.parse(b.holdUntil) <= ms(now);
const blocking = (b, now) => ACTIVE.includes(b.status) && !holdLapsed(b, now);

/** Why a requested slot can't be offered, or null if it can. */
export function slotProblem(slot, { availability, book, today, now = `${today}T12:00:00Z`, busy = [] }) {
  if (!slot || typeof slot.time !== "string" || !TIME.test(slot.time)) return "not a valid time";
  try { assertDate(slot.date); } catch { return "not a valid date"; }
  const earliest = addWorkingDays(today, availability.minNoticeWorkingDays);
  if (slot.date < earliest) return `too soon (earliest ${earliest})`;
  if (slot.date > addDays(today, availability.maxWeeksAhead * 7)) return "too far ahead";
  if (!holidaysCover(slot.date)) return "bank holiday list not updated for this date";
  if (availability.skipBankHolidays && BANK_HOLIDAYS.has(slot.date)) return "bank holiday";
  const times = availability.weekly[dayName(slot.date)] || [];
  if (!times.includes(slot.time)) return `outside your published times for ${dayName(slot.date)}`;
  const len = slotLength(availability);
  const start = mins(slot.time);
  for (const x of Array.isArray(busy) ? busy : [{}]) {
    if (!x || typeof x !== "object") return "a diary entry couldn't be read: check by hand";
    let entryDate;
    try { entryDate = assertDate(x.date); } catch { return "a diary entry couldn't be read: check by hand"; }
    if (entryDate !== slot.date) continue;
    if (x.allDay === true) return "clashes with something else in your diary";
    if (!TIME.test(x.from || "") || !TIME.test(x.to || "") || mins(x.to) <= mins(x.from)) return "a diary entry on that day couldn't be read: check by hand";
    if (start < mins(x.to) && mins(x.from) < start + len) return "clashes with something else in your diary";
  }
  const sameDay = book.filter((b) => b.date === slot.date && blocking(b, now));
  if (sameDay.some((b) => TIME.test(b.time || "") && Math.abs(mins(b.time) - start) < len)) return "already taken";
  if (sameDay.length >= availability.maxChatsPerDay) return "that day is full";
  return null;
}

/** Next free published slots after the minimum notice, for suggesting alternatives. */
export function nextFreeSlots({ availability, book, today, now = `${today}T12:00:00Z`, busy = [], count = 3 }) {
  const out = [];
  let d = addWorkingDays(today, availability.minNoticeWorkingDays);
  const last = addDays(today, availability.maxWeeksAhead * 7);
  while (d <= last && out.length < count) {
    for (const time of availability.weekly[dayName(d)] || []) {
      if (out.length >= count) break;
      const withOut = [...book, ...out.map((o) => ({ ...o, status: "offered" }))];
      if (!slotProblem({ date: d, time }, { availability, book: withOut, today, now, busy })) out.push({ date: d, time });
    }
    d = addDays(d, 1);
  }
  return out;
}

const pretty = (s) => `${dayName(s.date)} ${s.date} at ${s.time}`;
const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);

/**
 * Assess a request and prepare a DRAFT reply for you, never sent.
 * request: { ref, slots: [{date, time}] (max 3), communication, accessNeeds?: boolean }
 */
export function assessRequest(request, { availability, book, today, now, busy = [] }) {
  assertDate(today);
  if (now === undefined) throw new Error("now-required");
  const at = ms(now);
  if (ukDateOf(at) !== today) throw new Error("now-and-today-disagree");
  const slots = (request.slots || []).slice(0, 3);
  const comm = availability.communication.includes(request.communication) ? request.communication : null;
  const checked = slots.map((s) => ({ slot: s, problem: slotProblem(s, { availability, book, today, now: at, busy }) }));
  const ok = checked.find((c) => !c.problem);
  const flags = [];
  if (!availability.approved) flags.push("Availability is still PROPOSED, not approved.");
  if (!comm) flags.push("Communication preference not given or not recognised: ask how they'd like to communicate (written, BSL, captions or another way).");
  if (comm === "Face to face") flags.push("Face to face requested: decide the place, or offer video instead.");
  if (comm && /Deafblind/.test(comm)) flags.push("Deafblind access: ask what works and arrange it before confirming (e.g. interpreter type, braille or large-print materials).");
  if (comm && /BSL/.test(comm)) flags.push("BSL chosen: you'll sign directly; check whether they'd like anything in writing afterwards.");
  if ((request.slots || []).length > 3) flags.push("More than three times were sent; only the first three were checked.");
  if (ok) {
    const hold = { ref: request.ref, ...ok.slot, status: "proposed", heldAt: new Date(at).toISOString(), holdUntil: new Date(at + holdHoursOf(availability) * 3600e3).toISOString(), communication: comm };
    return {
      outcome: "offer-draft", hold, checked, flags,
      draft: [
        "Hello,",
        `Thank you for asking for a free 20-minute introductory chat. I can offer ${pretty(ok.slot)}${comm ? ` (${lowerFirst(comm)})` : ""}.`,
        "Please reply to let me know if that still suits you, and I'll confirm the details.",
        "If you need anything to make the chat accessible, just tell me.",
        "[Your sign-off]",
      ].join("\n\n"),
    };
  }
  const alternatives = nextFreeSlots({ availability, book, today, now: at, busy });
  return {
    outcome: "alternatives-draft", hold: null, checked, alternatives, flags,
    draft: [
      "Hello,",
      "Thank you for asking for a free 20-minute introductory chat. I'm afraid the times you suggested aren't available.",
      alternatives.length ? `Could any of these work instead?\n${alternatives.map((s) => `- ${pretty(s)}`).join("\n")}` : "Please send me a few other evenings or Saturday mornings that suit you.",
      "[Your sign-off]",
    ].join("\n\n"),
  };
}

/**
 * Releases expired INTERNAL holds (status "lapsed"). Nothing else changes: no enquiry is declined,
 * no message sent, no calendar touched. Returns the book and the refs released (for your info).
 */
export function expireHolds(book, now) {
  const released = book.filter((b) => holdLapsed(b, now)).map((b) => b.ref);
  return { book: book.map((b) => (holdLapsed(b, now) ? { ...b, status: "lapsed", lapsedAt: new Date(ms(now)).toISOString() } : b)), released };
}

/**
 * Status changes YOU make. "offered" = you sent the offer; "confirmed" = they agreed AND you
 * personally confirm (confirmedPersonally: true). Refused if the hold has lapsed, if anyone else
 * holds that time, or if the chat time has already passed.
 */
export function updateBooking(book, ref, to, { by, now, confirmedPersonally = false, slotMinutes = 20 } = {}) {
  if (by !== "Lucindha") throw new Error("only-lucindha-changes-bookings");
  const at = ms(now);
  const allowed = { proposed: ["offered", "released"], offered: ["confirmed", "released"], confirmed: ["held", "cancelled"] };
  const b = book.find((x) => x.ref === ref && ACTIVE.includes(x.status));
  if (!b) throw new Error("no-such-booking");
  if (!(Object.hasOwn(allowed, b.status) && allowed[b.status].includes(to))) throw new Error(`cannot-${b.status}-to-${to}`);
  if (to === "offered" && holdLapsed(b, at)) throw new Error("hold-lapsed-check-again");
  if (to === "confirmed" && confirmedPersonally !== true) throw new Error("confirmation-must-be-made-personally-by-lucindha");
  const startsAt = Date.parse(`${b.date}T${b.time}:00Z`) - (ukOffsetMinutes(b.date) * 60e3);
  if (["offered", "confirmed"].includes(to)) {
    if (at >= startsAt) throw new Error("chat-time-has-passed");
    const clash = book.some((x) => x !== b && x.date === b.date && Math.abs(mins(x.time) - mins(b.time)) < slotMinutes && blocking(x, at));
    if (clash) throw new Error("time-already-taken");
  }
  if (to === "held" && at < startsAt) throw new Error("chat-not-happened-yet");
  const stamp = new Date(at).toISOString();
  return book.map((x) => (x === b ? { ...x, status: to, [`${to}At`]: stamp, holdUntil: null } : x));
}

/** UK offset from UTC in minutes on a date (0 in winter, 60 in summer). */
function ukOffsetMinutes(date) {
  const noon = new Date(`${date}T12:00:00Z`);
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(noon);
  return (Number(local) - 12) * 60;
}

export { ukDateOf };
