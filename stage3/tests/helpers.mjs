// Test helpers: an in-memory stand-in for the store, and FICTIONAL messages.
export function memoryStore() {
  const m = new Map();
  const v = new Map(); // version per key, like Netlify Blobs etags
  const tick = () => new Promise((r) => setImmediate(r));
  return {
    m,
    v,
    async get(k) { await tick(); return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async getWithMetadata(k) { await tick(); return m.has(k) ? { data: JSON.parse(m.get(k)), etag: String(v.get(k) || 0) } : null; },
    async setJSON(k, val, o = {}) {
      await tick();
      if (o.onlyIfNew && m.has(k)) return { modified: false };
      if (o.onlyIfMatch !== undefined && String(v.get(k) || 0) !== o.onlyIfMatch) return { modified: false };
      m.set(k, JSON.stringify(val)); v.set(k, (v.get(k) || 0) + 1);
      return { modified: true };
    },
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
