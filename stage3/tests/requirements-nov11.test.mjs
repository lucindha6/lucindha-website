// Regression tests for Lucindha's 11 Nov 2026 requirements (privacy rights, deadline adjustments,
// complaints escalation and delivery, manual monthly retention review, health reconciliation).
// FICTIONAL data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { memoryStore, message, SECRET } from "./helpers.mjs";
import { intake, logCase, recordEvent as rawRecordEvent, dailyCaseCheck, getCase, looksLikePrivacyRequest, privacyLabels, deadlinesFor, confirmed } from "../lib/cases.mjs";
import { privacyRequestDeadlines } from "../lib/deadlines.mjs";
import { classifyRights, RIGHTS } from "../lib/rights.mjs";
import { monthlyReview, recordManualDeletion, SCHEDULE, OUTSIDE_NETLIFY } from "../lib/retention.mjs";
import { buildHealthReport } from "../lib/health.mjs";

const T = Date.parse("2026-11-16T12:00:00Z");
const ok = async () => ({ delivered: true });
const deps = () => ({ store: memoryStore(), secret: SECRET, now: T, notify: ok });
const recordEvent = (ref, ev, date, x) => rawRecordEvent(ref, ev, date, { ...x, now: Date.parse("2027-06-01T12:00:00Z") });
const P = "privacy@lucindhalawson.co.uk";

// ------------------------------------------------------------------ rights
test("rights: each data protection right is told apart, including unusual wording", () => {
  const cases = {
    access: ["What do you have on file about me?", "Please send me everything you've got on me", "I'd like a copy of all my records"],
    rectification: ["My details are wrong on your system", "Please correct my address", "You've got my surname wrong"],
    erasure: ["Please wipe my details", "Take me off your system", "Forget me please", "delete all my data", "please take her off your system", "delete his records"],
    restriction: ["Please restrict the use of my information while you check"],
    objection: ["I object to you using my data for this", "Stop processing my personal data"],
    "direct-marketing-objection": ["Stop sending me marketing", "Unsubscribe me", "Please remove me from your mailing list"],
    portability: ["I want to transfer my data to another accountant (data portability)"],
    "consent-withdrawal": ["I withdraw my consent"],
    "dp-complaint": ["I want to complain about how you shared my data", "You leaked my information to someone else"],
  };
  for (const [right, texts] of Object.entries(cases)) for (const t of texts) assert.ok(classifyRights(`FICTIONAL. ${t}`).rights.includes(right), `${right}: ${t}`);
  assert.deepEqual(classifyRights("FICTIONAL. Stop sending me marketing").rights, ["direct-marketing-objection"]);
  for (const k of Object.keys(RIGHTS)) assert.ok(RIGHTS[k].article && RIGHTS[k].exemptions.length, k);
});

test("rights: ambiguous or complex requests go to you for manual review", () => {
  assert.ok(classifyRights("FICTIONAL. Send me a copy of my data and then delete all my data").review.includes("more-than-one-right"));
  assert.ok(classifyRights("FICTIONAL. I am writing on behalf of my mother: a copy of all her records please, a copy of my records too").review.includes("on-behalf"));
  assert.ok(classifyRights("FICTIONAL. My solicitor asks for a copy of my data").review.includes("legal-context"));
  assert.deepEqual(privacyLabels("FICTIONAL. Hello", "Can we talk?"), { rights: ["unclear"], review: ["no-right-identified"] });
});

test("signatures, disclaimers and quoted text never create false privacy cases", () => {
  const footers = [
    "FICTIONAL. Thanks for the invoice.\n\nKind regards\nAlex\nThis email is confidential. We process your personal data in line with our privacy notice. To have your data deleted contact us.",
    "FICTIONAL. See you Tuesday.\n--\nAlex Example\nPrivacy notice: how we use your personal data ... you can ask for a copy of your data or to delete your data",
    "FICTIONAL. Fine by me.\n\nOn Mon, 16 Nov 2026 someone wrote:\n> please delete all my data\n> I object to processing",
    "FICTIONAL. Agreed.\n-----Original Message-----\nFrom: x\nPlease send me a copy of my data",
    "FICTIONAL. Lovely.\nGet Outlook for iOS\nunsubscribe me",
    "FICTIONAL. Thanks.\nDisclaimer: you have the right to request access to your personal information.",
  ];
  for (const b of footers) assert.equal(looksLikePrivacyRequest("Re: invoice", b), false, b);
  assert.equal(looksLikePrivacyRequest("Re: invoice", "FICTIONAL. Also please delete all my data.\n\nKind regards\nAlex"), true);
});

// ------------------------------------------------------------------ deadlines
test("deadlines record the original date, each adjustment with its legal basis, and the result", () => {
  const d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], idNeeded: true, idReason: "reasonable-doubts", idRequested: "2026-11-16", idReceived: "2026-11-20", clarifications: [{ requested: "2026-11-23", received: "2026-11-25", reason: "large-volume" }] });
  assert.equal(d.original, "2026-12-16");
  assert.equal(d.adjustments.length, 2);
  assert.match(d.adjustments[0].change, /start moved from 2026-11-16 to 2026-11-20/);
  assert.match(d.adjustments[0].basis, /Art\. 12\(6\)/);
  assert.match(d.adjustments[1].basis, /Art\. 12A\(5\)/);
  assert.equal(d.resulting, d.due);
  assert.equal(d.due, "2026-12-23"); // 20 Dec + 3 days paused
});

test("ID only moves the deadline with a legal reason; without one the original stands", () => {
  const d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], idNeeded: true, idRequested: "2026-11-16", idReceived: "2026-11-30" });
  assert.equal(d.due, "2026-12-16");
  assert.equal(d.adjustments.length, 0);
  assert.match(d.warnings.join(" "), /does NOT move the deadline/);
});

test("clarification pauses only subject access requests, and only with a reason", () => {
  const erasure = privacyRequestDeadlines({ received: "2026-11-16", rights: ["erasure"], clarifications: [{ requested: "2026-11-20", received: "2026-11-30", reason: "unclear-scope" }] });
  assert.equal(erasure.due, "2026-12-16");
  assert.match(erasure.warnings.join(" "), /subject access only/);
  const noReason = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], clarifications: [{ requested: "2026-11-20", received: "2026-11-30" }] });
  assert.equal(noReason.due, "2026-12-16");
  const mixed = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access", "erasure"], clarifications: [{ requested: "2026-11-20", received: "2026-11-22", reason: "unclear-scope" }] });
  assert.equal(mixed.due, "2026-12-21"); // 16 Dec + 3 = Sat 19 Dec -> Mon 21
});

test("a fee only for manifestly unfounded or excessive requests; the clock starts when it's paid", () => {
  let d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], fee: { requested: "2026-11-17", reason: "manifestly-excessive" } });
  assert.equal(d.status, "waiting-for-fee");
  d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], fee: { requested: "2026-11-17", reason: "manifestly-excessive", paid: "2026-11-25" } });
  assert.equal(d.due, "2026-12-29"); // 25 Dec (bank holiday), 26-27 weekend, 28 Dec bank holiday
  assert.match(d.adjustments[0].basis, /12\(5\)/);
  d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], fee: { requested: "2026-11-17", reason: null, paid: "2026-11-25" } });
  assert.equal(d.due, "2026-12-16");
});

test("data protection complaints: acknowledge within 30 days (DPA 2018 s.164A), then keep the person updated", () => {
  let d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["dp-complaint"] });
  assert.equal(d.status, "complaint-only");
  assert.equal(d.dpComplaintAckDue, "2026-12-16");
  d = privacyRequestDeadlines({ received: "2026-11-19", rights: ["dp-complaint"] });
  assert.equal(d.dpComplaintAckDue, "2026-12-18"); // 19 Dec is a Saturday: aim for the Friday before
  d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["dp-complaint", "erasure"] });
  assert.equal(d.due, "2026-12-16");
  assert.equal(d.dpComplaintAckDue, "2026-12-16");
});

test("objection to direct marketing and consent withdrawal: act straight away", () => {
  const d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["direct-marketing-objection"] });
  assert.match(d.warnings.join(" "), /straight away/);
});

// ------------------------------------------------------------------ intake and events
test("intake labels privacy cases; recorded events need legal reasons; clarification only on access cases", async () => {
  const x = deps();
  const r = await intake(message({ mailbox: P, bodyText: "FICTIONAL. Please wipe my details from your system." }), x);
  let c = await getCase(x.store, r.refs[0]);
  assert.deepEqual(c.rights, ["erasure"]);
  await assert.rejects(recordEvent(c.ref, "id-requested", "2026-11-17", x), /value-required/);
  await assert.rejects(recordEvent(c.ref, "id-requested", "2026-11-17", { ...x, value: "just-because" }), /bad-value/);
  await assert.rejects(recordEvent(c.ref, "clarification-requested", "2026-11-17", { ...x, value: "unclear-scope" }), /subject-access-only/);
  await recordEvent(c.ref, "rights-set", "2026-11-17", { ...x, value: "erasure,access" });
  await recordEvent(c.ref, "clarification-requested", "2026-11-17", { ...x, value: "unclear-scope" });
  c = await getCase(x.store, c.ref);
  assert.equal(deadlinesFor(c).status, "paused");
  await assert.rejects(recordEvent(c.ref, "rights-set", "2026-11-17", { ...x, value: "erasure,teleport" }), /bad-value/);
  const cmp = await intake(message(), x);
  await assert.rejects(recordEvent(cmp.refs[0], "fee-requested", "2026-11-17", { ...x, value: "manifestly-excessive" }), /privacy-only/);
});

test("a privacy request inside an existing complaint thread, in unusual words, opens a linked privacy case", async () => {
  const x = deps();
  const first = await intake(message({ id: "t1", conversationId: "th-1" }), x);
  const r = await intake(message({ id: "t2", conversationId: "th-1", from: "fictional.person1@example.org", subject: `Re: ${first.refs[0]}`, bodyText: "FICTIONAL. And while you're at it, take me off your system.\n\nOn Mon someone wrote:\n> earlier text" }), x);
  const priv = await getCase(x.store, r.refs.at(-1));
  assert.equal(priv.type, "privacy");
  assert.deepEqual(priv.rights, ["erasure"]);
  assert.equal(priv.linkedTo, first.refs[0]);
});

test("other channels: a request by letter or social media is logged from the day it reached you", async () => {
  const x = deps();
  const c = await logCase({ type: "privacy", channel: "social-media", received: "2026-11-02", rights: ["access"] }, x);
  assert.equal(deadlinesFor(c).due, "2026-12-02");
  await assert.rejects(logCase({ type: "privacy", channel: "letter", received: "2026-11-02", rights: ["nonsense"] }, x), /bad-rights/);
  await assert.rejects(logCase({ type: "complaint", channel: "letter", received: "2026-11-02", rights: ["access"] }, x), /bad-rights/);
  const unclear = await logCase({ type: "privacy", channel: "phone-or-video", received: "2026-11-16" }, x);
  assert.deepEqual(unclear.review, ["no-right-identified"]);
});

test("manual review: you're reminded until you record that you've reviewed it", async () => {
  const x = deps();
  const r = await intake(message({ mailbox: P, bodyText: "FICTIONAL. On behalf of my son, please send a copy of all his records and delete my data." }), x);
  assert.match(r.notices[0].message, /MANUAL REVIEW NEEDED: .*someone else's behalf.*more than one thing/);
  let n = await dailyCaseCheck({ ...x, today: "2026-11-17" });
  assert.ok(n.some((m) => /Reminder: Read this request yourself/.test(m.subject)));
  await recordEvent(r.refs[0], "review-done", "2026-11-17", x);
  n = await dailyCaseCheck({ ...x, today: "2026-11-25" });
  assert.ok(!n.some((m) => /Read this request yourself/.test(m.subject)));
});

test("a reply that raises another right is flagged in the follow-up notice", async () => {
  const x = deps();
  const a = await intake(message({ id: "f1", mailbox: P, conversationId: "th-9", bodyText: "FICTIONAL. Please send me a copy of my data." }), x);
  const b = await intake(message({ id: "f2", mailbox: P, conversationId: "th-9", from: "fictional.person1@example.org", bodyText: "FICTIONAL. Actually, also delete all my data." }), x);
  assert.equal(b.refs[0], a.refs[0]);
  assert.match(b.notices[0].message, /seems to raise another right \(Erasure/);
});

// ------------------------------------------------------------------ complaints
test("complaints: published timescales kept; approaching, due-today, overdue and escalation every 3 working days", async () => {
  const x = deps();
  await intake(message(), x); // received Mon 16 Nov: ack due Mon 23 Nov
  const at = async (today) => (await dailyCaseCheck({ ...x, today })).map((m) => m.subject.split(" · ")[0]);
  assert.deepEqual(await at("2026-11-19"), ["[Stage 3] Reminder: Acknowledge in writing"]);
  assert.deepEqual(await at("2026-11-23"), ["[Stage 3] DUE TODAY: Acknowledge in writing"]);
  assert.deepEqual(await at("2026-11-24"), ["[Stage 3] OVERDUE: Acknowledge in writing"]);
  assert.deepEqual(await at("2026-11-26"), []);
  assert.deepEqual(await at("2026-11-27"), ["[Stage 3] STILL OVERDUE: Acknowledge in writing"]);
  assert.deepEqual(await at("2026-12-01"), []);
  assert.deepEqual(await at("2026-12-02"), ["[Stage 3] STILL OVERDUE: Acknowledge in writing"]);
});

test("reminders count as delivered only when delivery is CONFIRMED; otherwise retried and reported", async () => {
  const x = deps();
  await intake(message(), x);
  for (const bad of [async () => {}, async () => true, async () => "sent", async () => ({ delivered: "yes" }), async () => { throw new Error("down"); }]) {
    const n = await dailyCaseCheck({ store: x.store, today: "2026-11-19", notify: bad });
    assert.equal(n.length, 0);
    assert.equal(n.undelivered.length, 1);
  }
  const n = await dailyCaseCheck({ ...x, today: "2026-11-19" });
  assert.equal(n.length, 1);
  assert.equal((await dailyCaseCheck({ ...x, today: "2026-11-19" })).length, 0);
  assert.equal(confirmed({ delivered: true }), true);
  // intake: an unconfirmed notice stops the run so it's retried, and is never lost
  const m = message();
  await assert.rejects(intake(m, { ...x, notify: async () => undefined }), /not-confirmed/);
  const again = await intake(m, { ...x, now: T + 3 * 60e3 });
  assert.equal(again.notices.length, 1);
  await assert.rejects(dailyCaseCheck({ store: x.store, today: "2026-11-19" }), /notify-required/);
});

test("responses and outcomes stay yours: no code writes or sends a reply", () => {
  for (const f of readdirSync(new URL("../lib/", import.meta.url))) {
    const src = readFileSync(new URL(`../lib/${f}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    assert.ok(!/sendMail|Mail\.Send|\/messages\/[^"']*\/reply|createReply|\bfetch\(/.test(src), f);
  }
});

// ------------------------------------------------------------------ retention
test("retention: monthly manual review; complaint and privacy periods stay unapproved; exceptions keep records", () => {
  assert.equal(SCHEDULE.approved, false);
  assert.equal(SCHEDULE.rules.complaint.keepMonths, null);
  assert.equal(SCHEDULE.rules["privacy-request"].keepMonths, null);
  const items = [
    { id: "sub-001", category: "enquiry-no-work", clockDate: "2025-06-01" },
    { id: "sub-002", category: "enquiry-no-work", clockDate: "2025-06-01", flags: ["dispute"] },
    { id: "sub-003", category: "enquiry-no-work", clockDate: "2025-06-01", flags: ["preservation-notice"] },
    { id: "sub-004", category: "client-identity", clockDate: "2025-06-01", flags: ["aml-record"] },
    { id: "cmp-001", category: "complaint", clockDate: "2020-01-01" },
    { id: "sub-005", category: "enquiry-no-work", clockDate: "2025-06-01", flags: ["open-privacy-request"] },
  ];
  const r = monthlyReview(items, { asOf: "2026-12-01" });
  assert.deepEqual(r.potentially.map((p) => p.id), ["sub-001"]);
  assert.equal(r.kept.length, 4);
  assert.ok(r.decide.some((d) => d.id === "cmp-001"));
  assert.deepEqual(r.unapproved, ["complaint", "privacy-request"]);
  assert.equal(r.complete, false);
  assert.match(r.text, /REVIEW NOT COMPLETE/);
  assert.match(r.text, /Nothing has been deleted/);
});

test("retention: personal data outside Netlify must be reviewed too; the audit trail holds no personal data", () => {
  const outside = Object.fromEntries(OUTSIDE_NETLIFY.map((o) => [o.id, "reviewed"]));
  const r = monthlyReview([{ id: "sub-001", category: "enquiry-no-work", clockDate: "2025-06-01" }], { asOf: "2026-12-01", outside });
  assert.equal(r.complete, true);
  assert.ok(OUTSIDE_NETLIFY.some((o) => /Outlook/.test(o.place)) && OUTSIDE_NETLIFY.some((o) => /Paper/.test(o.place)) && OUTSIDE_NETLIFY.some((o) => /Backups/.test(o.place)));
  assert.deepEqual(Object.keys(r.audit).sort(), ["asOf", "complete", "deletedByLucindha", "keptByException", "month", "needDecision", "outsideReviewed", "potentiallyDue", "scheduleApproved"]);
  assert.ok(!/@|name|address/i.test(JSON.stringify(r.audit)));
  assert.throws(() => recordManualDeletion(r.audit, { ids: ["sub-001"], date: "2026-12-02", by: "automation" }), /only-lucindha/);
  assert.throws(() => recordManualDeletion(r.audit, { ids: ["sub-999"], date: "2026-12-02", by: "Lucindha" }), /not-in-this-months-review/);
  assert.deepEqual(recordManualDeletion(r.audit, { ids: ["sub-001"], date: "2026-12-02", by: "Lucindha" }).deletedByLucindha, { ids: ["sub-001"], date: "2026-12-02" });
});

test("retention: no automated deletion and no Netlify access token anywhere in Stage 3", () => {
  for (const dir of ["../lib/", "../tools/"]) for (const f of readdirSync(new URL(dir, import.meta.url))) {
    const src = readFileSync(new URL(dir + f, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    assert.ok(!/NETLIFY_AUTH_TOKEN|NETLIFY_TOKEN|api\.netlify\.com|personal access token|\bunlink|rmSync|deleteBlob/.test(src), f);
    if (f !== "cases.mjs") assert.ok(!/\.delete\(/.test(src), f);
  }
  assert.ok(!/\.delete\(/.test(readFileSync(new URL("../lib/cases.mjs", import.meta.url), "utf8")));
});

// ------------------------------------------------------------------ health
const healthy = {
  asOf: "2026-11-16",
  deploys: [{ site: "lucindha", state: "ready", date: "2026-11-15" }],
  functions: [{ site: "lucindha", name: "submission-created", calls: 10, errors: 0 }],
  tasks: [{ name: "daily check", lastRun: "2026-11-16", status: "succeeded", expectedEveryDays: 1 }],
  reconciliation: [{ stage: "Stage 1", received: 10, processed: 10, failed: 0 }],
  reminders: { attempted: 3, confirmed: 3, undelivered: 0, caseErrors: 0 },
  credentials: [{ what: "Stage 2 client secret", expires: "2027-05-10" }],
  formSubmissions7d: 10,
};

test("health: OK only when every required figure is present and fine", () => {
  assert.equal(buildHealthReport(healthy).overall, "ok");
  for (const k of ["deploys", "functions", "tasks", "reconciliation", "reminders", "credentials"]) {
    const f = { ...healthy }; delete f[k];
    assert.equal(buildHealthReport(f).overall, "bad", `missing ${k}`);
  }
});

test("health: received vs processed reconciled; failed reminders, case errors and expiring credentials flagged", () => {
  const r = buildHealthReport({ ...healthy,
    reconciliation: [{ stage: "Stage 1", received: 12, processed: 10, failed: 1 }, { stage: "Stage 3", received: 2, processed: 3, failed: 0 }],
    reminders: { attempted: 4, confirmed: 2, caseErrors: 1 },
    credentials: [{ what: "Stage 1 client secret", expires: "2026-12-01" }, { what: "Other", expires: "not a date" }],
  });
  assert.equal(r.overall, "bad");
  assert.match(r.text, /12 received but only 10 processed and 1 failed\. 1 unaccounted for/);
  assert.match(r.text, /more processed \(3\) than received \(2\)/);
  assert.match(r.text, /2 of 4 not confirmed as delivered/);
  assert.match(r.text, /1 case\(s\) couldn't be checked/);
  assert.match(r.text, /Stage 1 client secret: expires 2026-12-01 \(15 days\)/);
  assert.match(r.text, /expiry date unknown/);
});

test("health: reports never carry personal information", () => {
  const r = buildHealthReport({ ...healthy, tasks: [{ name: "check for jane.doe@example.org", lastRun: "2026-11-16", status: "succeeded", expectedEveryDays: 1 }] });
  assert.ok(!/@/.test(r.text));
});
