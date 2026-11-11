// Stage 3 demonstration with FICTIONAL messages and a stand-in store. Prints the notices you'd get.
import { intake, logCase, recordEvent, dailyCaseCheck } from "../lib/cases.mjs";
import { buildHealthReport } from "../lib/health.mjs";
import { dryRun, reportText } from "../lib/retention.mjs";
import { readFileSync } from "node:fs";

const m = new Map();
const store = {
  async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
  async setJSON(k, v, o = {}) { if (o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; },
  async list({ prefix }) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
};
const deps = { store, secret: "demo-secret", now: Date.parse("2026-11-16T10:05:00Z") };
const out = [];
const show = (label, r) => { out.push(`--- ${label}: ${r.result}`); for (const n of r.notices) out.push(n.subject, n.message, ""); };

const kim = { id: "d1", mailbox: "complaints@lucindhalawson.co.uk", from: "kim.fictional@example.org", subject: "Unhappy", receivedAt: "2026-11-16T09:12:00Z", conversationId: "t1", headers: {}, bodyText: "FICTIONAL complaint text." };
const k = await intake(kim, deps); show("Kim complains", k);
show("Kim replies in the same thread", await intake({ ...kim, id: "d2", receivedAt: "2026-11-17T09:00:00Z" }, deps));
show("Lee: privacy request at complaints@", await intake({ id: "d3", mailbox: "complaints@lucindhalawson.co.uk", from: "lee.fictional@example.org", subject: "My data", receivedAt: "2026-11-16T11:00:00Z", conversationId: "t3", headers: {}, bodyText: "FICTIONAL. What information do you hold about me?" }, deps));
show("Automatic out-of-office reply", await intake({ id: "d4", mailbox: "complaints@lucindhalawson.co.uk", from: "x.fictional@example.org", subject: "Out of office", receivedAt: "2026-11-16T11:05:00Z", headers: { "Auto-Submitted": "auto-replied" }, bodyText: "" }, deps));
const phone = await logCase({ type: "privacy", channel: "phone-or-video", received: "2026-11-13" }, deps);
out.push(`--- Privacy request made on a video call, logged by hand: ${phone.ref} (received 2026-11-13)`, "");
await recordEvent(phone.ref, "id-requested", "2026-11-16", deps);
for (const day of ["2026-11-19", "2026-11-24"]) {
  for (const n of await dailyCaseCheck({ store, today: day })) out.push(`--- Daily check ${day}`, n.subject, n.message, "");
}
out.push("=== Retention dry run (fictional)", reportText(dryRun(JSON.parse(readFileSync(new URL("./fictional-retention-items.json", import.meta.url))), { asOf: "2026-11-16" })), "");
out.push("=== Weekly health report (fictional facts)", buildHealthReport({
  asOf: "2026-11-16",
  deploys: [{ site: "lucindha", state: "ready", date: "2026-11-15" }, { site: "lucindha-stage2-test", state: "ready", date: "2026-11-11" }],
  functions: [{ site: "lucindha", name: "submission-created", calls: 14, errors: 0 }, { site: "lucindha-stage2-test", name: "enquiry-webhook", calls: 15, errors: 0 }],
  tasks: [{ name: "Weekly news check", lastRun: "2026-11-16", status: "succeeded", expectedEveryDays: 7 }],
  expiries: [{ what: "Stage 2 client secret", date: "2027-05-10" }, { what: "Netlify plan review (switch to Free)", date: "2027-01-04" }],
  formSubmissions7d: 14,
}).text);
console.log(out.join("\n"));
