// Retention DRY RUN. This module only REPORTS what would be deleted under the proposed retention
// schedule. It contains no code that deletes, moves or changes anything, anywhere (a test checks
// this). Deletion needs your approval of the schedule and its legal and regulatory exceptions first.
//
// It works on a list of items you supply, for example a CSV/JSON export you download yourself from
// the Netlify dashboard, so it needs no Netlify access token. The report lists only item IDs, dates,
// categories and reasons, never names, addresses or message text.
import { assertDate, addCalendarMonths, ukDateOf } from "./calendar.mjs";

/**
 * PROPOSED schedule, taken from your published privacy notice. Not approved.
 * keepMonths counts from `from`: the date the clock starts for that kind of item.
 */
export const SCHEDULE = {
  approved: false,
  rules: {
    "enquiry-no-work": { keepMonths: 12, from: "last contact", source: "privacy notice: enquiries that don't lead to work, up to 12 months after last contact" },
    "stage2-record": { keepMonths: 1, from: "created", source: "Stage 2 design: technical records tidied after 30 days" },
    "client-identity": { keepMonths: 60, from: "relationship ended", source: "privacy notice: 5 years after the relationship ends (anti-money laundering law)" },
    "client-accounting": { keepMonths: 72, from: "end of tax year or period", source: "privacy notice: generally 6 years, or longer where law, insurer or professional body requires" },
    complaint: { keepMonths: null, from: null, source: "NEEDS YOUR DECISION: no period published (consider your insurer's and AAT's expectations)" },
    "privacy-request": { keepMonths: null, from: null, source: "NEEDS YOUR DECISION: no period published" },
  },
};

/** Reasons an item must be kept whatever its age. Any one of these means KEEP. */
export const EXCEPTIONS = {
  "open-case": "linked to an open complaint or privacy request",
  "legal-hold": "you've marked it to keep (e.g. dispute, claim, insurer, HMRC or AAT enquiry)",
  "became-client": "the enquirer became a client, so client retention rules apply instead",
  "regulatory-hold": "kept for a regulator or professional body",
};

/**
 * items: [{ id, category, clockDate (YYYY-MM-DD) | createdAt (ISO), flags: [exception keys] }]
 * Returns { approved:false, asOf, rows: [{id, category, action, reason, keepUntil}], totals }
 */
export function dryRun(items, { asOf, schedule = SCHEDULE } = {}) {
  assertDate(asOf);
  const rows = [];
  for (const it of items) {
    const tidy = (v, n) => String(v ?? "").replace(/[^\w.@:-]/g, "_").slice(0, n);
    const id = tidy(it.id, 64) || "(no id)";
    const category = tidy(it.category, 40);
    const rule = Object.prototype.hasOwnProperty.call(schedule.rules, it.category) ? schedule.rules[it.category] : null;
    const badFlagsShape = it.flags !== undefined && !Array.isArray(it.flags);
    const rawFlags = Array.isArray(it.flags) ? it.flags.map(String) : badFlagsShape ? ["(flags not a list)"] : [];
    const flags = rawFlags.filter((f) => EXCEPTIONS[f]);
    const unknownFlags = rawFlags.filter((f) => !EXCEPTIONS[f]);
    // The clock date must be given explicitly, unless the rule really counts from creation.
    let clock = null;
    try {
      clock = it.clockDate ? assertDate(it.clockDate) : rule?.from === "created" && it.createdAt ? ukDateOf(it.createdAt) : null;
    } catch { clock = null; }
    let action, reason, keepUntil = null;
    if (!rule) [action, reason] = ["keep", "unknown category: needs your decision"];
    else if (unknownFlags.length) [action, reason] = ["keep", `unrecognised flag (${unknownFlags.map((f) => tidy(f, 20)).join(", ")}): check by hand`];
    else if (rule.keepMonths == null) [action, reason] = ["keep", rule.source];
    else if (!clock) [action, reason] = ["keep", "no reliable date: check by hand"];
    else {
      keepUntil = addCalendarMonths(clock, rule.keepMonths);
      if (flags.length) [action, reason] = ["keep", `exception: ${flags.map((f) => EXCEPTIONS[f]).join("; ")}`];
      else if (asOf > keepUntil) [action, reason] = ["would-delete", `older than ${rule.keepMonths} month(s) from ${rule.from} (${rule.source})`];
      else [action, reason] = ["keep", `within retention until ${keepUntil}`];
    }
    rows.push({ id, category, action, reason, keepUntil });
  }
  const totals = rows.reduce((t, r) => ((t[r.action] = (t[r.action] || 0) + 1), t), {});
  return { approved: schedule.approved === true, asOf, rows, totals };
}

export function reportText(result) {
  const lines = [
    `Retention dry run · as of ${result.asOf}`,
    result.approved ? "Schedule: approved." : "Schedule: PROPOSED, NOT APPROVED. Nothing may be deleted.",
    `Would delete: ${result.totals["would-delete"] || 0} · Keep: ${result.totals.keep || 0}`,
    "",
    ...result.rows.map((r) => `${r.action === "would-delete" ? "WOULD DELETE" : "keep        "} ${r.id} [${r.category}] ${r.reason}`),
    "",
    "This is a report only. Nothing has been deleted.",
  ];
  return lines.join("\n");
}
