// Retention: MANUAL MONTHLY REVIEW (your decision, 11 Nov 2026). This module only REPORTS records
// potentially due for deletion; you review them and delete by hand, if at all. There is no automated
// deletion and no Netlify access token. Personal data held OUTSIDE Netlify is covered by a monthly
// checklist of places you review yourself.
//
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
  dispute: "a fee dispute or disagreement that isn't settled",
  "legal-claim": "a possible or actual legal claim (keep to establish or defend it)",
  "preservation-notice": "you've been asked to preserve information (court, regulator, insurer)",
  "insurer-notified": "notified to your professional indemnity insurer",
  "hmrc-enquiry": "an open HMRC enquiry or compliance check",
  "aml-record": "anti-money laundering record (keep 5 years after the relationship ends, MLR 2017 reg. 40)",
  "investigation": "an ICO, AAT or other regulatory investigation",
  "open-privacy-request": "the person has an open access or other privacy request (don't delete what they've asked for)",
};

/**
 * Places personal data can sit OUTSIDE Netlify. Reviewed by you each month; Stage 3 can't see
 * into them. Edit the list to match your set-up.
 */
export const OUTSIDE_NETLIFY = [
  { id: "outlook-hello", place: "Outlook: hello@ (Inbox, Sent Items, Deleted Items, archive)" },
  { id: "outlook-specialist", place: "Outlook: complaints@, privacy@ and media@ mailboxes (once created)" },
  { id: "outlook-own", place: "Outlook: your own mailbox and any test mailboxes (e.g. drafts-test@)" },
  { id: "onedrive-sharepoint", place: "OneDrive / SharePoint client folders and downloads" },
  { id: "bookkeeping-software", place: "Bookkeeping and tax software client records" },
  { id: "hmrc-agent", place: "HMRC agent services and other government portals (follow their own rules)" },
  { id: "devices", place: "Laptop and phone: downloads, desktop, screenshots, local copies" },
  { id: "messages-social", place: "Texts, WhatsApp, video-call chats and social media messages" },
  { id: "paper", place: "Paper files and notebooks" },
  { id: "backups", place: "Backups and exports (they keep data after the original is deleted)" },
  { id: "github", place: "GitHub repository: should hold NO personal data (check nothing has crept in)" },
];

/** Proposed audit-trail retention. Not approved. */
export const AUDIT = { approved: false, keepYears: 6, note: "PROPOSED: keep the review log for 6 years (a typical professional records period). Needs your decision." };

/**
 * items: [{ id, category, clockDate (YYYY-MM-DD) | createdAt (ISO), flags: [exception keys] }]
 * Returns { approved:false, asOf, rows: [{id, category, action, reason, keepUntil}], totals }
 */
export function dryRun(items, { asOf, schedule = SCHEDULE } = {}) {
  assertDate(asOf);
  const rows = [];
  for (const it of items) {
    const tidy = (v, n) => String(v ?? "").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[address removed]").replace(/[^\w.:\[\] -]/g, "_").slice(0, n);
    const id = tidy(it.id, 64) || "(no id)";
    const category = tidy(it.category, 40);
    const rule = Object.prototype.hasOwnProperty.call(schedule.rules, it.category) ? schedule.rules[it.category] : null;
    const badFlagsShape = it.flags !== undefined && !Array.isArray(it.flags);
    const rawFlags = Array.isArray(it.flags) ? it.flags.map(String) : badFlagsShape ? ["(flags not a list)"] : [];
    const flags = rawFlags.filter((f) => Object.hasOwn(EXCEPTIONS, f));
    const unknownFlags = rawFlags.filter((f) => !Object.hasOwn(EXCEPTIONS, f));
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

/**
 * Monthly review report (manual process). `items` = an export you download yourself from Netlify
 * (form submissions, Blobs listing) with ids, categories and dates only. `outside` = which outside-
 * Netlify places you've reviewed this month: { [id]: "reviewed" | "not-applicable" }.
 * Returns the report and an audit-trail entry WITHOUT personal data (ids, counts, dates).
 */
export function monthlyReview(items, { asOf, outside = {}, schedule = SCHEDULE } = {}) {
  const run = dryRun(items, { asOf, schedule });
  const month = asOf.slice(0, 7);
  const potentially = run.rows.filter((r) => r.action === "would-delete");
  const kept = run.rows.filter((r) => r.action === "keep" && /^exception/.test(r.reason));
  const decide = run.rows.filter((r) => r.action === "keep" && /(needs your decision|check by hand|NEEDS YOUR DECISION|no reliable date|unknown category|unrecognised flag)/i.test(r.reason));
  const outsideRows = OUTSIDE_NETLIFY.map((o) => ({ ...o, status: ["reviewed", "not-applicable"].includes(outside[o.id]) ? outside[o.id] : "not yet reviewed" }));
  const outstanding = outsideRows.filter((o) => o.status === "not yet reviewed");
  const unapproved = Object.entries(schedule.rules).filter(([, r]) => r.keepMonths == null).map(([k]) => k);
  const complete = outstanding.length === 0;
  const text = [
    `Monthly retention review · ${month} · as of ${asOf}`,
    run.approved ? "Schedule: approved." : "Schedule: PROPOSED, NOT APPROVED. Nothing may be deleted until you approve it.",
    unapproved.length ? `Retention periods still needing your decision: ${unapproved.join(", ")}.` : null,
    "",
    `Potentially due for deletion (your decision, deleted by hand if at all): ${potentially.length}`,
    ...potentially.map((r) => `  - ${r.id} [${r.category}] ${r.reason}`),
    `Kept because of an exception: ${kept.length}`,
    ...kept.map((r) => `  - ${r.id} [${r.category}] ${r.reason}`),
    `Need your decision: ${decide.length}`,
    ...decide.map((r) => `  - ${r.id} [${r.category}] ${r.reason}`),
    "",
    `Outside Netlify: ${outsideRows.length - outstanding.length} of ${outsideRows.length} places reviewed this month.`,
    ...outsideRows.map((o) => `  [${o.status === "not yet reviewed" ? " " : "x"}] ${o.place}${o.status === "not-applicable" ? " (not applicable)" : ""}`),
    complete ? "Review complete for this month." : "REVIEW NOT COMPLETE: some places haven't been reviewed.",
    "",
    "Before deleting anything, check for exceptions not recorded here (disputes, claims, HMRC or AAT enquiries, insurer notifications, open privacy requests).",
    "This is a report only. Nothing has been deleted.",
  ].filter((l) => l !== null).join("\n");
  const audit = {
    month, asOf,
    potentiallyDue: potentially.map((r) => r.id),
    keptByException: kept.length,
    needDecision: decide.length,
    outsideReviewed: outsideRows.filter((o) => o.status !== "not yet reviewed").map((o) => o.id),
    complete,
    scheduleApproved: run.approved,
    deletedByLucindha: null, // you fill in afterwards: ids you deleted by hand and the date
  };
  return { month, complete, potentially, kept, decide, outside: outsideRows, unapproved, text, audit };
}

/** Records what YOU did after the review: ids only. Refuses anything that isn't on that month's list. */
export function recordManualDeletion(audit, { ids, date, by }) {
  if (by !== "Lucindha") throw new Error("only-lucindha-records-deletions");
  assertDate(date);
  if (!Array.isArray(ids) || !ids.every((i) => audit.potentiallyDue.includes(i))) throw new Error("id-not-in-this-months-review");
  return { ...audit, deletedByLucindha: { ids: [...ids], date } };
}
