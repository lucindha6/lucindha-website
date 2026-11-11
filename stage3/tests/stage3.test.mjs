// Run: cd stage3 && npm test      (all data FICTIONAL; store and mailbox are stand-ins)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { memoryStore, message, SECRET } from "./helpers.mjs";
import { addCalendarMonths, addWorkingDays, onOrNextWorkingDay, HOLIDAYS_VALID_UNTIL, ukDateOf } from "../lib/calendar.mjs";
import { complaintDeadlines, privacyRequestDeadlines, mediaDeadlines } from "../lib/deadlines.mjs";
import { intake, logCase, recordEvent, dailyCaseCheck, getCase, isAutomatic, looksLikePrivacyRequest } from "../lib/cases.mjs";
import { dryRun, reportText, SCHEDULE } from "../lib/retention.mjs";
import { buildHealthReport } from "../lib/health.mjs";

const ack = JSON.parse(readFileSync(new URL("../config/acknowledgements.json", import.meta.url)));
const T = Date.parse("2026-11-16T10:05:00Z");
const deps = () => ({ store: memoryStore(), secret: SECRET, now: T });

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
  let d = privacyRequestDeadlines({ received: "2026-11-16", idNeeded: true, idRequested: "2026-11-17" });
  assert.equal(d.status, "waiting-for-id");
  assert.equal(d.due, null);
  d = privacyRequestDeadlines({ received: "2026-11-16", idNeeded: true, idRequested: "2026-11-17", idReceived: "2026-11-20" });
  assert.equal(d.clockStarts, "2026-11-20");
  assert.equal(d.due, "2026-12-21"); // 20 Dec is a Sunday
  d = privacyRequestDeadlines({ received: "2026-11-16", idNeeded: true, idRequested: "2026-11-30", idReceived: "2026-12-01" });
  assert.match(d.warnings.join(" "), /ask promptly/);
});

test("privacy: clarification pauses the clock from the day asked to the day answered, counted in days", () => {
  let d = privacyRequestDeadlines({ received: "2026-11-16", clarifications: [{ requested: "2026-11-20", received: "2026-11-24" }] });
  assert.equal(d.pausedDays, 5);
  assert.equal(d.due, "2026-12-21");
  d = privacyRequestDeadlines({ received: "2026-11-16", clarifications: [{ requested: "2026-11-20" }] });
  assert.equal(d.status, "paused");
  assert.throws(() => privacyRequestDeadlines({ received: "2026-11-16", clarifications: [{ requested: "2026-11-20", received: "2026-11-19" }] }), /clarification/);
});

test("privacy: extension by two further months only with notice inside the first month", () => {
  let d = privacyRequestDeadlines({ received: "2026-11-16", extended: true });
  assert.equal(d.due, "2027-02-16");
  assert.equal(d.extensionNoticeBy, "2026-12-16");
  assert.match(d.warnings.join(" "), /must tell the person.*by 2026-12-16/);
  d = privacyRequestDeadlines({ received: "2026-11-16", extended: true, extensionNotified: "2026-12-20" });
  assert.match(d.warnings.join(" "), /may not be valid/);
  d = privacyRequestDeadlines({ received: "2026-11-16", extended: true, extensionNotified: "2026-12-01" });
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
  const notices = await dailyCaseCheck({ store: x.store, today: "2026-12-07" });
  assert.match(notices[0].message, /via social-media \(other channel\)/);
});

test("automatic emails, internal emails and unknown mailboxes never create cases (no reply loops)", async () => {
  const x = deps();
  for (const h of [{ "Auto-Submitted": "auto-replied" }, { Precedence: "bulk" }, { "List-Id": "<news.example.org>" }]) {
    assert.equal((await intake(message({ headers: h }), x)).result, "ignored-automatic");
  }
  assert.equal((await intake(message({ from: "no-reply@example.org" }), x)).result, "ignored-automatic");
  assert.equal((await intake(message({ from: "hello@lucindhalawson.co.uk" }), x)).result, "ignored-internal");
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
  await recordEvent(r.refs[0], "id-requested", "2026-11-16", x);
  const f = await intake(message({ mailbox: "privacy@lucindhalawson.co.uk", from: m.from, conversationId: m.conversationId }), x);
  assert.equal(f.result, "follow-up");
  assert.match(f.notices[0].message, /record it to restart the clock/);
});

// ===================================================== reminders
test("complaint reminders: one before the acknowledgement is due, one if overdue, never repeated", async () => {
  const x = deps();
  const ref = (await intake(message(), x)).refs[0];
  assert.equal((await dailyCaseCheck({ store: x.store, today: "2026-11-18" })).length, 0);
  let n = await dailyCaseCheck({ store: x.store, today: "2026-11-19" });
  assert.match(n[0].subject, /Reminder: Acknowledge in writing/);
  assert.equal((await dailyCaseCheck({ store: x.store, today: "2026-11-20" })).length, 0);
  n = await dailyCaseCheck({ store: x.store, today: "2026-11-24" });
  assert.match(n[0].subject, /OVERDUE: Acknowledge/);
  assert.equal((await dailyCaseCheck({ store: x.store, today: "2026-11-25" })).length, 0);
  await recordEvent(ref, "acknowledged", "2026-11-24", x);
  n = await dailyCaseCheck({ store: x.store, today: "2026-12-16" });
  assert.match(n[0].message, /Send the full response: due 2026-12-22/);
  await recordEvent(ref, "responded", "2026-12-18", x);
  assert.equal((await dailyCaseCheck({ store: x.store, today: "2026-12-30" })).length, 0);
});

test("privacy reminders: due date reminder; extension notice reminder when extended without telling the person", async () => {
  const x = deps();
  const ref = (await intake(message({ mailbox: "privacy@lucindhalawson.co.uk", bodyText: "FICTIONAL. Copy of my data please." }), x)).refs[0];
  let n = await dailyCaseCheck({ store: x.store, today: "2026-12-09" });
  assert.match(n[0].message, /Send the full response: due 2026-12-16/);
  await recordEvent(ref, "extended", "2026-12-10", x);
  n = await dailyCaseCheck({ store: x.store, today: "2026-12-16" });
  assert.ok(n.some((k) => /Tell the person about the extension/.test(k.subject)));
});

// ===================================================== confidentiality
test("stored cases and notices never hold addresses, subjects, message text or links", async () => {
  const x = deps();
  const msgs = [message(), message({ mailbox: "privacy@lucindhalawson.co.uk", subject: "Secret subject line", bodyText: "FICTIONAL. My NI number is QQ123456C, send my data." }), message({ mailbox: "media@lucindhalawson.co.uk" })];
  const notices = [];
  for (const m of msgs) notices.push(...(await intake(m, x)).notices);
  notices.push(...(await dailyCaseCheck({ store: x.store, today: "2026-12-30" })));
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
  assert.equal((await intake(m, y)).result, "duplicate-event"); // still genuinely in progress
});

test("waiting for ID: one nudge after 10 working days, no false 'overdue' (the clock hasn't started)", async () => {
  const x = deps();
  const c = await logCase({ type: "privacy", channel: "letter", received: "2026-11-13" }, x);
  await recordEvent(c.ref, "id-requested", "2026-11-16", x);
  assert.equal((await dailyCaseCheck({ store: x.store, today: "2026-11-27" })).length, 0);
  const n = await dailyCaseCheck({ store: x.store, today: "2026-11-30" });
  assert.match(n[0].subject, /Still waiting for ID/);
  assert.equal((await dailyCaseCheck({ store: x.store, today: "2026-12-30" })).length, 0);
  await recordEvent(c.ref, "id-received", "2026-12-01", x);
  const d = await dailyCaseCheck({ store: x.store, today: "2026-12-24" });
  assert.match(d[0].message, /due 2027-01-04/); // 1 Jan 2027 is a bank holiday, 2-3 Jan a weekend
});
