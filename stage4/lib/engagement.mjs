// Engagement letter STRUCTURE and checks (DEVELOPMENT ONLY).
//
// AAT Client Care 5.1: a letter of engagement must be issued before any professional work and must
// include at least items (a) to (p). This module holds the structure and checks a letter against
// it. It contains NO legal wording: every section is a placeholder until you supply or approve
// wording, ideally from AAT's own template letters (5.2). A letter can reach "ready for your review",
// never "sent", and never without every placeholder replaced.
//
// Also: a new letter is needed when services are added or terms change (5.3), and a disengagement
// letter when an engagement ends (5.9).
import { clean } from "./util.mjs";

export const PLACEHOLDER = "[AAT SAMPLE WORDING NOT SUPPLIED OR APPROVED]";
/** The structure was checked against this document (11 Nov 2026): items (a)-(p) match section 5.1. */
export const AAT_SOURCE = "AAT Client Care Policy, version 1, approved 18 June 2025, issued 1 July 2025 (section 5.1 (a)-(p); 5.3 new letters; 5.8 PII details; 5.9-5.10 disengagement)";

export const AAT_ITEMS = [
  ["a", "Nature, scope and reporting", "The nature of the assignment, the scope of the work, and the format and type of any report."],
  ["b", "Timing", "Start date (and any dependence on client information), duration, and report deadlines."],
  ["c", "Recurrence", "One-off, monthly or annual, and whether it continues until the client ends it."],
  ["d", "Client responsibilities", "Providing accurate records on time; for tax work, acting as the client's agent on information the client supplies."],
  ["e", "Irregularities and fraud", "Detecting irregularities and fraud is management's responsibility and normally outside the engagement."],
  ["f", "Liability", "Any liability disclaimers, e.g. reliance on client-supplied information or compliance with legislation."],
  ["g", "Fees", "Fee basis, billing frequency and rates, expenses, an estimate and hourly rates if no fixed fee, and any additional taxes (VAT)."],
  ["h", "Books, records and lien", "Ownership of records, any lien if fees are unpaid or disputed, and retention, destruction or return."],
  ["i", "Unpaid fees", "Steps if a fee is unpaid, including any interest and its rate, stopping work and recovery."],
  ["j", "Use by third parties", "How the client may use your work for a third party, with suitable disclaimers."],
  ["k", "Investment work", "A statement that the AAT licence does not authorise any investment work."],
  ["l", "Money laundering", "Your duties under the Money Laundering Regulations: due diligence, risk assessments, record keeping and suspicious activity reporting."],
  ["m", "Data protection", "Whether you're registered with the Information Commissioner, and your duty to process data securely under UK GDPR."],
  ["n", "Client money and commissions", "How client money is handled, and how commissions or benefits from introductions are accounted for (including any fee reduction) under the Code of Professional Ethics."],
  ["o", "Complaints", "How complaints are handled, the Principal responsible, and that unresolved complaints can be referred to AAT."],
  ["p", "Continuity", "An alternate who can contact the client if you're permanently incapacitated, and that the client may appoint another firm. (AAT: with six or fewer clients, cover isn't required if clients are told, agree, and it's recorded in the letter.)"],
].map(([id, title, covers]) => ({ id, title, covers }));

/** Practice details the letter needs from you (unknown to this code; placeholders until you decide). */
export const PRACTICE_FACTS = [
  ["firmName", "LUCINDHA LAWSON LTD"],
  ["licence", "AAT licence no. 1010532"],
  ["principal", "Lucindha Lawson MAAT"],
  ["icoRegistration", null],
  ["piiInsurer", null],
  ["continuityAlternate", null],
  ["vatStatus", null],
  ["piiTerritorialCoverage", null],
].map(([key, value]) => ({ key, value }));

export function newLetter({ ref, clientRef, services = [], licensedServices = [] }) {
  return {
    ref, clientRef, kind: "engagement",
    services: services.map((s) => clean(s, 80)),
    licensedServices,
    sections: Object.fromEntries(AAT_ITEMS.map((i) => [i.id, PLACEHOLDER])),
    schedules: Object.fromEntries(services.map((s) => [clean(s, 80), PLACEHOLDER])),
    practice: Object.fromEntries(PRACTICE_FACTS.map((f) => [f.key, f.value])),
    wordingApproved: false,
    status: "draft",
  };
}

/** Anything that looks unfinished: the placeholder, brackets, braces, <<...>>, TBC/TBD/XXX, "to do". */
export function looksUnfinished(v) {
  const t = clean(v, 4000);
  return !t || t.includes(PLACEHOLDER) || /[[\]{}]|<<|>>|\b(TBC|TBD|TBA|XXX|to do|todo|insert here)\b/i.test(t);
}
const approved = (o) => o && o.approvedByLucindha === true;
const SECTION_IDS = new Set(AAT_ITEMS.map((i) => i.id));
const FACT_KEYS = new Set(PRACTICE_FACTS.map((f) => f.key));

/** You supply approved wording for one section (e.g. from AAT's template). Any change withdraws overall approval. */
export function setSection(letter, id, text, opts = {}) {
  if (!SECTION_IDS.has(id)) throw new Error("bad-section");
  if (!approved(opts)) throw new Error("wording-must-be-approved-by-lucindha");
  if (looksUnfinished(text)) throw new Error("wording-has-placeholder");
  return { ...letter, sections: { ...letter.sections, [id]: clean(text, 4000) }, wordingApproved: false };
}

/** You supply approved scope wording for one service on the letter. */
export function setSchedule(letter, service, text, opts = {}) {
  if (!Object.hasOwn(letter.schedules, service)) throw new Error("service-not-on-letter");
  if (!approved(opts)) throw new Error("wording-must-be-approved-by-lucindha");
  if (looksUnfinished(text)) throw new Error("wording-has-placeholder");
  return { ...letter, schedules: { ...letter.schedules, [service]: clean(text, 4000) }, wordingApproved: false };
}

/** You supply a practice detail (ICO number, insurer, continuity alternate, VAT status). */
export function setPracticeFact(letter, key, value, opts = {}) {
  if (!FACT_KEYS.has(key)) throw new Error("bad-practice-fact");
  if (!approved(opts)) throw new Error("detail-must-be-approved-by-lucindha");
  if (looksUnfinished(value)) throw new Error("detail-has-placeholder");
  return { ...letter, practice: { ...letter.practice, [key]: clean(value, 300) }, wordingApproved: false };
}

/** A letter is FINAL only when every check passes and you've given your final approval since the last change. */
export const isFinal = (letter) => letter.wordingApproved === true && checkLetter(letter).status === "ready-for-review";

/** Your final read-through of the whole letter. Refused while anything is unfinished. */
export function approveWording(letter, { by, confirmedPersonally } = {}) {
  if (by !== "Lucindha" || confirmedPersonally !== true) throw new Error("approval-must-be-made-personally-by-lucindha");
  const c = checkLetter({ ...letter, wordingApproved: true });
  if (c.status !== "ready-for-review") throw new Error("letter-incomplete");
  return { ...letter, wordingApproved: true };
}

const INVESTMENT_WORDS = /\b(invest\w*|pension\w*|ISAs?|SIPPs?|annuit\w*|crypto\w*|shares|stocks?|wealth management|retirement planning|financial (advice|adviser|advisor|planning))\b/i;
const NEGATED_AUTHORITY = /\b(does not|doesn't|do not|don't|cannot|can't|is not|isn't|not)\b[^.]{0,40}\b(authori[sz]e|authori[sz]ed|cover|permit|allow)\w*[^.]{0,60}\binvestment\b/i;

/** Checks a letter against AAT 5.1 (a)-(p) and your licensed services. Never sends anything. */
export function checkLetter(letter) {
  const sections = letter.sections || {};
  const missing = AAT_ITEMS.filter((i) => looksUnfinished(sections[i.id])).map((i) => `(${i.id}) ${i.title}`);
  const problems = [];
  if (missing.length) problems.push(`Required AAT items still placeholders: ${missing.join("; ")}.`);
  for (const svc of letter.services) if (looksUnfinished((letter.schedules || {})[svc])) problems.push(`Scope schedule for "${svc}" is a placeholder.`);
  for (const f of PRACTICE_FACTS) if (looksUnfinished((letter.practice || {})[f.key])) problems.push(`Practice detail needed: ${f.key}.`);
  const unlicensed = letter.services.filter((x) => !letter.licensedServices.includes(x));
  if (unlicensed.length) problems.push(`Services not on your licensed list: ${unlicensed.join(", ")}.`);
  const others = AAT_ITEMS.filter((i) => i.id !== "k").map((i) => sections[i.id] || "").join(" ") + " " + Object.values(letter.schedules || {}).join(" ");
  if (INVESTMENT_WORDS.test(others)) problems.push("Wording outside item (k) mentions investment, pensions or similar, which your AAT licence doesn't authorise. Check it.");
  if (!looksUnfinished(sections.k) && !NEGATED_AUTHORITY.test(sections.k)) problems.push("Item (k) must state that the AAT licence does NOT authorise investment work.");
  if (!looksUnfinished(sections.o) && !/\bAAT\b/.test(sections.o)) problems.push("Item (o) must say unresolved complaints can be referred to AAT.");
  if (!looksUnfinished(sections.l) && !/money laundering/i.test(sections.l)) problems.push("Item (l) must describe your Money Laundering Regulations duties.");
  if (!looksUnfinished(sections.m) && !/(information commissioner|\bICO\b)/i.test(sections.m)) problems.push("Item (m) must say whether you're registered with the Information Commissioner.");
  if (!looksUnfinished(sections.p) && !/(alternate|another (accountant|firm)|six or fewer)/i.test(sections.p)) problems.push("Item (p) must name the continuity arrangement (an alternate), or record the six-or-fewer-clients agreement.");
  if (!problems.length && letter.wordingApproved !== true) problems.push("Your final read-through approval is still needed.");
  return { status: problems.length ? "incomplete" : "ready-for-review", problems };
}

/** AAT 5.3: a new letter is needed when services are added or terms change. */
export function newLetterNeeded({ previousServices = [], services = [], termsChanged = false }) {
  const added = services.filter((s) => !previousServices.includes(s));
  const reasons = [];
  if (added.length) reasons.push(`new services: ${added.join(", ")}`);
  if (termsChanged) reasons.push("terms changed");
  return { needed: reasons.length > 0, reasons };
}

/** AAT 5.9: disengagement letter structure (placeholders until you supply wording). */
export function disengagementChecklist({ outstandingWork = null, deadlinesStated = false, newAdviserRequestHandled = null }) {
  const problems = [];
  if (outstandingWork === null) problems.push("State work you'll complete before the engagement ends, and work you won't.");
  if (!deadlinesStated) problems.push("State any relevant deadlines (e.g. Self Assessment, VAT, Companies House).");
  if (newAdviserRequestHandled === null) problems.push("If a new adviser asks for information, respond with the client's consent (professional clearance).");
  return { status: problems.length ? "incomplete" : "ready-for-review", problems, wording: PLACEHOLDER };
}
