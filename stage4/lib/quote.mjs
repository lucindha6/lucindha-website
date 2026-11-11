// Draft quotation builder (DEVELOPMENT ONLY, fictional data, PROPOSED prices).
//
// It never sets a fee. It lists your published starting prices for the services asked about,
// suggests packages that fit the client type as options, and leaves a blank for every fee, which
// only you fill in. A draft can be "ready for your review" only when you've entered every fee; it is
// never sent by this code.
//
// Rules:
//  - Only services on your licensed list can be quoted. Anything else is left out and flagged.
//  - Investment work (and other things your AAT licence doesn't cover) is never quoted and is flagged
//    (AAT Client Care 5.1(k)).
//  - Year-end accounts + Corporation Tax are one price, shown once.
//  - A fee below your published starting price is allowed (your decision) but flagged for a second look.
import { clean } from "./util.mjs";

export const BLANK = "[enter your fee]";

export function buildQuoteDraft({ ref, clientType = "", services = [], requestText = "" }, pricing) {
  const asked = [...new Set((services || []).map((s) => clean(s, 80)).filter(Boolean))];
  const flags = [];
  const unknown = asked.filter((s) => !pricing.services[s]);
  if (unknown.length) flags.push(`Not on your licensed list, so left out: ${unknown.join(", ")}. Decide whether to offer it.`);
  const hay = `${asked.join(" ")} ${clean(requestText, 2000)}`;
  const notOffered = [...new Set((pricing.notOffered?.patterns || []).map((p) => hay.match(new RegExp(`\\b${p}\\b`, "i"))?.[0]?.toLowerCase()).filter(Boolean))];
  if (notOffered.length) flags.push(`Mentions ${notOffered.join(", ")}: not quoted. Your AAT licence doesn't authorise investment work; refer elsewhere if needed.`);

  const known = asked.filter((s) => pricing.services[s]);
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
  const packages = (pricing.packages || []).filter((p) => p.for.includes(clean(clientType, 60)));
  return { ref, status: "draft", approvedPrices: pricing.approved === true, lines, packageOptions: packages, adviceSession: pricing.adviceSession, flags, vat: null, validUntil: null };
}

/** You enter a fee (in pence) for one line. Returns the updated draft; never changes anything else. */
export function enterFee(draft, key, feePence) {
  if (!Number.isInteger(feePence) || feePence <= 0 || feePence > 10_000_000) throw new Error("bad-fee");
  const line = draft.lines.find((l) => l.key === key);
  if (!line) throw new Error("no-such-line");
  return { ...draft, lines: draft.lines.map((l) => (l.key === key ? { ...l, feePence } : l)) };
}

/** Checks a draft before YOU review and send it. Never sends; never sets status beyond "ready-for-review". */
export function checkQuote(draft, { vatStatusDecided = false, validityDecided = false } = {}) {
  const problems = [];
  const warnings = [...draft.flags];
  for (const l of draft.lines) {
    if (l.feePence == null) problems.push(`${l.label}: ${BLANK}`);
    else if (l.fromPence && l.feePence < l.fromPence) warnings.push(`${l.label}: £${(l.feePence / 100).toFixed(2)} is below your published starting price (${l.published}). Fine if intended.`);
  }
  if (!draft.approvedPrices) warnings.push("Published prices in this tool are still PROPOSED, not approved.");
  if (!vatStatusDecided) problems.push("VAT: decide whether your fees include VAT (are you VAT-registered?).");
  if (!validityDecided) problems.push("How long the quote is valid for: decide.");
  if (!draft.lines.length) problems.push("No quotable services.");
  return { status: problems.length ? "incomplete" : "ready-for-review", problems, warnings };
}

export function quoteText(draft) {
  const money = (p) => `£${(p / 100).toFixed(2)}`;
  return [
    `Draft quote · ${draft.ref} · NOT SENT`,
    "",
    ...draft.lines.map((l) => `- ${l.label}: ${l.feePence == null ? BLANK : money(l.feePence)} (published: ${l.published})`),
    "",
    draft.packageOptions.length ? `Package options to mention: ${draft.packageOptions.map((p) => `${p.name} (${p.price})`).join("; ")}.` : "No package matches this client type.",
    draft.adviceSession,
    ...draft.flags.map((f) => `CHECK: ${f}`),
  ].join("\n");
}
