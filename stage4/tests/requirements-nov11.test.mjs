// Regression tests for Lucindha's 11 Nov 2026 decisions and requirements. FICTIONAL data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildQuoteDraft, enterFee, checkQuote, setQuoteSection, approveQuote, quoteStatus, quoteText, QUOTE_SECTIONS, BLANK } from "../lib/quote.mjs";
import { newLetter, setSection, setSchedule, setPracticeFact, approveWording, checkLetter, isFinal, AAT_ITEMS, AAT_SOURCE } from "../lib/engagement.mjs";
import { newChecklist, applicableSteps, confirmStep, answerRedFlag, recordDecision, review, STEPS, RED_FLAGS, monitoringDue, FIRM_PREREQUISITES, MONITORING } from "../lib/onboarding.mjs";
import { assessRequest, updateBooking, expireHolds, slotProblem, holdLapsed } from "../lib/booking.mjs";
import { nudgesDue, newEntry, move } from "../lib/pipeline.mjs";

const pricing = JSON.parse(readFileSync(new URL("../config/proposed-pricing.json", import.meta.url)));
const availability = JSON.parse(readFileSync(new URL("../config/availability.json", import.meta.url)));
const ME = { by: "Lucindha" };
const YES = { approvedByLucindha: true };
const MON = "2026-11-16";
const S = { date: "2026-11-26", time: "19:00" }; // Thursday

// ------------------------------------------------------------------ bookings
test("booking: 24-hour internal hold by default, configurable", () => {
  assert.equal(availability.holdHours, 24);
  const r = assessRequest({ ref: "BKR-AAAAAA", slots: [S], communication: "Video call with BSL" }, { availability, book: [], today: MON, now: `${MON}T09:00:00Z` });
  assert.equal(r.hold.holdUntil, "2026-11-17T09:00:00.000Z");
  assert.equal(holdLapsed(r.hold, "2026-11-17T08:59:00Z"), false);
  assert.equal(holdLapsed(r.hold, "2026-11-17T09:00:00Z"), true);
  const r48 = assessRequest({ ref: "BKR-B", slots: [S], communication: "Video call" }, { availability: { ...availability, holdHours: 48 }, book: [], today: MON, now: `${MON}T09:00:00Z` });
  assert.equal(r48.hold.holdUntil, "2026-11-18T09:00:00.000Z");
});

test("booking: an expired hold releases ONLY the internal hold (nothing declined, sent or put in a calendar)", () => {
  const r = assessRequest({ ref: "BKR-AAAAAA", slots: [S], communication: "Video call" }, { availability, book: [], today: MON, now: `${MON}T09:00:00Z` });
  const { book, released } = expireHolds([r.hold], "2026-11-17T10:00:00Z");
  assert.deepEqual(released, ["BKR-AAAAAA"]);
  assert.equal(book[0].status, "lapsed");
  const { status, lapsedAt, ...rest } = book[0];
  const { status: s0, ...orig } = r.hold;
  assert.deepEqual(rest, orig);
  assert.equal(slotProblem(S, { availability, book, today: "2026-11-17", now: "2026-11-17T10:00:00Z" }), null);
  const src = readFileSync(new URL("../lib/booking.mjs", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  assert.ok(!/declin|sendMail|calendar\/events|\bfetch\(/.test(src.replace(/no enquiry is declined/g, "")));
});

test("booking: no double bookings, no clashes with your diary, no confirmations after the time or after a hold lapses", () => {
  let book = [assessRequest({ ref: "BKR-C", slots: [S], communication: "Video call" }, { availability, book: [], today: MON, now: `${MON}T09:00:00Z` }).hold];
  assert.equal(assessRequest({ ref: "BKR-D", slots: [S], communication: "Video call" }, { availability, book, today: MON, now: `${MON}T10:00:00Z` }).outcome, "alternatives-draft");
  assert.match(slotProblem(S, { availability, book: [], today: MON, busy: [{ date: S.date, from: "18:45", to: "19:15" }] }), /clashes with something else in your diary/);
  assert.equal(slotProblem(S, { availability, book: [], today: MON, busy: [{ date: S.date, from: "19:20", to: "20:00" }] }), null);
  assert.throws(() => updateBooking(book, "BKR-C", "offered", { ...ME, now: "2026-11-18T09:00:00Z" }), /hold-lapsed/);
  book = updateBooking(book, "BKR-C", "offered", { ...ME, now: `${MON}T11:00:00Z` });
  assert.throws(() => updateBooking(book, "BKR-C", "confirmed", { ...ME, confirmedPersonally: true, now: "2026-11-26T19:05:00Z" }), /chat-time-has-passed/);
  const other = [...book, { ref: "BKR-X", ...S, status: "offered" }];
  assert.throws(() => updateBooking(other, "BKR-X", "confirmed", { ...ME, confirmedPersonally: true, now: "2026-11-20T09:00:00Z" }), /already-taken/);
});

test("booking: every confirmed appointment needs your personal approval", () => {
  let book = [assessRequest({ ref: "BKR-E", slots: [S], communication: "Video call" }, { availability, book: [], today: MON, now: `${MON}T09:00:00Z` }).hold];
  book = updateBooking(book, "BKR-E", "offered", { ...ME, now: `${MON}T10:00:00Z` });
  assert.throws(() => updateBooking(book, "BKR-E", "confirmed", { ...ME, now: "2026-11-17T09:00:00Z" }), /personally/);
  assert.throws(() => updateBooking(book, "BKR-E", "confirmed", { by: "system", confirmedPersonally: true, now: "2026-11-17T09:00:00Z" }), /only-lucindha/);
  assert.equal(updateBooking(book, "BKR-E", "confirmed", { ...ME, confirmedPersonally: true, now: "2026-11-17T09:00:00Z" })[0].status, "confirmed");
});

test("booking: chat times respect British Summer Time", () => {
  const book = [{ ref: "BKR-S", date: "2027-04-01", time: "19:00", status: "offered" }]; // 19:00 BST = 18:00 UTC
  assert.throws(() => updateBooking(book, "BKR-S", "confirmed", { ...ME, confirmedPersonally: true, now: "2027-04-01T18:10:00Z" }), /passed/);
  assert.equal(updateBooking(book, "BKR-S", "confirmed", { ...ME, confirmedPersonally: true, now: "2027-04-01T17:50:00Z" })[0].status, "confirmed");
});

test("booking: accessible communication preferences kept: BSL, captions, written, deafblind", () => {
  for (const c of ["Email or text chat (written)", "Video call with BSL", "Video call with live captions"]) assert.ok(availability.communication.includes(c), c);
  assert.ok(availability.communication.some((c) => /Deafblind/.test(c)));
  const r = assessRequest({ ref: "BKR-F", slots: [S], communication: availability.communication.find((c) => /Deafblind/.test(c)) }, { availability, book: [], today: MON, now: `${MON}T09:00:00Z` });
  assert.match(r.flags.join(" "), /Deafblind access: ask what works/);
  assert.match(r.draft, /If you need anything to make the chat accessible/);
  assert.throws(() => assessRequest({ ref: "BKR-G", slots: [S] }, { availability, book: [], today: MON }), /now-required/);
});

// ------------------------------------------------------------------ quotes
function readyQuote() {
  let q = buildQuoteDraft({ ref: "QTE-QQQQQQ", clientType: "Limited company", services: ["Year-end accounts", "Corporation tax returns"] }, pricing);
  q = enterFee(q, "bundle:ye-ct", 95000);
  for (const s of QUOTE_SECTIONS) q = setQuoteSection(q, s.key, `FICTIONAL ${s.key}.`, YES);
  return q;
}

test("quotes: valid for 30 days from the date you approve it, with the expiry date shown", () => {
  assert.equal(pricing.quoteValidityDays, 30);
  const q = approveQuote(readyQuote(), { by: "Lucindha", confirmedPersonally: true, issueDate: "2026-11-20", today: "2026-11-20" });
  assert.equal(q.validUntil, "2026-12-20");
  assert.match(quoteText(q), /Issued 2026-11-20\. Valid until 2026-12-20 \(30 days\)/);
  assert.equal(quoteStatus(q, "2026-12-20"), "approved");
  assert.equal(quoteStatus(q, "2026-12-21"), "expired");
  assert.match(quoteText(readyQuote()), /Valid for 30 days from the date you approve and issue it/);
});

test("quotes: you approve every fee and quote; any later change withdraws approval", () => {
  assert.throws(() => approveQuote(buildQuoteDraft({ ref: "QTE-X", clientType: "Individual", services: ["Personal tax"] }, pricing), { by: "Lucindha", confirmedPersonally: true, issueDate: "2026-11-20", today: "2026-11-20" }), /incomplete/);
  assert.throws(() => approveQuote(readyQuote(), { by: "system", confirmedPersonally: true, issueDate: "2026-11-20", today: "2026-11-20" }), /personally/);
  let q = approveQuote(readyQuote(), { by: "Lucindha", confirmedPersonally: true, issueDate: "2026-11-20", today: "2026-11-20" });
  q = enterFee(q, "bundle:ye-ct", 99000);
  assert.equal(q.status, "draft");
  assert.equal(q.validUntil, null);
  const d = buildQuoteDraft({ ref: "QTE-Y", clientType: "Sole trader", services: ["Bookkeeping"] }, pricing);
  assert.match(quoteText(d), new RegExp(BLANK.replace(/[[\]]/g, "\\$&")));
  assert.match(quoteText(d), /Scope: \[NEEDS YOUR WORDING\]/);
});

test("quotes: £850 for year-end accounts and Corporation Tax shown once; payroll and regulated services excluded", () => {
  const q = buildQuoteDraft({ ref: "QTE-Z", clientType: "Limited company", services: ["Year-end accounts", "Corporation tax returns", "Payroll"], requestText: "FICTIONAL. Also pension advice please" }, pricing);
  assert.equal(quoteText(q).match(/£850/g).length, 1);
  assert.ok(!q.lines.some((l) => /payroll/i.test(l.label)));
  assert.match(q.flags.join(" "), /Payroll is excluded from your approved services unless you separately authorise it/);
  assert.match(q.flags.join(" "), /pension.*AAT licence doesn't authorise investment work/);
  assert.ok(!Object.keys(pricing.services).some((k) => /payroll/i.test(k)));
});

// ------------------------------------------------------------------ engagement letters
function letter() {
  let l = newLetter({ ref: "ENG-LLLLLL", clientRef: "CLI-LLLLLL", services: ["Bookkeeping", "VAT returns"], licensedServices: Object.keys(pricing.services) });
  for (const i of AAT_ITEMS) l = setSection(l, i.id, `FICTIONAL wording for ${i.id}.`, YES);
  for (const [id, t] of [["k", "FICTIONAL. The AAT licence does not authorise investment work."], ["l", "FICTIONAL. Money Laundering Regulations duties."], ["m", "FICTIONAL. Registered with the Information Commissioner."], ["o", "FICTIONAL. Complaints may go to AAT."], ["p", "FICTIONAL. Our alternate is named here."]]) l = setSection(l, id, t, YES);
  for (const k of ["icoRegistration", "piiInsurer", "continuityAlternate", "vatStatus", "piiTerritorialCoverage"]) l = setPracticeFact(l, k, "FICTIONAL", YES);
  return l;
}

test("engagement letters: (a)-(p) checked against AAT's current Client Care Policy; key items checked", () => {
  assert.match(AAT_SOURCE, /version 1.*1 July 2025/);
  assert.equal(AAT_ITEMS.map((i) => i.id).join(""), "abcdefghijklmnop");
  assert.match(AAT_ITEMS.find((i) => i.id === "l").covers, /suspicious activity reporting/);
  let l = letter();
  for (const [id, re] of [["l", /\(l\) must/], ["m", /\(m\) must/], ["p", /\(p\) must/]]) {
    const bad = { ...l, sections: { ...l.sections, [id]: "FICTIONAL. Something else entirely." } };
    assert.match(checkLetter(bad).problems.join(" "), re);
  }
});

test("engagement letters: every service schedule reviewed; never final while incomplete or unapproved; re-approval after every change", () => {
  let l = letter();
  assert.match(checkLetter(l).problems.join(" "), /Scope schedule for "Bookkeeping"/);
  l = setSchedule(l, "Bookkeeping", "FICTIONAL bookkeeping scope.", YES);
  assert.throws(() => approveWording(l, { by: "Lucindha", confirmedPersonally: true }), /incomplete/);
  l = setSchedule(l, "VAT returns", "FICTIONAL VAT scope.", YES);
  assert.equal(isFinal(l), false);
  l = approveWording(l, { by: "Lucindha", confirmedPersonally: true });
  assert.equal(isFinal(l), true);
  l = setSchedule(l, "VAT returns", "FICTIONAL changed VAT scope.", YES);
  assert.equal(isFinal(l), false);
  assert.equal(isFinal({ ...l, wordingApproved: true, sections: { ...l.sections, a: "[AAT SAMPLE WORDING NOT SUPPLIED OR APPROVED]" } }), false);
});

// ------------------------------------------------------------------ AML and onboarding
const flags = (c, yes = []) => RED_FLAGS.reduce((x, f) => answerRedFlag(x, f.id, yes.includes(f.id), ME), c);
function finish(c, risk = "low") {
  for (let o; (o = applicableSteps(c).filter((s) => !c.steps[s.id])).length; ) c = confirmStep(c, o[0].id, { method: o[0].id === "risk-assessment" ? risk : o[0].methods[0], date: "2026-11-20", by: "Lucindha" });
  return c;
}

test("AML: PEP checks and sanctions screening are separate; sanctions against the UK Sanctions List", () => {
  const ids = STEPS.map((s) => s.id);
  assert.ok(ids.includes("pep-check") && ids.includes("sanctions-check") && !ids.includes("pep-sanctions"));
  assert.match(STEPS.find((s) => s.id === "sanctions-check").title, /UK Sanctions List \(FCDO/);
  assert.ok(!JSON.stringify(STEPS).includes("OFSI Consolidated"));
  for (const id of ["identity", "address", "entity", "beneficial-owners", "risk-assessment", "edd", "source-of-funds", "monitoring-date"]) assert.ok(ids.includes(id), id);
});

test("AML: a possible sanctions match stops everything; acceptance is impossible here", () => {
  let c = finish(flags(newChecklist({ ref: "ONB-S", clientRef: "CLI-S", clientType: "Individual" }), ["sanctions-match"]), "high");
  assert.match(review(c).stop.join(" "), /do NOT proceed.*OFSI/);
  assert.throws(() => recordDecision(c, { outcome: "accepted", date: "2026-11-21", ...ME, confirmedPersonally: true, reviewedRedFlags: true }), /sanctions-match/);
  assert.equal(recordDecision(c, { outcome: "declined", date: "2026-11-21", ...ME, confirmedPersonally: true }).status, "declined");
});

test("AML: identity checks are manual and risk-based; no paid electronic provider without approval", () => {
  const id = STEPS.find((s) => s.id === "identity");
  assert.ok(!id.methods.some((m) => /electronic/i.test(m)));
  const c = newChecklist({ ref: "ONB-I", clientRef: "CLI-I", clientType: "Individual" });
  assert.throws(() => confirmStep(c, "identity", { method: "electronic ID check (provider to be chosen)", date: "2026-11-20", by: "Lucindha" }), /bad-method/);
});

test("AML: supports your firm-wide policies; you keep responsibility; nobody accepted with checks open", () => {
  assert.ok(FIRM_PREREQUISITES.some((p) => /reg\. 18/.test(p)) && FIRM_PREREQUISITES.some((p) => /Nominated Officer/.test(p)));
  const c = flags(newChecklist({ ref: "ONB-P", clientRef: "CLI-P", clientType: "Limited company" }));
  assert.match(review(c).notes.join(" "), /supports your firm-wide risk assessment.*doesn't replace them/);
  assert.match(review(c).notes.join(" "), /your professional judgement/);
  assert.throws(() => recordDecision(c, { outcome: "accepted", date: "2026-11-21", ...ME, confirmedPersonally: true }), /steps-open/);
  assert.ok(applicableSteps(c).some((s) => s.id === "register-discrepancy"));
});

test("AML: ongoing monitoring reminders by risk level (intervals PROPOSED)", () => {
  assert.equal(MONITORING.approved, false);
  let c = finish(flags(newChecklist({ ref: "ONB-M", clientRef: "CLI-M", clientType: "Individual" })), "medium");
  c = recordDecision(c, { outcome: "accepted", date: "2026-11-21", ...ME, confirmedPersonally: true });
  assert.equal(monitoringDue([c], "2028-11-20").length, 0);
  assert.match(monitoringDue([c], "2028-11-21")[0].text, /due 2028-11-21 \(medium risk\).*sanctions and PEP/);
});

test("AML: suspicious activity is never recorded in the automation", () => {
  const src = readFileSync(new URL("../lib/onboarding.mjs", import.meta.url), "utf8");
  assert.ok(!/(sarReport|suspicionNote|reportToNCA|nca\.gov|suspicionText)/i.test(src));
  assert.ok(STEPS.every((s) => !/suspici/i.test(s.id)));
});

// ------------------------------------------------------------------ pipeline
test("pipeline: reference-only; no Microsoft Lists or SharePoint connection; reminders only", () => {
  for (const dir of ["../lib/", "../tools/"]) for (const f of readdirSync(new URL(dir, import.meta.url))) {
    const src = readFileSync(new URL(dir + f, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    assert.ok(!/graph\.microsoft\.com|sharepoint\.com|\/_api\/|\/lists\/[^"']*\/items|@microsoft\/microsoft-graph/i.test(src), f);
  }
  let e = move(newEntry({ ref: "CLI-NNNNNN", date: MON }), "chat-requested", MON);
  e = move(e, "chat-offered", MON);
  const n = nudgesDue([e], "2026-11-19");
  assert.match(n[0].text, /Decide whether to follow up/);
  assert.deepEqual(Object.keys(n[0]).sort(), ["key", "ref", "since", "stage", "text"]);
});

// ------------------------------------------------------------------ second independent review (11 Nov)
test("review 2-M8: unreadable diary entries are never ignored; slot length from config; hold hours must be set", () => {
  const ctx = { availability, book: [], today: MON };
  for (const b of [{ date: S.date, from: "18:00", to: "21:00:00" }, { date: S.date, from: "9:00", to: "20:00" }, { date: S.date, from: "18:00", to: "24:00" }, { date: "26/11/2026", from: "18:00", to: "20:00" }, null])
    assert.match(slotProblem(S, { ...ctx, busy: [b] }), /couldn't be read/, JSON.stringify(b));
  assert.match(slotProblem(S, { ...ctx, busy: [{ date: S.date, allDay: true }] }), /clashes/);
  assert.equal(slotProblem(S, { ...ctx, busy: [{ date: "2026-11-27", from: "9:00", to: "x" }] }), null); // other days don't matter
  assert.match(slotProblem({ date: S.date, time: "19:30" }, { ...ctx, availability: { ...availability, slotMinutes: 45 }, book: [{ ref: "BKR-Z", ...S, status: "confirmed" }] }), /already taken/);
  const { holdHours, ...noHold } = availability;
  assert.throws(() => assessRequest({ ref: "BKR-H", slots: [S], communication: "Video call" }, { availability: noHold, book: [], today: MON, now: `${MON}T09:00:00Z` }), /hold-hours-not-set/);
});

test("review 2-M9: approvals are tied to the exact content approved", () => {
  const q = approveQuote(readyQuote(), { by: "Lucindha", confirmedPersonally: true, issueDate: "2026-11-20", today: "2026-11-20" });
  assert.equal(quoteStatus(q, "2026-11-21"), "approved");
  assert.equal(quoteStatus({ ...q, lines: q.lines.map((l) => ({ ...l, feePence: 1 })) }, "2026-11-21"), "changed-since-approval");
  assert.equal(quoteStatus({ ...q, validUntil: "2099-01-01" }, "2026-11-21"), "changed-since-approval");
  assert.equal(quoteStatus({ ...readyQuote(), status: "approved", validUntil: "2099-01-01" }, "2026-11-21"), "changed-since-approval");
  assert.throws(() => approveQuote(readyQuote(), { by: "Lucindha", confirmedPersonally: true, issueDate: "2026-11-01", today: "2026-11-20" }), /past/);
  let l = letter();
  l = setSchedule(setSchedule(l, "Bookkeeping", "FICTIONAL.", YES), "VAT returns", "FICTIONAL.", YES);
  l = approveWording(l, { by: "Lucindha", confirmedPersonally: true });
  assert.equal(isFinal(l), true);
  assert.equal(isFinal({ ...l, sections: { ...l.sections, g: "FICTIONAL. Different fees wording." } }), false);
  assert.equal(isFinal({ ...l, services: [...l.services, "Start-up support"], schedules: { ...l.schedules, "Start-up support": "x" } }), false);
  const c = finish(flags(newChecklist({ ref: "ONB-F", clientRef: "CLI-F", clientType: "Individual" })), "high");
  assert.throws(() => recordDecision({ ...c, riskLevel: "low", steps: Object.fromEntries(Object.entries(c.steps).filter(([k]) => !["edd", "source-of-funds"].includes(k))) }, { outcome: "accepted", date: "2026-11-21", ...ME, confirmedPersonally: true }), /not-well-formed/);
});

test("review 2-low: payroll in free text, investigate vs invest, insolvency and probate", () => {
  const f = (t) => buildQuoteDraft({ ref: "QTE-L", clientType: "Sole trader", services: ["Bookkeeping"], requestText: t }, pricing).flags.join(" ");
  assert.match(f("FICTIONAL. Could you do my payroll too?"), /Payroll is excluded/);
  assert.doesNotMatch(f("FICTIONAL. Please investigate my VAT error"), /investment/);
  assert.match(f("FICTIONAL. Help with insolvency"), /insolvency practitioner/);
  assert.match(f("FICTIONAL. Mum's probate"), /reserved legal activity/);
  const q = setQuoteSection(readyQuote(), "assumptions", "FICTIONAL. You agree to do your own invoicing.", YES);
  assert.equal(q.sections.assumptions, "FICTIONAL. You agree to do your own invoicing.");
});

test("review 2-low: no electronic address check; PEP monitoring is enhanced; month-end dates handled", () => {
  assert.ok(!STEPS.find((s) => s.id === "address").methods.some((m) => /electronic/i.test(m)));
  let c = finish(flags(newChecklist({ ref: "ONB-PEP", clientRef: "CLI-PEP", clientType: "Individual" }), ["pep"]), "medium");
  c = recordDecision(c, { outcome: "accepted", date: "2028-02-29", ...ME, confirmedPersonally: true, reviewedRedFlags: true });
  assert.equal(monitoringDue([c], "2029-02-27").length, 0);
  assert.match(monitoringDue([c], "2029-02-28")[0].text, /due 2029-02-28/);
});
