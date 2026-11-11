// Run: cd stage4 && npm test      (FICTIONAL clients only; nothing is sent, booked or decided)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildQuoteDraft, enterFee, checkQuote, quoteText, BLANK } from "../lib/quote.mjs";
import { newLetter, setSection, setSchedule, setPracticeFact, approveWording, checkLetter, newLetterNeeded, disengagementChecklist, AAT_ITEMS, PLACEHOLDER } from "../lib/engagement.mjs";
import { newChecklist, applicableSteps, confirmStep, answerRedFlag, review, recordDecision, RED_FLAGS } from "../lib/onboarding.mjs";
import { newEntry, move, nudgesDue, markNudged, LIST_COLUMNS } from "../lib/pipeline.mjs";
import { slotProblem, assessRequest, updateBooking, nextFreeSlots } from "../lib/booking.mjs";

const pricing = JSON.parse(readFileSync(new URL("../config/proposed-pricing.json", import.meta.url)));
const availability = JSON.parse(readFileSync(new URL("../config/availability.json", import.meta.url)));
const LICENSED = Object.keys(pricing.services);
const ME = { by: "Lucindha" };

// ===================================================== quotes
test("quote: published starting prices only, every fee left blank for you, £850 shown once for year-end + Corporation Tax", () => {
  const q = buildQuoteDraft({ ref: "QTE-AAAAAA", clientType: "Limited company", services: ["Year-end accounts", "Corporation tax returns", "VAT returns"] }, pricing);
  assert.equal(q.lines.length, 2);
  assert.equal(q.lines[0].label, "Year-end accounts and Corporation Tax return");
  assert.equal(quoteText(q).match(/£850/g).length, 1);
  assert.ok(q.lines.every((l) => l.feePence === null));
  assert.match(quoteText(q), new RegExp(BLANK.replace(/[[\]]/g, "\\$&")));
  assert.deepEqual(q.packageOptions.map((p) => p.name), ["Limited Company Essentials", "Limited Company Plus"]);
  assert.match(quoteText(q), /NOT SENT/);
});

test("quote: services not on your licensed list are left out and flagged; investment work is never quoted", () => {
  const q = buildQuoteDraft({ ref: "QTE-B", clientType: "Sole trader", services: ["Bookkeeping", "Payroll"], requestText: "FICTIONAL. Also can you give me investment and pension advice?" }, pricing);
  assert.deepEqual(q.lines.map((l) => l.label), ["Bookkeeping"]);
  assert.match(q.flags.join(" "), /Payroll/);
  assert.match(q.flags.join(" "), /investment, pension.*AAT licence doesn't authorise investment work/);
  const q2 = buildQuoteDraft({ ref: "QTE-B2", clientType: "Individual", services: ["Self Assessment"], requestText: "FICTIONAL. What about my pensions and investing?" }, pricing);
  assert.match(q2.flags.join(" "), /investing, pensions/);
});

test("quote: can't be 'ready for review' until you've entered every fee and decided VAT and validity; low fees flagged", () => {
  let q = buildQuoteDraft({ ref: "QTE-C", clientType: "Sole trader", services: ["Bookkeeping", "VAT returns"] }, pricing);
  assert.equal(checkQuote(q).status, "incomplete");
  q = enterFee(q, "Bookkeeping", 2500);
  q = enterFee(q, "VAT returns", 9000);
  let c = checkQuote(q);
  assert.equal(c.status, "incomplete");
  assert.match(c.problems.join(" "), /VAT/);
  c = checkQuote(q, { vatStatusDecided: true, validityDecided: true });
  assert.equal(c.status, "ready-for-review");
  assert.match(c.warnings.join(" "), /below your published starting price/);
  assert.match(c.warnings.join(" "), /PROPOSED, not approved/);
  assert.throws(() => enterFee(q, "Bookkeeping", -5), /bad-fee/);
  assert.throws(() => enterFee(q, "Payroll", 100), /no-such-line/);
});

// ===================================================== engagement letters
test("engagement letter: all 16 AAT items (a)-(p) start as placeholders and block review", () => {
  assert.equal(AAT_ITEMS.length, 16);
  assert.deepEqual(AAT_ITEMS.map((i) => i.id).join(""), "abcdefghijklmnop");
  const l = newLetter({ ref: "ENG-A", clientRef: "CLI-A", services: ["Bookkeeping"], licensedServices: LICENSED });
  const c = checkLetter(l);
  assert.equal(c.status, "incomplete");
  for (const i of AAT_ITEMS) assert.match(c.problems[0], new RegExp(`\\(${i.id}\\)`));
  assert.match(c.problems.join(" "), /icoRegistration/);
  assert.match(c.problems.join(" "), /piiInsurer/);
  assert.match(c.problems.join(" "), /continuityAlternate/);
});

test("engagement letter: wording only goes in when you approve it, never with placeholders; (k) and (o) checked", () => {
  let l = newLetter({ ref: "ENG-B", clientRef: "CLI-B", services: ["Bookkeeping"], licensedServices: LICENSED });
  assert.throws(() => setSection(l, "a", "FICTIONAL wording"), /approved-by-lucindha/);
  assert.throws(() => setSection(l, "a", "Scope: [to do]", { approvedByLucindha: true }), /placeholder/);
  for (const i of AAT_ITEMS) l = setSection(l, i.id, `FICTIONAL approved wording for item ${i.id}.`, { approvedByLucindha: true });
  l = setSchedule(l, "Bookkeeping", "FICTIONAL scope for bookkeeping.", { approvedByLucindha: true });
  for (const k of ["icoRegistration", "piiInsurer", "continuityAlternate", "vatStatus"]) l = setPracticeFact(l, k, "FICTIONAL", { approvedByLucindha: true });
  let c = checkLetter(l);
  assert.match(c.problems.join(" "), /\(k\) must state/);
  assert.match(c.problems.join(" "), /\(o\) must say/);
  l = setSection(l, "k", "FICTIONAL. My AAT licence does not authorise investment work.", { approvedByLucindha: true });
  l = setSection(l, "o", "FICTIONAL. Unresolved complaints can be referred to AAT.", { approvedByLucindha: true });
  c = checkLetter(l);
  assert.deepEqual(c.problems, ["Your final read-through approval is still needed."]);
  assert.throws(() => approveWording(l, { by: "Lucindha" }), /personally/);
  l = approveWording(l, { by: "Lucindha", confirmedPersonally: true });
  c = checkLetter(l);
  assert.equal(c.status, "ready-for-review", c.problems.join(" | "));
  assert.equal(checkLetter(setSection(l, "a", "FICTIONAL changed wording.", { approvedByLucindha: true })).status, "incomplete");
  assert.equal(checkLetter({ ...l, services: [...l.services, "Payroll"], schedules: { ...l.schedules, Payroll: "x" } }).status, "incomplete");
});

test("engagement letter: a new letter is needed when services are added or terms change; disengagement checklist", () => {
  assert.equal(newLetterNeeded({ previousServices: ["Bookkeeping"], services: ["Bookkeeping"] }).needed, false);
  assert.deepEqual(newLetterNeeded({ previousServices: ["Bookkeeping"], services: ["Bookkeeping", "VAT returns"] }).reasons, ["new services: VAT returns"]);
  assert.equal(newLetterNeeded({ services: [], termsChanged: true }).needed, true);
  assert.equal(disengagementChecklist({}).status, "incomplete");
  assert.equal(disengagementChecklist({ outstandingWork: "FICTIONAL", deadlinesStated: true, newAdviserRequestHandled: true }).status, "ready-for-review");
  assert.equal(disengagementChecklist({}).wording, PLACEHOLDER);
});

// ===================================================== onboarding and AML
const answerAll = (c, present = false) => RED_FLAGS.reduce((x, f) => answerRedFlag(x, f.id, present && f.id === "pep", ME), c);
/** Simulates you confirming every open step (risk = `risk` unless already set). */
function completeAll(c, { risk = "low", date = "2026-11-20", except = [] } = {}) {
  for (let open; (open = applicableSteps(c).filter((s) => !c.steps[s.id] && !except.includes(s.id))).length; ) {
    const s = open[0];
    c = confirmStep(c, s.id, { method: s.id === "risk-assessment" ? risk : s.methods[0], date, by: "Lucindha" });
  }
  return c;
}

test("onboarding: companies get organisation and beneficial-owner checks; individuals don't", () => {
  const ltd = newChecklist({ ref: "ONB-A", clientRef: "CLI-A", clientType: "Limited company" });
  const ind = newChecklist({ ref: "ONB-B", clientRef: "CLI-B", clientType: "Individual" });
  assert.ok(applicableSteps(ltd).some((s) => s.id === "beneficial-owners"));
  assert.ok(!applicableSteps(ind).some((s) => s.id === "beneficial-owners"));
  assert.throws(() => newChecklist({ ref: "x", clientRef: "y", clientType: "Pirate" }), /bad-client-type/);
});

test("onboarding: nothing is ticked automatically; only you confirm steps, using set methods (no document details stored)", () => {
  const c = newChecklist({ ref: "ONB-C", clientRef: "CLI-C", clientType: "Sole trader" });
  assert.throws(() => confirmStep(c, "identity", { method: "original documents seen in person", date: "2026-11-20", by: "automation" }), /only-lucindha/);
  assert.throws(() => confirmStep(c, "identity", { method: "Passport 123456789", date: "2026-11-20", by: "Lucindha" }), /bad-method/);
  const d = confirmStep(c, "identity", { method: "documents seen on video call", date: "2026-11-20", by: "Lucindha" });
  assert.deepEqual(Object.keys(d.steps.identity).sort(), ["date", "method"]);
});

test("onboarding: the checklist never decides; acceptance is refused while anything is open or unanswered", () => {
  let c = newChecklist({ ref: "ONB-D", clientRef: "CLI-D", clientType: "Sole trader" });
  assert.equal(review(c).status, "in-progress");
  assert.throws(() => recordDecision(c, { outcome: "accepted", date: "2026-11-21", by: "Lucindha", confirmedPersonally: true }), /steps-open/);
  c = completeAll(c);
  assert.throws(() => recordDecision(c, { outcome: "accepted", date: "2026-11-21", by: "Lucindha", confirmedPersonally: true }), /unanswered/);
  c = answerAll(c);
  assert.equal(review(c).status, "ready-for-your-decision");
  assert.throws(() => recordDecision(c, { outcome: "accepted", date: "2026-11-21", by: "Lucindha" }), /personally/);
  assert.throws(() => recordDecision(c, { outcome: "accepted", date: "2026-11-21", by: "system", confirmedPersonally: true }), /personally/);
  const ok = recordDecision(c, { outcome: "accepted", date: "2026-11-21", by: "Lucindha", confirmedPersonally: true });
  assert.equal(ok.status, "accepted");
});

test("onboarding: a red flag stops the process; acceptance needs your review plus enhanced due diligence", () => {
  let c = answerAll(newChecklist({ ref: "ONB-E", clientRef: "CLI-E", clientType: "Individual" }), true); // PEP
  assert.ok(applicableSteps(c).some((s) => s.id === "edd"));
  assert.ok(applicableSteps(c).some((s) => s.id === "source-of-funds")); // always for a PEP (reg. 35)
  assert.throws(() => confirmStep(c, "risk-assessment", { method: "low", date: "2026-11-20", by: "Lucindha" }), /cannot-be-low/);
  c = completeAll(c, { risk: "medium" });
  const r = review(c);
  assert.equal(r.status, "stopped-for-review");
  assert.match(r.stop.join(" "), /Nominated Officer outside this tool; record nothing here/);
  assert.throws(() => recordDecision(c, { outcome: "accepted", date: "2026-11-21", by: "Lucindha", confirmedPersonally: true }), /not-reviewed/);
  assert.equal(recordDecision(c, { outcome: "accepted", date: "2026-11-21", by: "Lucindha", confirmedPersonally: true, reviewedRedFlags: true }).status, "accepted");
  assert.equal(recordDecision(newChecklist({ ref: "ONB-F", clientRef: "CLI-F", clientType: "Individual" }), { outcome: "declined", date: "2026-11-21", by: "Lucindha", confirmedPersonally: true }).status, "declined");
});

test("onboarding: ANY raised red flag adds enhanced due diligence and blocks acceptance until done and reviewed", () => {
  let c = newChecklist({ ref: "ONB-H", clientRef: "CLI-H", clientType: "Sole trader" });
  c = RED_FLAGS.reduce((x, f) => answerRedFlag(x, f.id, f.id === "cash-intensive", ME), c);
  assert.ok(applicableSteps(c).some((s) => s.id === "edd"));
  c = completeAll(c, { except: ["edd"] });
  assert.throws(() => recordDecision(c, { outcome: "accepted", date: "2026-11-21", by: "Lucindha", confirmedPersonally: true, reviewedRedFlags: true }), /steps-open/);
  c = confirmStep(c, "edd", { method: "completed", date: "2026-11-20", by: "Lucindha" });
  assert.throws(() => recordDecision(c, { outcome: "accepted", date: "2026-11-21", by: "Lucindha", confirmedPersonally: true }), /not-reviewed/);
  assert.equal(recordDecision(c, { outcome: "accepted", date: "2026-11-21", by: "Lucindha", confirmedPersonally: true, reviewedRedFlags: true }).status, "accepted");
});

test("onboarding: high risk adds source-of-funds and EDD steps; engagement letter must be signed by the decision date", () => {
  let c = answerAll(newChecklist({ ref: "ONB-G", clientRef: "CLI-G", clientType: "Sole trader" }));
  c = confirmStep(c, "risk-assessment", { method: "high", date: "2026-11-20", by: "Lucindha" });
  const ids = applicableSteps(c).map((s) => s.id);
  assert.ok(ids.includes("edd") && ids.includes("source-of-funds"));
  c = completeAll(c);
  assert.equal(c.riskLevel, "high");
  c = confirmStep(c, "engagement-letter", { method: "signed copy held", date: "2026-11-25", by: "Lucindha" });
  assert.throws(() => recordDecision(c, { outcome: "accepted", date: "2026-11-21", by: "Lucindha", confirmedPersonally: true }), /engagement-letter-after-decision/);
});

test("onboarding: suspicious activity reporting is deliberately NOT part of the checklist", () => {
  const src = readFileSync(new URL("../lib/onboarding.mjs", import.meta.url), "utf8");
  assert.ok(!/(sarReport|suspicionNote|reportToNCA|nca\.gov)/i.test(src));
  assert.ok(!RED_FLAGS.some((f) => /suspici/i.test(f.id)));
});

// ===================================================== pipeline
test("pipeline: stages move in order; 'engaged' and 'declined' only by your personal decision", () => {
  let e = newEntry({ ref: "CLI-AAAAAA", enquiryRef: "ENQ-ABCDEF", date: "2026-11-16" });
  e = move(e, "chat-requested", "2026-11-16");
  assert.throws(() => move(e, "engaged", "2026-11-17"), /cannot-move/);
  e = move(move(move(move(e, "chat-offered", "2026-11-17"), "chat-confirmed", "2026-11-18"), "chat-held", "2026-11-21"), "quote-drafted", "2026-11-21");
  e = move(move(move(e, "quote-sent", "2026-11-23"), "letter-sent", "2026-11-25"), "onboarding", "2026-11-26");
  assert.throws(() => move(e, "engaged", "2026-11-30"), /personally/);
  assert.throws(() => move(e, "engaged", "2026-11-30", { by: "Lucindha", confirmedPersonally: true }), /onboarding-checklist-not-accepted/);
  e = move(e, "engaged", "2026-11-30", { by: "Lucindha", confirmedPersonally: true, onboardingStatus: "accepted" });
  assert.throws(() => move(e, "declined", "2026-12-01", { by: "Lucindha", confirmedPersonally: true }), /already-closed/);
  assert.throws(() => move(newEntry({ ref: "CLI-XXXXXX", date: "2026-11-16" }), "chat-requested", "2026-11-10"), /before-current/);
});

test("pipeline: nudges when waiting on the other person, once per stage", () => {
  let e = move(move(newEntry({ ref: "CLI-BBBBBB", date: "2026-11-16" }), "quote-drafted", "2026-11-16"), "quote-sent", "2026-11-16");
  assert.equal(nudgesDue([e], "2026-11-20").length, 0);
  const n = nudgesDue([e], "2026-11-23");
  assert.match(n[0].text, /no progress at "quote-sent" since 2026-11-16/);
  e = markNudged(e, n[0].key, "2026-11-23");
  assert.equal(nudgesDue([e], "2026-11-30").length, 0);
});

test("pipeline: designed for Microsoft Lists with references and dates only", () => {
  assert.ok(LIST_COLUMNS.every((c) => !/name|email|address|phone|note|amount|fee/i.test(c.name)));
  const e = newEntry({ ref: "CLI-CCCCCC", date: "2026-11-16" });
  for (const bad of ["Jane Smith, 07700 900123", "jane@example.com", "CLI-owes £5k"]) assert.throws(() => newEntry({ ref: bad, date: "2026-11-16" }), /reference/);
  assert.throws(() => newEntry({ ref: "CLI-CCCCCC", enquiryRef: "Jane", date: "2026-11-16" }), /reference/);
  assert.throws(() => newEntry({ ref: "CLI-CCCCCC", kind: "owes £5k", date: "2026-11-16" }), /bad-kind/);
  assert.deepEqual(Object.keys(e).sort(), ["enquiryRef", "history", "kind", "nudged", "ref", "since", "stage"]);
});

// ===================================================== booking requests
const T = "2026-11-16"; // Monday

test("booking: slots checked against your published times, notice period, bank holidays, clashes and a daily limit", () => {
  const book = [];
  const ctx = { availability, book, today: T };
  assert.equal(slotProblem({ date: "2026-11-18", time: "19:00" }, ctx), null);
  assert.match(slotProblem({ date: "2026-11-17", time: "19:00" }, ctx), /too soon \(earliest 2026-11-18\)/);
  assert.match(slotProblem({ date: "2026-11-20", time: "19:00" }, ctx), /outside your published times for Fri/);
  assert.match(slotProblem({ date: "2026-11-18", time: "14:00" }, ctx), /outside/);
  assert.equal(slotProblem({ date: "2026-11-21", time: "10:00" }, ctx), null);
  assert.match(slotProblem({ date: "2027-01-30", time: "10:00" }, ctx), /too far/);
  assert.match(slotProblem({ date: "2026-12-28", time: "18:30" }, { ...ctx, today: "2026-12-07" }), /bank holiday/);
  const busy = [{ date: "2026-11-18", time: "18:30", status: "confirmed" }, { date: "2026-11-18", time: "19:30", status: "offered" }];
  assert.match(slotProblem({ date: "2026-11-18", time: "18:30" }, { ...ctx, book: busy }), /already taken/);
  assert.match(slotProblem({ date: "2026-11-18", time: "19:00" }, { ...ctx, book: busy }), /day is full/);
  assert.match(slotProblem({ date: "2026-02-30", time: "19:00" }, ctx), /not a valid date/);
  assert.match(slotProblem({ date: "2026-11-18", time: "7pm" }, ctx), /not a valid time/);
});

test("booking: a request produces a DRAFT offer for you; nothing is booked or confirmed by the code", () => {
  const r = assessRequest({ ref: "BKR-A", slots: [{ date: "2026-11-17", time: "19:00" }, { date: "2026-11-19", time: "19:00" }], communication: "Video call with BSL" }, { availability, book: [], today: T });
  assert.equal(r.outcome, "offer-draft");
  assert.equal(r.hold.status, "proposed");
  assert.match(r.draft, /I can offer Thu 2026-11-19 at 19:00 \(video call with BSL\)/);
  assert.match(r.draft, /reply to let me know if that still suits you/);
  assert.ok(!/confirmed|booked|see you/i.test(r.draft));
  assert.match(r.flags.join(" "), /PROPOSED, not approved/);
});

test("booking: if no requested time works, the draft suggests your next free times instead", () => {
  const r = assessRequest({ ref: "BKR-B", slots: [{ date: "2026-11-20", time: "12:00" }], communication: "Email or text chat" }, { availability, book: [], today: T });
  assert.equal(r.outcome, "alternatives-draft");
  assert.equal(r.alternatives.length, 3);
  assert.deepEqual(r.alternatives[0], { date: "2026-11-18", time: "18:30" });
  assert.equal(r.hold, null);
});

test("booking: tentative holds stop double offers but lapse; only you mark offered, confirmed or released", () => {
  const S = { date: "2026-11-26", time: "19:00" }; // Thu
  let book = [];
  const r1 = assessRequest({ ref: "BKR-C", slots: [S], communication: "Video call" }, { availability, book, today: T });
  assert.equal(r1.outcome, "offer-draft");
  book = [...book, r1.hold];
  const r2 = assessRequest({ ref: "BKR-D", slots: [S], communication: "Video call" }, { availability, book, today: T });
  assert.equal(r2.outcome, "alternatives-draft");
  const r3 = assessRequest({ ref: "BKR-E", slots: [S], communication: "Video call" }, { availability, book, today: "2026-11-20" });
  assert.equal(r3.outcome, "offer-draft"); // BKR-C hold lapsed (not sent within 3 days)
  assert.throws(() => updateBooking(book, "BKR-C", "confirmed", { by: "Lucindha", date: "2026-11-17" }), /cannot-proposed-to-confirmed/);
  assert.throws(() => updateBooking(book, "BKR-C", "offered", { by: "system", date: "2026-11-17" }), /only-lucindha/);
  book = updateBooking(book, "BKR-C", "offered", { by: "Lucindha", date: "2026-11-16" });
  book = updateBooking(book, "BKR-C", "confirmed", { by: "Lucindha", date: "2026-11-17" });
  assert.equal(book[0].status, "confirmed");
  // a confirmed chat never lapses
  assert.equal(assessRequest({ ref: "BKR-H", slots: [S], communication: "Video call" }, { availability, book, today: "2026-11-20" }).outcome, "alternatives-draft");
  book = updateBooking(book, "BKR-C", "cancelled", { by: "Lucindha", date: "2026-11-18" });
  assert.equal(slotProblem(S, { availability, book, today: T }), null);
});

test("booking: missing or unusual communication preference is flagged; face to face needs your decision", () => {
  let r = assessRequest({ ref: "BKR-F", slots: [{ date: "2026-11-19", time: "19:00" }] }, { availability, book: [], today: T });
  assert.match(r.flags.join(" "), /ask how they'd like to communicate/);
  r = assessRequest({ ref: "BKR-G", slots: [{ date: "2026-11-19", time: "19:00" }], communication: "Face to face" }, { availability, book: [], today: T });
  assert.match(r.flags.join(" "), /decide the place/);
});

test("booking: next free slots skip taken and full days", () => {
  const book = [{ date: "2026-11-18", time: "18:30", status: "confirmed" }, { date: "2026-11-18", time: "19:00", status: "confirmed" }];
  const s = nextFreeSlots({ availability, book, today: T });
  assert.ok(s.every((x) => x.date !== "2026-11-18"));
});

// ===================================================== safety and independence
test("all prices and availability are PROPOSED, not approved", () => {
  assert.equal(pricing.approved, false);
  assert.equal(availability.approved, false);
});

test("Stage 4 contains no code that sends, books, deletes or calls out, and imports nothing from other stages", () => {
  for (const dir of ["../lib/", "../tools/"]) {
    for (const f of readdirSync(new URL(dir, import.meta.url))) {
      if (!f.endsWith(".mjs")) continue;
      const src = readFileSync(new URL(dir + f, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
      assert.ok(!/\bfetch\(|https?\.request|sendMail|Mail\.Send|\.delete\(|unlink|rmSync|\brm\(|writeFile|calendar\/events|bookingBusinesses/.test(src), `${f}`);
      assert.ok(!/\brequire\(|globalThis|process\.binding|child_process|\beval\(|new Function/.test(src), `${f} uses a forbidden global`);
      const allowed = dir === "../lib/" ? /^(\.\/[a-z]+\.mjs|node:crypto)$/ : /^(\.\.\/lib\/[a-z]+\.mjs|node:fs)$/;
      for (const m of src.matchAll(/(?:from\s+|import\s*\(?)\s*["']([^"']+)["']/g)) assert.ok(allowed.test(m[1]), `${f} imports ${m[1]}`);
    }
  }
});
