// MONTHLY RETENTION REVIEW from a file you export yourself (e.g. a Netlify Forms export converted
// to JSON). Prints a report of records POTENTIALLY due for deletion and a checklist of places outside
// Netlify. Never deletes, never connects to anything, needs no access token.
//
//   node tools/monthly-review.mjs items.json [YYYY-MM-DD] [outside.json]
//
// outside.json (optional): { "outlook-hello": "reviewed", "paper": "not-applicable", ... }
// Until Lucindha approves, use FICTIONAL files only (tools/fictional-retention-items.json).
import { readFileSync } from "node:fs";
import { monthlyReview } from "../lib/retention.mjs";

const [file, asOf = new Date().toISOString().slice(0, 10), outsideFile] = process.argv.slice(2);
if (!file) { console.error("Usage: node tools/monthly-review.mjs items.json [YYYY-MM-DD] [outside.json]"); process.exit(2); }
const items = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(items)) { console.error("The file must contain a JSON list."); process.exit(2); }
const outside = outsideFile ? JSON.parse(readFileSync(outsideFile, "utf8")) : {};
const r = monthlyReview(items, { asOf, outside });
console.log(r.text);
console.log("\nAudit entry (ids and counts only):\n" + JSON.stringify(r.audit, null, 2));
