// Regression tests for the safeguards approved on 11 Nov 2026 (second set): manual privacy check,
// weekly and monthly manual reviews, "part answered", legal deadline vs internal target, data
// protection complaints under the 5-working-day policy, any-channel receipt dates. FICTIONAL data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { memoryStore, message, SECRET } from "./helpers.mjs";
import { intake, logCase, recordEvent as raw, dailyCaseCheck, getCase, deadlinesFor, CHANNELS } from "../lib/cases.mjs";
import { privacyRequestDeadlines } from "../lib/deadlines.mjs";
import { weeklyReview, monthlySample, WEEKLY_PLACES } from "../lib/reviews.mjs";
import { buildHealthReport } from "../lib/health.mjs";

const T = Date.parse("2026-11-16T12:00:00Z");
const ok = async () => ({ delivered: true });
const deps = () => ({ store: memoryStore(), secret: SECRET, now: T, notify: ok });
const ev = (ref, e, date, x, value = null) => raw(ref, e, date, { ...x, value, now: Date.parse("2027-06-01T12:00:00Z") });
const subjects = (n) => n.map((m) => m.subject.split(" · ")[0]);

test("manual privacy check: every new complaint and media case asks for one, and keeps reminding until done", async () => {
  const x = deps();
  for (const mailbox of ["complaints@lucindhalawson.co.uk", "media@lucindhalawson.co.uk"]) {
    const r = await intake(message({ mailbox, bodyText: "FICTIONAL. Nothing about data here at all." }), x);
    assert.match(r.notices[0].message, /PRIVACY CHECK NEEDED/);
  }
  const s1 = subjects(await dailyCaseCheck({ ...x, today: "2026-11-16" }));
  assert.equal(s1.filter((s) => /Privacy check/.test(s)).length, 2);
  const late = subjects(await dailyCaseCheck({ ...x, today: "2026-11-19" }));
  assert.ok(late.some((s) => /OVERDUE: Privacy check/.test(s)));
  const privacyCase = await intake(message({ mailbox: "privacy@lucindhalawson.co.uk" }), x);
  await assert.rejects(ev(privacyCase.refs[0], "privacy-check-done", "2026-11-16", x, "none-found"), /complaint-and-media/);
});

test("manual privacy check: recording it stops the reminders; a request found is logged from its ORIGINAL receipt date", async () => {
  const x = deps();
  const r = await intake(message({ receivedAt: "2026-11-16T10:00:00Z" }), x);
  await assert.rejects(ev(r.refs[0], "privacy-check-done", "2026-11-17", x), /value-required/);
  await ev(r.refs[0], "privacy-check-done", "2026-11-17", x, "privacy-case-logged");
  const p = await logCase({ type: "privacy", channel: "other-mailbox", received: "2026-11-16", rights: ["erasure"] }, x);
  assert.equal(deadlinesFor(p).due, "2026-12-16");
  const s = subjects(await dailyCaseCheck({ ...x, today: "2026-11-25" }));
  assert.ok(!s.some((t) => /Privacy check/.test(t)));
  assert.ok(s.some((t) => /Acknowledge in writing/.test(t))); // positive control: the check still runs
});

test("any channel: WhatsApp, social media, post, calls are logged with the date they first arrived", async () => {
  const x = deps();
  assert.ok(CHANNELS.includes("whatsapp") && CHANNELS.includes("social-media") && CHANNELS.includes("letter"));
  const w = await logCase({ type: "privacy", channel: "whatsapp", received: "2026-11-02", rights: ["access"] }, x);
  assert.equal(deadlinesFor(w).due, "2026-12-02");
  const c = await logCase({ type: "complaint", channel: "social-media", received: "2026-11-09" }, x);
  assert.equal(deadlinesFor(c).ackDue, "2026-11-16");
});

test("weekly manual review covers hello@, WhatsApp, social media and post; it's a backstop, not a substitute", () => {
  for (const id of ["hello", "whatsapp", "social", "post"]) assert.ok(WEEKLY_PLACES.some((p) => p.id === id), id);
  const part = weeklyReview({ weekOf: "2026-11-16", done: { hello: "checked", whatsapp: "checked" } });
  assert.equal(part.complete, false);
  assert.match(part.text, /not a substitute for checking messages promptly/);
  const all = weeklyReview({ weekOf: "2026-11-16", done: Object.fromEntries(WEEKLY_PLACES.map((p) => [p.id, "checked"])), found: 1 });
  assert.equal(all.complete, true);
  assert.deepEqual(Object.keys(all.audit).sort(), ["checked", "complete", "found", "weekOf"]);
});

test("monthly sample: closed complaint and media cases from that month, chosen by a fixed scramble", () => {
  const cases = [
    { ref: "CMP-AAAAAA", type: "complaint", status: "closed", received: "2026-11-03" },
    { ref: "CMP-BBBBBB", type: "complaint", status: "responded", received: "2026-11-10" },
    { ref: "MED-CCCCCC", type: "media", status: "closed", received: "2026-11-20" },
    { ref: "MED-DDDDDD", type: "media", status: "closed", received: "2026-11-21" },
    { ref: "CMP-EEEEEE", type: "complaint", status: "open", received: "2026-11-04" },
    { ref: "DSR-FFFFFF", type: "privacy", status: "closed", received: "2026-11-04" },
    { ref: "CMP-GGGGGG", type: "complaint", status: "closed", received: "2026-10-30" },
  ];
  const s = monthlySample(cases, { month: "2026-11" });
  assert.equal(s.length, 3);
  assert.ok(s.every((r) => !["CMP-EEEEEE", "DSR-FFFFFF", "CMP-GGGGGG"].includes(r)));
  assert.deepEqual(monthlySample(cases, { month: "2026-11" }), s);
  assert.throws(() => monthlySample(cases, { month: "November" }), /bad-month/);
});

test("health report needs the manual review dates; an overdue weekly review needs action", () => {
  const base = {
    asOf: "2026-11-16", deploys: [{ site: "s", state: "ready", date: "2026-11-15" }], functions: [{ site: "s", name: "f", calls: 1, errors: 0 }],
    tasks: [{ name: "t", lastRun: "2026-11-16", status: "succeeded", expectedEveryDays: 1 }], reconciliation: [{ stage: "S1", received: 1, processed: 1 }],
    reminders: { attempted: 0, confirmed: 0 }, credentials: [{ what: "c", expires: "2027-05-10" }], formSubmissions7d: 1,
  };
  assert.equal(buildHealthReport(base).overall, "bad");
  assert.equal(buildHealthReport({ ...base, manualReviews: { weekly: { weekOf: "2026-11-13", complete: true, checked: [] }, monthlySampleLastDone: "2026-11-02" } }).overall, "ok");
  const r = buildHealthReport({ ...base, manualReviews: { weekly: { weekOf: "2026-11-01", complete: true, checked: [] }, monthlySampleLastDone: "2026-11-02" } });
  assert.equal(r.overall, "bad");
  assert.match(r.text, /Weekly manual review last done 2026-11-01/);
});

test("part answered: each right keeps its own deadline and status; one part never closes the case", async () => {
  const x = deps();
  const c = await logCase({ type: "privacy", channel: "letter", received: "2026-11-16", rights: ["access", "rectification"] }, x);
  await ev(c.ref, "clarification-requested", "2026-11-18", x, "large-volume");
  await ev(c.ref, "clarification-received", "2026-11-27", x);
  let d = deadlinesFor(await getCase(x.store, c.ref));
  assert.deepEqual(d.perRight, { access: "2026-12-29", rectification: "2026-12-16" });
  await ev(c.ref, "part-answered", "2026-12-10", x, "rectification");
  let k = await getCase(x.store, c.ref);
  assert.equal(k.status, "open");
  d = deadlinesFor(k);
  assert.deepEqual(d.perRight, { access: "2026-12-29", rectification: "answered" });
  assert.equal(d.due, "2026-12-29");
  await assert.rejects(ev(c.ref, "responded", "2026-12-11", x), /answer-each-part-first:access/);
  await assert.rejects(ev(c.ref, "part-answered", "2026-12-11", x, "rectification"), /already-answered/);
  await assert.rejects(ev(c.ref, "part-answered", "2026-12-11", x, "erasure"), /right-not-on-this-case/);
  await ev(c.ref, "part-answered", "2026-12-20", x, "access");
  k = await getCase(x.store, c.ref);
  assert.equal(deadlinesFor(k).status, "all-parts-answered");
  assert.ok(!(await dailyCaseCheck({ ...x, today: "2026-12-30" })).some((n) => /Send the full response/.test(n.subject)));
  await ev(c.ref, "responded", "2026-12-21", x);
  assert.equal((await getCase(x.store, c.ref)).status, "responded");
});

test("legal deadline vs internal target: weekends and bank holidays roll forward legally; internal target never later than the calendar date", () => {
  const d = privacyRequestDeadlines({ received: "2027-01-31", rights: ["access"] }); // 28 Feb 2027 is a Sunday
  assert.equal(d.due, "2027-03-01");
  assert.equal(d.internalTarget, "2027-02-26");
  const n = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"] });
  assert.equal(n.due, "2026-12-16");
  assert.equal(n.internalTarget, "2026-12-16");
  assert.equal(n.uncertain.length, 0);
});

test("extended deadlines follow ICO (three calendar months); a differing reading is flagged for manual review", async () => {
  const d = privacyRequestDeadlines({ received: "2027-01-31", rights: ["access"], extended: true, extensionNotified: "2027-02-10" });
  assert.equal(d.due, "2027-04-30");
  assert.equal(d.internalTarget, "2027-04-28");
  assert.equal(d.uncertain.length, 1);
  const same = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], extended: true, extensionNotified: "2026-11-20" });
  assert.equal(same.due, "2027-02-16");
  assert.equal(same.uncertain.length, 0);
  const x = deps();
  const c = await logCase({ type: "privacy", channel: "letter", received: "2027-01-31", rights: ["access"] }, { ...x, now: Date.parse("2027-02-01T12:00:00Z") });
  await ev(c.ref, "extended", "2027-02-10", x);
  await ev(c.ref, "extension-notified", "2027-02-10", x);
  const s = subjects(await dailyCaseCheck({ ...x, today: "2027-02-11" }));
  assert.ok(s.some((t) => /Check the deadline calculation yourself/.test(t)));
  await ev(c.ref, "deadline-checked", "2027-02-11", x);
  assert.ok(!subjects(await dailyCaseCheck({ ...x, today: "2027-02-15" })).some((t) => /Check the deadline/.test(t)));
});

test("data protection complaints follow your 5-working-day acknowledgement and 4-week response, with progress updates", async () => {
  const x = deps();
  const r = await intake(message({ mailbox: "privacy@lucindhalawson.co.uk", bodyText: "FICTIONAL. I want to complain about how you shared my data." }), x);
  assert.match(r.notices[0].message, /your 5-working-day policy; legal limit 2026-12-16.*ICO/);
  assert.ok(subjects(await dailyCaseCheck({ ...x, today: "2026-11-23" })).some((s) => /DUE TODAY: Acknowledge the data protection complaint/.test(s)));
  await ev(r.refs[0], "acknowledged", "2026-11-23", x);
  assert.ok(subjects(await dailyCaseCheck({ ...x, today: "2026-12-21" })).some((s) => /DUE TODAY: Send the outcome of the data protection complaint, or a progress update/.test(s)));
  await ev(r.refs[0], "progress-update-sent", "2026-12-21", x);
  const after = subjects(await dailyCaseCheck({ ...x, today: "2027-01-14" }));
  assert.ok(!after.some((s) => /OVERDUE: Send the outcome/.test(s)));
  assert.ok(after.some((s) => /Reminder: Send the outcome/.test(s))); // positive control: approaching 18 Jan
  assert.ok(subjects(await dailyCaseCheck({ ...x, today: "2027-01-18" })).some((s) => /DUE TODAY: Send the outcome/.test(s))); // 4 weeks after the update
});

test("no message content goes to an AI provider from any Stage 3 module", () => {
  for (const f of ["cases.mjs", "rights.mjs", "reviews.mjs", "deadlines.mjs", "health.mjs", "retention.mjs"]) {
    const src = readFileSync(new URL(`../lib/${f}`, import.meta.url), "utf8");
    assert.ok(!/anthropic|openai|api\.claude|messages\.create|\bfetch\(/i.test(src.replace(/\/\/.*$/gm, "")), f);
  }
});

// ------------------------------------------------------------------ third independent review (11 Nov)
test("review 3-M1/M2: 'closed' can't skip open parts; complaint and media cases can't close before the privacy check", async () => {
  const x = deps();
  const c = await logCase({ type: "privacy", channel: "letter", received: "2026-11-16", rights: ["access", "erasure"] }, x);
  await ev(c.ref, "part-answered", "2026-11-20", x, "erasure");
  await assert.rejects(ev(c.ref, "closed", "2026-11-21", x), /answer-each-part-first:access/);
  const m = await intake(message({ mailbox: "media@lucindhalawson.co.uk" }), x);
  await assert.rejects(ev(m.refs[0], "closed", "2026-11-17", x), /privacy-check-first/);
  await assert.rejects(ev(m.refs[0], "responded", "2026-11-17", x), /privacy-check-first/);
  await ev(m.refs[0], "privacy-check-done", "2026-11-17", x, "none-found");
  await ev(m.refs[0], "closed", "2026-11-17", x);
});

test("review 3-M3/L1: the deadline check only counts after the extension notice; the notice target is the calendar date", async () => {
  const x = deps();
  const c = await logCase({ type: "privacy", channel: "letter", received: "2026-10-31", rights: ["erasure"] }, { ...x, now: Date.parse("2026-11-01T12:00:00Z") });
  await ev(c.ref, "deadline-checked", "2026-11-01", x);
  await ev(c.ref, "extended", "2026-11-20", x);
  await ev(c.ref, "extension-notified", "2026-11-20", x);
  const k = await getCase(x.store, c.ref);
  assert.equal(deadlinesFor(k).uncertain.length, 1);
  const s = subjects(await dailyCaseCheck({ ...x, today: "2026-11-20" }));
  assert.ok(s.some((t) => /Reminder: Check the deadline calculation/.test(t)), s.join("|")); // dated from the notice, not overdue
  const d = privacyRequestDeadlines({ received: "2027-01-31", rights: ["access"], extended: true });
  assert.equal(d.extensionNoticeTarget, "2027-02-26");
  assert.equal(d.extensionNoticeBy, "2027-03-01");
  const late = privacyRequestDeadlines({ received: "2027-01-31", rights: ["access"], extended: true, extensionNotified: "2027-03-01" });
  assert.match(late.uncertain.join(" "), /within the next-working-day allowance/);
});

test("review 3-M4/L4: future or incomplete weekly reviews aren't healthy; the sample size can't be changed", async () => {
  const { manualReviewStatus, monthlySample: ms } = await import("../lib/reviews.mjs");
  const lv = (o) => manualReviewStatus({ asOf: "2026-11-16", monthlySampleLastDone: "2026-11-02", ...o })[0].level;
  assert.equal(lv({ weekly: { weekOf: "2099-01-01", complete: true } }), "bad");
  assert.equal(lv({ weekly: { weekOf: "2026-11-13", complete: false } }), "bad");
  assert.equal(lv({ weekly: { weekOf: "2026-11-13", complete: "yes" } }), "bad");
  assert.equal(lv({ weekly: { weekOf: "2026-11-13", complete: true } }), "ok");
  assert.equal(manualReviewStatus({ asOf: "2026-11-16", weekly: { weekOf: "2026-11-13", complete: true }, monthlySampleLastDone: "2099-01-01" })[1].level, "warn");
  const cases = ["A", "B", "C", "D", "E"].map((l) => ({ ref: `CMP-${l.repeat(6)}`, type: "complaint", status: "closed", received: "2026-11-03" }));
  assert.equal(ms(cases, { month: "2026-11", n: 0 }).length, 3);
  assert.equal(ms(cases, { month: "2026-11", n: 5 }).length, 3);
});
