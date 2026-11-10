// Conservative screening that runs on our own function BEFORE any AI step.
// It reads the free text locally; in "structured only" mode the free text is never sent anywhere.
// A false alarm only means a manual reply, so the lists are deliberately broad.
// Reasons are short codes (safe to log and to show in a notice); they never quote the enquiry.
import { clean, asList } from "./util.mjs";

export const ACCOUNTING_SERVICES = [
  "Bookkeeping", "VAT returns", "Personal tax", "Year-end accounts", "Corporation tax returns",
  "Management accounts", "Start-up support", "Business support", "Financial health check",
];
export const CLIENT_TYPES = [
  "Sole trader", "Limited company", "Partnership", "Individual or landlord", "School, charity or organisation", "Other",
];
export const CONTACT_METHODS = ["Email", "Text message", "Video call", "Phone call", "Face to face"];

const SENSITIVE = [
  ["complaint", /\b(complain\w*|unhappy|dissatisf\w*|ombudsman|solicitor\w*|lawyer\w*|legal action|sue|suing)\b/i],
  ["data-rights", /\b(gdpr|data protection|subject access|my (personal )?data|delete my|erase my|erasure|privacy)\b/i],
  ["no-ai-request", /\b(no ai|not use ai|without ai|don'?t use ai|do not use ai|no artificial intelligence)\b/i],
  ["aml", /\b(money laundering|launder\w*|cash[- ]only|cash business|offshore|crypto\w*|bitcoin|shell compan\w*|nominee|sanction\w*)\b/i],
  ["hmrc-dispute", /\b(investigation|investigating|penalt\w*|tribunal|appeal\w*|fraud\w*|evasion|prosecut\w*|court|compliance check|enquiry into)\b/i],
  ["debt", /\b(debt\w*|bailiff\w*|insolven\w*|bankrupt\w*|iva|liquidat\w*|ccj|arrears|repossess\w*)\b/i],
  ["bereavement", /\b(bereave\w*|died|passed away|death|deceased|probate|executor\w*|estate of|widow\w*)\b/i],
  ["family", /\b(divorc\w*|separation|separated|custody|maintenance)\b/i],
  ["health", /\b(ill|illness|cancer|mental health|depress\w*|anxiety|disabilit\w*|disabled|hospital\w*|diagnos\w*|medication|terminal|pregnan\w*|carer|benefits)\b/i],
  ["safeguarding", /\b(abuse\w*|domestic|suicid\w*|self[- ]harm|vulnerab\w*|threat\w*|scared|afraid)\b/i],
];

// Time pressure is not sensitive, but it needs your judgement, so it goes to manual review.
const NEEDS_JUDGEMENT = [
  ["urgent", /\b(urgent\w*|asap|tomorrow|overdue|late filing|missed (the )?deadline)\b/i],
];

const FINANCIAL_PATTERNS = [
  ["sort-code", /\b\d{2}[- ]\d{2}[- ]\d{2}\b/],
  ["card-number", /\b(?:\d[ -]?){13,19}\b/],
  ["ni-number", /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/i],
  ["utr", /\b\d{5}\s?\d{5}\b/],
  ["vat-number", /\bGB\s?\d{9}\b/i],
  ["date-of-birth", /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/],
  ["long-number", /\d{6,}/],
  ["money-amount", /£\s?\d|\b\d[\d,]*\s?(k|grand|pounds)\b/i],
];

const STOPWORDS = new Set("the a an and or to of in for on with my i i'm is are be have need help me you your it this that we our can would like please about".split(" "));

/**
 * @returns {{route: 'ordinary'|'sensitive'|'manual', reasons: string[], notes: string[], services: string[], clientType: string, methods: string[]}}
 */
export function screen(data, { inputMode = "structured" } = {}) {
  const reasons = [];
  let route = "ordinary";
  const flag = (r, code) => {
    reasons.push(code);
    if (r === "sensitive") route = "sensitive";
    else if (route === "ordinary") route = "manual";
  };

  const about = clean(data.about, 100);
  const services = asList(data.services);
  const clientType = clean(data["client-type"], 60);
  const methods = CONTACT_METHODS.filter((m) => asList(data["contact-method"]).some((v) => v.toLowerCase() === m.toLowerCase()));
  const details = clean(data.details, 5000);

  // 1. Eligibility (structured fields)
  if (about !== "Accounting services") flag("manual", "not-accounting");
  if (!services.length) flag("manual", "no-service-ticked");
  if (services.some((s) => !ACCOUNTING_SERVICES.includes(s))) flag("manual", "non-accounting-service");
  if (clientType && !CLIENT_TYPES.includes(clientType)) flag("manual", "unknown-client-type");
  if (!details) flag("manual", "no-details");
  if (details.length > 1200) flag("manual", "long-message");

  // 2. Language check (very rough): mostly non-English text goes to you.
  const words = details.toLowerCase().match(/[\p{L}']+/gu) || [];
  if (words.length >= 8 && words.filter((w) => STOPWORDS.has(w)).length / words.length < 0.08) flag("manual", "may-not-be-english");
  if (/[^\u0000-ɏ‘-‟–—£€\s]/u.test(details)) flag("manual", "unusual-characters");

  // 3. Sensitive topics and financial details (in the free text, read locally only)
  for (const [code, re] of SENSITIVE) if (re.test(details)) flag("sensitive", code);
  for (const [code, re] of NEEDS_JUDGEMENT) if (re.test(details)) flag("manual", code);
  // Financial details: in "structured" mode the text never reaches the AI, so they are noted
  // for you (handle securely) without blocking the draft. In "screened-text" mode they block it.
  // Account numbers, tax references, card numbers and dates of birth are confidential financial
  // information: always sensitive. Plain money amounts (e.g. turnover) are only noted in
  // "structured" mode, because the text never reaches the AI; in "screened-text" mode they block it.
  const notes = [];
  for (const [code, re] of FINANCIAL_PATTERNS) {
    if (!re.test(details)) continue;
    if (code === "money-amount" && inputMode === "structured") notes.push(`financial-${code}`);
    else flag("sensitive", `financial-${code}`);
  }

  // 4. Anything that looks like an attempt to instruct an AI is treated as unusual.
  if (/\b(ignore (all|any|previous)|system prompt|you are (an|a) ai|as an ai|disregard|instructions?)\b/i.test(details)) flag("manual", "unusual-instructions");

  return { route, reasons: [...new Set(reasons)], notes: [...new Set(notes)], services: services.filter((s) => ACCOUNTING_SERVICES.includes(s)), clientType: CLIENT_TYPES.includes(clientType) ? clientType : "", methods: methods.length ? methods : ["Email"] };
}
