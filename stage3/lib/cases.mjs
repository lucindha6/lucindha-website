// Stage 3 case tracker for complaints@, privacy@ and media@ (DEVELOPMENT ONLY: fictional data,
// stand-in mailbox and store). It never sends email, never deletes anything and never passes
// message text to AI. A case record holds only: reference, type, channel, mailbox, dates, a keyed
// fingerprint of the sender's address, keyed fingerprints of email threads, and events. Names,
// addresses, subjects and what people wrote are never stored (no free-text fields).
//
// ACKNOWLEDGEMENTS, TWO LAYERS (see README):
//   1. Receipt: Exchange's built-in automatic reply on each shared mailbox (no app, no permission).
//      It replies once per sender while switched on, so it confirms RECEIPT of a first contact only.
//   2. Formal acknowledgement: written by you for each NEW complaint or privacy request. Stage 3
//      tells a new case apart from a follow-up, works out the deadline and reminds you.
//
// SAFETY RULES (from the independent review):
//   - When unsure, open a case (or send a "check this" notice). Never silently drop a message.
//   - Privacy wording is checked in EVERY message (new or follow-up, subject and body), because a
//     privacy request can arrive anywhere, including in an existing complaint thread.
//   - Reminders are recorded as sent only after they've been delivered.
//   - Updates use a version check, so two updates at once can't wipe each other's events.
//   - One faulty case never stops reminders for the others.
import { clean, keyedHash, referenceCandidates, REF_PATTERN, sha256Hex } from "./util.mjs";
import { complaintDeadlines, privacyRequestDeadlines, mediaDeadlines } from "./deadlines.mjs";
import { ukDateOf, assertDate, addWorkingDays } from "./calendar.mjs";

export const MAILBOX_TYPES = {
  "complaints@lucindhalawson.co.uk": "complaint",
  "privacy@lucindhalawson.co.uk": "privacy",
  "media@lucindhalawson.co.uk": "media",
};
export const PREFIX = { complaint: "CMP", privacy: "DSR", media: "MED" };
export const CHANNELS = ["email", "letter", "phone-or-video", "in-person", "social-media", "website-form", "other-mailbox", "other"];
export const EVENTS = ["acknowledged", "id-requested", "id-received", "clarification-requested", "clarification-received", "extended", "extension-notified", "responded", "closed", "duplicate-of"];
const CLOSED = new Set(["responded", "closed", "duplicate"]);
const STALE_CLAIM_MS = 2 * 60 * 1000;

// A privacy request needn't say "subject access": broad on purpose (a false alarm only means a check).
const PRIVACY_ABOUT_ME = /\b(information|data|details|records?)\b[^.?!\n]{0,40}\b(hold|have|keep|store|process)\b[^.?!\n]{0,25}\b(about|on|of) me\b/i;
// Request-style wording only (first person, or naming the right), so ordinary email footers such as
// "we process personal data in line with data protection law" don't open privacy cases.
const PRIVACY_WORDING = /\b(subject access|dsar|my (personal )?(data|information|details|records)|data (you|that you) hold|information (you|that you) hold|copy of (my|all) (data|information|records)|(delete|erase|remove) (my|all my)|right to be forgotten|right of access|(rectify|correct) my|object to (you )?(the )?processing|stop (using|processing) my|data portability)\b/i;
const AUTOMATIC_SENDER = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce\w*|notifications?)@/i;

/** Bare, lower-case address from "Name <addr@x>" or "addr@x". */
export function bareAddress(from) {
  const s = clean(from, 320);
  const m = s.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

/** Mail that looks machine-generated. Used to avoid reply loops and noise, NOT to drop messages silently. */
export function isAutomatic(msg) {
  const h = Object.fromEntries(Object.entries(msg.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
  if (h["auto-submitted"] && h["auto-submitted"] !== "no") return true;
  if (["bulk", "junk", "list", "auto_reply"].includes(h["precedence"])) return true;
  if (h["list-id"] || h["list-unsubscribe"]) return true;
  return AUTOMATIC_SENDER.test(bareAddress(msg.from));
}

/** The person's own new words: quoted earlier messages and signatures removed. */
export function newText(body) {
  const lines = clean(body, 50000).split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (/^\s*(-- ?|_{5,}|-{5,}\s*original message|from:\s.+|on .+ wrote:|sent from my )/i.test(line)) break; // signature or quoted history starts
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n");
}

export function looksLikePrivacyRequest(subject = "", body = "") {
  const t = `${clean(subject, 500)}\n${newText(body)}`;
  return PRIVACY_WORDING.test(t) || PRIVACY_ABOUT_ME.test(t);
}

// ------------------------------------------------------------------ storage with version checks
/**
 * Read-modify-write with a version check (Netlify Blobs: getWithMetadata + setJSON onlyIfMatch).
 * VERIFY at integration: conditional writes on the Blobs version used.
 * `mutate` returns false when nothing needs writing.
 */
export async function updateCase(store, ref, mutate, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const got = await store.getWithMetadata(`case/${ref}`, { type: "json" });
    if (!got?.data) throw new Error("no-such-case");
    const c = got.data;
    const changed = await mutate(c);
    if (changed === false) return c;
    const r = await store.setJSON(`case/${ref}`, c, { onlyIfMatch: got.etag });
    if (r?.modified === true) return c;
  }
  throw new Error("case-update-conflict");
}

async function reserveRef(store, type, key, now) {
  for (const ref of referenceCandidates(PREFIX[type], key)) {
    const r = await store.setJSON(`s3ref/${ref}`, { key, at: now }, { onlyIfNew: true });
    if (r?.modified === true) return ref;
    const h = await store.get(`s3ref/${ref}`, { type: "json" });
    if (h?.key === key) return ref;
  }
  throw new Error("no-reference-available");
}

async function allCases(store) {
  const { blobs = [] } = (await store.list({ prefix: "case/" })) || {};
  const out = [];
  for (const b of blobs) {
    const c = await store.get(b.key, { type: "json" });
    if (c) out.push(c);
  }
  return out;
}

export async function getCase(store, ref) {
  return store.get(`case/${ref}`, { type: "json" });
}

/**
 * One case per source (message id or manual entry), claimed atomically. Returns
 * { case, source, srcKey, fresh } or { busy: true }. `source.notified` tells a retry whether
 * the notices went out, so a run stopped part-way finishes the job next time.
 */
async function claimCase(store, { type, sourceKey, fields }, now) {
  const key = sha256Hex(`case:${type}:${sourceKey}`);
  const srcKey = `s3src/${key}`;
  const claim = await store.setJSON(srcKey, { at: now }, { onlyIfNew: true });
  if (claim?.modified !== true) {
    const existing = await store.get(srcKey, { type: "json" });
    if (existing?.ref) return { case: await getCase(store, existing.ref), source: existing, srcKey, fresh: false };
    if (existing && now - existing.at < STALE_CLAIM_MS) return { busy: true };
    await store.setJSON(srcKey, { at: now }); // a stopped run: take over
  }
  const ref = await reserveRef(store, type, key, now);
  const rec = { ref, type, status: "open", events: [], reminded: {}, threads: [], createdAt: new Date(now).toISOString(), ...fields };
  await store.setJSON(`case/${ref}`, rec, { onlyIfNew: true });
  const source = { at: now, ref, notified: false };
  await store.setJSON(srcKey, source);
  return { case: (await getCase(store, ref)) || rec, source, srcKey, fresh: true };
}

const markNotified = (store, srcKey, source) => store.setJSON(srcKey, { ...source, notified: true });

/**
 * Handles one incoming message to complaints@, privacy@ or media@ (fictional in development).
 * msg: { id, mailbox, from, subject, receivedAt (ISO), conversationId, headers, bodyText }
 * deps: { store, secret, now, notify(notice) }  Notices are delivered first, then recorded as sent.
 * Returns { result, refs, notices }. Subject and body are read here only, never stored.
 */
export async function intake(msg, { store, secret, now = Date.now(), notify = async () => {} }) {
  const mailbox = clean(msg.mailbox, 254).toLowerCase();
  const type = MAILBOX_TYPES[mailbox];
  if (!type) return { result: "ignored-unknown-mailbox", refs: [], notices: [] };
  const from = bareAddress(msg.from);
  if (from.endsWith("@lucindhalawson.co.uk")) return { result: "ignored-internal", refs: [], notices: [] };
  const okSender = /^[^\s<>]+@[^\s@<>]+$/.test(from) || /^"[^"]+"@[^\s@<>]+$/.test(from);
  const okDetails = msg.id && msg.receivedAt && Number.isFinite(Date.parse(msg.receivedAt));
  if (!okSender || !okDetails) {
    // Never silently dropped: a "check this" notice (once per message where it has an id).
    const k = `s3odd/${sha256Hex(`odd:${msg.id || `${mailbox}:${from}:${msg.receivedAt}`}`)}`;
    const n = { subject: `[Stage 3] Message at ${mailbox} needs checking`, message: `A message arrived at ${mailbox} that Stage 3 couldn't read properly (${okSender ? "missing date or id" : "unusual sender address"}), so no case was opened.\n\nPlease look at it in the mailbox and log it as a case if it's a complaint or request.\n\nNothing has been sent.` };
    if ((await store.setJSON(k, { at: now }, { onlyIfNew: true }))?.modified === true) { await notify(n); return { result: "needs-check", refs: [], notices: [n] }; }
    return { result: "needs-check", refs: [], notices: [] };
  }

  const fromHash = keyedHash(from, secret);
  const threadHash = msg.conversationId ? keyedHash(`thread:${msg.conversationId}`, secret) : null;
  const received = ukDateOf(msg.receivedAt);
  const subject = clean(msg.subject, 500);
  const privacyWording = looksLikePrivacyRequest(subject, msg.bodyText);
  const automatic = isAutomatic(msg);
  const notices = [];
  const refs = [];
  const send = async (n) => { await notify(n); notices.push(n); };

  // Automatic-looking mail: media@ is ignored unless it has request wording (no legal deadline);
  // complaints@ gets a "check this" notice; privacy@ ALWAYS opens a case, because a request sent
  // through a service from a no-reply address still has a legal deadline.
  if (automatic && !privacyWording && type === "media") return { result: "ignored-automatic", refs: [], notices: [] };
  const automaticNoticeOnly = automatic && type !== "privacy";

  const open = (await allCases(store)).filter((c) => !CLOSED.has(c.status));

  // 1. Follow-up on an existing case OF THE SAME TYPE: its reference in the subject from the same
  //    sender, or the same email thread.
  // A case already made FROM THIS MESSAGE (a retry after a stop part-way) is never its own follow-up.
  const ownSource = await store.get(`s3src/${sha256Hex(`case:${type}:msg:${msg.id}`)}`, { type: "json" });
  const refInSubject = ownSource?.ref ? null : subject.match(REF_PATTERN)?.[0];
  let existing = ownSource?.ref ? null : refInSubject ? open.find((c) => c.ref === refInSubject && c.type === type && c.fromHash === fromHash) : null;
  if (!existing && threadHash && !ownSource?.ref) existing = open.find((c) => c.type === type && (c.threads || []).includes(threadHash));

  if (existing) {
    const followKey = `s3fu/${sha256Hex(`fu:${msg.id}:${existing.ref}`)}`;
    await store.setJSON(followKey, { at: now }, { onlyIfNew: true });
    if (!(await store.get(followKey, { type: "json" }))?.notified) {
      await updateCase(store, existing.ref, (c) => { if (c.lastContact === received) return false; c.lastContact = received; });
      const waiting = existing.type === "privacy" && (needsId(existing) || openClarification(existing));
      await send(noticeFor("follow-up", existing, { extra: waiting ? "The person has replied while the deadline is paused or waiting for ID. If this reply contains the ID or clarification, record it to restart the clock." : "No new case created." }));
      await store.setJSON(followKey, { at: now, notified: true });
    }
    refs.push(existing.ref);
  } else if (automaticNoticeOnly) {
    // complaints@ or privacy@: no case for auto-replies and bulk mail, but a "check this" notice
    // (once per message), so a request sent through a service is never silently dropped.
    const k = `s3auto/${sha256Hex(`auto:${msg.id}`)}`;
    await store.setJSON(k, { at: now }, { onlyIfNew: true });
    if (!(await store.get(k, { type: "json" }))?.notified) {
      await send({ subject: `[Stage 3] Automatic-looking message at ${mailbox}`, message: `Received ${received}. It looks machine-generated (for example an auto-reply or a service's no-reply address), so no case was opened.${privacyWording ? "\n\nIt contains wording that might be a privacy request: please check it." : ""}\n\nIf it's actually a complaint or a request (some services send requests on people's behalf), log it as a case.\n\nNothing has been sent.` });
      await store.setJSON(k, { at: now, notified: true });
    }
    return { result: "automatic-needs-check", refs: [], notices };
  } else {
    // 2. A NEW case. Never merged automatically: if the same person has an open case of the same
    //    type, the new one is linked and you decide whether it's the same matter.
    const sameSender = open.find((c) => c.type === type && c.fromHash === fromHash);
    const made = await claimCase(store, {
      type, sourceKey: `msg:${msg.id}`,
      fields: { channel: "email", mailbox, received, fromHash, threads: threadHash ? [threadHash] : [], linkedTo: sameSender?.ref || null, viaOtherChannel: false, arrivedAsAutomatic: automatic },
    }, now);
    if (made.busy) return { result: "in-progress", refs: [], notices: [] };
    refs.push(made.case.ref);
    if (!made.fresh && made.source.notified && !privacyWording) return { result: "duplicate-event", refs, notices: [] };
    if (made.fresh || !made.source.notified) {
      await send(noticeFor("new-case", made.case, { extra: [
        sameSender ? `The same person has an open case, ${sameSender.ref}. If this is the same matter, record it as a duplicate.` : "",
        automatic ? "It arrived looking machine-generated (e.g. sent through a service). Check it's genuine." : "",
      ].filter(Boolean).join(" ") }));
      await markNotified(store, made.srcKey, made.source);
    }
  }

  // 3. Privacy wording outside a privacy case (another inbox, or inside a complaint or media
  //    thread): open a linked privacy case counted from today. Finishes the job on a retry too.
  const ownPrivacy = await store.get(`s3src/${sha256Hex(`case:privacy:msg:${msg.id}:privacy`)}`, { type: "json" });
  const threadPrivacy = threadHash && !ownPrivacy?.ref ? open.find((c) => c.type === "privacy" && (c.threads || []).includes(threadHash)) : null;
  if (privacyWording && type !== "privacy" && threadPrivacy) {
    const k = `s3fu/${sha256Hex(`fu:${msg.id}:${threadPrivacy.ref}`)}`;
    await store.setJSON(k, { at: now }, { onlyIfNew: true });
    if (!(await store.get(k, { type: "json" }))?.notified) {
      await send(noticeFor("follow-up", threadPrivacy, { extra: "More privacy wording in this thread. No new case opened." }));
      await store.setJSON(k, { at: now, notified: true });
    }
    refs.push(threadPrivacy.ref);
  } else if (privacyWording && type !== "privacy") {
    const p = await claimCase(store, {
      type: "privacy", sourceKey: `msg:${msg.id}:privacy`,
      fields: { channel: "email", mailbox, received, fromHash, threads: threadHash ? [threadHash] : [], linkedTo: refs[0] || null, viaOtherChannel: true },
    }, now);
    if (!p.busy) {
      refs.push(p.case.ref);
      if (p.fresh || !p.source.notified) {
        await send(noticeFor("possible-privacy-request", p.case, { extra: `It arrived at ${mailbox}${existing ? ` in the thread of ${existing.ref}` : ""}. Check whether it's a request for personal data. If not, close ${p.case.ref}.` }));
        await markNotified(store, p.srcKey, p.source);
      }
    }
  }
  return { result: existing ? "follow-up" : "new-case", refs, notices };
}

/**
 * For requests made by phone, video, letter, in person, social media, the website form or any other
 * mailbox (e.g. hello@). No free-text notes are kept: record details in your own case file.
 */
export async function logCase({ type, channel, received, sourceId }, { store, now = Date.now() }) {
  if (!PREFIX[type]) throw new Error("bad-type");
  if (!CHANNELS.includes(channel)) throw new Error("bad-channel");
  assertDate(received);
  if (received > ukDateOf(now)) throw new Error("received-in-future");
  const made = await claimCase(store, {
    type, sourceKey: `manual:${sourceId || `${now}:${Math.random()}`}`,
    fields: { channel, mailbox: null, received, fromHash: null, linkedTo: null, viaOtherChannel: channel !== "email" },
  }, now);
  if (made.busy) throw new Error("in-progress");
  return made.case;
}

/** Records something you did or received. Dates are checked so one bad entry can't break deadlines. */
export async function recordEvent(ref, event, date, { store, value = null, now = Date.now() }) {
  if (!EVENTS.includes(event)) throw new Error("bad-event");
  assertDate(date);
  if (date > ukDateOf(now)) throw new Error("date-in-future");
  if (value !== null) {
    if (event !== "duplicate-of" || typeof value !== "string" || value.match(REF_PATTERN)?.[0] !== value) throw new Error("bad-value");
  }
  return updateCase(store, ref, (c) => {
    if (date < c.received) throw new Error("date-before-received");
    if (event === "id-received" && !(firstDate(c, "id-requested") && date >= firstDate(c, "id-requested"))) throw new Error("id-received-without-request");
    if (event === "clarification-received") {
      const pending = clarificationPairs(c).find((p) => !p.received);
      if (!pending || date < pending.requested) throw new Error("clarification-received-before-requested");
    }
    if (event === "extension-notified" && !c.events.some((e) => e.event === "extended")) throw new Error("extension-not-recorded");
    c.events.push({ event, date, ...(value ? { value } : {}) });
    if (event === "responded") c.status = "responded";
    if (event === "closed") c.status = "closed";
    if (event === "duplicate-of") c.status = "duplicate";
    if (event === "id-requested") c.idNeeded = true;
  });
}

const lastDate = (c, e) => [...c.events].reverse().find((x) => x.event === e)?.date || null;
const firstDate = (c, e) => c.events.find((x) => x.event === e)?.date || null;
const needsId = (c) => c.idNeeded && !lastDate(c, "id-received");
const openClarification = (c) => clarificationPairs(c).some((p) => !p.received);
function clarificationPairs(c) {
  const req = c.events.filter((e) => e.event === "clarification-requested").map((e) => e.date).sort();
  const rec = c.events.filter((e) => e.event === "clarification-received").map((e) => e.date).sort();
  return req.map((r, i) => ({ requested: r, received: rec[i] || null }));
}

export function deadlinesFor(c) {
  if (c.type === "complaint") return complaintDeadlines({ received: c.received, acknowledged: lastDate(c, "acknowledged") });
  if (c.type === "media") return mediaDeadlines({ received: c.received });
  return privacyRequestDeadlines({
    received: c.received,
    idNeeded: Boolean(c.idNeeded),
    idRequested: firstDate(c, "id-requested"),
    idReceived: lastDate(c, "id-received"),
    clarifications: clarificationPairs(c),
    extended: c.events.some((e) => e.event === "extended"),
    extensionNotified: lastDate(c, "extension-notified"),
  });
}

function milestonesFor(c, d) {
  const m = [];
  if (c.type === "complaint") {
    if (!lastDate(c, "acknowledged")) m.push(["acknowledge", d.ackRemind, d.ackDue]);
    else m.push(["respond", d.responseRemind, d.responseDue]);
  } else if (c.type === "privacy") {
    if (d.status === "running") m.push(["respond", d.remind, d.due]);
    if (d.status === "waiting-for-id") {
      const chase = addWorkingDays(firstDate(c, "id-requested"), 10);
      m.push(["chase-id", chase, chase, { noOverdue: true }]);
    }
    if (d.extensionNoticeRemind) m.push(["notify-extension", d.extensionNoticeRemind, d.extensionNoticeBy]);
  } else {
    m.push(["reply", d.replyBy, d.replyBy]);
  }
  return m;
}

/**
 * Daily check (development: called by tests and the demo, not scheduled anywhere).
 * One reminder before each milestone and one "overdue" per milestone, recorded only once delivered.
 */
export async function dailyCaseCheck({ store, today, notify = async () => {} }) {
  assertDate(today);
  const out = [];
  for (const c of (await allCases(store)).filter((x) => !CLOSED.has(x.status))) {
    try {
      const d = deadlinesFor(c);
      for (const [what, remindOn, due, opts = {}] of milestonesFor(c, d)) {
        const key = `${what}:${due}`;
        let kind = null;
        let mark = null;
        if (today > due && !opts.noOverdue && !c.reminded[`over:${key}`]) [kind, mark] = ["overdue", `over:${key}`];
        else if (today >= remindOn && (today <= due || opts.noOverdue) && !c.reminded[key] && !c.reminded[`over:${key}`]) [kind, mark] = ["reminder", key];
        if (!kind) continue;
        const n = noticeFor(kind, c, { what, due });
        await notify(n); // if this fails, nothing is recorded and the next check tries again
        c.reminded[mark] = today;
        await updateCase(store, c.ref, (fresh) => { if (fresh.reminded[mark]) return false; fresh.reminded[mark] = today; });
        out.push(n);
      }
    } catch (err) {
      const n = { subject: `[Stage 3] Case needs attention · ${c.ref}`, message: `The daily check couldn't complete for ${c.ref} (${String(err?.message || "error").replace(/[^a-z0-9-]/gi, " ").slice(0, 60)}). Please check its recorded dates.\n\nOther cases were checked as normal. Nothing has been sent.` };
      try { await notify(n); out.push(n); } catch { /* reported next run */ }
    }
  }
  return out;
}

const TYPE_LABEL = { complaint: "complaint", privacy: "privacy request", media: "media enquiry" };
const WHAT_LABEL = { acknowledge: "Acknowledge in writing", respond: "Send the full response", "notify-extension": "Tell the person about the extension (with reasons)", "chase-id": "Still waiting for ID: decide whether to chase", reply: "Reply" };

/** Notice text: reference, type, dates and what to do. Never names, addresses, message text or links. */
export function noticeFor(kind, c, { what = "", due = "", extra = "" } = {}) {
  const t = TYPE_LABEL[c.type];
  const d = deadlinesFor(c);
  const firstDue = c.type === "complaint" ? `Acknowledge by ${d.ackDue}; full response by ${d.responseDue}.`
    : c.type === "media" ? `Reply target ${d.replyBy}.`
    : d.status === "running" ? `Respond by ${d.due}.` : d.status === "paused" ? "Clock paused for clarification." : "Clock not started: waiting for ID.";
  const titles = {
    "new-case": `New ${t}`,
    "follow-up": `Follow-up on ${t}`,
    "possible-privacy-request": "Possible privacy request (arrived outside privacy@ or in another case)",
    reminder: `Reminder: ${WHAT_LABEL[what] || what}`,
    overdue: `OVERDUE: ${WHAT_LABEL[what] || what}`,
  };
  const complaintTips = c.type === "complaint" && kind === "new-case"
    ? "AAT Client Care: acknowledge promptly in writing, restating your understanding of the complaint; tell the client they can refer an unresolved complaint to AAT; check whether your PII insurer needs to be told."
    : null;
  const lines = [
    `${titles[kind]} · ${c.ref}`,
    "",
    `Received ${c.received} via ${c.channel}${c.viaOtherChannel ? " (other channel)" : ""}.`,
    kind === "reminder" || kind === "overdue" ? `${WHAT_LABEL[what] || what}: due ${due}.` : firstDue,
    ...(d.warnings || []),
    complaintTips,
    extra || null,
    "",
    "Your judgement decides this case. Nothing has been sent.",
  ].filter((l) => l !== null);
  return { subject: `[Stage 3] ${titles[kind]} · ${c.ref}`, message: lines.join("\n") };
}
