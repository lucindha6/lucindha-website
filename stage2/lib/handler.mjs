// Stage 2: turns one genuine website enquiry into ONE draft in the drafts mailbox plus ONE notice.
// Order matters: verify → isolate → switches → claim → duplicates → screen → already answered
// → (ordinary only) minimal AI → check → compose → save draft → notify.
// Every uncertain or failed path ends as "manual review" with no AI. Never throws.
import { verifyNetlifySignature } from "./jws.mjs";
import { clean, isValidEmail, firstName, keyedHash, sha256Hex } from "./util.mjs";
import { screen } from "./screen.mjs";
import { detectPreferences, describePreferences } from "./access.mjs";
import { buildAiInput, checkAiAnswer } from "./ai.mjs";
import { validateIntro } from "./validate.mjs";
import { composeDraft } from "./compose.mjs";
import { noticeText } from "./notify.mjs";

export const ENQUIRY_FORM = "enquiry";
export const MAX_AI_PER_DAY = 20;
export const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RETAIN_DAYS = 30;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export function referenceFor(submissionId) {
  const h = sha256Hex(Buffer.from(`ll-enq:${submissionId}`));
  let out = "";
  for (let i = 0; i < 4; i++) out += ALPHABET[parseInt(h.slice(i * 4, i * 4 + 4), 16) % ALPHABET.length];
  return `ENQ-${out}`;
}

export function configMissing(env, { needGraph = true } = {}) {
  const need = ["STAGE2_WEBHOOK_SECRET", "STAGE2_HASH_SECRET", "DRAFTS_MAILBOX"];
  if (needGraph) need.push("M365_DRAFTS_TENANT_ID", "M365_DRAFTS_CLIENT_ID", "M365_DRAFTS_CLIENT_SECRET");
  return need.filter((k) => !env[k]);
}

/**
 * deps: { env, store, graph, ai, notify, facts, log, now() }
 * returns { status: number, result: string }
 */
export async function handleWebhook(rawBody, signature, deps) {
  const { env, store, graph, ai, notify, facts, log } = deps;
  const now = deps.now || (() => Date.now());
  let ref = "-";
  const done = (status, result, extra = {}) => {
    log({ fn: "stage2", ref, result, ...extra });
    return { status, result };
  };

  try {
    // 1. Only Netlify can call this: verify the signed webhook.
    const sig = verifyNetlifySignature(rawBody, signature, env.STAGE2_WEBHOOK_SECRET);
    if (!sig.ok) return done(401, "rejected", { reason: sig.reason });

    let payload;
    try {
      const parsed = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
      payload = parsed.payload || parsed; // Netlify sends the submission object
    } catch {
      return done(400, "rejected", { reason: "bad-json" });
    }

    // 2. Form isolation: ONLY the public enquiry form. ack-alert, stage2-notice and anything else is ignored.
    if (!payload || payload.form_name !== ENQUIRY_FORM) return done(200, "ignored", { reason: "other-form" });

    const id = clean(payload.id, 64).replace(/[^A-Za-z0-9_-]/g, "");
    if (!id) return done(200, "ignored", { reason: "no-id" });
    ref = referenceFor(id);
    const d = payload.data || {};

    // 3. Switches: off unless DRAFT_MODE is exactly test or live; test mode only for allowlisted addresses.
    const mode = String(env.DRAFT_MODE || "off").toLowerCase();
    if (mode !== "test" && mode !== "live") return done(200, "ignored", { reason: "disabled" });
    const missing = configMissing(env);
    if (missing.length) return done(200, "ignored", { reason: "not-configured", missing });
    if (mode === "live" && facts.approved !== true) return done(200, "ignored", { reason: "facts-not-approved" });

    const to = clean(d.email, 254).toLowerCase();
    if (clean(d["bot-field"])) return done(200, "ignored", { reason: "honeypot" });
    if (clean(d.consent).toLowerCase() !== "yes") return done(200, "ignored", { reason: "no-consent" });
    if (!isValidEmail(to)) return done(200, "ignored", { reason: "bad-email" });
    if (to.endsWith("@lucindhalawson.co.uk")) return done(200, "ignored", { reason: "own-address" });
    if (mode === "test") {
      const allow = String(env.DRAFT_TEST_ALLOWLIST || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (!allow.includes(to)) return done(200, "ignored", { reason: "test-mode-not-allowlisted" });
    }

    const t = now();
    const today = new Date(t).toISOString().slice(0, 10);

    // 4. One record per submission, claimed atomically (retries and simultaneous copies do nothing).
    const claim = await store.setJSON(`rec/${ref}`, { ref, status: "processing", at: t }, { onlyIfNew: true });
    if (claim && claim.modified === false) return done(200, "ignored", { reason: "duplicate-event" });
    const save = (rec) => store.setJSON(`rec/${ref}`, { ref, at: t, createdIso: new Date(t).toISOString(), ...rec });

    // 5. Same address again within 24 hours: no second draft, just a note.
    const addrKey = `addr/${keyedHash(to, env.STAGE2_HASH_SECRET)}`;
    const firstClaim = await store.setJSON(addrKey, { ref, at: t }, { onlyIfNew: true });
    if (firstClaim && firstClaim.modified === false) {
      const prev = await store.get(addrKey, { type: "json" });
      if (prev && t - prev.at < DUPLICATE_WINDOW_MS) {
        await save({ status: "duplicate", of: prev.ref });
        await safeNotify(notify, noticeText({ ref, status: "duplicate", extra: `Same address as ${prev.ref}. Reply to that one.` }), log, ref);
        return done(200, "duplicate", { of: prev.ref });
      }
      await store.setJSON(addrKey, { ref, at: t }); // older than 24h: this becomes the latest
    }

    // 6. Screen (locally) and read preferences (locally).
    const inputMode = env.DRAFT_INPUT_MODE === "screened-text" ? "screened-text" : "structured";
    const s = screen(d, { inputMode });
    const pref = detectPreferences(d.access, d.details, s.methods);
    const prefsSummary = describePreferences(pref, s.methods);
    let route = s.route;
    const reasons = [...s.reasons];

    // 7. Already answered by you? Then no draft.
    try {
      if (await graph.hasReplySince(to, new Date(Date.parse(payload.created_at) || t).toISOString())) {
        await save({ status: "answered", route });
        await safeNotify(notify, noticeText({ ref, status: "already-answered", services: s.services }), log, ref);
        return done(200, "already-answered");
      }
    } catch {
      reasons.push("could-not-check-sent-items");
      if (route === "ordinary") route = "manual";
    }

    // 8. Ordinary enquiries only: minimal AI input, daily cap, strict checks. Any doubt → manual.
    let intro = "";
    if (route === "ordinary") {
      // Claim one of today's 20 AI slots atomically, so simultaneous enquiries can't exceed the cap.
      let slot = 0;
      for (let i = 1; i <= MAX_AI_PER_DAY && !slot; i++) {
        const r = await store.setJSON(`count/${today}/${i}`, { at: t }, { onlyIfNew: true });
        if (!r || r.modified !== false) slot = i;
      }
      if (!slot) {
        route = "manual";
        reasons.push("daily-ai-limit");
      } else {
        try {
          const ans = checkAiAnswer(await withTimeout(ai.draftIntro(buildAiInput(s)), 5000));
          if (!ans.ok) {
            route = "manual";
            reasons.push(ans.reason);
          } else {
            const v = validateIntro(ans.intro);
            if (!v.ok) {
              route = "manual";
              reasons.push(...v.reasons.map((r) => `draft-rule-${r}`));
            } else intro = ans.intro;
          }
        } catch (err) {
          route = "manual";
          reasons.push(err && err.name === "TimeoutError" ? "ai-timeout" : "ai-unavailable");
        }
      }
    }

    // 9. Save ONE draft (AI draft, or a plain reply shell for sensitive/manual).
    const draft = composeDraft({ route, ref, first: firstName(d.name), services: s.services, prefs: pref.prefs, intro, facts });
    let draftId = null;
    try {
      draftId = await graph.createDraft({ to, subject: draft.subject, html: draft.html, category: draft.category, ref });
    } catch {
      await save({ status: "failed", route, reasons: [...reasons, "draft-not-saved"] });
      await safeNotify(notify, noticeText({ ref, status: "failed", services: s.services, reasons: [...reasons, "draft-not-saved"] }), log, ref);
      return done(200, "failed", { stage: "graph" });
    }

    const status = route === "ordinary" ? "draft-ready" : route; // draft-ready | sensitive | manual
    await save({ status, route, draftId, reasons, reminded: false });
    await safeNotify(notify, noticeText({ ref, status, services: s.services, reasons, notes: s.notes, prefsSummary }), log, ref);
    await tidy(store, t);
    return done(200, status, { reasons });
  } catch {
    return done(200, "error", { stage: "internal" });
  }
}

async function safeNotify(notify, notice, log, ref) {
  try {
    await notify(notice);
  } catch {
    log({ fn: "stage2", ref, result: "notice-failed" });
  }
}

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" })), ms); }),
  ]);
}

/** Delete records and counters older than RETAIN_DAYS; address fingerprints after 2 days. */
export async function tidy(store, now) {
  try {
    for (const prefix of ["rec/", "addr/", "count/"]) {
      const { blobs = [] } = (await store.list({ prefix })) || {};
      for (const b of blobs) {
        if (prefix === "count/") {
          if (b.key.slice(6, 16) < new Date(now - 2 * 864e5).toISOString().slice(0, 10)) await store.delete(b.key);
          continue;
        }
        const v = await store.get(b.key, { type: "json" });
        const limit = prefix === "addr/" ? 2 * 864e5 : RETAIN_DAYS * 864e5;
        if (!v || now - v.at > limit) await store.delete(b.key);
      }
    }
  } catch {
    /* best effort */
  }
}
