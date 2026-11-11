// Data protection rights: what each one is, its time limit, what can move the deadline, and the
// exemptions you must consider. Used to label privacy cases and to work out deadlines correctly.
//
// Sources (checked 11 Nov 2026; still to be confirmed against the full ICO guidance before go-live):
//  - UK GDPR Art. 12(3) and new Art. 12A (inserted by the Data (Use and Access) Act 2025, s.76,
//    in force 5 Feb 2026): one month from "the relevant time" = the LATEST of receipt of the
//    request, receipt of ID information you asked for under Art. 12(6) (only where you have
//    reasonable doubts about identity), and payment of any fee under Art. 12(5) (only for
//    manifestly unfounded or excessive requests). Extension by two further months for complexity
//    or number of requests, notified with reasons within the first month.
//  - Art. 12A(5): the "stop the clock" pause for clarification applies ONLY to access requests
//    (Art. 15), and only where you reasonably require the information to identify what's wanted
//    (e.g. you hold a large amount of information about the person).
//  - Data protection complaints to a controller (Data Protection Act 2018 s.164A, inserted by
//    DUAA 2025 s.103, in force 19 June 2026): acknowledge within 30 days of receipt; take
//    appropriate steps and tell the person the outcome without undue delay; keep them informed.
//
// This module labels and explains. It never decides: anything unclear goes to you.
import { clean } from "./util.mjs";

const ONE_MONTH = { kind: "one-month", basis: "UK GDPR Art. 12(3) and 12A" };

export const RIGHTS = {
  access: {
    label: "Subject access (copy of their personal data)", article: "Art. 15", limit: ONE_MONTH,
    clarificationPauses: true,
    exemptions: ["other people's information (third-party data)", "legal professional privilege", "manifestly unfounded or excessive", "searches need only be reasonable and proportionate"],
  },
  rectification: {
    label: "Rectification (correct inaccurate data, complete incomplete data)", article: "Art. 16", limit: ONE_MONTH,
    clarificationPauses: false,
    exemptions: ["you may restrict processing while you check accuracy", "you may refuse if the data is accurate: explain why", "manifestly unfounded or excessive"],
  },
  erasure: {
    label: "Erasure (right to be forgotten)", article: "Art. 17", limit: ONE_MONTH,
    clarificationPauses: false,
    exemptions: ["a legal obligation to keep it (e.g. anti-money laundering records for 5 years; HMRC and Companies Act record-keeping)", "establishing, exercising or defending legal claims", "the right only applies on the Art. 17(1) grounds", "manifestly unfounded or excessive"],
  },
  restriction: {
    label: "Restriction (pause use of the data)", article: "Art. 18", limit: ONE_MONTH,
    clarificationPauses: false,
    exemptions: ["applies only on the Art. 18(1) grounds", "tell the person before lifting a restriction"],
  },
  portability: {
    label: "Data portability", article: "Art. 20", limit: ONE_MONTH,
    clarificationPauses: false,
    exemptions: ["only data they gave you, processed by automated means on consent or contract"],
  },
  objection: {
    label: "Objection to processing", article: "Art. 21", limit: ONE_MONTH,
    clarificationPauses: false,
    exemptions: ["for processing on legitimate interests or public task: you may continue only with compelling legitimate grounds, or for legal claims"],
  },
  "direct-marketing-objection": {
    label: "Objection to direct marketing (absolute)", article: "Art. 21(2)-(3); PECR", limit: ONE_MONTH,
    clarificationPauses: false, stopNow: true,
    exemptions: ["none: you must stop direct marketing (keep a suppression record)"],
  },
  "automated-decisions": {
    label: "Automated decision-making safeguards", article: "Art. 22A-22D", limit: ONE_MONTH,
    clarificationPauses: false,
    exemptions: ["you don't currently make automated decisions with legal or similar effects: confirm and explain"],
  },
  "consent-withdrawal": {
    label: "Withdrawal of consent", article: "Art. 7(3)", limit: ONE_MONTH,
    clarificationPauses: false, stopNow: true,
    exemptions: ["processing before withdrawal stays lawful; stop processing that relied on consent"],
  },
  "dp-complaint": {
    label: "Data protection complaint (about how their data was used)", article: "DPA 2018 s.164A (DUAA 2025 s.103)",
    limit: { kind: "ack-30-days", basis: "DPA 2018 s.164A: acknowledge within 30 days; outcome without undue delay" },
    clarificationPauses: false,
    exemptions: ["keep the person informed of progress", "they can also complain to the ICO"],
  },
  unclear: {
    label: "Unclear: needs your reading", article: "-", limit: ONE_MONTH,
    clarificationPauses: false,
    exemptions: ["decide which right(s) are being exercised"],
  },
};
export const RIGHT_KEYS = Object.keys(RIGHTS);

// Detection: first person / request-style wording only, so footers and notices don't count.
const PATTERNS = {
  access: /\b(subject access|dsar|right of access|(making|make|submit|submitting|this is) an? sar|everything (that )?you (hold|have|keep)( on| about) me|(what|any|all) (personal )?(data|information|details)( (that )?(you|your firm|your company))? (has|have|hold|holds|keep|keeps) (on|about) me|copy of (all )?(of )?(my|his|her|their|our|the) (personal )?(data|information|records|details|file)|(what|all the|any) (personal )?(data|information|details|records)[^.?!\n]{0,30}\b(you|your firm)\b[^.?!\n]{0,20}\b(hold|have|keep|store)\b|(information|data|details|records?)\b[^.?!\n]{0,40}\b(hold|have|keep|store|process)\b[^.?!\n]{0,25}\b(about|on|of) me\b|(see|send me|show me|get) (my file|everything you('ve| have)? (got|hold|have) on me)|what (do )?you (have|hold|keep) on (file about )?me)\b/i,
  rectification: /\b((rectify|correct|update|fix|amend) (my|his|her|their|the) (personal )?(data|details|information|records?|address|name|date of birth)|my (details|information|data|records?) (is|are) (wrong|incorrect|out of date|inaccurate)|you('ve| have) got my [a-z ]{1,20} wrong)\b/i,
  erasure: /\b((delete|remove|erase) me from your (records|system|database|list|files)|(erase|delete|remove) everything (you (hold|have) )?(about|on) me|(delete|erase|remove|wipe|destroy) (all )?(of )?(my|his|her|their|our) (personal )?(data|information|details|records|file)|right to be forgotten|forget (me|him|her|them)|take (me|him|her|them|us) off your (system|records|database|list))\b/i,
  restriction: /\b(restrict (the )?(use|processing)( of my)?|restriction of processing|(pause|freeze) (using|use of|processing) my)\b/i,
  portability: /\b(data portability|port my data|(transfer|move) my (personal )?data to)\b/i,
  objection: /\b(object to (you |your )?(the )?(using|use|processing)|stop (using|processing) my (personal )?(data|information|details))\b/i,
  "direct-marketing-objection": /\b(stop (sending|emailing) me (marketing|newsletters|promotions?)|unsubscribe me|no more marketing|opt me out|remove me from (your )?(mailing|marketing) list)\b/i,
  "automated-decisions": /\b(automated decision|decided by (a )?(computer|algorithm|ai)|human review of (the|this) decision)\b/i,
  "consent-withdrawal": /\b((withdraw|withdrawing|revoke) (my )?consent|no longer consent)\b/i,
  "dp-complaint": /\b((complain|complaint)[^.?!\n]{0,40}\b(my (personal )?(data|information|details)|data protection|gdpr|privacy)|(shared|disclosed|leaked|lost|sent) my (personal )?(data|information|details)|data breach|misused my (data|information|details))\b/i,
};

// Things that make a request complex enough that you should read it yourself before relying on any label.
const NEEDS_REVIEW = {
  "on-behalf": /\b(on behalf of|my client|my (son|daughter|child|mother|father|mum|dad|partner|wife|husband)('s)?|power of attorney|acting for)\b/i,
  "legal-context": /\b(solicitor|tribunal|court|litigation|legal action|claim against|ombudsman)\b/i,
  "ico-mentioned": /\b(ico|information commissioner)\b/i,
  "child-or-vulnerable": /\b(i am (1[0-7]|[1-9]) |i'm (1[0-7]|[1-9]) |under 18|vulnerable|safeguarding)\b/i,
};

/**
 * Which right(s) the person's own words seem to exercise, and whether you should read it yourself.
 * text = subject + the person's new words (quoted history and signatures already removed).
 */
export function classifyRights(text) {
  const t = String(clean(text, 20000)).normalize("NFKC").replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ").replace(/[\u2018\u2019\u201b\u2032]/g, "'");
  const rights = RIGHT_KEYS.filter((k) => PATTERNS[k] && PATTERNS[k].test(t));
  const review = Object.entries(NEEDS_REVIEW).filter(([, re]) => re.test(t)).map(([k]) => k);
  if (rights.length > 1) review.push("more-than-one-right");
  if (rights.includes("objection") && rights.includes("direct-marketing-objection")) rights.splice(rights.indexOf("objection"), 1);
  return { rights, review };
}

/** True if the person's own words look like they're exercising any data protection right. */
export const mentionsAnyRight = (text) => classifyRights(text).rights.length > 0;

export const REVIEW_LABEL = {
  "on-behalf": "made on someone else's behalf: check their authority before acting",
  "legal-context": "mentions legal action, a court, tribunal or solicitor",
  "ico-mentioned": "mentions the ICO",
  "child-or-vulnerable": "may involve a child or a vulnerable person",
  "more-than-one-right": "asks for more than one thing: each right has its own rules",
  "no-right-identified": "no specific right identified: decide what's being asked",
  "recorded-unclear": "you've recorded it as unclear",
  "new-right-in-follow-up": "raised a new right in a reply to an existing request",
};
