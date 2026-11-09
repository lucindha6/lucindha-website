// Run with: npm test   (or: node --test tests/)
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  assess,
  buildEmail,
  firstName,
  handleSubmission,
  resetTokenCache,
  joinNatural,
  isValidEmail,
} from "../netlify/lib/ack.mjs";

const T0 = Date.parse("2026-11-20T10:00:00Z");

const ENV = {
  ACK_MODE: "live",
  ACK_FROM: "hello@lucindhalawson.co.uk",
  ACK_HASH_SECRET: "test-secret",
  M365_TENANT_ID: "tenant",
  M365_CLIENT_ID: "client",
  M365_CLIENT_SECRET: "SUPER-SECRET-VALUE",
};

function payload(over = {}, data = {}) {
  return {
    id: "sub-" + Math.random().toString(36).slice(2),
    form_name: "enquiry",
    created_at: new Date(T0).toISOString(),
    data: {
      name: "Sam Taylor",
      email: "sam@example.org",
      phone: "",
      about: "Accounting services",
      details: "I need help with my VAT return.",
      "contact-method": ["Email"],
      access: "",
      consent: "yes",
      "bot-field": "",
      ...data,
    },
    ...over,
  };
}

// In-memory stand-in for Netlify Blobs, including conditional writes and etags.
// Each call yields to the event loop first, so simultaneous calls really interleave.
function memoryStore() {
  const m = new Map();
  const etags = new Map();
  let n = 0;
  const tick = () => new Promise((r) => setImmediate(r));
  return {
    m,
    async get(k) {
      await tick();
      return m.has(k) ? JSON.parse(m.get(k)) : null;
    },
    async getWithMetadata(k) {
      await tick();
      return m.has(k) ? { data: JSON.parse(m.get(k)), etag: etags.get(k), metadata: {} } : null;
    },
    async setJSON(k, v, opts = {}) {
      await tick();
      if (opts.onlyIfNew && m.has(k)) return { modified: false };
      if (opts.onlyIfMatch && etags.get(k) !== opts.onlyIfMatch) return { modified: false };
      m.set(k, JSON.stringify(v));
      etags.set(k, `"${++n}"`);
      return { modified: true, etag: etags.get(k) };
    },
    async delete(k) {
      m.delete(k);
    },
    async list({ prefix }) {
      return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}

function fakeGraph({ sendStatuses = [202] } = {}) {
  const calls = [];
  let i = 0;
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/oauth2/v2.0/token")) {
      return { ok: true, status: 200, json: async () => ({ access_token: "tok", expires_in: 3600 }) };
    }
    const status = sendStatuses[Math.min(i++, sendStatuses.length - 1)];
    return { ok: status >= 200 && status < 300, status, headers: { get: () => null } };
  };
  return { fetchFn, calls, sends: () => calls.filter((c) => c.url.includes("/sendMail")) };
}

function deps(over = {}) {
  const logs = [];
  const g = over.graph || fakeGraph();
  let clock = over.clock ?? T0;
  return {
    logs,
    g,
    d: {
      env: { ...ENV, ...(over.env || {}) },
      fetchFn: g.fetchFn,
      store: "store" in over ? over.store : memoryStore(),
      now: () => clock,
      sleep: async () => {},
      log: (o) => logs.push(o),
    },
    tick(ms) {
      clock += ms;
    },
  };
}

beforeEach(() => resetTokenCache());

// ------------------------------------------------------------ switching on/off

test("does nothing when ACK_MODE is missing or off", async () => {
  for (const mode of [undefined, "", "off", "OFF", "yes"]) {
    const x = deps({ env: { ACK_MODE: mode } });
    const r = await handleSubmission(payload(), { ...x.d, store: null });
    assert.equal(r, "skipped");
    assert.equal(x.logs[0].reason, "disabled");
    assert.equal(x.g.calls.length, 0);
  }
});

test("test mode only sends to allowlisted addresses", async () => {
  const x = deps({ env: { ACK_MODE: "test", ACK_TEST_ALLOWLIST: "me@example.com, Sam@Example.org" } });
  assert.equal(await handleSubmission(payload(), x.d), "sent");
  const y = deps({ env: { ACK_MODE: "test", ACK_TEST_ALLOWLIST: "me@example.com" } });
  assert.equal(await handleSubmission(payload(), y.d), "skipped");
  assert.equal(y.logs[0].reason, "test-mode-not-allowlisted");
  assert.equal(y.g.calls.length, 0);
});

test("skips safely when Microsoft settings are missing", async () => {
  const x = deps({ env: { M365_CLIENT_SECRET: "" } });
  assert.equal(await handleSubmission(payload(), x.d), "skipped");
  assert.equal(x.logs[0].reason, "not-configured");
  assert.equal(x.g.calls.length, 0);
});

// ------------------------------------------------------------ spam & validation

test("spam and invalid submissions get no acknowledgement", async () => {
  const cases = [
    [{ "bot-field": "x" }, "honeypot"],
    [{ consent: "" }, "no-consent"],
    [{ email: "not-an-email" }, "bad-email"],
    [{ email: "a@b" }, "bad-email"],
    [{ email: "victim@example.org\r\nBcc: x@y.z" }, "bad-email"],
    [{ email: "hello@lucindhalawson.co.uk" }, "own-address"],
    [{ name: "Visit https://spam.example" }, "suspicious-name"],
    [{ name: "Win big www.casino.example" }, "suspicious-name"],
    [{ name: "<script>alert(1)</script>" }, "suspicious-name"],
    [{ name: "x".repeat(150) }, "suspicious-name"],
    [{ name: "" }, "suspicious-name"],
    [{ details: "http://a http://b http://c http://d" }, "suspicious-details"],
  ];
  for (const [data, reason] of cases) {
    const x = deps();
    assert.equal(await handleSubmission(payload({}, data), x.d), "skipped", reason);
    assert.equal(x.logs[0].reason, reason);
    assert.equal(x.g.calls.length, 0, reason);
  }
});

test("ignores other forms", () => {
  assert.equal(assess(payload({ form_name: "newsletter" }), ENV).reason, "other-form");
});

test("email validation", () => {
  assert.ok(isValidEmail("first.last+tag@sub.example.co.uk"));
  for (const bad of ["", "a@", "@b.com", "a b@c.com", "a@b..com", "a@-b.com", "a@b.com>", "x".repeat(250) + "@b.com"]) {
    assert.ok(!isValidEmail(bad), bad);
  }
});

// ------------------------------------------------------------ duplicates & limits

test("the same submission is only acknowledged once", async () => {
  const x = deps();
  const p = payload();
  assert.equal(await handleSubmission(p, x.d), "sent");
  assert.equal(await handleSubmission(p, x.d), "skipped");
  assert.equal(x.logs[1].reason, "duplicate-submission");
  assert.equal(x.g.sends().length, 1);
});

test("same address twice within 10 minutes gets one acknowledgement", async () => {
  const x = deps();
  assert.equal(await handleSubmission(payload(), x.d), "sent");
  x.tick(5 * 60 * 1000);
  assert.equal(await handleSubmission(payload({}, { email: "SAM@example.org" }), x.d), "skipped");
  assert.equal(x.logs[1].reason, "duplicate-address-10min");
  x.tick(6 * 60 * 1000);
  assert.equal(await handleSubmission(payload(), x.d), "sent");
});

test("an address gets at most 3 acknowledgements a day, then again next day", async () => {
  const x = deps();
  for (let i = 0; i < 3; i++) {
    assert.equal(await handleSubmission(payload(), x.d), "sent");
    x.tick(11 * 60 * 1000);
  }
  assert.equal(await handleSubmission(payload(), x.d), "skipped");
  assert.equal(x.logs[3].reason, "address-daily-limit");
  x.tick(25 * 60 * 60 * 1000);
  assert.equal(await handleSubmission(payload(), x.d), "sent");
});

test("10-minute duplicate check works across midnight", async () => {
  const x = deps({ clock: Date.parse("2026-11-20T23:55:00Z") });
  assert.equal(await handleSubmission(payload(), x.d), "sent");
  x.tick(7 * 60 * 1000); // 00:02 next day
  assert.equal(await handleSubmission(payload(), x.d), "skipped");
  assert.equal(x.logs[1].reason, "duplicate-address-10min");
});

test("simultaneous submissions to one address can't beat the daily limit", async () => {
  const x = deps();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => handleSubmission(payload(), x.d)),
  );
  assert.ok(results.filter((r) => r === "sent").length <= 3);
});

test("whole-site daily safety limit stops sending and alerts the owner", async () => {
  const x = deps();
  let sent = 0;
  for (let i = 0; i < 52; i++) {
    const r = await handleSubmission(payload({}, { email: `person${i}@example.org` }), x.d);
    if (r === "sent") sent++;
  }
  assert.equal(sent, 50);
  assert.equal(x.logs.filter((l) => l.reason === "site-daily-limit").length, 2);
  const alerts = x.g.sends().filter((c) => JSON.parse(c.init.body).message.subject === "Website acknowledgement not sent");
  assert.equal(alerts.length, 2);
});

test("store never holds the email address, name or enquiry text", async () => {
  const store = memoryStore();
  const x = deps({ store });
  await handleSubmission(payload({}, { access: "I use BSL", phone: "07700900123" }), x.d);
  const dump = JSON.stringify([...store.m.entries()]);
  for (const s of ["sam@example.org", "Sam", "Taylor", "VAT", "BSL", "07700900123"]) assert.ok(!dump.includes(s), s);
});

test("old fingerprints are deleted after 48 hours", async () => {
  const store = memoryStore();
  const x = deps({ store });
  await handleSubmission(payload(), x.d);
  assert.ok([...store.m.keys()].some((k) => k.startsWith("addr/2026-11-20")));
  x.tick(3 * 86_400_000);
  await handleSubmission(payload({ created_at: new Date(T0 + 3 * 86_400_000).toISOString() }, { email: "other@example.org" }), x.d);
  assert.ok(![...store.m.keys()].some((k) => k.startsWith("addr/2026-11-20")));
});

// ------------------------------------------------------------ Microsoft Graph

test("sends from hello@ with reply-to hello@, saved to Sent Items", async () => {
  const x = deps();
  await handleSubmission(payload(), x.d);
  const [send] = x.g.sends();
  assert.equal(send.url, "https://graph.microsoft.com/v1.0/users/hello%40lucindhalawson.co.uk/sendMail");
  const body = JSON.parse(send.init.body);
  assert.equal(body.saveToSentItems, true);
  assert.equal(body.message.toRecipients[0].emailAddress.address, "sam@example.org");
  assert.equal(body.message.replyTo[0].emailAddress.address, "hello@lucindhalawson.co.uk");
  assert.equal(body.message.body.contentType, "HTML");
  assert.equal(send.init.headers.Authorization, "Bearer tok");
  const tokenCall = x.g.calls.find((c) => c.url.includes("token"));
  assert.equal(tokenCall.url, "https://login.microsoftonline.com/tenant/oauth2/v2.0/token");
  assert.match(String(tokenCall.init.body), /grant_type=client_credentials/);
});

test("retries once on throttling, then succeeds", async () => {
  const x = deps({ graph: fakeGraph({ sendStatuses: [429, 202] }) });
  assert.equal(await handleSubmission(payload(), x.d), "sent");
  assert.equal(x.g.sends().length, 2);
});

test("failure: marks failed, alerts owner without personal data, logs no secrets", async () => {
  const x = deps({ graph: fakeGraph({ sendStatuses: [403, 403, 202] }) });
  const p = payload({}, { access: "I use BSL" });
  assert.equal(await handleSubmission(p, x.d), "failed");
  const sends = x.g.sends();
  assert.equal(sends.length, 2); // failed ack (403 not retried) + alert
  const alert = JSON.parse(sends[1].init.body).message;
  assert.equal(alert.toRecipients[0].emailAddress.address, "hello@lucindhalawson.co.uk");
  assert.equal(alert.subject, "Website acknowledgement not sent");
  for (const s of ["sam@example.org", "Sam", "VAT", "BSL"]) assert.ok(!alert.body.content.includes(s), s);
  assert.ok(alert.body.content.includes(p.id));
  assert.deepEqual(x.logs.at(-1), { fn: "enquiry-ack", id: p.id, result: "failed", stage: "send", status: 403 });
  // A failed submission is not retried automatically by a duplicate event.
  assert.equal(await handleSubmission(p, x.d), "skipped");
});

test("token failure is reported as a token problem", async () => {
  const fetchFn = async (url) =>
    url.includes("token") ? { ok: false, status: 401, json: async () => ({}) } : { ok: true, status: 202 };
  const x = deps();
  x.d.fetchFn = fetchFn;
  assert.equal(await handleSubmission(payload(), x.d), "failed");
  assert.equal(x.logs.at(-1).stage, "token");
});

test("logs never contain personal data or secrets", async () => {
  const x = deps({ graph: fakeGraph({ sendStatuses: [500, 500, 500] }) });
  await handleSubmission(payload({}, { phone: "07700900123", access: "Deafblind" }), x.d);
  const logs = JSON.stringify(x.logs);
  for (const s of ["sam@example.org", "Sam", "Taylor", "07700900123", "Deafblind", "SUPER-SECRET-VALUE", "tok"]) {
    assert.ok(!logs.includes(s), s);
  }
});

test("never throws, even if the store breaks", async () => {
  const x = deps({
    store: {
      get: async () => {
        throw new Error("boom");
      },
    },
  });
  assert.equal(await handleSubmission(payload(), x.d), "error");
  assert.equal(x.logs.at(-1).stage, "internal");
  // ...and the owner is told, with no personal details.
  const alert = JSON.parse(x.g.sends()[0].init.body).message;
  assert.equal(alert.subject, "Website acknowledgement not sent");
  assert.ok(!alert.body.content.includes("sam@example.org"));
});

test("a missing store is handled the same way", async () => {
  const x = deps({ store: null });
  assert.equal(await handleSubmission(payload(), x.d), "error");
  assert.equal(x.g.sends().length, 1); // alert only
});

test("two copies of the same event at the same moment send only one email", async () => {
  const x = deps();
  const p = payload();
  const results = await Promise.all([handleSubmission(p, x.d), handleSubmission(p, x.d)]);
  assert.deepEqual(results.sort(), ["sent", "skipped"]);
  assert.equal(x.g.sends().length, 1);
});

// ------------------------------------------------------------ wording

test("first names", () => {
  assert.equal(firstName("Sam Taylor"), "Sam");
  assert.equal(firstName("  sam  taylor "), "Sam");
  assert.equal(firstName("Siân O'Neill"), "Siân");
  assert.equal(firstName("Mary-Jane Smith"), "Mary-Jane");
  assert.equal(firstName("D'Arcy"), "D'Arcy");
  assert.equal(firstName("McDonald"), "McDonald");
  assert.equal(firstName("Dr. Jones"), ""); // falls back to "Hello,"
  assert.equal(firstName("12345"), "");
  assert.equal(firstName("http://x.example"), "");
});

test("email confirms contact method and asks for a number if missing", () => {
  const e = buildEmail({ first: "Sam", methods: ["Text message", "Video call"], phoneGiven: false, accessGiven: false });
  assert.match(e.text, /^Hello Sam,/);
  assert.match(e.text, /contact you by text message and video call/);
  assert.match(e.text, /If you'd like me to text or call you, you're welcome to reply with your mobile number/);
  assert.match(e.text, /If you'd rather not share it, that's absolutely fine/);
  assert.match(e.text, /BSL, an interpreter, large print/);
  const f = buildEmail({ first: "", methods: ["Email"], phoneGiven: true, accessGiven: true });
  assert.match(f.text, /^Hello,/);
  assert.doesNotMatch(f.text, /mobile number/);
  assert.match(f.text, /Thank you for telling me about your communication or access needs/);
});

test("email makes no hard promise and includes company details and privacy link", () => {
  const e = buildEmail({ first: "Sam", methods: ["Email"], phoneGiven: false, accessGiven: false });
  assert.match(e.text, /as soon as I can, usually within 2 working days/);
  assert.match(e.text, /Company no\. 17408408/);
  assert.match(e.html, /lang="en-GB"/);
  assert.match(e.html, /privacy\.html/);
  assert.doesNotMatch(e.text, /mobile number/); // email-only: no phone nudge
});

test("HTML escapes the name", () => {
  const e = buildEmail({ first: "O'Brien", methods: ["Email"], phoneGiven: false, accessGiven: false });
  assert.match(e.html, /Hello O&#39;Brien,/);
});

test("acknowledgement never repeats the enquiry or access details", async () => {
  const x = deps();
  await handleSubmission(payload({}, { details: "My secret tax issue", access: "I am Deafblind and use hands-on BSL" }), x.d);
  const content = JSON.parse(x.g.sends()[0].init.body).message.body.content;
  for (const s of ["secret tax", "Deafblind", "hands-on"]) assert.ok(!content.includes(s), s);
});

test("checkbox values as comma string are handled", () => {
  const r = assess(payload({}, { "contact-method": "Email, Phone call" }), ENV);
  assert.deepEqual(r.methods, ["Email", "Phone call"]);
  assert.equal(joinNatural(["Email", "Phone call", "Face to face"]), "email, phone call and face to face");
});

// ------------------------------------------------------------ review fixes

test("contact methods outside the form's own list are ignored (no injected text)", async () => {
  const x = deps();
  await handleSubmission(
    payload({}, { "contact-method": ["Claim your refund at hmrc-refund.co.uk", "Video call", "Email"] }),
    x.d,
  );
  const content = JSON.parse(x.g.sends()[0].init.body).message.body.content;
  assert.ok(!content.includes("refund"));
  assert.match(content, /by email and video call/);
});

test("names containing any web address are refused", () => {
  for (const name of ["Visit hmrc-refund.co.uk", "Bob bit.ly/x", "Jo //evil"]) {
    assert.equal(assess(payload({}, { name }), ENV).reason, "suspicious-name", name);
  }
  assert.equal(assess(payload({}, { name: "Dr. Jones" }), ENV).send, true);
});

test("no acknowledgements to the business's own addresses", () => {
  for (const email of ["media@lucindhalawson.co.uk", "alerts@example.com"]) {
    assert.equal(assess(payload({}, { email }), { ...ENV, ACK_ALERT_TO: "alerts@example.com" }).reason, "own-address", email);
  }
});

test("missing form name is treated as another form", () => {
  assert.equal(assess(payload({ form_name: undefined }), ENV).reason, "other-form");
});

test("the hash secret is required", async () => {
  const x = deps({ env: { ACK_HASH_SECRET: "" } });
  assert.equal(await handleSubmission(payload(), x.d), "skipped");
  assert.deepEqual(x.logs[0].missing, ["ACK_HASH_SECRET"]);
});

test("alerts go through the Netlify form first, so they work when Microsoft is broken", async () => {
  const fetchFn = async (url) =>
    url.includes("token") ? { ok: false, status: 401, json: async () => ({}) } : { ok: true, status: 202 };
  const x = deps();
  x.d.fetchFn = fetchFn;
  const alerts = [];
  x.d.alertViaForm = async (text) => {
    alerts.push(text);
    return true;
  };
  assert.equal(await handleSubmission(payload({}, { access: "Deafblind" }), x.d), "failed");
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /Problem: token \(401\)/);
  for (const s of ["sam@example.org", "Sam", "Deafblind"]) assert.ok(!alerts[0].includes(s), s);
  assert.ok(x.logs.some((l) => l.result === "alert-sent" && l.via === "netlify-form"));
});

test("a timed-out send is not retried (it may have gone) and is reported", async () => {
  let sends = 0;
  const fetchFn = async (url) => {
    if (url.includes("token")) return { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 3600 }) };
    sends++;
    if (sends === 1) throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    return { ok: true, status: 202 };
  };
  const x = deps();
  x.d.fetchFn = fetchFn;
  assert.equal(await handleSubmission(payload(), x.d), "failed");
  assert.equal(sends, 2); // the failed send + the Graph alert (no form route in this test)
  assert.equal(x.logs.at(-1).status, "timeout-or-network");
});

test("store keys are removed once older than yesterday", async () => {
  const store = memoryStore();
  const x = deps({ store });
  await handleSubmission(payload(), x.d);
  x.tick(2 * 86_400_000);
  await handleSubmission(payload({ created_at: new Date(T0 + 2 * 86_400_000).toISOString() }, { email: "b@example.org" }), x.d);
  const keys = [...store.m.keys()];
  assert.ok(!keys.some((k) => /^(addr|site)\/2026-11-20/.test(k)), keys.join(" "));
  assert.ok(keys.some((k) => k.startsWith("sub/2026-11-20"))); // submission markers kept 30 days
});

test("two different submissions from one address at the same moment send only one email", async () => {
  const x = deps();
  const results = await Promise.all([handleSubmission(payload(), x.d), handleSubmission(payload(), x.d)]);
  assert.deepEqual(results.sort(), ["sent", "skipped"]);
  assert.equal(x.g.sends().length, 1);
  assert.ok(x.logs.some((l) => l.reason === "duplicate-address-10min"));
});

test("a burst of 10 simultaneous submissions from one address sends one email", async () => {
  const x = deps();
  const results = await Promise.all(Array.from({ length: 10 }, () => handleSubmission(payload(), x.d)));
  assert.equal(results.filter((r) => r === "sent").length, 1);
  assert.equal(x.g.sends().length, 1);
});

test("the same event delivered 5 times at once sends one email", async () => {
  const x = deps();
  const p = payload();
  const results = await Promise.all(Array.from({ length: 5 }, () => handleSubmission(p, x.d)));
  assert.equal(results.filter((r) => r === "sent").length, 1);
});

test("OFF by default: every unset or unexpected ACK_MODE sends nothing and touches no storage", async () => {
  for (const mode of [undefined, null, "", " ", "off", "on", "true", "1", "enabled", "production"]) {
    const x = deps({ env: { ACK_MODE: mode } });
    let touched = false;
    const spy = new Proxy({}, { get: () => () => { touched = true; } });
    assert.equal(await handleSubmission(payload(), { ...x.d, store: spy }), "skipped", String(mode));
    assert.equal(x.g.calls.length, 0);
    assert.equal(touched, false);
  }
});

test("test or live mode with no Microsoft settings sends nothing", async () => {
  for (const mode of ["test", "live"]) {
    const x = deps({ env: { ACK_MODE: mode, ACK_TEST_ALLOWLIST: "sam@example.org", M365_TENANT_ID: "", M365_CLIENT_ID: "", M365_CLIENT_SECRET: "", ACK_HASH_SECRET: "" } });
    assert.equal(await handleSubmission(payload(), x.d), "skipped");
    assert.equal(x.logs[0].reason, "not-configured");
    assert.equal(x.g.calls.length, 0);
  }
});
