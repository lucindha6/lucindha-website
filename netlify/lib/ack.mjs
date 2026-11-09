// Automatic acknowledgement for website enquiries.
//
// Pure logic lives here so it can be tested without Netlify or Microsoft.
// The Netlify Function in netlify/functions/submission-created.mjs wires in the
// real fetch, Netlify Blobs store and environment variables.
//
// Privacy rules followed throughout:
//  - Never log names, email addresses, phone numbers or enquiry text. Logs hold
//    the submission id, a result code and (on failure) an HTTP status only.
//  - The acknowledgement never repeats what the visitor wrote, including any
//    access needs (which may be health information).
//  - Duplicate checking stores a keyed hash of the email address, never the
//    address itself, and deletes it within about 48 hours.

import { createHmac } from "node:crypto";

export const FORM_NAME = "enquiry";
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000; // same address within 10 minutes
export const MAX_PER_ADDRESS_PER_DAY = 3; // per calendar day (UTC)
export const MAX_PER_SITE_PER_DAY = 50; // overall safety cap
export const SUB_RETENTION_DAYS = 30;
export const TIME_BUDGET_MS = 6000; // stay well inside Netlify's function time limit
const FETCH_TIMEOUT_MS = 3000;

// The only contact methods the form offers. Anything else is ignored, so nobody can
// put their own words into an email that is sent from hello@.
export const CONTACT_METHODS = ["Email", "Text message", "Video call", "Phone call", "Face to face"];
const OWN_DOMAIN = "lucindhalawson.co.uk";

const SITE = "https://www.lucindhalawson.co.uk";
const COMPANY_LINE =
  "LUCINDHA LAWSON LTD. Registered in England & Wales. Company no. 17408408. " +
  "Registered office: 128 City Road, London, EC1V 2NX.";

// ---------------------------------------------------------------- helpers

const CONTROL = /[\u0000-\u001f\u007f]/g;

export function clean(value, max = 500) {
  if (value == null) return "";
  if (Array.isArray(value)) value = value.join(", ");
  return String(value).replace(CONTROL, " ").trim().slice(0, max);
}

/** Checkbox groups may arrive as an array or a comma-separated string. */
export function asList(value) {
  if (value == null || value === "") return [];
  const list = Array.isArray(value) ? value : String(value).split(",");
  return list.map((v) => clean(v, 60)).filter(Boolean);
}

export function isValidEmail(email) {
  if (!email || email.length > 254) return false;
  // Deliberately simple: one @, no spaces, a dot in the domain.
  return /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(
    email,
  );
}

// Links, web addresses (any "something.tld"), markup or email addresses.
const LINKISH = /(https?:\/\/|www\.|\.[a-z]{2,}\b|<|>|@|\[url|\/\/)/i;

/** First name for the greeting, or "" if the name looks unsafe or odd. */
export function firstName(fullName) {
  const name = clean(fullName, 100);
  if (!name || LINKISH.test(name)) return "";
  const first = name.split(/\s+/)[0];
  if (!/^[\p{L}][\p{L}'’-]{0,29}$/u.test(first)) return "";
  // Tidy an all-lowercase name ("sam" -> "Sam"); otherwise keep it as typed.
  if (first === first.toLowerCase()) return first.charAt(0).toUpperCase() + first.slice(1);
  return first;
}

function countLinks(text) {
  return (String(text || "").match(/https?:\/\/|www\./gi) || []).length;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function joinNatural(items) {
  const list = items.map((s) => s.toLowerCase());
  if (list.length <= 1) return list.join("");
  return list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
}

export function hashAddress(email, secret) {
  if (!secret) throw new Error("ACK_HASH_SECRET missing");
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex");
}

function dayKey(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// ---------------------------------------------------------------- decide

/**
 * Decide whether to send. Returns { send: false, reason } or
 * { send: true, to, first, methods, phoneGiven, accessGiven }.
 * Reasons are short codes that are safe to log.
 */
export function assess(payload, env) {
  const mode = String(env.ACK_MODE || "off").toLowerCase();
  if (mode !== "test" && mode !== "live") return { send: false, reason: "disabled" };

  if (!payload || typeof payload !== "object") return { send: false, reason: "no-payload" };
  if (payload.form_name !== FORM_NAME) return { send: false, reason: "other-form" };

  const d = payload.data || {};
  if (clean(d["bot-field"])) return { send: false, reason: "honeypot" };
  if (clean(d.consent).toLowerCase() !== "yes") return { send: false, reason: "no-consent" };

  const to = clean(d.email, 254).toLowerCase();
  if (!isValidEmail(to)) return { send: false, reason: "bad-email" };

  const from = clean(env.ACK_FROM || "hello@lucindhalawson.co.uk").toLowerCase();
  const alertTo = clean(env.ACK_ALERT_TO).toLowerCase();
  if (to === from || to === alertTo || to.endsWith("@" + OWN_DOMAIN)) return { send: false, reason: "own-address" };

  const rawName = clean(d.name, 300);
  if (!rawName || rawName.length > 100 || LINKISH.test(rawName)) return { send: false, reason: "suspicious-name" };
  if (countLinks(d.details) > 3) return { send: false, reason: "suspicious-details" };

  if (mode === "test") {
    const allow = String(env.ACK_TEST_ALLOWLIST || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!allow.includes(to)) return { send: false, reason: "test-mode-not-allowlisted" };
  }

  const methods = CONTACT_METHODS.filter((m) => asList(d["contact-method"]).some((v) => v.toLowerCase() === m.toLowerCase()));
  return {
    send: true,
    to,
    first: firstName(rawName),
    methods: methods.length ? methods : ["Email"],
    phoneGiven: clean(d.phone, 40).replace(/[^0-9+]/g, "").length >= 7,
    accessGiven: clean(d.access, 2000).length > 0,
  };
}

// ---------------------------------------------------------------- email

export function buildEmail({ first, methods, phoneGiven, accessGiven }) {
  const greeting = first ? `Hello ${first},` : "Hello,";
  const paras = [];

  paras.push(
    "Thank you for getting in touch. I've received your enquiry and I'll reply as soon as I can, usually within 2 working days.",
  );

  const wantsPhone = methods.some((m) => /text|phone/i.test(m));
  paras.push(`You told me you'd like me to contact you by ${joinNatural(methods)}. I'll do my best to use what you've chosen.`);
  if (wantsPhone && !phoneGiven) {
    paras.push(
      "If you'd like me to text or call you, you're welcome to reply with your mobile number. If you'd rather not share it, that's absolutely fine – I'll contact you another way.",
    );
  }

  if (accessGiven) {
    paras.push("Thank you for telling me about your communication or access needs. I'll take them into account when I reply.");
  } else {
    paras.push(
      "If you have any communication or access needs, such as BSL, an interpreter, large print or more time, just reply to this email and let me know.",
    );
  }

  paras.push("If you'd like to add anything to your enquiry, simply reply to this email.");

  const signature = ["Best wishes,", "Lucindha Lawson MAAT", "www.lucindhalawson.co.uk"];
  const footer = [
    "This is an automatic email to confirm that an enquiry was sent from www.lucindhalawson.co.uk using this email address. If this wasn't you, you can ignore it, or reply to let me know.",
    `How I use your information: ${SITE}/privacy.html`,
    COMPANY_LINE,
  ];

  const subject = "Thank you for your enquiry – Lucindha Lawson";

  const text = [greeting, "", ...paras.flatMap((p) => [p, ""]), ...signature, "", "—", ...footer.flatMap((f) => [f, ""])]
    .join("\n")
    .trim();

  const p = (t) => `<p style="margin:0 0 16px">${escapeHtml(t)}</p>`;
  const html = `<!doctype html>
<html lang="en-GB">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">
<div style="max-width:600px">
${p(greeting)}
${paras.map(p).join("\n")}
<p style="margin:0 0 24px">${escapeHtml(signature[0])}<br>${escapeHtml(signature[1])}<br><a href="${SITE}" style="color:#0b4f8a">www.lucindhalawson.co.uk</a></p>
<hr style="border:0;border-top:1px solid #cccccc;margin:24px 0">
<p style="margin:0 0 12px;font-size:14px;color:#444444">${escapeHtml(footer[0])}</p>
<p style="margin:0 0 12px;font-size:14px;color:#444444">How I use your information: <a href="${SITE}/privacy.html" style="color:#0b4f8a">privacy notice</a></p>
<p style="margin:0;font-size:14px;color:#444444">${escapeHtml(COMPANY_LINE)}</p>
</div>
</body>
</html>`;

  return { subject, text, html };
}

// ---------------------------------------------------------------- Microsoft Graph

let cachedToken = null; // { token, expires } – reused while the function stays warm

export function resetTokenCache() {
  cachedToken = null;
}

export class GraphError extends Error {
  constructor(stage, status) {
    super(`graph-${stage}-${status}`); // no response body: it can contain addresses
    this.stage = stage;
    this.status = status;
  }
}

function withTimeout(init) {
  return { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
}

async function getToken(env, fetchFn, now) {
  if (cachedToken && cachedToken.expires - 60_000 > now) return cachedToken.token;
  const body = new URLSearchParams({
    client_id: env.M365_CLIENT_ID,
    client_secret: env.M365_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  let res;
  try {
    res = await fetchFn(
      `https://login.microsoftonline.com/${encodeURIComponent(env.M365_TENANT_ID)}/oauth2/v2.0/token`,
      withTimeout({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }),
    );
  } catch {
    throw new GraphError("token", "timeout-or-network");
  }
  if (!res.ok) throw new GraphError("token", res.status);
  const json = await res.json();
  cachedToken = { token: json.access_token, expires: now + (json.expires_in || 3000) * 1000 };
  return cachedToken.token;
}

/** Send one email as the shared mailbox. Retries once on throttling or server errors if time allows. */
export async function sendMail({ env, fetchFn, now, sleep, startedAt, to, subject, html, text }) {
  const from = env.ACK_FROM || "hello@lucindhalawson.co.uk";
  const message = {
    subject,
    body: { contentType: html ? "HTML" : "Text", content: html || text },
    toRecipients: [{ emailAddress: { address: to } }],
    replyTo: [{ emailAddress: { address: from } }],
    // Ask Exchange-based recipients not to send out-of-office replies to an automatic email.
    internetMessageHeaders: [{ name: "X-Auto-Response-Suppress", value: "All" }],
  };
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const token = await getToken(env, fetchFn, now());
    let res;
    try {
      res = await fetchFn(
        url,
        withTimeout({
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message, saveToSentItems: true }),
        }),
      );
    } catch {
      // A timeout may still have been delivered, so never retry it (avoids a double email).
      throw new GraphError("send", "timeout-or-network");
    }
    if (res.status === 202 || res.ok) return;
    if (res.status === 401) resetTokenCache();
    const retryable = res.status === 429 || res.status >= 500 || res.status === 401;
    const timeLeft = TIME_BUDGET_MS - (now() - (startedAt ?? now()));
    if (attempt === 1 && retryable && timeLeft > FETCH_TIMEOUT_MS + 1000) {
      const ra = Number(res.headers?.get?.("retry-after"));
      await sleep(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000, 1000));
      continue;
    }
    throw new GraphError("send", res.status);
  }
}

export function configMissing(env) {
  return ["M365_TENANT_ID", "M365_CLIENT_ID", "M365_CLIENT_SECRET", "ACK_HASH_SECRET"].filter((k) => !env[k]);
}

// ---------------------------------------------------------------- store (dedupe + limits)
//
// Keys (no personal data):
//   sub/<YYYY-MM-DD>/<submission id>          status of one submission      – kept 30 days
//   addr/<YYYY-MM-DD>/<hash>/<1..3>           one send slot per address/day – kept until the day after
//   site/<YYYY-MM-DD>/<1..50>                 one slot per acknowledgement  – kept until the day after
//   win/<hash>                                time of the last acknowledgement to that address – kept until the day after
// Every claim is an atomic conditional write ("only if new" or "only if unchanged"), so
// simultaneous submissions can't get past the 10-minute window or the limits.

async function claimSlot(store, prefix, max, value) {
  for (let n = 1; n <= max; n++) {
    const r = await store.setJSON(`${prefix}/${n}`, value, { onlyIfNew: true });
    if (!r || r.modified !== false) return n;
  }
  return 0;
}

/**
 * Atomically claim the 10-minute window for one address (compare-and-swap).
 * Returns true if this submission may send; false if another one already did or is doing.
 */
async function claimWindow(store, key, t) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await store.getWithMetadata(key, { type: "json" });
    if (current && current.data && t - current.data.at < DUPLICATE_WINDOW_MS) return false;
    const r = current
      ? await store.setJSON(key, { at: t }, { onlyIfMatch: current.etag })
      : await store.setJSON(key, { at: t }, { onlyIfNew: true });
    if (!r || r.modified !== false) return true;
    // Someone else wrote first: read again and re-check.
  }
  return false;
}

async function tidy(store, now) {
  // Address and site slots: keep today and yesterday only. Submission markers: 30 days.
  try {
    const keepFrom = dayKey(new Date(now - 86_400_000));
    const subKeepFrom = dayKey(new Date(now - SUB_RETENTION_DAYS * 86_400_000));
    for (const [prefix, cutoff] of [
      ["addr/", keepFrom],
      ["site/", keepFrom],
      ["sub/", subKeepFrom],
    ]) {
      const { blobs = [] } = (await store.list({ prefix })) || {};
      for (const b of blobs) {
        if (b.key.slice(prefix.length, prefix.length + 10) < cutoff) await store.delete(b.key);
      }
    }
    const { blobs: wins = [] } = (await store.list({ prefix: "win/" })) || {};
    for (const b of wins) {
      const v = await store.get(b.key, { type: "json" });
      if (!v || now - v.at > 2 * 86_400_000) await store.delete(b.key);
    }
  } catch {
    // Tidying is best-effort; never block an acknowledgement on it.
  }
}

// ---------------------------------------------------------------- main handler

/**
 * Process one verified form submission.
 * deps: { env, fetchFn, store, now(), sleep(ms), log(obj), alertViaForm(text) }
 * Returns a result code (also logged). Never throws.
 */
export async function handleSubmission(payload, deps) {
  const { env, fetchFn, store, log } = deps;
  const now = deps.now || (() => Date.now());
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const startedAt = now();
  const id = clean(payload?.id, 64).replace(/[^A-Za-z0-9_-]/g, "") || "unknown";
  const done = (result, extra = {}) => {
    log({ fn: "enquiry-ack", id, result, ...extra });
    return result;
  };
  const ctx = { env, fetchFn, now, sleep, startedAt, log, id, alertViaForm: deps.alertViaForm };

  try {
    const decision = assess(payload, env);
    if (!decision.send) return done("skipped", { reason: decision.reason });

    const missing = configMissing(env);
    if (missing.length) return done("skipped", { reason: "not-configured", missing });

    const t = startedAt;
    const today = dayKey(new Date(t));
    const created = new Date(Date.parse(payload.created_at) || t);
    const hash = hashAddress(decision.to, env.ACK_HASH_SECRET);
    const subKey = `sub/${dayKey(created)}/${id === "unknown" ? hashAddress(decision.to + created.toISOString(), env.ACK_HASH_SECRET) : id}`;

    await tidy(store, t);

    // 1. Same submission seen before (for example a retried event)? Atomic claim.
    const claim = await store.setJSON(subKey, { status: "processing", at: t }, { onlyIfNew: true });
    if (claim && claim.modified === false) return done("skipped", { reason: "duplicate-submission" });
    const mark = (status) => store.setJSON(subKey, { status, at: t });

    // 2. Same address within the last 10 minutes (including at the very same moment)?
    if (!(await claimWindow(store, `win/${hash}`, t))) {
      await mark("skipped-recent");
      return done("skipped", { reason: "duplicate-address-10min" });
    }

    // 3. Per-address and whole-site daily limits (claimed before sending).
    if (!(await claimSlot(store, `addr/${today}/${hash}`, MAX_PER_ADDRESS_PER_DAY, { at: t }))) {
      await mark("skipped-limit");
      return done("skipped", { reason: "address-daily-limit" });
    }
    if (!(await claimSlot(store, `site/${today}`, MAX_PER_SITE_PER_DAY, { at: t }))) {
      await mark("skipped-site-limit");
      await alertOwner(ctx, {
        created,
        problem: `the daily safety limit of ${MAX_PER_SITE_PER_DAY} acknowledgements was reached`,
        advice: "This can mean the form is being abused. Acknowledgements restart tomorrow. Check the Forms area in Netlify for spam.",
      });
      return done("skipped", { reason: "site-daily-limit" });
    }

    // 4. Send.
    try {
      await sendMail({ ...ctx, to: decision.to, ...buildEmail(decision) });
    } catch (err) {
      await mark("failed");
      const status = err instanceof GraphError ? err.status : undefined;
      const stage = err instanceof GraphError ? err.stage : "send";
      await alertOwner(ctx, { created, problem: `${stage}${status ? " (" + status + ")" : ""}` });
      return done("failed", { stage, status });
    }

    await mark("sent");
    return done("sent", { mode: String(env.ACK_MODE).toLowerCase() });
  } catch (err) {
    // Something unexpected (for example the store is unavailable). Tell the owner if we can.
    const stage = err instanceof GraphError ? err.stage : "internal";
    await alertOwner(ctx, { created: new Date(startedAt), problem: stage });
    return done("error", { stage });
  }
}

/**
 * Tell the owner an acknowledgement was not sent, without any enquiry details.
 * First choice: a hidden Netlify form ("ack-alert"), whose notification email is
 * sent by Netlify and so still works if the Microsoft connection is broken.
 * Fallback: Microsoft Graph.
 */
async function alertOwner(ctx, { created, problem, advice }) {
  const { env, fetchFn, log, id, alertViaForm } = ctx;
  const when = created.toLocaleString("en-GB", { timeZone: "Europe/London" });
  const text = [
    "The automatic acknowledgement for a website enquiry was not sent.",
    "",
    `Enquiry received: ${when} (UK time)`,
    `Netlify submission id: ${id}`,
    `Problem: ${problem}`,
    "",
    advice ||
      "The enquiry itself has still arrived in the usual Netlify notification email. Please reply to that enquirer yourself. If this keeps happening, the Microsoft client secret may have expired or a permission may have changed.",
  ].join("\n");

  if (alertViaForm) {
    try {
      if (await alertViaForm(text)) return log({ fn: "enquiry-ack", id, result: "alert-sent", via: "netlify-form" });
    } catch {
      /* fall through to Microsoft */
    }
  }
  if (configMissing(env).length) return log({ fn: "enquiry-ack", id, result: "alert-failed" });
  try {
    await sendMail({ ...ctx, to: env.ACK_ALERT_TO || env.ACK_FROM || "hello@lucindhalawson.co.uk", subject: "Website acknowledgement not sent", text });
    log({ fn: "enquiry-ack", id, result: "alert-sent", via: "graph" });
  } catch {
    log({ fn: "enquiry-ack", id, result: "alert-failed" });
  }
}
