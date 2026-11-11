// Run: cd stage3 && npm test      (all data FICTIONAL; store and mailbox are stand-ins)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { memoryStore, message, SECRET } from "./helpers.mjs";
import { addCalendarMonths, addWorkingDays, onOrNextWorkingDay, HOLIDAYS_VALID_UNTIL, ukDateOf } from "../lib/calendar.mjs";
import { complaintDeadlines, privacyRequestDeadlines, mediaDeadlines } from "../lib/deadlines.mjs";
import { intake, logCase, recordEvent as rawRecordEvent, dailyCaseCheck, getCase, isAutomatic, looksLikePrivacyRequest, bareAddress } from "../lib/cases.mjs";
// Events are recorded "on the day" they happen (recordEvent refuses dates in the future).
const recordEvent = (ref, e, d, x, extra = {}) => rawRecordEvent(ref, e, d, { ...x, now: Date.parse(`${d}T18:00:00Z`), ...extra });
import { dryRun, reportText, SCHEDULE } from "../lib/retention.mjs";
import { buildHealthReport } from "../lib/health.mjs";

const ack = JSON.parse(readFileSync(new URL("../config/acknowledgements.json", import.meta.url)));
const T = Date.parse("2026-11-16T10:05:00Z");
const ok = async () => ({ delivered: true });
const deps = () => ({ store: memoryStore(), secret: SECRET, now: T, notify: ok });

// ===================================================== calendar
test("calendar months follow the ICO corresponding-date rule (end-of-month and leap years)", () => {
  assert.equal(addCalendarMonths("2026-03-15", 1), "2026-04-15");
  assert.equal(addCalendarMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addCalendarMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addCalendarMonths("2026-08-31", 1), "2026-09-30");
  assert.equal(addCalendarMonths("2026-11-30", 3), "2027-02-28");
  assert.equal(addCalendarMonths("2026-12-31", 1), "2027-01-31");
});

test("working days skip weekends and England and Wales bank holidays", () => {
  assert.equal(addWorkingDays("2026-11-16", 5), "2026-11-23");
  assert.equal(addWorkingDays("2026-12-22", 5), "2026-12-31"); // 25 Dec and 28 Dec 2026 are bank holidays
  assert.equal(onOrNextWorkingDay("2026-12-26"), "2026-12-29");
  assert.throws(() => addWorkingDays("2026-02-30", 1), /bad-date/);
});

test("UK date of an email is taken in UK time (BST late-evening emails count as the UK date)", () => {
  assert.equal(ukDateOf("2026-07-06T23:30:00Z"), "2026-07-07");
  assert.equal(ukDateOf("2026-11-16T23:30:00Z"), "2026-11-16");
});

test("bank holiday list is still current (update it every year)", () => {
  assert.ok(new Date().toISOString().slice(0, 10) <= HOLIDAYS_VALID_UNTIL.replace("12-31", "11-30"));
});

// ===================================================== complaint deadlines (published procedure)
test("complaints: acknowledge within 5 working days; full response 4 weeks after acknowledgement", () => {
  let d = complaintDeadlines({ received: "2026-11-16" });
  assert.equal(d.ackDue, "2026-11-23");
  assert.equal(d.responseDue, "2026-12-21"); // provisional: 4 weeks after the latest acknowledgement date
  d = complaintDeadlines({ received: "2026-11-16", acknowledged: "2026-11-18" });
  assert.equal(d.responseDue, "2026-12-16");
  d = complaintDeadlines({ received: "2026-12-22" });
  assert.equal(d.ackDue, "2026-12-31");
  // a response date on a weekend is flagged with the working day before
  d = complaintDeadlines({ received: "2026-11-16", acknowledged: "2026-11-21" });
  assert.equal(d.responseDue, "2026-12-19");
  assert.match(d.notes.join(" "), /isn't a working day: aim for 2026-12-18/);
});

// ===================================================== privacy request deadlines (ICO)
test("privacy: one calendar month from receipt; weekend or bank holiday moves to the next working day", () => {
  assert.equal(privacyRequestDeadlines({ received: "2026-11-16" }).due, "2026-12-16");
  assert.equal(privacyRequestDeadlines({ received: "2026-01-31" }).due, "2026-03-02"); // 28 Feb 2026 is a Saturday
  assert.equal(privacyRequestDeadlines({ received: "2026-11-28" }).due, "2026-12-29"); // 28 Dec 2026 is a bank holiday
});

test("privacy: the clock starts when requested ID arrives; until then it hasn't started", () => {
  let d = privacyRequestDeadlines({ received: "2026-11-16", idNeeded: true, idReason: "reasonable-doubts", idRequested: "2026-11-17" });
  assert.equal(d.status, "waiting-for-id");
  assert.equal(d.due, null);
  d = privacyRequestDeadlines({ received: "2026-11-16", idNeeded: true, idReason: "reasonable-doubts", idRequested: "2026-11-17", idReceived: "2026-11-20" });
  assert.equal(d.clockStarts, "2026-11-20");
  assert.equal(d.due, "2026-12-21"); // 20 Dec is a Sunday
  d = privacyRequestDeadlines({ received: "2026-11-16", idNeeded: true, idReason: "reasonable-doubts", idRequested: "2026-11-30", idReceived: "2026-12-01" });
  assert.match(d.warnings.join(" "), /ask promptly/);
});

test("privacy: clarification pauses the clock from the day asked to the day answered, counted in days", () => {
  let d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], clarifications: [{ requested: "2026-11-20", received: "2026-11-24", reason: "large-volume" }] });
  assert.equal(d.pausedDays, 5);
  assert.equal(d.due, "2026-12-21");
  d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], clarifications: [{ requested: "2026-11-20", reason: "large-volume" }] });
  assert.equal(d.status, "paused");
  assert.throws(() => privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], clarifications: [{ requested: "2026-11-20", received: "2026-11-19", reason: "large-volume" }] }), /clarification/);
});

test("privacy: extension by two further months only with notice inside the first month", () => {
  let d = privacyRequestDeadlines({ received: "2026-11-16", extended: true });
  assert.equal(d.due, "2026-12-16", "not valid until notified: normal date stands");
  assert.equal(d.extensionNoticeBy, "2026-12-16");
  assert.equal(d.extensionNoticeRemind, "2026-12-09");
  assert.match(d.warnings.join(" "), /must tell the person, with reasons, by 2026-12-16/);
  d = privacyRequestDeadlines({ received: "2026-11-16", extended: true, extensionNotified: "2026-12-20" });
  assert.equal(d.due, "2026-12-16", "late notice: extension not valid");
  assert.match(d.warnings.join(" "), /isn't valid/);
  d = privacyRequestDeadlines({ received: "2026-11-16", extended: true, extensionNotified: "2026-12-01" });
  assert.equal(d.due, "2027-02-16");
  assert.equal(d.warnings.length, 0);
});

test("media: 2 working-day reply target (not a legal deadline)", () => {
  assert.equal(mediaDeadlines({ received: "2026-11-20" }).replyBy, "2026-11-24");
});

// ===================================================== intake: new case vs follow-up
test("a new complaint creates one case with its own reference and a notice with the deadlines", async () => {
  const x = deps();
  const r = await intake(message(), x);
  assert.equal(r.result, "new-case");
  assert.match(r.refs[0], /^CMP-[A-HJKMNP-Z2-9]{6}$/);
  assert.match(r.notices[0].subject, /^\[Stage 3\] New complaint · CMP-/);
  assert.match(r.notices[0].message, /Acknowledge by 2026-11-23; full response by 2026-12-21/);
  assert.match(r.notices[0].message, /Nothing has been sent/);
});

test("a reply quoting the case reference (same sender) or in the same email thread is a follow-up, not a new case", async () => {
  const x = deps();
  const m1 = message();
  const r1 = await intake(m1, x);
  const ref = r1.refs[0];
  const r2 = await intake(message({ from: m1.from, subject: `RE: Your complaint ${ref}`, conversationId: "another-thread" }), x);
  assert.equal(r2.result, "follow-up");
  assert.deepEqual(r2.refs, [ref]);
  const r3 = await intake(message({ from: "someone.else@example.org", conversationId: m1.conversationId }), x);
  assert.equal(r3.result, "follow-up");
  assert.equal([...x.store.m.keys()].filter((k) => k.startsWith("case/")).length, 1);
});

test("someone else quoting a reference does NOT attach to that case (new case instead)", async () => {
  const x = deps();
  const r1 = await intake(message(), x);
  const r2 = await intake(message({ subject: `About ${r1.refs[0]}` }), x);
  assert.equal(r2.result, "new-case");
});

test("a NEW email (new thread) from someone with an open case is a new case, linked, never merged automatically", async () => {
  const x = deps();
  const m1 = message();
  const r1 = await intake(m1, x);
  const r2 = await intake(message({ from: m1.from }), x);
  assert.equal(r2.result, "new-case");
  assert.notEqual(r2.refs[0], r1.refs[0]);
  assert.equal((await getCase(x.store, r2.refs[0])).linkedTo, r1.refs[0]);
  assert.match(r2.notices[0].message, new RegExp(`open case, ${r1.refs[0]}`));
});

test("a privacy request arriving at complaints@ or media@ also opens a privacy case from that day", async () => {
  const x = deps();
  const r = await intake(message({ bodyText: "FICTIONAL. Please send me a copy of all the information you hold about me." }), x);
  assert.equal(r.refs.length, 2);
  assert.match(r.refs[1], /^DSR-/);
  assert.match(r.notices[1].subject, /Possible privacy request/);
  const c = await getCase(x.store, r.refs[1]);
  assert.equal(c.viaOtherChannel, true);
  assert.equal(c.received, "2026-11-16");
  const m = await intake(message({ mailbox: "media@lucindhalawson.co.uk", bodyText: "FICTIONAL. Under GDPR, delete my details." }), x);
  assert.equal(m.refs.length, 2);
});

test("requests made by phone, video, letter, in person or social media can be logged with their real receipt date", async () => {
  const x = deps();
  const c = await logCase({ type: "privacy", channel: "social-media", received: "2026-11-14" }, x);
  assert.equal(c.viaOtherChannel, true);
  assert.match(c.ref, /^DSR-/);
  await assert.rejects(logCase({ type: "privacy", channel: "carrier-pigeon", received: "2026-11-14" }, x), /bad-channel/);
  const notices = await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-12-07" });
  assert.match(notices[0].message, /via social-media \(other channel\)/);
});

test("automatic emails, internal emails and unknown mailboxes never create cases (no reply loops)", async () => {
  const x = deps();
  for (const h of [{ "Auto-Submitted": "auto-replied" }, { Precedence: "bulk" }, { "List-Id": "<news.example.org>" }]) {
    const r = await intake(message({ headers: h }), x);
    assert.equal(r.result, "automatic-needs-check"); // no case, but never silently dropped
    assert.match(r.notices[0].subject, /Automatic-looking message/);
  }
  assert.equal((await intake(message({ from: "no-reply@example.org" }), x)).result, "automatic-needs-check");
  assert.equal((await intake(message({ mailbox: "media@lucindhalawson.co.uk", headers: { Precedence: "bulk" } }), x)).result, "ignored-automatic");
  const internal = await intake(message({ from: "hello@lucindhalawson.co.uk" }), x);
  assert.equal(internal.result, "internal-needs-check"); // never silently dropped
  assert.match(internal.notices[0].subject, /from your own address/);
  assert.equal((await intake(message({ mailbox: "hello@lucindhalawson.co.uk" }), x)).result, "ignored-unknown-mailbox");
  assert.equal([...x.store.m.keys()].filter((k) => k.startsWith("case/")).length, 0);
  assert.equal(isAutomatic({ from: "a@b.org", headers: { "Auto-Submitted": "no" } }), false);
});

test("the same message processed twice, or five times at once, creates one case", async () => {
  const x = deps();
  const m = message();
  const rs = await Promise.all(Array.from({ length: 5 }, () => intake(m, x)));
  assert.equal(rs.filter((r) => r.result === "new-case").length, 1);
  assert.equal([...x.store.m.keys()].filter((k) => k.startsWith("case/")).length, 1);
});

test("privacy follow-up while waiting for ID tells you to record the ID if it's there", async () => {
  const x = deps();
  const m = message({ mailbox: "privacy@lucindhalawson.co.uk", bodyText: "FICTIONAL. What data do you hold about me?" });
  const r = await intake(m, x);
  await recordEvent(r.refs[0], "id-requested", "2026-11-16", { ...x, value: "reasonable-doubts" });
  const f = await intake(message({ mailbox: "privacy@lucindhalawson.co.uk", from: m.from, conversationId: m.conversationId }), x);
  assert.equal(f.result, "follow-up");
  assert.match(f.notices[0].message, /record it to restart the clock/);
});

// ===================================================== reminders
test("complaint reminders: one before the acknowledgement is due, one if overdue, never repeated", async () => {
  const x = deps();
  const ref = (await intake(message(), x)).refs[0];
  await recordEvent(ref, "privacy-check-done", "2026-11-16", { ...x, value: "none-found" });
  assert.equal((await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-11-18" })).length, 0);
  let n = await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-11-19" });
  assert.match(n[0].subject, /Reminder: Acknowledge in writing/);
  assert.equal((await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-11-20" })).length, 0);
  n = await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-11-24" });
  assert.match(n[0].subject, /OVERDUE: Acknowledge/);
  assert.equal((await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-11-25" })).length, 0);
  await recordEvent(ref, "acknowledged", "2026-11-24", x);
  n = await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-12-16" });
  assert.match(n[0].message, /Send the full response: due 2026-12-22/);
  await recordEvent(ref, "responded", "2026-12-18", x);
  assert.equal((await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-12-30" })).length, 0);
});

test("privacy reminders: due date reminder; extension notice reminder when extended without telling the person", async () => {
  const x = deps();
  const ref = (await intake(message({ mailbox: "privacy@lucindhalawson.co.uk", bodyText: "FICTIONAL. Copy of my data please." }), x)).refs[0];
  let n = await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-12-09" });
  assert.match(n[0].message, /Send the full response: due 2026-12-16/);
  await recordEvent(ref, "extended", "2026-12-10", x);
  n = await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-12-16" });
  assert.ok(n.some((k) => /Tell the person about the extension/.test(k.subject)));
});

// ===================================================== confidentiality
test("stored cases and notices never hold addresses, subjects, message text or links", async () => {
  const x = deps();
  const msgs = [message(), message({ mailbox: "privacy@lucindhalawson.co.uk", subject: "Secret subject line", bodyText: "FICTIONAL. My NI number is QQ123456C, send my data." }), message({ mailbox: "media@lucindhalawson.co.uk" })];
  const notices = [];
  for (const m of msgs) notices.push(...(await intake(m, x)).notices);
  notices.push(...(await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-12-30" })));
  const blob = JSON.stringify([...x.store.m.values()]) + JSON.stringify(notices);
  for (const m of msgs) for (const v of [m.from, m.subject, m.bodyText, m.conversationId]) assert.ok(!blob.includes(v), `leaked: ${v}`);
  assert.ok(!/QQ123456C|https?:|www\./.test(blob));
  assert.ok(!blob.includes(SECRET));
});

test("privacy wording detection is broad (a false alarm only means a check)", () => {
  for (const t of ["What information do you hold about me?", "Subject access request please", "Please delete my details", "I object to the processing", "Send me a copy of my data"]) assert.ok(looksLikePrivacyRequest(t), t);
  assert.equal(looksLikePrivacyRequest("Can you speak at our event in March?"), false);
});

// ===================================================== retention dry run
test("retention dry run lists what WOULD be deleted, applies exceptions, and says it's not approved", () => {
  const r = dryRun([
    { id: "sub-1", category: "enquiry-no-work", clockDate: "2025-10-01" },
    { id: "sub-2", category: "enquiry-no-work", clockDate: "2025-10-01", flags: ["legal-hold"] },
    { id: "sub-3", category: "enquiry-no-work", clockDate: "2026-06-01" },
    { id: "sub-4", category: "complaint", clockDate: "2020-01-01" },
    { id: "sub-5", category: "mystery", clockDate: "2020-01-01" },
    { id: "sub-6", category: "enquiry-no-work", clockDate: "not-a-date" },
    { id: "sub-7", category: "enquiry-no-work", clockDate: "2025-10-01", flags: ["open-case", "nonsense-flag"] },
  ], { asOf: "2026-11-11" });
  const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
  assert.equal(by["sub-1"].action, "would-delete");
  assert.equal(by["sub-2"].action, "keep");
  assert.equal(by["sub-3"].action, "keep");
  assert.match(by["sub-4"].reason, /NEEDS YOUR DECISION/);
  assert.match(by["sub-5"].reason, /unknown category/);
  assert.match(by["sub-6"].reason, /no reliable date/);
  assert.equal(by["sub-7"].action, "keep");
  assert.equal(r.approved, false);
  assert.match(reportText(r), /NOT APPROVED\. Nothing may be deleted/);
  assert.match(reportText(r), /This is a report only/);
  assert.equal(SCHEDULE.approved, false);
});

test("Stage 3 contains no code that deletes, sends or calls out to the internet", () => {
  for (const dir of ["../lib/", "../tools/"]) {
    for (const f of readdirSync(new URL(dir, import.meta.url))) {
      if (!f.endsWith(".mjs")) continue;
      const src = readFileSync(new URL(dir + f, import.meta.url), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      assert.ok(!/\bfetch\(|https?\.request|XMLHttpRequest|sendMail|Mail\.Send|method:\s*["']DELETE|\.delete\(|unlink|rmSync|rmdir|writeFile/.test(src), `${f} must not delete, send or call out`);
    }
  }
});

// ===================================================== health report
test("weekly health report: problems first, expiry warnings, no personal data", () => {
  const r = buildHealthReport({
    asOf: "2026-11-16",
    deploys: [{ site: "lucindha", state: "ready", date: "2026-11-15" }, { site: "lucindha-stage2-test", state: "error", date: "2026-11-14" }],
    functions: [{ site: "lucindha", name: "submission-created", calls: 40, errors: 0 }, { site: "lucindha-stage2-test", name: "enquiry-webhook", calls: 12, errors: 3 }],
    tasks: [{ name: "Weekly news check", lastRun: "2026-11-16", status: "succeeded", expectedEveryDays: 7 }, { name: "Stage 2 daily check", lastRun: "2026-11-10", status: "succeeded", expectedEveryDays: 1 }],
    expiries: [{ what: "Stage 2 client secret", date: "2027-05-10" }, { what: "Stage 1 client secret", date: "2026-12-06" }, { what: "Netlify plan review", date: "2027-01-04" }],
    formSubmissions7d: 0,
  });
  assert.equal(r.overall, "bad");
  assert.match(r.text.split("\n")[2], /^ACTION/);
  assert.match(r.text, /Stage 1 client secret: expires 2026-12-06 \(20 days\)/);
  assert.match(r.text, /Netlify plan review: expires 2027-01-04 \(49 days\)/);
  assert.match(r.text, /hasn't run since 2026-11-10/);
  assert.match(r.text, /No website enquiries in the last 7 days/);
  assert.ok(!/@/.test(r.text));
});

// ===================================================== wording and independence
test("acknowledgement wording is proposed only, makes no promises about outcomes, and covers all three inboxes", () => {
  assert.equal(ack.approved, false);
  assert.match(ack._status, /NOT APPROVED/);
  const auto = ack.layer1_receipt_auto_replies;
  for (const box of ["complaints@lucindhalawson.co.uk", "privacy@lucindhalawson.co.uk", "media@lucindhalawson.co.uk"]) assert.ok(Array.isArray(auto[box]), box);
  const all = JSON.stringify(ack);
  assert.ok(!/(will|shall) (be )?(uphold|refund|compensat|resolve[ds]? in your favour|delete your)/i.test(all));
  assert.match(auto["complaints@lucindhalawson.co.uk"].join(" "), /within 5 working days/);
  assert.match(auto["complaints@lucindhalawson.co.uk"].join(" "), /automatic reply/);
});

test("Stage 3 doesn't import anything from Stage 1 or Stage 2", () => {
  for (const dir of ["../lib/", "../tools/", "./"]) {
    for (const f of readdirSync(new URL(dir, import.meta.url))) {
      if (!f.endsWith(".mjs")) continue;
      const src = readFileSync(new URL(dir + f, import.meta.url), "utf8");
      for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
        assert.ok(!/stage2|netlify\/|\.\.\/\.\.\//.test(m[1]), `${f} imports ${m[1]}`);
      }
    }
  }
});

test("a message whose processing stopped part-way (claim older than 2 minutes) is picked up again, not lost", async () => {
  const x = deps();
  const m = message();
  const { sha256Hex } = await import("../lib/util.mjs");
  const key = sha256Hex(`case:complaint:msg:${m.id}`);
  await x.store.setJSON(`s3src/${key}`, { at: T - 3 * 60e3 });
  assert.equal((await intake(m, x)).result, "new-case");
  const y = deps();
  await y.store.setJSON(`s3src/${key}`, { at: T - 30e3 });
  assert.equal((await intake(m, y)).result, "in-progress"); // still genuinely in progress
});

test("waiting for ID: one nudge after 10 working days, no false 'overdue' (the clock hasn't started)", async () => {
  const x = deps();
  const c = await logCase({ type: "privacy", channel: "letter", received: "2026-11-13", rights: ["access"] }, x);
  await recordEvent(c.ref, "id-requested", "2026-11-16", { ...x, value: "reasonable-doubts" });
  assert.equal((await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-11-27" })).length, 0);
  const n = await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-11-30" });
  assert.match(n[0].subject, /Still waiting for ID/);
  assert.equal((await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-12-30" })).length, 0);
  await recordEvent(c.ref, "id-received", "2026-12-01", x);
  const d = await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-12-24" });
  assert.match(d[0].message, /due 2026-12-31/); // internal target: the working day before 1 Jan (a bank holiday)
  assert.match(d[0].message, /Legal deadline 2027-01-04/); // legal: next working day after 1-3 Jan
});

// ===================================================== fixes from the independent review
test("review 1: one email sent to complaints@ AND privacy@ opens a privacy case too (threads only match the same type)", async () => {
  const x = deps();
  const m = message({ bodyText: "FICTIONAL. I'm unhappy." });
  const a = await intake(m, x);
  const b = await intake({ ...m, id: m.id + "-copy", mailbox: "privacy@lucindhalawson.co.uk" }, x);
  assert.equal(b.result, "new-case");
  assert.match(b.refs[0], /^DSR-/);
  assert.notEqual(a.refs[0], b.refs[0]);
});

test("review 1: a privacy request made inside an existing complaint thread opens a linked privacy case", async () => {
  const x = deps();
  const m = message();
  const a = await intake(m, x);
  const r = await intake(message({ from: m.from, conversationId: m.conversationId, bodyText: "FICTIONAL. Also, send me all the information you hold about me." }), x);
  assert.equal(r.result, "follow-up");
  assert.equal(r.refs[0], a.refs[0]);
  assert.match(r.refs[1], /^DSR-/);
  assert.match(r.notices.at(-1).message, new RegExp(`in the thread of ${a.refs[0]}`));
});

test("review 2: a run that stopped before notices or the linked privacy case is completed on retry", async () => {
  const x = deps();
  const m = message({ bodyText: "FICTIONAL. What information do you hold about me?" });
  let calls = 0;
  const flaky = async () => { calls++; if (calls === 1) throw new Error("stopped"); };
  await assert.rejects(intake(m, { ...x, notify: flaky }));
  const delivered = [];
  const r = await intake(m, { ...x, now: T + 3 * 60e3, notify: async (n) => (delivered.push(n), { delivered: true }) });
  assert.equal(r.refs.length, 2);
  assert.ok(delivered.some((n) => /New complaint/.test(n.subject)));
  assert.ok(delivered.some((n) => /Possible privacy request/.test(n.subject)));
  const again = await intake(m, { ...x, now: T + 6 * 60e3, notify: async (n) => (delivered.push(n), { delivered: true }) });
  assert.equal(again.notices.length, 0, "and never twice");
});

test("review 3: reminders are only recorded once delivered; a failed delivery is retried next time", async () => {
  const x = deps();
  await intake(message(), x);
  await assert.doesNotReject(dailyCaseCheck({ notify: ok, store: x.store, today: "2026-11-19", notify: async () => { throw new Error("down"); } }));
  const n = await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-11-20" });
  assert.match(n[0].subject, /Reminder: Acknowledge/);
});

test("review 4: recording an event at the same time as the daily check never loses the event", async () => {
  const x = deps();
  const ref = (await intake(message(), x)).refs[0];
  await Promise.all([
    dailyCaseCheck({ notify: ok, store: x.store, today: "2026-11-19" }),
    recordEvent(ref, "acknowledged", "2026-11-19", x),
    dailyCaseCheck({ notify: ok, store: x.store, today: "2026-11-19" }),
  ]);
  const c = await getCase(x.store, ref);
  assert.ok(c.events.some((e) => e.event === "acknowledged"));
});

test("review 5: overlapping clarification pauses are merged; a pause after the deadline doesn't extend it", () => {
  let d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], clarifications: [{ requested: "2026-11-20", received: "2026-11-24", reason: "large-volume" }, { requested: "2026-11-22", received: "2026-11-26", reason: "large-volume" }] });
  assert.equal(d.pausedDays, 7);
  d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], clarifications: [{ requested: "2027-01-05", received: "2027-01-08", reason: "large-volume" }] });
  assert.equal(d.due, "2026-12-16");
  assert.match(d.warnings.join(" "), /after the deadline/);
  d = privacyRequestDeadlines({ received: "2026-11-16", rights: ["access"], clarifications: [{ requested: "2027-01-05", reason: "large-volume" }] });
  assert.equal(d.status, "running");
  assert.match(d.warnings.join(" "), /overdue/);
});

test("review 6: bad dates are refused when recorded, and one faulty case never stops the others' reminders", async () => {
  const x = deps();
  const ref = (await intake(message({ mailbox: "privacy@lucindhalawson.co.uk", bodyText: "FICTIONAL. my data" }), x)).refs[0];
  await recordEvent(ref, "clarification-requested", "2026-11-20", x);
  await assert.rejects(recordEvent(ref, "clarification-received", "2026-11-19", x), /before-requested/);
  await assert.rejects(recordEvent(ref, "id-received", "2026-11-21", x), /without-request/);
  await assert.rejects(recordEvent(ref, "acknowledged", "2026-11-01", x), /before-received/);
  await assert.rejects(rawRecordEvent(ref, "acknowledged", "2027-06-01", x), /in-future/);
  // a corrupted record (e.g. edited by hand) produces its own notice; other cases still get reminders
  const other = (await intake(message(), x)).refs[0];
  const c = await getCase(x.store, ref);
  c.events.push({ event: "clarification-received", date: "2026-11-01" });
  await x.store.setJSON(`case/${ref}`, c);
  const n = await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-11-19" });
  assert.ok(n.some((k) => k.subject.includes(`needs attention · ${ref}`)));
  assert.ok(n.some((k) => k.subject.includes(other)));
});

test("review 7: requests sent through a service (no-reply address, list headers) aren't silently dropped", async () => {
  const x = deps();
  const r = await intake(message({ mailbox: "privacy@lucindhalawson.co.uk", from: "no-reply@request-service.example", headers: { "List-Unsubscribe": "<x>" }, subject: "Subject access request on behalf of our client" }), x);
  assert.equal(r.result, "new-case");
  assert.match(r.notices[0].message, /machine-generated .* Check it's genuine/);
  const ordinary = await intake(message({ headers: { "X-Auto-Response-Suppress": "All" } }), x);
  assert.equal(ordinary.result, "new-case", "an Outlook header on ordinary mail isn't 'automatic'");
});

test("review 8: an extension not notified in time keeps the normal date; reminder 5 working days before", async () => {
  const x = deps();
  const ref = (await intake(message({ mailbox: "privacy@lucindhalawson.co.uk", bodyText: "FICTIONAL. Copy of my data please." }), x)).refs[0];
  await recordEvent(ref, "extended", "2026-11-20", x);
  const n = await dailyCaseCheck({ notify: ok, store: x.store, today: "2026-12-09" });
  assert.ok(n.some((k) => /Tell the person about the extension/.test(k.subject)));
  await assert.rejects(recordEvent("CMP-AAAAAA", "extension-notified", "2026-12-10", x));
});

test("review 9: no free text is ever stored (no notes; event values limited to a case reference)", async () => {
  const x = deps();
  const c = await logCase({ type: "complaint", channel: "letter", received: "2026-11-13", note: "Mrs Jane Doe, 1 High St" }, x);
  assert.ok(!JSON.stringify([...x.store.m.values()]).includes("Jane"));
  await assert.rejects(recordEvent(c.ref, "closed", "2026-11-16", x, { value: "Mrs Jane Doe" }), /bad-value/);
  const other = await logCase({ type: "complaint", channel: "letter", received: "2026-11-13", sourceId: "s2" }, x);
  await recordEvent(c.ref, "duplicate-of", "2026-11-16", x, { value: other.ref });
  assert.equal((await getCase(x.store, c.ref)).status, "duplicate");
});

test("review 10: retention keeps anything with an unrecognised flag, and needs an explicit date for 'last contact' rules", () => {
  const r = dryRun([
    { id: "a", category: "enquiry-no-work", clockDate: "2025-01-01", flags: ["Legal-Hold"] },
    { id: "b", category: "enquiry-no-work", createdAt: "2024-01-01T00:00:00Z" },
    { id: "c", category: "stage2-record", createdAt: "2026-01-01T00:00:00Z" },
    { id: "d\nWOULD DELETE fake", category: "enquiry-no-work", clockDate: "2026-11-01" },
    { id: "e", category: "__proto__", clockDate: "2020-01-01" },
  ], { asOf: "2026-11-11" });
  const by = Object.fromEntries(r.rows.map((x) => [x.id.slice(0, 1), x]));
  assert.equal(by.a.action, "keep");
  assert.match(by.a.reason, /unrecognised flag/);
  assert.equal(by.b.action, "keep");
  assert.equal(by.c.action, "would-delete");
  assert.ok(!reportText(r).includes("\nWOULD DELETE fake"));
  assert.equal(by.e.action, "keep");
});

test("review 11: privacy wording in the SUBJECT counts; long messages are fully checked", async () => {
  const x = deps();
  const r = await intake(message({ subject: "Subject Access Request", bodyText: "FICTIONAL. See attached." }), x);
  assert.equal(r.refs.length, 2);
  assert.ok(looksLikePrivacyRequest("", "x".repeat(20000) + " what data do you hold about me"));
});

test("review 12: the health report never says OK when it has no data", () => {
  const empty = buildHealthReport({ asOf: "2026-11-16" });
  assert.equal(empty.overall, "bad");
  assert.match(empty.text, /No deploy status were collected|No deploy status/);
  const r = buildHealthReport({ asOf: "2026-11-16", deploys: [{ site: "s", state: "ready", date: "2026-11-16" }], functions: [{ site: "s", name: "f", calls: 0, errors: 5 }], tasks: [{ name: "t", lastRun: null, status: "succeeded" }], formSubmissions7d: 3 });
  assert.equal(r.overall, "bad");
  assert.match(r.text, /has never run/);
  assert.ok(!/null/.test(r.text));
});

test("review 13: dates beyond the bank holiday list carry a warning", () => {
  const d = privacyRequestDeadlines({ received: "2027-12-03" });
  assert.match(d.warnings.join(" "), /bank holiday list doesn't cover/);
});

test("review 14: 'Name <address>' senders are handled consistently; internal senders filtered", async () => {
  assert.equal(bareAddress("Jo Fictional <Jo@Example.org>"), "jo@example.org");
  const x = deps();
  const a = await intake(message({ from: "Jo Fictional <jo@example.org>", subject: "Complaint" }), x);
  const b = await intake(message({ from: "jo@example.org", subject: `RE: ${a.refs[0]}`, conversationId: "new-thread" }), x);
  assert.equal(b.result, "follow-up");
  assert.equal((await intake(message({ from: "Me <hello@lucindhalawson.co.uk>" }), x)).result, "internal-needs-check");
  assert.equal((await intake(message({ from: "real@example.org <a@lucindhalawson.co.uk" }), x)).result, "internal-needs-check");
});

test("review 14: tripwires also catch rm(), ['delete'] and dynamic import()", () => {
  for (const dir of ["../lib/", "../tools/"]) {
    for (const f of readdirSync(new URL(dir, import.meta.url))) {
      if (!f.endsWith(".mjs")) continue;
      const src = readFileSync(new URL(dir + f, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
      assert.ok(!/\brm\(|\[["']delete["']\]|\bimport\(\s*["'][^"']*(stage2|netlify)/.test(src), f);
    }
  }
});

// ===================================================== fixes from the re-check of the review fixes
test("re-check A: ordinary email footers and quoted history don't open privacy cases; one privacy case per thread", async () => {
  const footer = "\n--\nFictional Ltd. We process personal data in line with data protection law (GDPR). Erasure requests: see our policy.";
  assert.equal(looksLikePrivacyRequest("Complaint", "FICTIONAL. I'm unhappy with the service." + footer), false);
  assert.equal(looksLikePrivacyRequest("Re: complaint", "Thanks.\n\nOn Mon, Jo wrote:\n> please send me a copy of my data"), false);
  const x = deps();
  const m = message({ bodyText: "FICTIONAL. Please send me a copy of my data." });
  const a = await intake(m, x);
  assert.equal(a.refs.length, 2);
  const b = await intake(message({ from: m.from, conversationId: m.conversationId, bodyText: "FICTIONAL. Following up: I want all the information you hold about me." }), x);
  assert.deepEqual(b.refs, [a.refs[0], a.refs[1]], "the thread's existing privacy case is followed up, no new one");
  assert.equal([...x.store.m.keys()].filter((k) => k.startsWith("case/DSR-")).length, 1);
});

test("re-check B: retention keeps items whose flags aren't a list", () => {
  const r = dryRun([{ id: "a", category: "enquiry-no-work", clockDate: "2020-01-01", flags: "legal-hold" }, { id: "b", category: "enquiry-no-work", clockDate: "2020-01-01", flags: { "legal-hold": true } }], { asOf: "2026-11-11" });
  assert.ok(r.rows.every((x) => x.action === "keep"));
});

test("re-check C: unusual senders or incomplete messages get a check notice, never silently dropped", async () => {
  const x = deps();
  assert.equal((await intake(message({ from: "kim@localhost" }), x)).result, "new-case", "unusual but valid: accepted");
  assert.equal((await intake(message({ from: '"john smith"@example.org' }), x)).result, "new-case");
  for (const m of [message({ from: "not an address" }), message({ receivedAt: "not a date" }), message({ id: "" })]) {
    const r = await intake(m, x);
    assert.equal(r.result, "needs-check");
    assert.match(r.notices[0].subject, /needs checking/);
  }
});

test("re-check D: automatic-looking mail at privacy@ always opens a case (legal deadline); at complaints@ a check notice", async () => {
  const x = deps();
  const p = await intake(message({ mailbox: "privacy@lucindhalawson.co.uk", from: "no-reply@service.example", bodyText: "FICTIONAL. See attached." }), x);
  assert.equal(p.result, "new-case");
  assert.match(p.refs[0], /^DSR-/);
  const c = await intake(message({ from: "no-reply@service.example", bodyText: "FICTIONAL. please send a copy of my data" }), x);
  assert.equal(c.result, "automatic-needs-check");
  assert.match(c.notices[0].message, /might be a privacy request/);
  assert.match(c.refs[0], /^DSR-/); // and a privacy case is opened, so the deadline is tracked
});
