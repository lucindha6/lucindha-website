// Client pipeline tracker DESIGN (DEVELOPMENT ONLY). References, stages and dates only: no names,
// addresses, figures or notes. Designed to map onto a Microsoft Lists list later (with approval).
import { assertDate, addWorkingDays } from "./calendar.mjs";

export const STAGES = ["enquiry", "chat-requested", "chat-offered", "chat-confirmed", "chat-held", "quote-drafted", "quote-sent", "letter-sent", "onboarding", "engaged", "declined", "withdrawn", "no-response"];
const END = new Set(["engaged", "declined", "withdrawn", "no-response"]);
const NEXT = {
  enquiry: ["chat-requested", "quote-drafted", "declined", "withdrawn", "no-response"],
  "chat-requested": ["chat-offered", "declined", "withdrawn", "no-response"],
  "chat-offered": ["chat-confirmed", "chat-requested", "withdrawn", "no-response"],
  "chat-confirmed": ["chat-held", "chat-requested", "withdrawn", "no-response"],
  "chat-held": ["quote-drafted", "declined", "withdrawn", "no-response"],
  "quote-drafted": ["quote-sent", "declined", "withdrawn"],
  "quote-sent": ["letter-sent", "quote-drafted", "declined", "withdrawn", "no-response"],
  "letter-sent": ["onboarding", "declined", "withdrawn", "no-response"],
  onboarding: ["engaged", "declined", "withdrawn"],
};
/** Stages only YOU can move a client into (decisions), with an explicit confirmation. */
const DECISIONS = new Set(["engaged", "declined"]);
/** "No reply after N working days" reminders. */
export const NUDGES = { "chat-offered": 3, "quote-sent": 5, "letter-sent": 5, onboarding: 10 };

/** Microsoft Lists design (for later): columns and types. */
export const LIST_COLUMNS = [
  { name: "Reference", type: "Single line of text", note: "e.g. CLI-7KQ3MX; Stage 2 enquiry ref in a second column" },
  { name: "Enquiry ref", type: "Single line of text" },
  { name: "Kind", type: "Choice", choices: ["Accounting", "Community work"] },
  { name: "Stage", type: "Choice", choices: STAGES },
  { name: "Stage since", type: "Date" },
  { name: "Next action due", type: "Date" },
  { name: "Quote ref", type: "Single line of text" },
  { name: "Engagement letter ref", type: "Single line of text" },
  { name: "Onboarding ref", type: "Single line of text" },
];

export function newEntry({ ref, enquiryRef = null, kind = "Accounting", date }) {
  assertDate(date);
  return { ref, enquiryRef, kind, stage: "enquiry", since: date, history: [{ stage: "enquiry", date }], nudged: {} };
}

export function move(entry, to, date, { by = null, confirmedPersonally = false } = {}) {
  assertDate(date);
  if (!STAGES.includes(to)) throw new Error("bad-stage");
  if (END.has(entry.stage)) throw new Error("already-closed");
  if (!(NEXT[entry.stage] || []).includes(to)) throw new Error(`cannot-move-${entry.stage}-to-${to}`);
  if (date < entry.since) throw new Error("date-before-current-stage");
  if (DECISIONS.has(to) && !(by === "Lucindha" && confirmedPersonally === true)) throw new Error("decision-must-be-made-personally-by-lucindha");
  return { ...entry, stage: to, since: date, history: [...entry.history, { stage: to, date }] };
}

/** Nudges for things waiting on the other person. Recorded only after you've been told (caller marks). */
export function nudgesDue(entries, today) {
  assertDate(today);
  const out = [];
  for (const e of entries) {
    const days = NUDGES[e.stage];
    if (!days) continue;
    const due = addWorkingDays(e.since, days);
    const key = `${e.stage}:${e.since}`;
    if (today >= due && !e.nudged[key]) out.push({ ref: e.ref, stage: e.stage, since: e.since, key, text: `[Stage 4] ${e.ref}: no progress at "${e.stage}" since ${e.since} (${days} working days). Decide whether to follow up.` });
  }
  return out;
}

export function markNudged(entry, key, date) { return { ...entry, nudged: { ...entry.nudged, [key]: date } }; }
