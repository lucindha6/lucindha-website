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
//    address itself, and deletes it after ADDR_RETENTION_DAYS.

import { createHmac, createHash } from "node:crypto";

export const FORM_NAME = "enquiry";
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000; // same address within 10 minutes
export const MAX_PER_ADDRESS_PER_DAY = 3;
export const ADDR_RETENTION_DAYS = 2;
export const SUB_RETENTION_DAYS = 30;

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

const LINKISH = /(https?:\/\/|www\.|\.(com|net|org|ru|xyz|top|info|biz)\b|<|>|@|\[url)/i;

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
  const normalised = email.trim().toLowerCase();
  if (secret) return createHmac("sha256", secret).update(normalised).digest("hex");
  return createHash("sha256").update("ll-ack:" + normalised).digest("hex");
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
  if (payload.form_name && payload.form_name !== FORM_NAME) return { send: false, reason: "other-form" };

  const d = payload.data || {};
  if (clean(d["bot-field"])) return { send: false, reason: "honeypot" };
  if (clean(d.consent).toLowerCase() !== "yes") return { send: false, reason: "no-consent" };

  const to = clean(d.email, 254).toLowerCase();
  if (!isValidEmail(to)) return { send: false, reason: "bad-email" };

  const from = clean(env.ACK_FROM || "hello@lucindhalawson.co.uk").toLowerCase();
  if (to === from) return { send: false, reason: "own-address" };

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

  const methods = asList(d["contact-method"]);
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
      "You asked for a text message or phone call, but I don't have a mobile number for you. If you'd like me to use one, please reply to this email with your number.",
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

  const signature = ["Best wishes,", "Lucindha Lawson MAAT", "LUCINDHA LAWSON LTD", "www.lucindhalawson.co.uk"];
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
<p style="margin:0 0 24px">${signature.map(escapeHtml).join("<br>")}</p>
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

async function getToken(env, fetchFn, now) {
  if (cachedToken && cachedToken.expires - 60_000 > now) return cachedToken.token;
  const body = new URLSearchParams({
    client_id: env.M365_CLIENT_ID,
    client_secret: env.M365_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetchFn(`https://login.microsoftonline.com/${encodeURIComponent(env.M365_TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new GraphError("token", res.status);
  const json = await res.json();
  cachedToken = { token: json.access_token, expires: now + (json.expires_in || 3000) * 1000 };
  return cachedToken.token;
}

export class GraphError extends Error {
  constructor(stage, status) {
    super(`graph-${stage}-${status}`); // no response body: it can contain addresses
    this.stage = stage;
    this.status = status;
  }
}

/** Send one email as the shared mailbox. Retries once on throttling or server errors. */
export async function sendMail({ env, fetchFn, now, sleep, to, subject, html, text, replyTo }) {
  const from = env.ACK_FROM || "hello@lucindhalawson.co.uk";
  const message = {
    subject,
    body: { contentType: html ? "HTML" : "Text", content: html || text },
    toRecipients: [{ emailAddress: { address: to } }],
    replyTo: [{ emailAddress: { address: replyTo || from } }],
    // Ask Exchange-based recipients not to send out-of-office replies to an automatic email.
    internetMessageHeaders: [{ name: "X-Auto-Response-Suppress", value: "All" }],
  };
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const token = await getToken(env, fetchFn, now());
    const res = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
    if (res.status === 202 || res.ok) return;
    if (res.status === 401) resetTokenCache();
    const retryable = res.status === 429 || res.status >= 500 || res.status === 401;
    if (attempt === 1 && retryable) {
      const ra = Number(res.headers?.get?.("retry-after"));
      await sleep(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500, 3000));
      continue;
    }
    throw new GraphError("send", res.status);
  }
}

export function configMissing(env) {
  return ["M365_TENANT_ID", "M365_CLIENT_ID", "M365_CLIENT_SECRET"].filter((k) => !env[k]);
}

// ---------------------------------------------------------------- store (dedupe + rate limit)

async function tidy(store, now) {
  // Delete fingerprints and submission markers older than their retention period.
  try {
    const cutoffAddr = dayKey(new Date(now - ADDR_RETENTION_DAYS * 86_400_000));
    const cutoffSub = dayKey(new Date(now - SUB_RETENTION_DAYS * 86_400_000));
    for (const [prefix, cutoff] of [
      ["addr/", cutoffAddr],
      ["sub/", cutoffSub],
    ]) {
      const { blobs = [] } = (await store.list({ prefix })) || {};
      for (const b of blobs) {
        const day = b.key.slice(prefix.length, prefix.length + 10);
        if (day < cutoff) await store.delete(b.key);
      }
    }
  } catch {
    // Tidying is best-effort; never block an acknowledgement on it.
  }
}

// ---------------------------------------------------------------- main handler

/**
 * Process one verified form submission.
 * deps: { env, fetchFn, store, now(), sleep(ms), log(obj) }
 * Returns a result code (also logged). Never throws.
 */
export async function handleSubmission(payload, deps) {
  const { env, fetchFn, store, log } = deps;
  const now = deps.now || (() => Date.now());
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const id = clean(payload?.id, 64) || "unknown";
  const done = (result, extra = {}) => {
    log({ fn: "enquiry-ack", id, result, ...extra });
    return result;
  };

  try {
    const decision = assess(payload, env);
    if (!decision.send) return done("skipped", { reason: decision.reason });

    const missing = configMissing(env);
    if (missing.length) return done("skipped", { reason: "not-configured", missing });

    const t = now();
    const created = new Date(Date.parse(payload.created_at) || t);
    const subKey = `sub/${dayKey(created)}/${id === "unknown" ? hashAddress(decision.to + created.toISOString(), env.ACK_HASH_SECRET) : id}`;

    // 1. Same submission seen before (for example a retried event)?
    //    The conditional write makes this safe even if two copies run at the same moment.
    if (await store.get(subKey, { type: "json" })) return done("skipped", { reason: "duplicate-submission" });
    const claim = await store.setJSON(subKey, { status: "processing", at: t }, { onlyIfNew: true });
    if (claim && claim.modified === false) return done("skipped", { reason: "duplicate-submission" });

    // 2. Same address recently or too often?
    const addrKey = `addr/${dayKey(new Date(t))}/${hashAddress(decision.to, env.ACK_HASH_SECRET)}`;
    const prevKey = `addr/${dayKey(new Date(t - 86_400_000))}/${hashAddress(decision.to, env.ACK_HASH_SECRET)}`;
    const today = (await store.get(addrKey, { type: "json" })) || { times: [] };
    const yesterday = (await store.get(prevKey, { type: "json" })) || { times: [] };
    const recent = [...yesterday.times, ...today.times].filter((x) => t - x < 86_400_000);

    if (recent.some((x) => t - x < DUPLICATE_WINDOW_MS)) {
      await store.setJSON(subKey, { status: "skipped-recent", at: t });
      return done("skipped", { reason: "duplicate-address-10min" });
    }
    if (recent.length >= MAX_PER_ADDRESS_PER_DAY) {
      await store.setJSON(subKey, { status: "skipped-limit", at: t });
      return done("skipped", { reason: "address-daily-limit" });
    }

    // 3. Send.
    const email = buildEmail(decision);
    try {
      await sendMail({ env, fetchFn, now, sleep, to: decision.to, ...email });
    } catch (err) {
      await store.setJSON(subKey, { status: "failed", at: t });
      const status = err instanceof GraphError ? err.status : undefined;
      const stage = err instanceof GraphError ? err.stage : "network";
      await alertOwner({ env, fetchFn, now, sleep, id, created, stage, status, log });
      return done("failed", { stage, status });
    }

    today.times.push(t);
    await store.setJSON(addrKey, today);
    await store.setJSON(subKey, { status: "sent", at: t, mode: String(env.ACK_MODE).toLowerCase() });
    await tidy(store, t);
    return done("sent", { mode: String(env.ACK_MODE).toLowerCase() });
  } catch (err) {
    // Something unexpected (for example the store is unavailable). Tell the owner if we can.
    const stage = err instanceof GraphError ? err.stage : "internal";
    if (!configMissing(env).length) {
      await alertOwner({ env, fetchFn, now, sleep, id, created: new Date(now()), stage, status: undefined, log });
    }
    return done("error", { stage });
  }
}

/** Tell the owner an acknowledgement failed, without any enquiry details. */
async function alertOwner({ env, fetchFn, now, sleep, id, created, stage, status, log }) {
  const to = env.ACK_ALERT_TO || env.ACK_FROM || "hello@lucindhalawson.co.uk";
  const when = created.toLocaleString("en-GB", { timeZone: "Europe/London" });
  const text = [
    "The automatic acknowledgement for a website enquiry could not be sent.",
    "",
    `Enquiry received: ${when} (UK time)`,
    `Netlify submission id: ${id}`,
    `Problem: ${stage}${status ? " (HTTP " + status + ")" : ""}`,
    "",
    "The enquiry itself has still arrived in the usual Netlify notification email. Please reply to that enquirer yourself.",
    "",
    "If this keeps happening, the Microsoft client secret may have expired or a permission may have changed.",
  ].join("\n");
  try {
    await sendMail({ env, fetchFn, now, sleep, to, subject: "Website acknowledgement not sent", text });
  } catch {
    log({ fn: "enquiry-ack", id, result: "alert-failed" });
  }
}
