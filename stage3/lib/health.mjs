// Weekly health report (DESIGN, development only). It turns status facts into a short report.
// Inputs are counts and dates only: deploy states, function call and error counts, scheduled task
// results and expiry dates. It never receives or prints enquiry content, names or addresses.
import { assertDate, daysBetween, HOLIDAYS_VALID_UNTIL } from "./calendar.mjs";

const LEVEL = { ok: "OK", warn: "CHECK", bad: "ACTION" };

/**
 * facts: {
 *   asOf: "YYYY-MM-DD",
 *   deploys: [{ site, state: "ready"|"error"|..., date }],
 *   functions: [{ site, name, calls, errors }],
 *   tasks: [{ name, lastRun: "YYYY-MM-DD"|null, status: "succeeded"|"failed"|... , expectedEveryDays }],
 *   expiries: [{ what, date }],
 *   formSubmissions7d: number | null,
 *   reconciliation: [{ stage, received, processed, failed }],   // counts for the week
 *   reminders: { attempted, confirmed, undelivered, caseErrors }, // from the daily case check
 *   credentials: [{ what, expires: "YYYY-MM-DD" }],               // e.g. client secrets
 * }
 * REQUIRED facts: deploys, functions, tasks, reconciliation, reminders, credentials. If any is
 * missing, the report can't be "OK": it says so as ACTION. It never shows a healthy status by default.
 */
const tidy = (v, n = 60) => String(v ?? "").replace(/[^\w .:/()-]/g, "_").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[address removed]").slice(0, n);
export function buildHealthReport(facts) {
  const asOf = assertDate(facts.asOf);
  const items = [];
  const add = (level, text) => items.push({ level, text });

  // Enquiries received vs processed: every enquiry must be accounted for.
  for (const r of Array.isArray(facts.reconciliation) ? facts.reconciliation : []) {
    const ok = [r.received, r.processed].every((n) => Number.isInteger(n) && n >= 0);
    if (!ok) { add("bad", `${tidy(r.stage)}: received/processed counts missing or invalid.`); continue; }
    const failed = Number.isInteger(r.failed) ? r.failed : 0;
    if (r.processed + failed < r.received) add("bad", `${tidy(r.stage)}: ${r.received} received but only ${r.processed} processed${failed ? ` and ${failed} failed` : ""}. ${r.received - r.processed - failed} unaccounted for: check the mailbox.`);
    else if (r.processed > r.received) add("bad", `${tidy(r.stage)}: more processed (${r.processed}) than received (${r.received}): possible duplicates.`);
    else if (failed) add("bad", `${tidy(r.stage)}: ${failed} enquiry(ies) failed processing. Check them by hand.`);
    else add("ok", `${tidy(r.stage)}: ${r.received} received, all processed.`);
  }
  // Reminders: only confirmed deliveries count.
  const rm = facts.reminders;
  if (rm && [rm.attempted, rm.confirmed].every(Number.isInteger)) {
    const undelivered = Number.isInteger(rm.undelivered) ? rm.undelivered : rm.attempted - rm.confirmed;
    if (undelivered > 0) add("bad", `Reminders: ${undelivered} of ${rm.attempted} not confirmed as delivered (they'll be retried). Check the reminder route.`);
    else add("ok", `Reminders: ${rm.confirmed} sent, all confirmed delivered.`);
    if (Number.isInteger(rm.caseErrors) && rm.caseErrors > 0) add("bad", `Case check: ${rm.caseErrors} case(s) couldn't be checked. Look at their dates.`);
  }
  for (const c of Array.isArray(facts.credentials) ? facts.credentials : []) {
    try { assertDate(c.expires); } catch { add("bad", `${tidy(c.what)}: expiry date unknown.`); continue; }
    const left = daysBetween(asOf, c.expires);
    if (left < 0) add("bad", `${tidy(c.what)}: EXPIRED ${c.expires}. The connection will fail until it's renewed.`);
    else if (left <= 30) add("bad", `${tidy(c.what)}: expires ${c.expires} (${left} days). Renew now.`);
    else if (left <= 60) add("warn", `${tidy(c.what)}: expires ${c.expires} (${left} days). Plan the renewal.`);
    else add("ok", `${tidy(c.what)}: valid until ${c.expires}.`);
  }

  for (const d of facts.deploys || []) {
    if (d.state === "ready") add("ok", `${tidy(d.site)}: latest deploy published (${tidy(d.date, 10)}).`);
    else add("bad", `${tidy(d.site)}: latest deploy is "${tidy(d.state, 20)}" (${tidy(d.date, 10)}). Check Netlify.`);
  }
  for (const f of facts.functions || []) {
    const rate = f.calls ? f.errors / f.calls : 0;
    if (f.errors > 0 && !f.calls) add("bad", `${tidy(f.site)}/${tidy(f.name)}: ${f.errors} error(s) with no successful calls recorded.`);
    else if (f.errors === 0) add("ok", `${tidy(f.site)}/${tidy(f.name)}: ${f.calls} calls, no errors.`);
    else if (rate < 0.05) add("warn", `${tidy(f.site)}/${tidy(f.name)}: ${f.errors} error(s) in ${f.calls} calls.`);
    else add("bad", `${tidy(f.site)}/${tidy(f.name)}: ${f.errors} error(s) in ${f.calls} calls (${Math.round(rate * 100)}%).`);
  }
  for (const t of facts.tasks || []) {
    const age = t.lastRun ? daysBetween(t.lastRun, asOf) : Infinity;
    if (!t.lastRun) add("warn", `Scheduled task "${tidy(t.name)}": has never run.`);
    else if (t.status !== "succeeded") add("bad", `Scheduled task "${tidy(t.name)}": last run ${t.status} on ${t.lastRun}.`);
    else if (age > (t.expectedEveryDays || 7) + 1) add("warn", `Scheduled task "${tidy(t.name)}": hasn't run since ${t.lastRun}.`);
    else add("ok", `Scheduled task "${tidy(t.name)}": ran ${t.lastRun}.`);
  }
  const expiries = [...(facts.expiries || []), { what: "Bank holiday list in Stage 2 and Stage 3", date: HOLIDAYS_VALID_UNTIL }];
  for (const e of expiries) {
    const left = daysBetween(asOf, assertDate(e.date));
    if (left < 0) add("bad", `${tidy(e.what)}: expired ${e.date}.`);
    else if (left <= 30) add("bad", `${tidy(e.what)}: expires ${e.date} (${left} days).`);
    else if (left <= 60) add("warn", `${tidy(e.what)}: expires ${e.date} (${left} days).`);
  }
  if (facts.formSubmissions7d === 0) add("warn", "No website enquiries in the last 7 days: check the form still works (or it's just a quiet week).");
  // Missing information is a problem in itself: a report must never say "OK" because it saw nothing.
  for (const [k, label] of [["deploys", "deploy status"], ["functions", "function figures"], ["tasks", "scheduled task results"], ["reconciliation", "received-vs-processed counts"], ["credentials", "credential expiry dates"]]) {
    if (!Array.isArray(facts[k]) || facts[k].length === 0) add("bad", `No ${label} were collected this week, so health CAN'T be confirmed: the check itself may have failed.`);
  }
  if (!rm || ![rm.attempted, rm.confirmed].every(Number.isInteger)) add("bad", "Reminder delivery figures weren't collected, so health CAN'T be confirmed.");
  if (facts.formSubmissions7d == null) add("warn", "Website enquiry count wasn't collected this week.");

  const worst = items.some((i) => i.level === "bad") ? "bad" : items.some((i) => i.level === "warn") ? "warn" : "ok";
  const order = { bad: 0, warn: 1, ok: 2 };
  const text = [
    `Weekly website health check · ${asOf} · overall: ${LEVEL[worst]}`,
    "",
    ...items.sort((a, b) => order[a.level] - order[b.level]).map((i) => `${LEVEL[i.level].padEnd(6)} ${i.text}`),
  ].join("\n");
  return { overall: worst, items, text };
}
