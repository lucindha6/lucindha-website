// Conservative screening that runs on our own function BEFORE any AI step.
// It reads the free text locally; in "structured only" mode the free text is never sent anywhere.
// A false alarm only means a manual reply, so the lists are deliberately broad.
// Reasons are short codes (safe to log and to show in a notice); they never quote the enquiry.
import { clean, asList } from "./util.mjs";

export const ACCOUNTING_SERVICES = [
  "Bookkeeping", "VAT returns", "Personal tax", "Year-end accounts", "Corporation tax returns",
  "Management accounts", "Start-up support", "Business support", "Financial health check",
];
export const COMMUNITY_SERVICES = ["Sport & Coaching", "Public Speaking", "Workshops", "I'm not sure yet"];
export const ABOUT = { accounting: "Accounting services", community: "Community Work (sport, speaking or workshops)", other: "Something else" };
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
  ["spaced-number", /\b\d(?:\s?\d){9}\b|\b\d{4}\s\d{4}\b/],
  ["money-amount", /£\s?\d|\b\d[\d,]*\s?(k|grand|pounds)\b/i],
];

// Media requests (usually sent as "Something else").
const MEDIA_CUES = /\b(journalist\w*|reporter\w*|interview\w*|documentar\w*|film(ing)?|podcast\w*|press|magazine|newspaper|article|feature|broadcast\w*|tv|television|radio|bbc|itv|channel 4|sky|producer|media)\b/i;
// Media requests about her personal history or health always need her own judgement.
const PERSONAL_STORY = /\b(foster\w*|in care|care leaver|childhood|trauma\w*|suicid\w*|long qt|heart condition|health|family|personal (story|life)|private life)\b/i;
// Roles that aren't public yet, or anything about them, go to you.
const NOT_PUBLIC = /\b(bda|british deaf association|trustee\w*)\b/i;
// Young people: not sensitive, but worth a note (e.g. safeguarding arrangements, DBS).
const YOUNG_PEOPLE = /\b(child\w*|kids?|young people|youth|pupils?|students?|school\w*|under[- ]?1\d|u1\d|teenager\w*|juniors?)\b/i;

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

  // 1. What kind of enquiry is it? (structured fields first, then wording for "Something else")
  const notes = [];
  let kind = "other";
  const acc = services.filter((s) => ACCOUNTING_SERVICES.includes(s));
  const com = services.filter((s) => COMMUNITY_SERVICES.includes(s));
  const unknown = services.filter((s) => !ACCOUNTING_SERVICES.includes(s) && !COMMUNITY_SERVICES.includes(s));
  if (unknown.length) flag("manual", "unknown-service");
  if (acc.length && com.length) flag("manual", "accounting-and-community-mixed");
  if (about === ABOUT.accounting) {
    kind = "accounting";
    if (!acc.length) flag("manual", com.length ? "community-service-under-accounting" : "no-service-ticked");
  } else if (about === ABOUT.community) {
    kind = "community";
    if (!com.length) flag("manual", acc.length ? "accounting-service-under-community" : "no-service-ticked");
  } else if (about === ABOUT.other && MEDIA_CUES.test(details) && !services.length) {
    kind = "media";
  } else {
    flag("manual", about === ABOUT.other ? "something-else" : "unknown-enquiry-type");
  }
  if (kind !== "media" && MEDIA_CUES.test(details) && /\b(interview\w*|documentar\w*|journalist\w*|podcast\w*|film(ing)?)\b/i.test(details)) flag("manual", "possible-media-request");
  if (kind === "media" && PERSONAL_STORY.test(details)) flag("manual", "media-about-personal-story");
  if (NOT_PUBLIC.test(details) || NOT_PUBLIC.test(clean(data.access, 2000))) flag("manual", "mentions-role-not-yet-public");
  if ((kind === "community" || kind === "media") && YOUNG_PEOPLE.test(details)) notes.push("involves-young-people");
  if (clientType && !CLIENT_TYPES.includes(clientType)) flag("manual", "unknown-client-type");
  if (!details) flag("manual", "no-details");
  if (details.length > 1200) flag("manual", "long-message");

  // 2. Language check (very rough): mostly non-English text goes to you.
  const words = details.toLowerCase().match(/[\p{L}']+/gu) || [];
  if (words.length >= 8 && words.filter((w) => STOPWORDS.has(w)).length / words.length < 0.08) flag("manual", "may-not-be-english");
  if (/[^\u0000-ɏ‘-‟–—£€\s]/u.test(details)) flag("manual", "unusual-characters");

  // 3. Sensitive topics and financial details (in the free text, read locally only)
  for (const [code, re] of SENSITIVE) {
    if (!re.test(details)) continue;
    if (code === "hmrc-dispute" && kind !== "accounting" && !/\b(hmrc|tax\w*)\b/i.test(details)) continue; // a futsal court or a charity appeal
    flag("sensitive", code);
  }
  for (const [code, re] of NEEDS_JUDGEMENT) if (re.test(details)) flag("manual", code);
  // Financial details: in "structured" mode the text never reaches the AI, so they are noted
  // for you (handle securely) without blocking the draft. In "screened-text" mode they block it.
  // Account numbers, tax references, card numbers and dates of birth are confidential financial
  // information: always sensitive. Plain money amounts (e.g. turnover) are only noted in
  // "structured" mode, because the text never reaches the AI; in "screened-text" mode they block it.
  for (const [code, re] of FINANCIAL_PATTERNS) {
    if (!re.test(details)) continue;
    if (code === "money-amount" && inputMode === "structured") notes.push(kind === "accounting" ? `financial-${code}` : "mentions-a-budget-or-fee");
    // For an event or interview, a date is an event date, not a date of birth.
    else if (code === "date-of-birth" && (kind === "community" || kind === "media")) notes.push("mentions-a-date");
    else flag("sensitive", `financial-${code}`);
  }

  // 4. Anything that looks like an attempt to instruct an AI is treated as unusual.
  const INSTRUCTIONS = /\b(ignore (all|any|previous)|system prompt|you are (an|a) ai|as an ai|disregard|instructions?)\b/i;
  if (INSTRUCTIONS.test(details)) flag("manual", "unusual-instructions");

  // 5. The access-needs box is screened too (but Deaf, BSL and disability wording is expected there
  //    and is NOT flagged; it is handled by the accessibility rules instead).
  const access = clean(data.access, 2000);
  for (const [code, re] of SENSITIVE) if (code !== "health" && re.test(access)) flag("sensitive", `${code}-in-access-box`);
  for (const [code, re] of FINANCIAL_PATTERNS) if (code !== "money-amount" && re.test(access)) flag("sensitive", `financial-${code}-in-access-box`);
  if (INSTRUCTIONS.test(access)) flag("manual", "unusual-instructions-in-access-box");

  return { route, kind, reasons: [...new Set(reasons)], notes: [...new Set(notes)], services: kind === "community" ? com : kind === "accounting" ? acc : [], clientType: CLIENT_TYPES.includes(clientType) ? clientType : "", methods: methods.length ? methods : ["Email"] };
}
