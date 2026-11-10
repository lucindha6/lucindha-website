// Produces the data for the Outlook workflow demonstration from the REAL Stage 2 code,
// run with a mock AI and a mock mailbox. All people and enquiries are FICTIONAL.
// Usage: node tools/demo.mjs > demo.json
import { readFileSync } from "node:fs";
import { handleWebhook } from "../lib/handler.mjs";
import { dailyCheck } from "../lib/daily.mjs";
import { signForTests } from "../lib/jws.mjs";
import { mockAi } from "../lib/ai.mjs";
import { mockGraph } from "../lib/graph.mjs";
import { ENQUIRIES, submission } from "../tests/fixtures.mjs";

const facts = JSON.parse(readFileSync(new URL("../config/approved-facts.json", import.meta.url)));
const pick = (note) => ENQUIRIES.find((e) => e.note.startsWith(note)).data;
const people = [
  ["Mon 16 Nov, 10:05", pick("bookkeeping, sole trader")],
  ["Mon 16 Nov, 11:20", pick("BSL video call")],
  ["Mon 16 Nov, 13:40", pick("complaint")],
  ["Mon 16 Nov, 15:10", pick("prompt injection")],
  ["Mon 16 Nov, 16:30", { ...pick("bookkeeping, sole trader"), details: "Sorry, I forgot to say I'm VAT-registered too." }],
];

const m = new Map();
const store = {
  async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
  async setJSON(k, v, o = {}) { if (o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; },
  async delete(k) { m.delete(k); },
  async list({ prefix }) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
};
const graph = mockGraph();
const inbox = [];
const env = {
  DRAFT_MODE: "test", DRAFT_TEST_ALLOWLIST: people.map(([, d]) => d.email).join(","), STAGE2_WEBHOOK_SECRET: "s", STAGE2_HASH_SECRET: "h",
  DRAFTS_MAILBOX: "drafts-test@lucindhalawson.co.uk", M365_DRAFTS_TENANT_ID: "t", M365_DRAFTS_CLIENT_ID: "c", M365_DRAFTS_CLIENT_SECRET: "x",
};
let clock = Date.parse("2026-11-16T10:05:00Z");
for (const [when, data] of people) {
  inbox.push({ when, from: "Netlify Forms", subject: "New website enquiry", kind: "original", who: data.name });
  const sub = submission(data);
  const raw = JSON.stringify({ payload: sub });
  await handleWebhook(raw, signForTests(raw, "s"), {
    env, store, graph, ai: mockAi(), facts, log: () => {}, now: () => clock,
    notify: async (n) => inbox.push({ when, from: "Stage 2 (via Netlify)", subject: n.subject, body: n.message, kind: "notice" }),
  });
  clock += 3600e3;
}
const draftsAfterMonday = [...graph.drafts.values()].map((d) => ({ ...d }));

// What you do on Monday evening, then the daily checks on Wednesday and Thursday.
const ids = [...graph.drafts.keys()];
graph.youSendDraft(ids[0], "2026-11-16T19:00:00.000Z"); // Priya: you edit and send the AI draft
graph.youReplySeparately("dev.patel@example.org", "2026-11-17T18:30:00.000Z"); // Dev: you reply from scratch
graph.youDeleteDraft(ids[3]); // Max (odd message): you decide no reply is needed
const notices = (when) => async (n) => inbox.push({ when, from: "Stage 2 (via Netlify)", subject: n.subject, body: n.message, kind: "notice" });
const wed = await dailyCheck({ store, graph, log: () => {}, notify: notices("Wed 18 Nov, 18:00"), now: () => Date.parse("2026-11-18T18:00:00Z") });
const thu = await dailyCheck({ store, graph, log: () => {}, notify: notices("Thu 19 Nov, 18:00"), now: () => Date.parse("2026-11-19T18:00:00Z") });

const records = [...m.entries()].filter(([k]) => k.startsWith("rec/")).map(([, v]) => JSON.parse(v));
console.log(JSON.stringify({ inbox, draftsAfterMonday, draftsNow: [...graph.drafts.values()], records, wed, thu }, null, 2));
