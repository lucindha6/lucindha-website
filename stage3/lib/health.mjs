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
 * }
 */
export function buildHealthReport(facts) {
  const asOf = assertDate(facts.asOf);
  const items = [];
  const add = (level, text) => items.push({ level, text });

  for (const d of facts.deploys || []) {
    if (d.state === "ready") add("ok", `${d.site}: latest deploy published (${d.date}).`);
    else add("bad", `${d.site}: latest deploy is "${d.state}" (${d.date}). Check Netlify.`);
  }
  for (const f of facts.functions || []) {
    const rate = f.calls ? f.errors / f.calls : 0;
    if (f.errors === 0) add("ok", `${f.site}/${f.name}: ${f.calls} calls, no errors.`);
    else if (rate < 0.05) add("warn", `${f.site}/${f.name}: ${f.errors} error(s) in ${f.calls} calls.`);
    else add("bad", `${f.site}/${f.name}: ${f.errors} error(s) in ${f.calls} calls (${Math.round(rate * 100)}%).`);
  }
  for (const t of facts.tasks || []) {
    const age = t.lastRun ? daysBetween(t.lastRun, asOf) : Infinity;
    if (t.status !== "succeeded") add("bad", `Scheduled task "${t.name}": last run ${t.status}${t.lastRun ? ` on ${t.lastRun}` : ""}.`);
    else if (age > (t.expectedEveryDays || 7) + 1) add("warn", `Scheduled task "${t.name}": hasn't run since ${t.lastRun}.`);
    else add("ok", `Scheduled task "${t.name}": ran ${t.lastRun}.`);
  }
  const expiries = [...(facts.expiries || []), { what: "Bank holiday list in Stage 2 and Stage 3", date: HOLIDAYS_VALID_UNTIL }];
  for (const e of expiries) {
    const left = daysBetween(asOf, assertDate(e.date));
    if (left < 0) add("bad", `${e.what}: expired ${e.date}.`);
    else if (left <= 30) add("bad", `${e.what}: expires ${e.date} (${left} days).`);
    else if (left <= 60) add("warn", `${e.what}: expires ${e.date} (${left} days).`);
  }
  if (facts.formSubmissions7d === 0) add("warn", "No website enquiries in the last 7 days: check the form still works (or it's just a quiet week).");

  const worst = items.some((i) => i.level === "bad") ? "bad" : items.some((i) => i.level === "warn") ? "warn" : "ok";
  const order = { bad: 0, warn: 1, ok: 2 };
  const text = [
    `Weekly website health check · ${asOf} · overall: ${LEVEL[worst]}`,
    "",
    ...items.sort((a, b) => order[a.level] - order[b.level]).map((i) => `${LEVEL[i.level].padEnd(6)} ${i.text}`),
  ].join("\n");
  return { overall: worst, items, text };
}
