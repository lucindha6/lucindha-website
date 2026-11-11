// Test helpers: an in-memory stand-in for the store, and FICTIONAL messages.
export function memoryStore() {
  const m = new Map();
  const tick = () => new Promise((r) => setImmediate(r));
  return {
    m,
    async get(k) { await tick(); return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async setJSON(k, v, o = {}) { await tick(); if (o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}
let n = 0;
export function message(over = {}) {
  n++;
  return {
    id: `fict-msg-${n}`,
    mailbox: "complaints@lucindhalawson.co.uk",
    from: `fictional.person${n}@example.org`,
    subject: "About my accounts",
    receivedAt: "2026-11-16T10:00:00Z",
    conversationId: `fict-thread-${n}`,
    headers: {},
    bodyText: "FICTIONAL. I am unhappy with how my enquiry was handled.",
    ...over,
  };
}
export const SECRET = "test-hash-secret";
