// Stage 3 case tracker for complaints@, privacy@ and media@ (DEVELOPMENT ONLY: fictional data,
// stand-in mailbox and store). It never sends email, never deletes anything and never passes
// message text to AI. A case record holds only: reference, type, channel, mailbox, dates, a keyed
// fingerprint of the sender's address, a keyed fingerprint of the email thread, and events.
// Names, addresses and what people wrote are never stored.
//
// ACKNOWLEDGEMENTS, TWO LAYERS (see README):
//   1. Receipt: Exchange's built-in automatic reply on each shared mailbox (no app, no permission).
//      It replies once per sender while switched on, so it confirms RECEIPT of a first contact only.
//   2. Formal acknowledgement: written by you for each NEW complaint or privacy request. Stage 3
//      works out the deadline, tracks it per case and reminds you; it tells a new case apart from a
//      follow-up on an existing one (by reference in the subject, or by email thread).
import { clean, keyedHash, referenceCandidates, REF_PATTERN, sha256Hex } from "./util.mjs";
import { complaintDeadlines, privacyRequestDeadlines, mediaDeadlines } from "./deadlines.mjs";
import { ukDateOf, assertDate, addWorkingDays } from "./calendar.mjs";

export const MAILBOX_TYPES = {
  "complaints@lucindhalawson.co.uk": "complaint",
  "privacy@lucindhalawson.co.uk": "privacy",
  "media@lucindhalawson.co.uk": "media",
};
export const PREFIX = { complaint: "CMP", privacy: "DSR", media: "MED" };
export const CHANNELS = ["email", "letter", "phone-or-video", "in-person", "social-media", "website-form", "other"];
export const EVENTS = ["acknowledged", "id-requested", "id-received", "clarification-requested", "clarification-received", "extended", "extension-notified", "responded", "closed", "duplicate-of"];
const CLOSED = new Set(["responded", "closed", "duplicate"]);
const STALE_CLAIM_MS = 2 * 60 * 1000;

// A privacy request needn't say "subject access": broad on purpose (a false alarm only means a check).
const PRIVACY_ABOUT_ME = /\b(information|data|details|records?)\b[^.?!\n]{0,40}\b(hold|have|keep|store|process)\b[^.?!\n]{0,25}\b(about|on|of) me\b/i;
const PRIVACY_WORDING = /\b(subject access|sar|dsar|my (personal )?(data|information|details)|data (you|that you) hold|information (you|that you) hold|copy of (my|all) (data|information|records)|gdpr|data protection|delete (my|all)|erase|erasure|right to be forgotten|rectif\w*|object to (the )?processing|stop (using|processing)|data portability)\b/i;
const AUTOMATIC_SENDER = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce\w*|notifications?)@/i;

/** Loop and noise protection: never treat automatic mail as a case. */
export function isAutomatic(msg) {
  const h = Object.fromEntries(Object.entries(msg.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
  if (h["auto-submitted"] && h["auto-submitted"] !== "no") return true;
  if (["bulk", "junk", "list", "auto_reply"].includes(h["precedence"])) return true;
  if (h["list-id"] || h["list-unsubscribe"] || h["x-auto-response-suppress"]?.includes("all")) return true;
  return AUTOMATIC_SENDER.test(clean(msg.from, 254));
}

export function looksLikePrivacyRequest(text) {
  const t = clean(text, 5000);
  return PRIVACY_WORDING.test(t) || PRIVACY_ABOUT_ME.test(t);
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

async function openCases(store) {
  const { blobs = [] } = (await store.list({ prefix: "case/" })) || {};
  const out = [];
  for (const b of blobs) {
    const c = await store.get(b.key, { type: "json" });
    if (c && !CLOSED.has(c.status)) out.push(c);
  }
  return out;
}

export async function getCase(store, ref) {
  return store.get(`case/${ref}`, { type: "json" });
}

async function createCase(store, { type, channel, mailbox, received, fromHash = null, threadHash = null, sourceKey, linkedTo = null, viaOtherChannel = false }, now) {
  assertDate(received);
  const key = sha256Hex(`case:${type}:${sourceKey}`);
  // One case per source message, claimed atomically. A claim left unfinished for over 2 minutes
  // (a run stopped part-way) is taken over, so a message can't be lost.
  const claim = await store.setJSON(`s3src/${key}`, { at: now }, { onlyIfNew: true });
  if (claim?.modified !== true) {
    const existing = await store.get(`s3src/${key}`, { type: "json" });
    if (existing?.ref) return { duplicateEvent: true, case: await getCase(store, existing.ref) };
    if (existing && now - existing.at < STALE_CLAIM_MS) return { duplicateEvent: true, case: null };
    await store.setJSON(`s3src/${key}`, { at: now });
  }
  const ref = await reserveRef(store, type, key, now);
  const rec = {
    ref, type, channel, mailbox, received, fromHash, threads: threadHash ? [threadHash] : [], linkedTo, viaOtherChannel,
    status: "open", events: [], reminded: {}, createdAt: new Date(now).toISOString(),
  };
  await store.setJSON(`case/${ref}`, rec);
  await store.setJSON(`s3src/${key}`, { at: now, ref });
  return { case: rec };
}

/**
 * Handles one incoming message to complaints@, privacy@ or media@ (fictional in development).
 * msg: { id, mailbox, from, subject, receivedAt (ISO), conversationId, headers, bodyText }
 * Returns { result, refs: [...], notices: [...] }. bodyText is read here only, never stored.
 */
export async function intake(msg, { store, secret, now = Date.now() }) {
  const mailbox = clean(msg.mailbox, 254).toLowerCase();
  const type = MAILBOX_TYPES[mailbox];
  if (!type) return { result: "ignored-unknown-mailbox", refs: [], notices: [] };
  if (isAutomatic(msg)) return { result: "ignored-automatic", refs: [], notices: [] };
  const from = clean(msg.from, 254).toLowerCase();
  if (!from.includes("@")) return { result: "ignored-no-sender", refs: [], notices: [] };
  if (from.endsWith("@lucindhalawson.co.uk")) return { result: "ignored-internal", refs: [], notices: [] };
  if (!msg.id || !msg.receivedAt) return { result: "ignored-incomplete", refs: [], notices: [] };

  const fromHash = keyedHash(from, secret);
  const threadHash = msg.conversationId ? keyedHash(`thread:${msg.conversationId}`, secret) : null;
  const received = ukDateOf(msg.receivedAt);
  const subject = clean(msg.subject, 300);
  const open = await openCases(store);

  // 1. Follow-up on an existing case: its reference in the subject (from the same sender), or the same email thread.
  const refInSubject = subject.match(REF_PATTERN)?.[0];
  let existing = refInSubject ? open.find((c) => c.ref === refInSubject && c.fromHash === fromHash) : null;
  if (!existing && threadHash) existing = open.find((c) => c.threads.includes(threadHash));
  if (existing) {
    existing.lastContact = received;
    await store.setJSON(`case/${existing.ref}`, existing);
    const waiting = existing.type === "privacy" && (needsId(existing) || openClarification(existing));
    return {
      result: "follow-up",
      refs: [existing.ref],
      notices: [noticeFor("follow-up", existing, { extra: waiting ? "The person has replied while the deadline is paused or waiting for ID. If this reply contains the ID or clarification, record it to restart the clock." : "No new case created." })],
    };
  }

  // 2. A NEW case (never merged automatically: if the same person already has an open case of the
  //    same type, the new one is linked and you decide whether it's the same matter).
  const sameSender = open.find((c) => c.type === type && c.fromHash === fromHash);
  const made = await createCase(store, { type, channel: "email", mailbox, received, fromHash, threadHash, sourceKey: `msg:${msg.id}`, linkedTo: sameSender?.ref || null }, now);
  if (made.duplicateEvent) return { result: "duplicate-event", refs: [made.case?.ref].filter(Boolean), notices: [] };
  const notices = [noticeFor("new-case", made.case, { extra: sameSender ? `The same person has an open case, ${sameSender.ref}. If this is the same matter, record it as a duplicate.` : "" })];
  const refs = [made.case.ref];

  // 3. A privacy request sent to another inbox (complaints@ or media@) still counts from today.
  if (type !== "privacy" && looksLikePrivacyRequest(msg.bodyText)) {
    const p = await createCase(store, { type: "privacy", channel: "email", mailbox, received, fromHash, threadHash, sourceKey: `msg:${msg.id}:privacy`, linkedTo: made.case.ref, viaOtherChannel: true }, now);
    if (!p.duplicateEvent) {
      refs.push(p.case.ref);
      notices.push(noticeFor("possible-privacy-request", p.case, { extra: `It arrived at ${mailbox}. Check whether it's a request for personal data. If not, close ${p.case.ref}.` }));
    }
  }
  return { result: "new-case", refs, notices };
}

/** For requests made by phone, video, letter, in person, social media or anywhere else. */
export async function logCase({ type, channel, received, note = "" }, { store, now = Date.now() }) {
  if (!PREFIX[type]) throw new Error("bad-type");
  if (!CHANNELS.includes(channel)) throw new Error("bad-channel");
  assertDate(received);
  const made = await createCase(store, { type, channel, mailbox: null, received, sourceKey: `manual:${now}:${Math.random()}`, viaOtherChannel: channel !== "email" }, now);
  // A short note is allowed for your own reference but is limited and never sent anywhere.
  if (note) { made.case.note = clean(note, 200); await store.setJSON(`case/${made.case.ref}`, made.case); }
  return made.case;
}

export async function recordEvent(ref, event, date, { store, value = null }) {
  if (!EVENTS.includes(event)) throw new Error("bad-event");
  assertDate(date);
  const c = await getCase(store, ref);
  if (!c) throw new Error("no-such-case");
  c.events.push({ event, date, ...(value ? { value: clean(value, 40) } : {}) });
  if (event === "responded") c.status = "responded";
  if (event === "closed") c.status = "closed";
  if (event === "duplicate-of") c.status = "duplicate";
  if (event === "id-requested") c.idNeeded = true;
  await store.setJSON(`case/${ref}`, c);
  return c;
}

const lastDate = (c, e) => [...c.events].reverse().find((x) => x.event === e)?.date || null;
const needsId = (c) => c.idNeeded && !lastDate(c, "id-received");
function openClarification(c) {
  const asked = c.events.filter((e) => e.event === "clarification-requested").length;
  const answered = c.events.filter((e) => e.event === "clarification-received").length;
  return asked > answered;
}
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
    idRequested: lastDate(c, "id-requested"),
    idReceived: lastDate(c, "id-received"),
    clarifications: clarificationPairs(c),
    extended: c.events.some((e) => e.event === "extended"),
    extensionNotified: lastDate(c, "extension-notified"),
  });
}

/**
 * Daily check (development: called by tests and the demo, not scheduled anywhere).
 * Returns notices: one reminder before each milestone and one "overdue" per milestone, never repeated.
 */
export async function dailyCaseCheck({ store, today, notify = async () => {} }) {
  assertDate(today);
  const out = [];
  for (const c of await openCases(store)) {
    const d = deadlinesFor(c);
    const milestones = [];
    if (c.type === "complaint") {
      if (!lastDate(c, "acknowledged")) milestones.push(["acknowledge", d.ackRemind, d.ackDue]);
      else milestones.push(["respond", d.responseRemind, d.responseDue]);
    } else if (c.type === "privacy") {
      if (d.status === "running") milestones.push(["respond", d.remind, d.due]);
      if (d.status === "waiting-for-id") {
        const chase = addWorkingDays(lastDate(c, "id-requested"), 10);
        milestones.push(["chase-id", chase, chase, { noOverdue: true }]);
      }
      if (d.warnings?.some((w) => w.startsWith("You must tell"))) milestones.push(["notify-extension", d.extensionNoticeBy, d.extensionNoticeBy]);
    } else {
      milestones.push(["reply", d.replyBy, d.replyBy]);
    }
    for (const [what, remindOn, due, opts = {}] of milestones) {
      const key = `${what}:${due}`;
      if (today > due && !opts.noOverdue && !c.reminded[`over:${key}`]) {
        c.reminded[`over:${key}`] = today;
        out.push(noticeFor("overdue", c, { what, due }));
      } else if (today >= remindOn && (today <= due || opts.noOverdue) && !c.reminded[key]) {
        c.reminded[key] = today;
        out.push(noticeFor("reminder", c, { what, due }));
      }
    }
    await store.setJSON(`case/${c.ref}`, c);
  }
  for (const n of out) await notify(n);
  return out;
}

const TYPE_LABEL = { complaint: "complaint", privacy: "privacy request", media: "media enquiry" };
const WHAT_LABEL = { acknowledge: "Acknowledge in writing", respond: "Send the full response", "notify-extension": "Tell the person about the extension", "chase-id": "Still waiting for ID: decide whether to chase", reply: "Reply" };

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
    "possible-privacy-request": "Possible privacy request (arrived at another inbox)",
    reminder: `Reminder: ${WHAT_LABEL[what] || what}`,
    overdue: `OVERDUE: ${WHAT_LABEL[what] || what}`,
  };
  const lines = [
    `${titles[kind]} · ${c.ref}`,
    "",
    `Received ${c.received} via ${c.channel}${c.viaOtherChannel ? " (other channel)" : ""}.`,
    kind === "reminder" || kind === "overdue" ? `${WHAT_LABEL[what] || what}: due ${due}.` : firstDue,
    ...(d.warnings || []),
    extra || null,
    "",
    "Your judgement decides this case. Nothing has been sent.",
  ].filter((l) => l !== null);
  return { subject: `[Stage 3] ${titles[kind]} · ${c.ref}`, message: lines.join("\n") };
}
