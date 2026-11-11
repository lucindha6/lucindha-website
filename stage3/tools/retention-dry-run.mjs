// Retention DRY RUN from a file you export yourself (e.g. a Netlify Forms export converted to JSON).
// Reads the file, prints a report. Never deletes, never connects to anything.
//
//   node tools/retention-dry-run.mjs path/to/items.json [YYYY-MM-DD]
//
// items.json: [{ "id": "...", "category": "enquiry-no-work", "clockDate": "YYYY-MM-DD", "flags": [] }, ...]
// Phase note: until Lucindha approves, use FICTIONAL files only (tools/fictional-retention-items.json).
import { readFileSync } from "node:fs";
import { dryRun, reportText } from "../lib/retention.mjs";

const [file, asOf = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!file) { console.error("Usage: node tools/retention-dry-run.mjs items.json [YYYY-MM-DD]"); process.exit(2); }
const items = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(items)) { console.error("The file must contain a JSON list."); process.exit(2); }
console.log(reportText(dryRun(items, { asOf })));
