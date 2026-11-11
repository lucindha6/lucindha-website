// Stage 4 demonstration with FICTIONAL clients. Run: cd stage4 && npm run demo
// Nothing is sent, booked, stored or decided automatically. Every "Lucindha" step below is a
// simulation of what you would do yourself.
import { readFileSync } from "node:fs";
import { buildQuoteDraft, enterFee, checkQuote, quoteText, setQuoteSection, approveQuote, quoteStatus, QUOTE_SECTIONS } from "../lib/quote.mjs";
import { newLetter, checkLetter, newLetterNeeded } from "../lib/engagement.mjs";
import { newChecklist, applicableSteps, confirmStep, answerRedFlag, review, recordDecision, RED_FLAGS } from "../lib/onboarding.mjs";
import { newEntry, move, nudgesDue } from "../lib/pipeline.mjs";
import { assessRequest, updateBooking, expireHolds } from "../lib/booking.mjs";

const pricing = JSON.parse(readFileSync(new URL("../config/proposed-pricing.json", import.meta.url)));
const availability = JSON.parse(readFileSync(new URL("../config/availability.json", import.meta.url)));
const today = "2026-11-16";
const h = (t) => console.log(`\n${"=".repeat(70)}\n${t}\n${"=".repeat(70)}`);
const ME = { by: "Lucindha" };

h("1. Booking request: 'Priya Example' (FICTIONAL) asks for a chat");
let book = [];
const r1 = assessRequest({ ref: "BKR-PRJYAX", slots: [{ date: "2026-11-17", time: "19:00" }, { date: "2026-11-19", time: "19:00" }], communication: "Video call with BSL" }, { availability, book, today, now: `${today}T09:00:00Z` });
console.log("Outcome:", r1.outcome, "| checked:", r1.checked.map((c) => `${c.slot.date} ${c.slot.time}: ${c.problem || "ok"}`).join("; "));
console.log("Flags:", r1.flags.join(" "));
console.log("--- DRAFT for you (not sent) ---\n" + r1.draft);
book = [r1.hold];

h("2. A second FICTIONAL person asks for the same time: offered alternatives instead");
const r2 = assessRequest({ ref: "BKR-TQMEXA", slots: [{ date: "2026-11-19", time: "19:00" }, { date: "2026-11-20", time: "12:00" }], communication: "Email or text chat (written)" }, { availability, book, today, now: `${today}T10:00:00Z` });
console.log("Outcome:", r2.outcome);
console.log("--- DRAFT for you (not sent) ---\n" + r2.draft);

h("3. You send the offer and the person agrees; YOU record it");
console.log("Internal hold until:", book[0].holdUntil, "(24 hours; when it expires only the hold is released)");
const lapsed = expireHolds(book, "2026-11-17T09:30:00Z");
console.log("If you hadn't sent the offer within 24 hours:", lapsed.book[0].status, "- nothing declined, sent or put in a calendar.");
book = updateBooking(book, "BKR-PRJYAX", "offered", { ...ME, now: `${today}T11:00:00Z` });
try { updateBooking(book, "BKR-PRJYAX", "confirmed", { ...ME, now: "2026-11-17T08:00:00Z" }); } catch (e) { console.log("Confirming without your personal approval refused:", e.message); }
book = updateBooking(book, "BKR-PRJYAX", "confirmed", { ...ME, confirmedPersonally: true, now: "2026-11-17T08:00:00Z" });
console.log(book.map((b) => `${b.ref}: ${b.status} ${b.date} ${b.time}`).join("\n"));

h("4. Draft quotation for FICTIONAL 'Example Widgets Ltd'");
let q = buildQuoteDraft({ ref: "QTE-EXWJDG", clientType: "Limited company", services: ["Year-end accounts", "Corporation tax returns", "VAT returns", "Payroll"], requestText: "FICTIONAL. Could you also look at my pension options?" }, pricing);
console.log(quoteText(q));
console.log("\nCheck now:", JSON.stringify(checkQuote(q), null, 1));
q = enterFee(q, "bundle:ye-ct", 95000);
q = enterFee(q, "VAT returns", 9000);
for (const sec of QUOTE_SECTIONS) q = setQuoteSection(q, sec.key, `FICTIONAL ${sec.title.split(":")[0].toLowerCase()} wording you approved.`, { approvedByLucindha: true });
console.log("\nAfter YOU enter fees and approve each section:", checkQuote(q).status);
q = approveQuote(q, { by: "Lucindha", confirmedPersonally: true, issueDate: "2026-11-20", today: "2026-11-20" });
console.log("After YOUR approval:", q.status, "| valid until", q.validUntil, "| on 2026-12-21:", quoteStatus(q, "2026-12-21"));

h("5. Engagement letter structure for the same FICTIONAL client");
const letter = newLetter({ ref: "ENG-EXWJDG", clientRef: "CLI-EXWJDG", services: ["Year-end accounts", "VAT returns"], licensedServices: Object.keys(pricing.services) });
const lc = checkLetter(letter);
console.log("Status:", lc.status);
for (const p of lc.problems) console.log(" -", p);
console.log("Later adding Bookkeeping:", JSON.stringify(newLetterNeeded({ previousServices: letter.services, services: [...letter.services, "Bookkeeping"] })));

h("6. Onboarding and AML checklist: a FICTIONAL company director turns out to be a PEP");
let c = newChecklist({ ref: "ONB-EXWJDG", clientRef: "CLI-EXWJDG", clientType: "Limited company" });
c = RED_FLAGS.reduce((x, f) => answerRedFlag(x, f.id, f.id === "pep", ME), c);
console.log("Steps that now apply:", applicableSteps(c).map((s) => s.id).join(", "));
try { confirmStep(c, "risk-assessment", { method: "low", date: "2026-11-24", by: "Lucindha" }); } catch (e) { console.log("Rating a PEP as low risk refused:", e.message); }
// You work through the checklist (simulated), rating the risk as medium; EDD left until last.
for (let open; (open = applicableSteps(c).filter((s) => !c.steps[s.id] && s.id !== "edd")).length; )
  c = confirmStep(c, open[0].id, { method: open[0].id === "risk-assessment" ? "medium" : open[0].methods[0], date: "2026-11-24", by: "Lucindha" });
let r = review(c);
console.log("Status:", r.status, "\nOpen:", r.open.join("; "), "\nStop:", r.stop.join(" "));
try { recordDecision(c, { outcome: "accepted", date: "2026-11-25", ...ME, confirmedPersonally: true }); } catch (e) { console.log("Acceptance attempt refused:", e.message); }
c = confirmStep(c, "edd", { method: "completed", date: "2026-11-25", by: "Lucindha" });
c = recordDecision(c, { outcome: "accepted", date: "2026-11-25", ...ME, confirmedPersonally: true, reviewedRedFlags: true });
console.log("After YOU complete EDD and review personally:", c.status);

h("7. Pipeline tracker and nudges (references and dates only)");
let p1 = newEntry({ ref: "CLI-EXWJDG", enquiryRef: "ENQ-EXWJDG", date: today });
for (const [to, d] of [["chat-requested", today], ["chat-offered", today], ["chat-confirmed", "2026-11-17"], ["chat-held", "2026-11-19"], ["quote-drafted", "2026-11-19"], ["quote-sent", "2026-11-20"]]) p1 = move(p1, to, d);
let p2 = move(newEntry({ ref: "CLI-TQMEXA", date: today }), "chat-requested", today);
p2 = move(p2, "chat-offered", today);
for (const n of nudgesDue([p1, p2], "2026-11-27")) console.log(n.text);
try { newEntry({ ref: "Jane Example, 07700 900000", date: today }); } catch (e) { console.log("Personal details in the tracker refused:", e.message); }
try { move(p1, "engaged", "2026-11-27"); } catch (e) { console.log("Automatic 'engaged' refused:", e.message); }

console.log("\nDemo finished. Nothing was sent, booked, stored or decided.");
