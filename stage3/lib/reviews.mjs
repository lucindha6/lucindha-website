// Manual review safeguards (approved for fictional-data development, 11 Nov 2026).
//
// Wording rules can miss a privacy request or complaint, and some channels aren't automated at all.
// These checklists back up, but NEVER replace, reading incoming messages promptly: a request has
// its deadline from the day it reaches you on ANY channel, whether or not this review has happened.
// Nothing here reads message content or sends anything to an AI provider.
import { assertDate, addDays, daysBetween } from "./calendar.mjs";
import { sha256Hex } from "./util.mjs";

export const WEEKLY_PLACES = [
  { id: "hello", place: "hello@ Inbox (direct emails aren't covered by Stage 1 or 2)" },
  { id: "whatsapp", place: "WhatsApp Business chats" },
  { id: "social", place: "Social media messages and comments (LinkedIn, Instagram and others)" },
  { id: "post", place: "Post and letters" },
  { id: "calls", place: "Notes from video calls and in-person conversations" },
  { id: "other-mailboxes", place: "Any other mailbox (your own, and the specialist mailboxes' Junk folders)" },
];

/**
 * Weekly checklist. done = { [id]: "checked" | "not-applicable" }. found = number of items you
 * logged as cases (a count only). Returns the text and whether it's complete.
 */
export function weeklyReview({ weekOf, done = {}, found = 0 }) {
  assertDate(weekOf);
  const rows = WEEKLY_PLACES.map((p) => ({ ...p, status: ["checked", "not-applicable"].includes(done[p.id]) ? done[p.id] : "not yet checked" }));
  const outstanding = rows.filter((r) => r.status === "not yet checked");
  const text = [
    `Weekly manual review · week of ${weekOf}`,
    "Look for anything that is really a complaint, a privacy request or a data protection complaint. Log each as a case with the date it FIRST reached you.",
    "This is a backstop, not a substitute for checking messages promptly: deadlines run from the day a message arrives.",
    "",
    ...rows.map((r) => `  [${r.status === "not yet checked" ? " " : "x"}] ${r.place}${r.status === "not-applicable" ? " (not applicable)" : ""}`),
    "",
    `Logged as cases this week: ${Number.isInteger(found) && found >= 0 ? found : "not recorded"}.`,
    outstanding.length ? "NOT COMPLETE: some places haven't been checked." : "Complete.",
  ].join("\n");
  return { weekOf, complete: outstanding.length === 0, outstanding: outstanding.map((o) => o.id), text, audit: { weekOf, checked: rows.filter((r) => r.status !== "not yet checked").map((r) => r.id), found: Number.isInteger(found) ? found : null } };
}

/**
 * Monthly sample: up to n closed complaint and media cases received in that month, chosen by a
 * fixed scramble of the reference (so the choice can't be steered), for you to reread for anything
 * missed. Returns references only.
 */
export function monthlySample(cases, { month, n = 3 }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("bad-month");
  const pool = cases.filter((c) => ["complaint", "media"].includes(c.type) && ["responded", "closed", "duplicate"].includes(c.status) && typeof c.received === "string" && c.received.startsWith(month));
  return pool.map((c) => ({ ref: c.ref, k: sha256Hex(`sample:${month}:${c.ref}`) })).sort((a, b) => (a.k < b.k ? -1 : 1)).slice(0, n).map((x) => x.ref);
}

/** For the health report: are the manual reviews up to date? */
export function manualReviewStatus({ asOf, weeklyLastDone = null, monthlySampleLastDone = null }) {
  assertDate(asOf);
  const out = [];
  const age = (d) => { try { return daysBetween(assertDate(d), asOf); } catch { return Infinity; } };
  const w = age(weeklyLastDone);
  if (w > 7) out.push({ level: "bad", text: weeklyLastDone ? `Weekly manual review last done ${weeklyLastDone} (${w} days ago). Do it now.` : "Weekly manual review: no record of it being done." });
  else out.push({ level: "ok", text: `Weekly manual review done ${weeklyLastDone}.` });
  const m = age(monthlySampleLastDone);
  if (m > 35) out.push({ level: "warn", text: monthlySampleLastDone ? `Monthly sample check last done ${monthlySampleLastDone}.` : "Monthly sample check: no record of it being done." });
  else out.push({ level: "ok", text: `Monthly sample check done ${monthlySampleLastDone}.` });
  return out;
}
export { addDays };
