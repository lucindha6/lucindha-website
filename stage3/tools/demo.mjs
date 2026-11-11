// Stage 3 demonstration with FICTIONAL messages and a stand-in store. Prints the notices you'd get.
import { intake, logCase, recordEvent, dailyCaseCheck } from "../lib/cases.mjs";
import { buildHealthReport } from "../lib/health.mjs";
import { monthlyReview, OUTSIDE_NETLIFY } from "../lib/retention.mjs";
import { readFileSync } from "node:fs";

const m = new Map();
const ver = new Map();
const store = {
  async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
  async getWithMetadata(k) { return m.has(k) ? { data: JSON.parse(m.get(k)), etag: String(ver.get(k) || 0) } : null; },
  async setJSON(k, v, o = {}) {
    if (o.onlyIfNew && m.has(k)) return { modified: false };
    if (o.onlyIfMatch !== undefined && String(ver.get(k) || 0) !== o.onlyIfMatch) return { modified: false };
    m.set(k, JSON.stringify(v)); ver.set(k, (ver.get(k) || 0) + 1); return { modified: true };
  },
  async list({ prefix }) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
};
// Stand-in notifier: in development it just confirms. A real one must return { delivered: true } only once delivery is confirmed.
const notify = async () => ({ delivered: true });
const deps = { store, secret: "demo-secret", now: Date.parse("2026-11-16T10:05:00Z"), notify };
const out = [];
const show = (label, r) => { out.push(`--- ${label}: ${r.result}`); for (const n of r.notices) out.push(n.subject, n.message, ""); };

const kim = { id: "d1", mailbox: "complaints@lucindhalawson.co.uk", from: "kim.fictional@example.org", subject: "Unhappy", receivedAt: "2026-11-16T09:12:00Z", conversationId: "t1", headers: {}, bodyText: "FICTIONAL complaint text." };
const k = await intake(kim, deps); show("Kim complains", k);
show("Kim replies in the same thread", await intake({ ...kim, id: "d2", receivedAt: "2026-11-17T09:00:00Z" }, deps));
show("Lee: privacy request at complaints@", await intake({ id: "d3", mailbox: "complaints@lucindhalawson.co.uk", from: "lee.fictional@example.org", subject: "My data", receivedAt: "2026-11-16T11:00:00Z", conversationId: "t3", headers: {}, bodyText: "FICTIONAL. What information do you hold about me?" }, deps));
show("Automatic out-of-office reply", await intake({ id: "d4", mailbox: "complaints@lucindhalawson.co.uk", from: "x.fictional@example.org", subject: "Out of office", receivedAt: "2026-11-16T11:05:00Z", headers: { "Auto-Submitted": "auto-replied" }, bodyText: "" }, deps));
show("Sam: 'take me off your system' on behalf of a relative", await intake({ id: "d5", mailbox: "privacy@lucindhalawson.co.uk", from: "sam.fictional@example.org", subject: "Please", receivedAt: "2026-11-16T12:00:00Z", conversationId: "t5", headers: {}, bodyText: "FICTIONAL. On behalf of my mother, please take her off your system and send me a copy of all her records.\n\nKind regards\nSam\nThis email is confidential." }, deps));
show("Media enquiry whose footer mentions data protection (media case only, no privacy case)", await intake({ id: "d6", mailbox: "media@lucindhalawson.co.uk", from: "press.fictional@example.org", subject: "Interview", receivedAt: "2026-11-16T12:30:00Z", conversationId: "t6", headers: {}, bodyText: "FICTIONAL. Could we interview you next week?\n\nBest regards\nPrivacy notice: how we use your personal data, including your right to request a copy of your data." }, deps));
const phone = await logCase({ type: "privacy", channel: "phone-or-video", received: "2026-11-13", sourceId: "demo-call-1", rights: ["access"] }, deps);
out.push(`--- Privacy request made on a video call, logged by hand: ${phone.ref} (received 2026-11-13)`, "");
await recordEvent(phone.ref, "id-requested", "2026-11-16", { ...deps, value: "reasonable-doubts" });
await recordEvent(phone.ref, "id-received", "2026-11-16", deps);
for (const day of ["2026-11-19", "2026-11-23", "2026-11-24", "2026-11-27"]) {
  for (const n of await dailyCaseCheck({ store, today: day, notify })) out.push(`--- Daily check ${day}`, n.subject, n.message, "");
}
const half = Object.fromEntries(OUTSIDE_NETLIFY.slice(0, 6).map((o) => [o.id, "reviewed"]));
out.push("=== Monthly retention review (fictional)", monthlyReview(JSON.parse(readFileSync(new URL("./fictional-retention-items.json", import.meta.url))), { asOf: "2026-12-01", outside: half }).text, "");
out.push("=== Weekly health report (fictional facts)", buildHealthReport({
  asOf: "2026-11-16",
  deploys: [{ site: "lucindha", state: "ready", date: "2026-11-15" }, { site: "lucindha-stage2-test", state: "ready", date: "2026-11-11" }],
  functions: [{ site: "lucindha", name: "submission-created", calls: 14, errors: 0 }, { site: "lucindha-stage2-test", name: "enquiry-webhook", calls: 15, errors: 0 }],
  tasks: [{ name: "Weekly news check", lastRun: "2026-11-16", status: "succeeded", expectedEveryDays: 7 }],
  expiries: [{ what: "Netlify plan review (switch to Free)", date: "2027-01-04" }],
  reconciliation: [{ stage: "Stage 1 acknowledgements", received: 14, processed: 13, failed: 0 }, { stage: "Stage 2 drafts (test)", received: 15, processed: 15, failed: 0 }],
  reminders: { attempted: 4, confirmed: 4, undelivered: 0, caseErrors: 0 },
  manualReviews: { weeklyLastDone: "2026-11-13", monthlySampleLastDone: "2026-11-02" },
  credentials: [{ what: "Stage 2 client secret", expires: "2027-05-10" }],
  formSubmissions7d: 14,
}).text);
console.log(out.join("\n"));
