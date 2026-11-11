// Produces the data for the Phase 2 Outlook demonstration from the REAL Stage 2 code, run with
// a mock mailbox and the PROPOSED (not approved) wording. All people and enquiries are FICTIONAL.
// Usage: node tools/demo.mjs > demo.json
import { readFileSync } from "node:fs";
import { handleWebhook } from "../lib/handler.mjs";
import { dailyCheck } from "../lib/daily.mjs";
import { signForTests } from "../lib/jws.mjs";
import { mockGraph } from "../lib/graph.mjs";
import { mailboxNotifier } from "../lib/notify.mjs";
import { ENQUIRIES, submission } from "../tests/fixtures.mjs";

const facts = JSON.parse(readFileSync(new URL("../config/approved-facts.json", import.meta.url)));
const pick = (note) => ENQUIRIES.find((e) => e.note.startsWith(note)).data;

function memStore() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async setJSON(k, v, o = {}) { if (o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}
const envFor = (emails) => ({
  DRAFT_MODE: "test", DRAFT_TEST_ALLOWLIST: emails.join(","), STAGE2_WEBHOOK_SECRET: "s", STAGE2_HASH_SECRET: "h",
  DRAFTS_MAILBOX: "drafts-test@lucindhalawson.co.uk", M365_DRAFTS_TENANT_ID: "t", M365_DRAFTS_CLIENT_ID: "c", M365_DRAFTS_CLIENT_SECRET: "x",
});
async function run({ store, graph, env, data, at }) {
  const sub = submission(data, { created_at: new Date(at).toISOString() });
  const raw = JSON.stringify({ payload: sub });
  return handleWebhook(raw, signForTests(raw, "s"), { env, store, graph, notify: mailboxNotifier(graph), facts, log: () => {}, now: () => at + 5000 });
}

// ---------------------------------------------------------------- 1. a week in the mailbox
const week = [
  ["Mon 16 Nov, 10:05", "2026-11-16T10:05:00Z", pick("bookkeeping, sole trader")],
  ["Mon 16 Nov, 11:20", "2026-11-16T11:20:00Z", pick("BSL video call")],
  ["Mon 16 Nov, 13:40", "2026-11-16T13:40:00Z", pick("complaint")],
  ["Mon 16 Nov, 15:10", "2026-11-16T15:10:00Z", pick("prompt injection")],
  ["Mon 16 Nov, 16:30", "2026-11-16T16:30:00Z", { ...pick("bookkeeping, sole trader"), details: "Sorry, I forgot to say I'm VAT-registered too, so I'll need help with VAT returns as well." }],
];
const store = memStore();
const graph = mockGraph();
const env = envFor(week.map(([, , d]) => d.email));
const inbox = [];
for (const [when, iso, data] of week) {
  const before = graph.notices.length;
  const r = await run({ store, graph, env, data, at: Date.parse(iso) });
  graph.stage1AcknowledgementSent(data.email, iso); // Stage 1 still sends its acknowledgement, saved in Sent Items
  inbox.push({ when, kind: "original", who: data.name, result: r.result });
  for (const n of graph.notices.slice(before)) inbox.push({ when, kind: "notice", subject: n.subject, body: n.message });
}
const refs = Object.fromEntries([...store.m.entries()].filter(([k]) => k.startsWith("rec/")).map(([, v]) => JSON.parse(v)).map((r, i) => [week[i][2].name + (i === 4 ? " (follow-up)" : ""), r.ref]));
const draftsMonday = [...graph.drafts.values()].map((d) => ({ to: d.to, subject: d.subject, category: d.category }));

// What you do, then the daily checks on Wednesday and Thursday.
const [priyaDraft, devDraft] = [...graph.drafts.keys()];
graph.youSendDraft(priyaDraft, "2026-11-16T19:00:00.000Z"); // Priya: you add a line about VAT and send the draft
graph.youReplySeparately("dev.patel@example.org", "2026-11-17T18:30:00.000Z", `RE: Your enquiry to Lucindha Lawson (ref ${refs["Dev Patel"]})`);
graph.youReplySeparately("kim.brown@example.org", "2026-11-17T19:15:00.000Z", `Your enquiry to Lucindha Lawson (ref ${refs["Kim Brown"]})`);
graph.youReplySeparately("max.reed@example.org", "2026-11-17T20:00:00.000Z", "Max – unrelated email about futsal on Saturday"); // not a reply: no reference
const later = [];
const wed = await dailyCheck({ store, graph, env, log: () => {}, notify: async (n) => later.push({ when: "Wed 18 Nov, 18:00", ...n }), now: () => Date.parse("2026-11-18T18:00:00Z") });
const thu = await dailyCheck({ store, graph, env, log: () => {}, notify: async (n) => later.push({ when: "Thu 19 Nov, 18:00", ...n }), now: () => Date.parse("2026-11-19T18:00:00Z") });
const finalCategories = [...graph.drafts.values()].map((d) => ({ to: d.to, category: d.category, isDraft: d.isDraft }));

// ---------------------------------------------------------------- 2. finished template replies
const previewCases = [
  ["Bookkeeping, sole trader, email", pick("bookkeeping, sole trader")],
  ["Personal tax, BSL video call", pick("BSL video call")],
  ["Year-end accounts and Corporation Tax", pick("limited company year-end")],
  ["Deafblind, email only", pick("Deafblind, email only")],
  ["Management accounts, large print", pick("large print")],
  ["Business support (no published price)", pick("business support")],
  ["Community: school talk", pick("school talk with a date")],
  ["Community: charity workshop", pick("charity workshop with a small budget")],
  ["Community: possible collaboration", pick("possible collaboration")],
  ["Media: interview request", pick("media interview about futsal")],
];
const previews = [];
for (const [label, data] of previewCases) {
  const g = mockGraph();
  await run({ store: memStore(), graph: g, env: envFor([data.email]), data, at: Date.parse("2026-11-16T10:00:00Z") });
  const [d] = [...g.drafts.values()];
  previews.push({ label, name: data.name, to: d.to, subject: d.subject, category: d.category, html: d.html, notice: g.notices[0] });
}

console.log(JSON.stringify({ inbox, refs, draftsMonday, later, wed, thu, finalCategories, previews }, null, 2));
