// Stage 2 (Phase 2, template-first): turns one genuine website enquiry into at most ONE
// template draft in the drafts mailbox, plus ONE short notice placed in that mailbox's Inbox.
//
// Order: verify signature → enquiry form only → switches → claim (by unique internal key)
// → reserve a short reference → screen → same-person check → (ordinary only) template draft
// → notice.
//
// - Sensitive and manual-review enquiries get a notice only: NO draft, so nothing can be sent by
//   mistake. You reply personally from the original Netlify notification.
// - A second, different enquiry from the same person within 24 hours is never dropped: it gets
//   its own reference and a "follow-up" notice, and any unsent earlier draft is re-labelled so you
//   read both before replying. Only an exact repeat (same choices and same wording) is treated as
//   nothing new.
// - An optional personaliser (e.g. AI, in a future phase only with your approval) may replace the
//   opening paragraph of an ordinary draft. It is OFF by default; any failure falls back to the
//   approved template. Never throws.
import { verifyNetlifySignature } from "./jws.mjs";
import { clean, asList, isValidEmail, firstName, keyedHash } from "./util.mjs";
import { screen } from "./screen.mjs";
import { detectPreferences, describePreferences } from "./access.mjs";
import { buildAiInput, checkAiAnswer } from "./ai.mjs";
import { validateIntro } from "./validate.mjs";
import { composeDraft, CATEGORIES } from "./compose.mjs";
import { noticeText } from "./notify.mjs";
import { internalKey, reserveReference } from "./ids.mjs";

export const ENQUIRY_FORM = "enquiry";
export const MAX_PERSONALISED_PER_DAY = 20;
export const SAME_PERSON_WINDOW_MS = 24 * 60 * 60 * 1000;
export const STALE_CLAIM_MS = 2 * 60 * 1000;
export const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PERSONALISER_TIMEOUT_MS = 4000;
const RETAIN_DAYS = 30;

export function configMissing(env, { needGraph = true } = {}) {
  const need = ["STAGE2_WEBHOOK_SECRET", "STAGE2_HASH_SECRET", "DRAFTS_MAILBOX"];
  if (needGraph) need.push("M365_DRAFTS_TENANT_ID", "M365_DRAFTS_CLIENT_ID", "M365_DRAFTS_CLIENT_SECRET");
  return need.filter((k) => !env[k]);
}

/** A keyed fingerprint of what the person chose and wrote, to spot an exact repeat. Not reversible. */
function contentFingerprint(d, secret) {
  const norm = (v) => clean(v, 5000).toLowerCase().replace(/\s+/g, " ").trim();
  const parts = [norm(d.about), asList(d.services).map(norm).sort().join("|"), norm(d["client-type"]),
    asList(d["contact-method"]).map(norm).sort().join("|"), norm(d.details), norm(d.access), norm(d.phone)];
  return keyedHash(parts.join("␟"), secret);
}

/**
 * deps: { env, store, graph, notify, facts, log, now(), personaliser? }
 * returns { status: number, result: string }
 */
export async function handleWebhook(rawBody, signature, deps) {
  const { env, store, graph, notify, facts, log } = deps;
  const now = deps.now || (() => Date.now());
  let ref = "-";
  let key = null;
  let claimed = false;
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
      payload = parsed.payload || parsed;
    } catch {
      return done(400, "rejected", { reason: "bad-json" });
    }

    // 2. Form isolation: ONLY the public enquiry form. ack-alert and anything else is ignored.
    if (!payload || payload.form_name !== ENQUIRY_FORM) return done(200, "ignored", { reason: "other-form" });

    const id = clean(payload.id, 64).replace(/[^A-Za-z0-9_-]/g, "");
    if (!id) return done(200, "ignored", { reason: "no-id" });
    key = internalKey(id);
    const d = payload.data || {};

    // 3. Switches: off unless DRAFT_MODE is exactly test or live; test mode only for allowlisted addresses.
    const mode = String(env.DRAFT_MODE || "off").toLowerCase();
    if (mode !== "test" && mode !== "live") return done(200, "ignored", { reason: "disabled" });
    const missing = configMissing(env);
    if (missing.length) return done(200, "ignored", { reason: "not-configured", missing });
    if (mode === "live" && facts.approved !== true) return done(200, "ignored", { reason: "wording-not-approved" });

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
    const createdAt = Date.parse(payload.created_at);
    if (!Number.isFinite(createdAt) || t - createdAt > MAX_EVENT_AGE_MS) return done(200, "ignored", { reason: "too-old" });
    const createdIso = new Date(createdAt).toISOString();

    // 4. One record per submission, keyed by the full internal key and claimed atomically.
    //    Retries and simultaneous copies of the SAME submission do nothing; different
    //    submissions can never collide. A claim stuck "processing" over 2 minutes is taken over.
    const recKey = `rec/${key}`;
    const claim = await store.setJSON(recKey, { status: "processing", at: t }, { onlyIfNew: true });
    if (claim?.modified !== true) {
      const existing = await store.get(recKey, { type: "json" });
      if (!(existing && existing.status === "processing" && t - existing.at > STALE_CLAIM_MS)) return done(200, "ignored", { reason: "duplicate-event" });
      await store.setJSON(recKey, { status: "processing", at: t });
    }
    claimed = true;

    // 5. The short reference you see, reserved so no two enquiries share one.
    ref = await reserveReference(store, key, t);
    if (!ref) throw new Error("no-reference-available");
    const toHash = keyedHash(to, env.STAGE2_HASH_SECRET); // lets the daily check recognise your reply without storing the address
    const save = (rec) => store.setJSON(recKey, { ref, at: t, createdIso, mailbox: env.DRAFTS_MAILBOX, toHash, ...rec });

    // 6. Screen (locally, on our own function) BEFORE anything else.
    const s = screen(d, { inputMode: "structured" });
    const pref = detectPreferences(d.access, d.details, s.methods);
    const prefsSummary = describePreferences(pref, s.methods);

    // Save the record, then deliver the notice. If the notice can't be delivered, the record is
    // marked so the daily check tells you (the notice may be the only Stage 2 output you get).
    const finish = async (rec, notice, result) => {
      await save(rec);
      if (!(await safeNotify(notify, notice, log, ref))) await save({ ...rec, noticeFailed: true });
      return done(200, result);
    };

    // 7. Same person, same KIND of enquiry, within 24 hours? (accounting, community work, media
    //    and other are kept apart: an accounting enquiry and a speaking request from one person on
    //    the same day are handled separately, each with its own draft or notice.) The pointer names
    //    the FIRST enquiry of the current chain (root) and the latest one; repeats never move it.
    const addrKey = `addr/${toHash}/${s.kind}`;
    const alsoSent = await otherKindsToday(store, toHash, s.kind, t);
    const fp = contentFingerprint(d, env.STAGE2_HASH_SECRET);
    const pointer = { rootKey: key, rootRef: ref, lastKey: key, lastRef: ref, at: t, fps: [fp] };
    const first = await store.setJSON(addrKey, pointer, { onlyIfNew: true });
    let chain = null;
    if (first?.modified !== true) {
      chain = await store.get(addrKey, { type: "json" });
      if (chain && t - chain.at >= SAME_PERSON_WINDOW_MS) chain = null;
      // A retry of THIS enquiry after a crash: use the chain as it was before us.
      if (chain && chain.lastKey === key) chain = chain.before || null;
      if (chain && chain.rootKey === key) chain = null;
    }

    if (chain) {
      // 7a. Exact repeat of anything already in the chain (e.g. the form sent twice): nothing new.
      if ((chain.fps || []).includes(fp)) {
        return finish({ status: "repeat", of: chain.lastKey, route: s.route },
          noticeText({ ref, status: "repeat", extra: `Exactly the same as an earlier enquiry from this person (${chain.lastRef}). No new draft. Reply to ${chain.rootRef} as normal.` }), "repeat");
      }
      // 7b. A different enquiry from the same person: never dropped. It joins the chain: one reply
      //     covering all of them, quoting any of the chain's references, answers them all.
      const rootRec = await store.get(`rec/${chain.rootKey}`, { type: "json" });
      const lastRec = chain.lastKey === chain.rootKey ? rootRec : await store.get(`rec/${chain.lastKey}`, { type: "json" });
      const refs = [...new Set([ref, ...(lastRec?.refs || [chain.lastRef]), ...(rootRec?.refs || [chain.rootRef])])];
      const draftId = rootRec?.draftId || null;
      const sensitiveNow = s.route !== "ordinary" || lastRec?.chainSensitive === true;
      const wanted = sensitiveNow ? CATEGORIES.sensitiveFollowUp : CATEGORIES.followUp;
      let relabel = "";
      let relabelPending = null;
      if (draftId) {
        try {
          const m = await graph.getMessage(draftId);
          if (m && m.isDraft && !m.deleted) {
            await graph.setCategory(draftId, wanted);
            relabel = ` The unsent draft for ${chain.rootRef} is now labelled "${wanted}".`;
          }
        } catch {
          relabelPending = wanted; // the daily check will try again
          relabel = ` Don't send the draft for ${chain.rootRef} without reading this first.`;
        }
      }
      await store.setJSON(addrKey, { ...chain, lastKey: key, lastRef: ref, fps: [...(chain.fps || []), fp], before: { ...chain, before: undefined } });
      // Earlier records in the chain are now tracked through this one (one reminder, not several).
      for (const [k2, r2] of [[chain.rootKey, rootRec], [chain.lastKey, lastRec]]) {
        if (r2 && !["answered", "answered-delete-draft", "closed"].includes(r2.status)) await store.setJSON(`rec/${k2}`, { ...r2, followedUpBy: key });
      }
      return finish({ status: "follow-up", route: s.route, of: chain.lastKey, refs, chainDraftId: draftId, chainSensitive: sensitiveNow, relabelPending, reminded: false },
        noticeText({
          ref, status: "follow-up", services: s.services, prefsSummary,
          reasons: s.route === "ordinary" ? [] : [`${s.route}: ${s.reasons.join(", ")}`],
          notes: s.notes,
          extra: `Same person as ${refs.filter((r) => r !== ref).join(", ")}. Read the new enquiry in its Netlify notification, then send one reply covering everything, with "(ref ${chain.rootRef})" in the subject.${relabel}`,
        }), "follow-up");
    }

    // 8. Sensitive or unsure: notice only, no draft.
    if (s.route !== "ordinary") {
      return finish({ status: s.route, route: s.route, kind: s.kind, refs: [ref], reminded: false },
        noticeText({ ref, status: s.route, kind: s.kind, services: s.services, reasons: s.reasons, notes: s.notes, prefsSummary, extra: alsoSent }), s.route);
    }

    // 9. Ordinary: the approved template, optionally with a personalised opening.
    // (A personalised opening is only possible for accounting enquiries so far.)
    const { opening, note } = s.kind === "accounting" ? await personalisedOpening(deps, s, t) : { opening: "" };
    const draft = composeDraft({ ref, first: firstName(d.name), services: s.services, prefs: pref.prefs, facts, opening, kind: s.kind });
    let draftId;
    try {
      draftId = await graph.createDraft({ to, subject: draft.subject, html: draft.html, category: draft.category, ref });
    } catch {
      return finish({ status: "failed", route: "ordinary", refs: [ref], reminded: false },
        noticeText({ ref, status: "failed", services: s.services, extra: "The draft could not be saved in Outlook." }), "failed");
    }
    // Stored record and log: route and ids only, never reasons (which can hint at health or debt).
    return finish({ status: "draft-ready", route: "ordinary", kind: s.kind, draftId, refs: [ref], reminded: false },
      noticeText({ ref, status: "draft-ready", kind: s.kind, services: s.services, notes: [...s.notes, ...(note ? [note] : [])], prefsSummary, extra: alsoSent }), "draft-ready");
  } catch {
    // Never lose an enquiry silently: tell you, and release the claim so a retry can try again.
    if (claimed && key) {
      try { await store.delete(`rec/${key}`); } catch { /* ignore */ }
      await safeNotify(notify, noticeText({ ref, status: "failed", extra: "Stage 2 stopped part-way." }), log, ref);
    }
    return done(200, "error", { stage: "internal" });
  }
}

const KIND_LABEL = { accounting: "accounting", community: "community work", media: "media", other: "other" };

/** A short line telling you the same person also sent a DIFFERENT kind of enquiry today. */
async function otherKindsToday(store, toHash, kind, t) {
  const { blobs = [] } = (await store.list({ prefix: `addr/${toHash}/` })) || {};
  const seen = [];
  for (const b of blobs) {
    const k = b.key.split("/")[2];
    if (k === kind) continue;
    const p = await store.get(b.key, { type: "json" });
    if (p && t - p.at < SAME_PERSON_WINDOW_MS) seen.push(`${p.lastRef || p.rootRef} (${KIND_LABEL[k] || k})`);
  }
  return seen.length ? `The same person also sent ${seen.join(", ")} in the last 24 hours. It's handled separately, so you can reply to each on its own or together.` : "";
}

/**
 * Future option, OFF unless DRAFT_PERSONALISER=ai AND a personaliser is supplied. Only fixed form
 * values are given to it. Any problem → the approved template opening (returns opening "").
 */
async function personalisedOpening(deps, s, t) {
  const { env, store, personaliser } = deps;
  if (env.DRAFT_PERSONALISER !== "ai" || !personaliser) return { opening: "" };
  const today = new Date(t).toISOString().slice(0, 10);
  let slot = 0;
  for (let i = 1; i <= MAX_PERSONALISED_PER_DAY && !slot; i++) {
    const r = await store.setJSON(`count/${today}/${i}`, { at: t }, { onlyIfNew: true });
    if (r?.modified === true) slot = i;
  }
  if (!slot) return { opening: "", note: "daily-personalisation-limit-template-used" };
  try {
    const ans = checkAiAnswer(await withTimeout(personaliser.draftIntro(buildAiInput(s)), PERSONALISER_TIMEOUT_MS));
    if (!ans.ok) return { opening: "", note: `${ans.reason}-template-used` };
    const v = validateIntro(ans.intro);
    if (!v.ok) return { opening: "", note: `personalised-opening-rejected-template-used` };
    return { opening: ans.intro };
  } catch (err) {
    return { opening: "", note: err?.name === "TimeoutError" ? "personaliser-timeout-template-used" : "personaliser-unavailable-template-used" };
  }
}

/** Tries twice. Returns false if the notice could not be delivered. */
async function safeNotify(notify, notice, log, ref) {
  for (let i = 0; i < 2; i++) {
    try {
      await notify(notice);
      return true;
    } catch { /* try once more */ }
  }
  log({ fn: "stage2", ref, result: "notice-failed" });
  return false;
}

function withTimeout(promise, ms) {
  let tm;
  return Promise.race([
    promise.finally(() => clearTimeout(tm)),
    new Promise((_, rej) => { tm = setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" })), ms); }),
  ]);
}

/** Delete records, references and counters after RETAIN_DAYS; same-person fingerprints after 2 days. */
export async function tidy(store, now) {
  try {
    for (const prefix of ["rec/", "ref/", "addr/", "count/"]) {
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
