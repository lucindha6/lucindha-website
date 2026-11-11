// Regression tests for the independent security review of Stage 4 (findings 1-17). FICTIONAL data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildQuoteDraft, checkQuote, enterFee, setQuoteSection, approveQuote, QUOTE_SECTIONS } from "../lib/quote.mjs";
import { newLetter, setSection, setSchedule, setPracticeFact, approveWording, checkLetter, AAT_ITEMS, looksUnfinished } from "../lib/engagement.mjs";
import { newChecklist, applicableSteps, confirmStep, answerRedFlag, recordDecision, review, RED_FLAGS } from "../lib/onboarding.mjs";
import { newEntry, move, markNudged } from "../lib/pipeline.mjs";
import { assessRequest, updateBooking, slotProblem } from "../lib/booking.mjs";

const pricing = JSON.parse(readFileSync(new URL("../config/proposed-pricing.json", import.meta.url)));
const availability = JSON.parse(readFileSync(new URL("../config/availability.json", import.meta.url)));
const ME = { by: "Lucindha" };
const N = (d) => `${d}T12:00:00Z`;
const YES = { approvedByLucindha: true };
const DECIDE = { by: "Lucindha", confirmedPersonally: true };

function fullLetter() {
  let l = newLetter({ ref: "ENG-RRRRRR", clientRef: "CLI-RRRRRR", services: ["Bookkeeping"], licensedServices: Object.keys(pricing.services) });
  for (const i of AAT_ITEMS) l = setSection(l, i.id, `FICTIONAL wording for ${i.id}.`, YES);
  l = setSection(l, "k", "FICTIONAL. My AAT licence does not authorise investment work.", YES);
  l = setSection(l, "o", "FICTIONAL. Unresolved complaints may be referred to AAT.", YES);
  l = setSection(l, "l", "FICTIONAL. Our Money Laundering Regulations duties.", YES);
  l = setSection(l, "m", "FICTIONAL. Registered with the Information Commissioner.", YES);
  l = setSection(l, "p", "FICTIONAL. Our alternate is a named practising accountant.", YES);
  l = setSchedule(l, "Bookkeeping", "FICTIONAL scope.", YES);
  for (const k of ["icoRegistration", "piiInsurer", "continuityAlternate", "vatStatus", "piiTerritorialCoverage"]) l = setPracticeFact(l, k, "FICTIONAL", YES);
  return approveWording(l, DECIDE);
}
function open(c, { risk = "low", date = "2026-11-20", except = [] } = {}) {
  for (let o; (o = applicableSteps(c).filter((s) => !c.steps[s.id] && !except.includes(s.id))).length; )
    c = confirmStep(c, o[0].id, { method: o[0].id === "risk-assessment" ? risk : o[0].methods[0], date, by: "Lucindha" });
  return c;
}
const answers = (c, yes = []) => RED_FLAGS.reduce((x, f) => answerRedFlag(x, f.id, yes.includes(f.id), ME), c);

test("F1: near-miss placeholders anywhere in the letter are caught; no direct setting without approval", () => {
  for (const v of ["", " [AAT SAMPLE WORDING NOT SUPPLIED OR APPROVED] ", "[AAT SAMPLE WORDING NOT SUPPLIED OR APPROVED].", "[TBC]", "TBC", "{name}", "<<decide>>", "to do"]) assert.ok(looksUnfinished(v), v);
  const l = fullLetter();
  assert.equal(checkLetter(l).status, "ready-for-review");
  assert.equal(checkLetter({ ...l, schedules: { Bookkeeping: "TBC " } }).status, "incomplete");
  assert.equal(checkLetter({ ...l, practice: { ...l.practice, piiInsurer: "{name}" } }).status, "incomplete");
  assert.equal(checkLetter({ ...l, sections: { ...l.sections, e: "[AAT SAMPLE WORDING NOT SUPPLIED OR APPROVED]." } }).status, "incomplete");
  assert.equal(checkLetter({ ...l, wordingApproved: false }).status, "incomplete");
  assert.throws(() => setSchedule(l, "Payroll", "x", YES), /service-not-on-letter/);
  assert.throws(() => setPracticeFact(l, "piiInsurer", "<<decide>>", YES), /placeholder/);
});

test("F2: a decided checklist is locked: no second decision, no changed answers or steps afterwards", () => {
  let c = open(answers(newChecklist({ ref: "ONB-RRRRRR", clientRef: "CLI-RRRRRR", clientType: "Individual" })));
  const d = recordDecision(c, { outcome: "declined", date: "2026-11-21", ...DECIDE });
  assert.throws(() => recordDecision(d, { outcome: "accepted", date: "2026-11-22", ...DECIDE }), /decided/);
  assert.throws(() => answerRedFlag(d, "pep", true, ME), /decided/);
  assert.throws(() => confirmStep(d, "risk-assessment", { method: "high", date: "2026-11-22", by: "Lucindha" }), /decided/);
});

test("F3/F10: only exactly `true` counts as your confirmation", () => {
  let c = open(answers(newChecklist({ ref: "ONB-R3", clientRef: "CLI-R3", clientType: "Individual" }), ["pep"]), { risk: "medium" });
  assert.throws(() => recordDecision(c, { outcome: "accepted", date: "2026-11-21", ...DECIDE, reviewedRedFlags: "no" }), /not-reviewed/);
  assert.throws(() => recordDecision(c, { outcome: "accepted", date: "2026-11-21", by: "Lucindha", confirmedPersonally: "yes" }), /personally/);
  assert.throws(() => setSection(newLetter({ ref: "E", clientRef: "C", services: [] }), "a", "x", { approvedByLucindha: "no" }), /approved/);
  let q = enterFee(buildQuoteDraft({ ref: "QTE-R", clientType: "Sole trader", services: ["Bookkeeping"] }, pricing), "Bookkeeping", 3000);
  assert.throws(() => setQuoteSection(q, "scope", "FICTIONAL scope.", { approvedByLucindha: "yes" }), /approved/);
  for (const sec of QUOTE_SECTIONS) q = setQuoteSection(q, sec.key, `FICTIONAL ${sec.key}.`, YES);
  assert.equal(checkQuote(q).status, "ready-for-your-approval");
  assert.throws(() => approveQuote(q, { by: "Lucindha", confirmedPersonally: "yes", issueDate: "2026-11-20" }), /personally/);
});

test("F4: EDD only after the flags are answered and risk assessed; no confirming steps that don't apply; no future-dated steps", () => {
  let c = newChecklist({ ref: "ONB-R4", clientRef: "CLI-R4", clientType: "Individual" });
  assert.throws(() => confirmStep(c, "edd", { method: "completed", date: "2026-11-01", by: "Lucindha" }), /answer-red-flags/);
  assert.throws(() => confirmStep(c, "beneficial-owners", { method: "register and documents checked", date: "2026-11-01", by: "Lucindha" }), /does-not-apply/);
  c = answers(c);
  c = confirmStep(c, "risk-assessment", { method: "low", date: "2026-11-20", by: "Lucindha" });
  assert.throws(() => confirmStep(c, "edd", { method: "completed", date: "2026-11-20", by: "Lucindha" }), /does-not-apply/);
  // EDD done, then the answers change -> EDD cleared and must be redone
  let d = confirmStep(c, "risk-assessment", { method: "high", date: "2026-11-20", by: "Lucindha" });
  d = confirmStep(d, "edd", { method: "completed", date: "2026-11-20", by: "Lucindha" });
  assert.throws(() => confirmStep(d, "edd", { method: "completed", date: "2026-11-19", by: "Lucindha" }), /before-risk-assessment/);
  d = confirmStep(d, "risk-assessment", { method: "medium", date: "2026-11-21", by: "Lucindha" });
  assert.equal(d.steps.edd, undefined);
  d = answerRedFlag(d, "cash-intensive", true, ME);
  assert.equal(d.steps.edd, undefined);
  // steps dated after the decision
  let e = open(answers(newChecklist({ ref: "ONB-R4B", clientRef: "CLI-R4B", clientType: "Individual" })));
  e = confirmStep(e, "monitoring-date", { method: "date set", date: "2026-11-25", by: "Lucindha" });
  assert.throws(() => recordDecision(e, { outcome: "accepted", date: "2026-11-21", ...DECIDE }), /after-decision/);
});

test("F5: a PEP always needs source of funds and wealth, and can't be rated low risk", () => {
  let c = newChecklist({ ref: "ONB-R5", clientRef: "CLI-R5", clientType: "Individual" });
  c = answers(c);
  c = confirmStep(c, "risk-assessment", { method: "low", date: "2026-11-20", by: "Lucindha" });
  c = answerRedFlag(c, "pep", true, ME); // low rating withdrawn
  assert.equal(c.riskLevel, null);
  assert.ok(applicableSteps(c).some((s) => s.id === "source-of-funds"));
  assert.match(review(c).open.join(" "), /client risk assessment/i);
});

test("F6/F17: no double confirmation after a lapsed hold; no confirming a chat after its date", () => {
  const S = { date: "2026-11-26", time: "19:00" };
  let book = [assessRequest({ ref: "BKR-CCCCCC", slots: [S], communication: "Video call" }, { availability, book: [], today: "2026-11-16", now: N("2026-11-16") }).hold];
  const r = assessRequest({ ref: "BKR-EEEEEE", slots: [S], communication: "Video call" }, { availability, book, today: "2026-11-20", now: N("2026-11-20") });
  assert.equal(r.outcome, "offer-draft");
  book = [...book, r.hold];
  assert.throws(() => updateBooking(book, "BKR-CCCCCC", "offered", { ...ME, now: N("2026-11-20") }), /hold-lapsed/);
  book = updateBooking(book, "BKR-EEEEEE", "offered", { ...ME, now: N("2026-11-20") });
  book = updateBooking(book, "BKR-EEEEEE", "confirmed", { ...ME, confirmedPersonally: true, now: N("2026-11-21") });
  const other = [{ ref: "BKR-X", ...S, status: "offered" }, ...book];
  assert.throws(() => updateBooking(other, "BKR-X", "confirmed", { ...ME, confirmedPersonally: true, now: N("2026-11-22") }), /already-taken/);
  assert.throws(() => updateBooking([{ ref: "BKR-Y", date: "2026-11-26", time: "18:30", status: "offered" }], "BKR-Y", "confirmed", { ...ME, confirmedPersonally: true, now: N("2026-11-27") }), /chat-time-has-passed/);
});

test("F7/F14: pipeline holds references only and refuses hand-made stages and bad dates cleanly", () => {
  assert.throws(() => newEntry({ ref: "Jane Smith, 07700 900123", date: "2026-11-16" }), /reference/);
  const e = newEntry({ ref: "CLI-RRRRRR", date: "2026-11-16" });
  assert.throws(() => move({ ...e, stage: "__proto__" }, "engaged", "2026-11-17"), /bad-stage/);
  assert.throws(() => markNudged(e, "enquiry:2026-11-16", "soon"), /bad-date/);
  assert.throws(() => markNudged(e, "__proto__", "2026-11-17"), /bad-nudge-key/);
});

test("F8/F16: wider unlicensed-work detection, with the right reason for audit and immigration", () => {
  const flags = (t) => buildQuoteDraft({ ref: "QTE-R8", clientType: "Individual", services: [], requestText: t }, pricing).flags.join(" ");
  for (const t of ["I invested in shares", "I'm a pensioner", "my SIPP", "an ISA", "annuity", "crypto", "wealth management", "retirement planning", "my financial adviser"]) assert.match(flags(t), /AAT licence doesn't authorise investment work/, t);
  assert.match(flags("we need an auditor"), /registered-auditor/);
  assert.match(flags("immigration help"), /Immigration Advice Authority/);
  const l = fullLetter();
  assert.equal(checkLetter({ ...l, schedules: { Bookkeeping: "FICTIONAL. Includes pension advice." } }).status, "incomplete");
  assert.equal(checkLetter({ ...l, sections: { ...l.sections, g: "FICTIONAL. We may recommend an ISA." } }).status, "incomplete");
});

test("F9: item (k) must say the licence does NOT authorise investment work", () => {
  const l = fullLetter();
  assert.equal(checkLetter({ ...l, sections: { ...l.sections, k: "FICTIONAL. Our AAT licence authorises investment work." } }).status, "incomplete");
  assert.equal(checkLetter({ ...l, sections: { ...l.sections, k: "FICTIONAL. The AAT licence doesn't cover any investment business." } }).status, "ready-for-review");
});

test("F11: hand-made checklists (missing questions, unknown steps) can't be accepted", () => {
  const c = open(answers(newChecklist({ ref: "ONB-R11", clientRef: "CLI-R11", clientType: "Individual" })));
  assert.throws(() => recordDecision({ ...c, redFlags: [] }, { outcome: "accepted", date: "2026-11-21", ...DECIDE }), /not-well-formed|unanswered/);
  assert.throws(() => recordDecision({ ...c, steps: { ...c.steps, magic: { method: "x", date: "2026-11-20" } } }, { outcome: "accepted", date: "2026-11-21", ...DECIDE }), /not-well-formed/);
});

test("F12: service names match regardless of case; returned packages don't alter the loaded prices", () => {
  const q = buildQuoteDraft({ ref: "QTE-R12", clientType: "Limited company", services: ["year-end accounts", "Corporation Tax returns"] }, pricing);
  assert.equal(q.lines.length, 1);
  assert.equal(q.flags.length, 0);
  q.packageOptions[0].price = "£0";
  assert.equal(pricing.packages.find((p) => p.name === "Limited Company Essentials").price, "£85 a month");
});

test("F13: dates beyond the loaded bank holidays are never offered; reminder to extend the list", () => {
  assert.match(slotProblem({ date: "2028-01-03", time: "18:30" }, { availability, book: [], today: "2027-12-20" }), /bank holiday list not updated/);
  const today = new Date().toISOString().slice(0, 10);
  if (today >= "2027-12-01") assert.fail("Extend BANK_HOLIDAYS in lib/calendar.mjs for 2028 (GOV.UK)");
});
