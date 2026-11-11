// Regression tests for Lucindha's 11 Nov 2026 requirements (privacy rights, deadline adjustments,
// complaints escalation and delivery, manual monthly retention review, health reconciliation).
// FICTIONAL data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { memoryStore, message, SECRET } from "./helpers.mjs";
import { intake, logCase, recordEvent as rawRecordEvent, dailyCaseCheck, getCase, looksLikePrivacyRequest, privacyLabels, deadlinesFor, confirmed } from "../lib/cases.mjs";
import { privacyRequestDeadlines, complaintDeadlines } from "../lib/deadlines.mjs";
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
  assert.deepEqual(mixed.perRight, { access: "2026-12-21", erasure: "2026-12-16" }); // only the access part is paused
  assert.equal(mixed.due, "2026-12-16");
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
  assert.equal(d.dpComplaintAckLegal, "2026-12-16");
  assert.equal(d.dpComplaintAckDue, "2026-11-23"); // your 5-working-day policy applies first
  d = privacyRequestDeadlines({ received: "2026-11-19", rights: ["dp-complaint"] });
  assert.equal(d.dpComplaintAckLegal, "2026-12-19");
  assert.equal(d.dpComplaintAckDue, "2026-11-26");
  d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["dp-complaint", "erasure"] });
  assert.equal(d.due, "2026-12-16");
  assert.equal(d.dpComplaintAckLegal, "2026-12-16");
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
  assert.equal(deadlinesFor(c).status, "running"); // erasure keeps running while the access part is paused
  assert.deepEqual(deadlinesFor(c).perRight, { access: "paused", erasure: "2026-12-16" });
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
  const r0 = await intake(message(), x); // received Mon 16 Nov: ack due Mon 23 Nov
  await recordEvent(r0.refs[0], "privacy-check-done", "2026-11-16", { ...x, value: "none-found" });
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
  const r0 = await intake(message(), x);
  await recordEvent(r0.refs[0], "privacy-check-done", "2026-11-16", { ...x, value: "none-found" });
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
  manualReviews: { weekly: { weekOf: "2026-11-13", complete: true, checked: [] }, monthlySampleLastDone: "2026-11-02" },
  formSubmissions7d: 10,
};

test("health: OK only when every required figure is present and fine", () => {
  assert.equal(buildHealthReport(healthy).overall, "ok");
  for (const k of ["deploys", "functions", "tasks", "reconciliation", "reminders", "credentials", "manualReviews"]) {
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
  const r = buildHealthReport({ ...healthy, tasks: [{ name: "check for jane.doe@example.org", lastRun: "2026-11-16", status: "succeeded", expectedEveryDays: 1 }], reconciliation: [{ stage: "Stage 1 (j.smith@example.com)", received: 1, processed: 1 }] });
  assert.ok(!/@/.test(r.text));
  assert.ok(!/jane|doe|smith|example\.(org|com)/i.test(r.text), r.text);
  assert.match(r.text, /\[address removed\]/);
});

test("health (review 2): undelivered reminders can't be hidden; missing call counts and overdue tasks need action", () => {
  let r = buildHealthReport({ ...healthy, reminders: { attempted: 4, confirmed: 2, undelivered: 0, caseErrors: 0 } });
  assert.equal(r.overall, "bad");
  assert.match(r.text, /2 of 4 not confirmed/);
  r = buildHealthReport({ ...healthy, functions: [{ site: "lucindha", name: "f", errors: 0 }] });
  assert.equal(r.overall, "bad");
  assert.ok(!/undefined/.test(r.text));
  r = buildHealthReport({ ...healthy, tasks: [{ name: "daily check", lastRun: "2026-11-01", status: "succeeded", expectedEveryDays: 1 }] });
  assert.equal(r.overall, "bad");
});

// ------------------------------------------------------------------ second independent review (11 Nov)
test("review 2-H2: requests after a sign-off phrase, in unusual words or with odd characters are caught", () => {
  for (const b of [
    "FICTIONAL. Many thanks for the interview. Separately, please delete all my personal data you hold.",
    "FICTIONAL. I'm making a SAR.", "FICTIONAL. Please send me everything you hold about me.",
    "FICTIONAL. Tell me what personal information your firm has on me.", "FICTIONAL. Please delete me from your records.",
    "FICTIONAL. Erase everything about me.", "FICTIONAL. A copy of my personal data please.", "FICTIONAL. You’ve got my surname wrong.",
  ]) assert.equal(looksLikePrivacyRequest("x", b), true, b);
  assert.equal(looksLikePrivacyRequest("x", "FICTIONAL. Hi.\nThe information contained in this email is confidential. You have a right of access."), false);
  assert.equal(looksLikePrivacyRequest("x", "FICTIONAL. Ok.\nFrom: Someone\nSent: Monday\nTo: me\nPlease delete all my data"), false);
});

test("review 2-H3: a clarification pause never delays the non-access parts of a request", () => {
  const d = privacyRequestDeadlines({ received: "2026-11-02", rights: ["access", "erasure"], clarifications: [{ requested: "2026-11-03", received: "2026-11-23", reason: "unclear-scope" }] });
  assert.equal(d.due, "2026-12-02");
  assert.deepEqual(d.perRight, { access: "2026-12-23", erasure: "2026-12-02" });
  const open = privacyRequestDeadlines({ received: "2026-11-02", rights: ["access", "erasure"], clarifications: [{ requested: "2026-11-03", reason: "unclear-scope" }] });
  assert.equal(open.status, "running");
  assert.equal(open.due, "2026-12-02");
});

test("review 2-H3: extension uses the earlier reading; weekend deadline handled for late clarification", () => {
  const d = privacyRequestDeadlines({ received: "2026-01-31", rights: ["access"], extended: true, extensionNotified: "2026-02-10" });
  assert.equal(d.due, "2026-04-30"); // ICO: three calendar months from the start
  assert.equal(d.internalTarget, "2026-04-28"); // the other reading is earlier: internal target + manual review
  assert.match(d.uncertain.join(" "), /Manual review/);
  // Deadline 13 Dec 2026 is a Sunday -> Mon 14 Dec; a clarification asked on Mon 14 Dec still counts
  const c = privacyRequestDeadlines({ received: "2026-11-13", rights: ["access"], clarifications: [{ requested: "2026-12-14", received: "2026-12-15", reason: "large-volume" }] });
  assert.equal(c.adjustments.length, 1);
});

test("review 2-M4: an automatic-looking privacy request at complaints@ or media@ still gets a privacy case", async () => {
  const x = deps();
  for (const mailbox of ["complaints@lucindhalawson.co.uk", "media@lucindhalawson.co.uk"]) {
    const r = await intake(message({ mailbox, from: "noreply@dsar-service.example", bodyText: "FICTIONAL. On behalf of our user: a copy of all their personal data you hold about me." }), x);
    assert.ok(r.refs.some((ref) => /^DSR-/.test(ref)), mailbox);
  }
});

test("review 2-M5/M6: recording rights keeps the review flag; a new right in a reply gets its own linked case", async () => {
  const x = deps();
  const a = await intake(message({ id: "m5", mailbox: P, conversationId: "th-m5", bodyText: "FICTIONAL. On behalf of my father, a copy of all his records please." }), x);
  await recordEvent(a.refs[0], "rights-set", "2026-11-17", { ...x, value: "access" });
  let c = await getCase(x.store, a.refs[0]);
  assert.ok(c.review.includes("on-behalf"));
  assert.ok((await dailyCaseCheck({ ...x, today: "2026-11-19" })).some((n) => /Read this request yourself/.test(n.subject)));
  const b = await intake(message({ id: "m6", mailbox: P, conversationId: "th-m5", from: "fictional.person1@example.org", receivedAt: "2026-11-20T10:00:00Z", bodyText: "FICTIONAL. Also delete my data and stop sending me marketing." }), x);
  assert.equal(b.refs[0], a.refs[0]);
  const linked = await getCase(x.store, b.refs[1]);
  assert.deepEqual(linked.rights.sort(), ["direct-marketing-objection", "erasure"]);
  assert.equal(linked.received, "2026-11-20");
  assert.equal(linked.linkedTo, a.refs[0]);
  assert.ok(linked.review.includes("new-right-in-follow-up"));
});

test("review 2-M7 and low: own-domain mail gets a check notice; prototype tricks and bad orders refused", async () => {
  const x = deps();
  assert.equal((await intake(message({ from: "hello@lucindhalawson.co.uk" }), x)).notices.length, 1);
  assert.equal((await intake(message({ mailbox: "__proto__" }), x)).result, "ignored-unknown-mailbox");
  assert.equal(confirmed(Object.create({ delivered: true })), false);
  const c = await logCase({ type: "privacy", channel: "letter", received: "2026-11-16", rights: ["access"] }, x);
  await recordEvent(c.ref, "extended", "2026-11-20", x);
  await assert.rejects(recordEvent(c.ref, "extension-notified", "2026-11-18", x), /extension-not-recorded/);
  assert.throws(() => complaintDeadlines({ received: "2026-11-16", acknowledged: "2026-11-10" }), /acknowledged-before-received/);
  const r = monthlyReview([{ id: "jane@example.org", category: "enquiry-no-work", clockDate: "2025-01-01", flags: ["constructor"] }], { asOf: "2026-12-01" });
  assert.ok(!/jane/.test(JSON.stringify(r.audit)) && !/jane/.test(r.text));
  assert.equal(r.potentially.length, 0);
  assert.match(r.text, /unrecognised flag/);
});
