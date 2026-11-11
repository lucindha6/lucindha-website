// Draft quotation builder (DEVELOPMENT ONLY, fictional data, PROPOSED prices).
//
// It never sets a fee. It lists your published starting prices for the services asked about,
// suggests packages that fit the client type as options, and leaves a blank for every fee, which
// only you fill in. A draft can be "ready for your review" only when you've entered every fee; it is
// never sent by this code.
//
// Decisions (11 Nov 2026): quotes are valid for 30 days (configurable) from the date YOU approve
// and issue them, with the expiry date shown; you enter and approve every fee and every quote;
// payroll is excluded unless you separately authorise it.
//
// A quote covers: scope, exclusions, assumptions, fees, VAT treatment, payment terms and how
// additional work is charged. Each wording section stays a blocked placeholder until you supply
// and approve it.
//
// Rules:
//  - Only services on your licensed list can be quoted. Anything else is left out and flagged.
//  - Investment work (and other things your AAT licence doesn't cover) is never quoted and is flagged
//    (AAT Client Care 5.1(k)).
//  - Year-end accounts + Corporation Tax are one price, shown once.
//  - A fee below your published starting price is allowed (your decision) but flagged for a second look.
import { clean, sha256Hex } from "./util.mjs";
import { assertDate, addDays } from "./calendar.mjs";

export const BLANK = "[enter your fee]";
export const NEEDS_WORDING = "[NEEDS YOUR WORDING]";
export const QUOTE_SECTIONS = [
  ["scope", "Scope: what's included"],
  ["exclusions", "Exclusions: what isn't included"],
  ["assumptions", "Assumptions: what the fee relies on (e.g. records supplied on time, number of transactions)"],
  ["vatTreatment", "VAT treatment: whether fees include or exclude VAT"],
  ["paymentTerms", "Payment terms: when and how fees are paid (e.g. Direct Debit monthly)"],
  ["additionalWork", "Additional work: how work outside the scope is agreed and charged"],
].map(([key, title]) => ({ key, title }));
const unfinished = (t) => { const v = clean(t, 4000); return !v || v.includes(NEEDS_WORDING) || /[[\]{}]|<<|>>|\b(TBC|TBD|XXX|TODO)\b/.test(v); };
/** Fingerprint of everything an approval covers: any change after approval shows. */
const fingerprint = (d) => sha256Hex(JSON.stringify({ ref: d.ref, lines: d.lines.map((l) => [l.key, l.feePence]), sections: QUOTE_SECTIONS.map((q) => (d.sections || {})[q.key] ?? null), validityDays: d.validityDays, issueDate: d.issueDate, validUntil: d.validUntil }));

export function buildQuoteDraft({ ref, clientType = "", services = [], requestText = "" }, pricing) {
  const canon = (name) => Object.keys(pricing.services).find((k) => k.toLowerCase() === name.toLowerCase()) || name;
  const asked = [...new Set((services || []).map((x) => canon(clean(x, 80))).filter(Boolean))];
  const flags = [];
  const excluded = pricing.excludedServices || {};
  const isExcluded = (x) => Object.keys(excluded).some((k) => k !== "_note" && k.toLowerCase() === x.toLowerCase());
  for (const k of Object.keys(excluded).filter((k) => k !== "_note")) {
    if (!asked.some((x) => x.toLowerCase() === k.toLowerCase()) && new RegExp(`\\b${k}\\b`, "i").test(clean(requestText, 2000))) flags.push(`${excluded[k]} (mentioned in the request).`);
  }
  for (const x of asked.filter(isExcluded)) flags.push(excluded[Object.keys(excluded).find((k) => k.toLowerCase() === x.toLowerCase())] + " Left out of the quote.");
  const unknown = asked.filter((x) => !Object.hasOwn(pricing.services, x) && !isExcluded(x));
  if (unknown.length) flags.push(`Not on your approved list, so left out: ${unknown.join(", ")}. Decide whether to offer it.`);
  const hay = `${asked.join(" ")} ${clean(requestText, 2000)}`;
  for (const g of pricing.notOffered?.groups || []) {
    const hits = [...new Set(g.patterns.map((p) => hay.match(new RegExp(`\\b(?:${p})\\b`, "i"))?.[0]?.toLowerCase()).filter(Boolean))];
    if (hits.length) flags.push(`Mentions ${hits.join(", ")}: not quoted. ${g.reason}; refer elsewhere if needed.`);
  }

  const known = asked.filter((x) => Object.hasOwn(pricing.services, x));
  const lines = [];
  const bundled = new Set();
  for (const s of known) {
    const b = pricing.services[s].bundle;
    if (b && !bundled.has(b) && known.filter((x) => pricing.services[x].bundle === b).length > 1) {
      bundled.add(b);
      lines.push({ key: `bundle:${b}`, label: pricing.bundles[b].label, published: pricing.bundles[b].from, fromPence: pricing.bundles[b].fromPence, unit: pricing.bundles[b].unit, feePence: null });
    } else if (!b || !bundled.has(b)) {
      const p = pricing.services[s];
      lines.push({ key: s, label: s, published: p.from || "no published price", fromPence: p.fromPence, unit: p.unit, feePence: null });
    }
  }
  if (!lines.length) flags.push("Nothing quotable was asked for: reply personally.");
  const packages = (pricing.packages || []).filter((p) => p.for.includes(clean(clientType, 60))).map((p) => ({ name: p.name, price: p.price }));
  const sections = Object.fromEntries(QUOTE_SECTIONS.map((q) => [q.key, NEEDS_WORDING]));
  const validityDays = Number.isInteger(pricing.quoteValidityDays) && pricing.quoteValidityDays > 0 ? pricing.quoteValidityDays : 30;
  return { ref, status: "draft", approvedPrices: pricing.approved === true, lines, packageOptions: packages, adviceSession: pricing.adviceSession, flags, sections, validityDays, issueDate: null, validUntil: null, approvedBy: null };
}

const withdraw = (d) => ({ ...d, status: "draft", issueDate: null, validUntil: null, approvedBy: null, approvalFingerprint: null });

/** You supply approved wording for one quote section. Any change withdraws approval. */
export function setQuoteSection(draft, key, text, { approvedByLucindha = false } = {}) {
  if (!QUOTE_SECTIONS.some((q) => q.key === key)) throw new Error("bad-section");
  if (approvedByLucindha !== true) throw new Error("wording-must-be-approved-by-lucindha");
  if (unfinished(text)) throw new Error("wording-has-placeholder");
  return withdraw({ ...draft, sections: { ...draft.sections, [key]: clean(text, 4000) } });
}

/** You enter a fee (in pence) for one line. Any change withdraws approval. */
export function enterFee(draft, key, feePence, { by = "Lucindha" } = {}) {
  if (by !== "Lucindha") throw new Error("only-lucindha-enters-fees");
  if (!Number.isInteger(feePence) || feePence <= 0 || feePence > 10_000_000) throw new Error("bad-fee");
  const line = draft.lines.find((l) => l.key === key);
  if (!line) throw new Error("no-such-line");
  return withdraw({ ...draft, lines: draft.lines.map((l) => (l.key === key ? { ...l, feePence } : l)) });
}

/** Checks a draft before YOU approve it. Never sends; never approves. */
export function checkQuote(draft) {
  const problems = [];
  const warnings = [...draft.flags];
  for (const l of draft.lines) {
    if (l.feePence == null) problems.push(`${l.label}: ${BLANK}`);
    else if (l.fromPence && l.feePence < l.fromPence) warnings.push(`${l.label}: £${(l.feePence / 100).toFixed(2)} is below your published starting price (${l.published}). Fine if intended.`);
  }
  for (const q of QUOTE_SECTIONS) if (unfinished((draft.sections || {})[q.key])) problems.push(`${q.title}: ${NEEDS_WORDING}`);
  if (!draft.approvedPrices) warnings.push("Published prices in this tool are still PROPOSED, not approved.");
  if (!draft.lines.length) problems.push("No quotable services.");
  return { status: problems.length ? "incomplete" : "ready-for-your-approval", problems, warnings };
}

/** YOUR approval of the whole quote, with the issue date. Sets the 30-day expiry. Refused if incomplete. */
export function approveQuote(draft, { by, confirmedPersonally = false, issueDate, today } = {}) {
  if (by !== "Lucindha" || confirmedPersonally !== true) throw new Error("approval-must-be-made-personally-by-lucindha");
  assertDate(issueDate);
  assertDate(today);
  if (issueDate < today) throw new Error("issue-date-in-the-past");
  if (checkQuote(draft).status !== "ready-for-your-approval") throw new Error("quote-incomplete");
  const approved = { ...draft, status: "approved", issueDate, validUntil: addDays(issueDate, draft.validityDays), approvedBy: "Lucindha" };
  return { ...approved, approvalFingerprint: fingerprint(approved) };
}

/** Where a quote stands on a date: draft, approved (valid) or expired. */
export function quoteStatus(draft, today) {
  assertDate(today);
  if (draft.status !== "approved" || !draft.validUntil) return "draft";
  if (draft.approvalFingerprint !== fingerprint(draft)) return "changed-since-approval";
  return today > draft.validUntil ? "expired" : "approved";
}

export function quoteText(draft) {
  const money = (p) => `£${(p / 100).toFixed(2)}`;
  return [
    `${draft.status === "approved" ? "Quote (approved by you)" : "Draft quote"} · ${draft.ref} · NOT SENT`,
    draft.validUntil ? `Issued ${draft.issueDate}. Valid until ${draft.validUntil} (${draft.validityDays} days).` : `Valid for ${draft.validityDays} days from the date you approve and issue it.`,
    "",
    ...draft.lines.map((l) => `- ${l.label}: ${l.feePence == null ? BLANK : money(l.feePence)} (published: ${l.published})`),
    "",
    draft.packageOptions.length ? `Package options to mention: ${draft.packageOptions.map((p) => `${p.name} (${p.price})`).join("; ")}.` : "No package matches this client type.",
    draft.adviceSession,
    "",
    ...QUOTE_SECTIONS.map((q) => `${q.title.split(":")[0]}: ${(draft.sections || {})[q.key] || NEEDS_WORDING}`),
    "",
    ...draft.flags.map((f) => `CHECK: ${f}`),
  ].join("\n");
}
