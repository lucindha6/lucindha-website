// Checks the AI-written opening paragraph against the professional-standards rules.
// The rest of every draft is assembled from approved sentences, so only the AI's words are checked.
// Any failure means the draft is NOT created and the enquiry goes to manual review.

const RULES = [
  ["advice", /\b(you should|you must|you need to|you can (claim|deduct|offset)|you are entitled|you're entitled|i recommend|i'd recommend|i advise|my advice|tax[- ]free|allowable|deduct\w*|claim (all|your))\b/i],
  ["fees", /£|\$|€|\b\d+\s?(pounds|gbp|per cent|percent|%)\b|\b(price|fee|cost|charge|quote|discount|free of charge|offer|deal|cheap\w*)\b/i],
  ["acceptance", /\b(take you on|act for you|welcome (you )?(aboard|as a client)|you're (now )?a client|engage(d|ment)|sign(ed)? up|onboard\w*)\b/i],
  ["appointments", /\b(appointment|book(ed|ing)?|meet(ing)? (on|at)|available (on|at)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|\d{1,2}(:\d{2})?\s?(am|pm)|o'clock)\b/i],
  ["deadlines", /\b(by (the )?\d|within \d|deadline|guarantee\w*|promise\w*|definitely|certainly will|straight away|immediately|asap)\b/i],
  ["support-promises", /\b(interpreter|captions?|i'll arrange|i will arrange|i can arrange|provide (a|an) )\b/i],
  ["links", /https?:\/\/|www\.|\.[a-z]{2,}\/|@/i],
  ["markup", /[<>{}\[\]]/],
  ["other-services", /\b(payroll|audit\w*|insolvency|probate|investment|mortgage|pension|legal|solicitor)\b/i],
];

export function validateIntro(text) {
  const reasons = [];
  const t = String(text || "");
  if (!t.trim()) reasons.push("empty");
  if (t.length > 320) reasons.push("too-long");
  if ((t.match(/[.!?](\s|$)/g) || []).length > 3) reasons.push("too-many-sentences");
  for (const [code, re] of RULES) if (re.test(t)) reasons.push(code);
  return { ok: reasons.length === 0, reasons };
}
