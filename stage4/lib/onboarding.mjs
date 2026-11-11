// AAT-aligned onboarding and anti-money-laundering (AML) checklist (DEVELOPMENT ONLY).
//
// Based on AAT's guidance for licensed members (customer due diligence before the relationship
// starts and throughout it, client risk assessment, enhanced due diligence where risk is higher,
// ongoing monitoring) and AAT Client Care (engagement letter before any work).
//
// PROFESSIONAL JUDGEMENT FIRST:
//  - Nothing is ticked automatically. Every step is confirmed by you, with a date.
//  - The checklist never accepts or declines a client. Only an explicit decision recorded by you
//    does that, and acceptance is refused while anything mandatory is open or a red flag is unresolved.
//  - No identity documents or their numbers are stored: only that a check was done, how and when.
//  - Suspicious activity is NEVER recorded here. As a sole practitioner you are the Nominated
//    Officer; suspicions and reports stay in your own confidential log, outside any automation
//    (and beware of tipping off).
import { assertDate } from "./calendar.mjs";

export const CLIENT_TYPES = ["Individual", "Sole trader", "Landlord", "Limited company", "Partnership", "Charity or organisation"];
const ENTITY = new Set(["Limited company", "Partnership", "Charity or organisation"]);

/** Steps; `when` decides whether a step applies. Method names only, never document details. */
export const STEPS = [
  { id: "identity", title: "Identity verified (each individual client, or each director/partner/trustee who instructs you)", methods: ["original documents seen in person", "documents seen on video call", "electronic ID check (provider to be chosen)", "other (your judgement)"], when: () => true },
  { id: "address", title: "Address verified", methods: ["document", "electronic check", "other (your judgement)"], when: () => true },
  { id: "entity", title: "Organisation verified (e.g. Companies House record, charity register)", methods: ["public register checked", "other (your judgement)"], when: (c) => ENTITY.has(c.clientType) },
  { id: "beneficial-owners", title: "Beneficial owners identified and verified (more than 25%, or control)", methods: ["register and documents checked", "other (your judgement)"], when: (c) => ENTITY.has(c.clientType) },
  { id: "pep-sanctions", title: "Politically exposed person and sanctions check", methods: ["UK sanctions list checked", "screening tool (to be chosen)", "other (your judgement)"], when: () => true },
  { id: "purpose", title: "Purpose and intended nature of the relationship recorded", methods: ["recorded"], when: () => true },
  { id: "risk-assessment", title: "Client risk assessment (your decision: low, medium or high)", methods: ["low", "medium", "high"], when: () => true },
  { id: "edd", title: "Enhanced due diligence (high risk, or any red flag raised)", methods: ["completed"], when: (c) => c.riskLevel === "high" || c.redFlags.some((f) => f.present === true) },
  { id: "source-of-funds", title: "Source of funds / wealth understood (where higher risk)", methods: ["recorded"], when: (c) => c.riskLevel === "high" },
  { id: "professional-clearance", title: "Professional clearance requested from any previous accountant", methods: ["requested", "not applicable (no previous accountant)"], when: () => true },
  { id: "engagement-letter", title: "Engagement letter issued and signed (before any work)", methods: ["signed copy held"], when: () => true },
  { id: "privacy-notice", title: "Privacy notice provided", methods: ["sent"], when: () => true },
  { id: "hmrc-authorisation", title: "HMRC agent authorisation in place (if acting as tax agent)", methods: ["authorised", "not applicable"], when: () => true },
  { id: "monitoring-date", title: "Next ongoing-monitoring review date set", methods: ["date set"], when: () => true },
];

/** Things that stop the process for your review. You answer each one; nothing is guessed. */
export const RED_FLAGS = [
  { id: "id-reluctance", question: "Reluctant or unable to provide identification?" },
  { id: "inconsistent", question: "Information inconsistent or doesn't add up?" },
  { id: "cash-intensive", question: "Cash-intensive business without a clear explanation?" },
  { id: "pep", question: "A politically exposed person (or family or close associate)?" },
  { id: "high-risk-country", question: "Links to a high-risk third country?" },
  { id: "complex-structure", question: "Unusually complex ownership or structure?" },
  { id: "client-money", question: "Asks you to hold or move money for them?" },
  { id: "pressure", question: "Unusual urgency or pressure to skip checks?" },
  { id: "out-of-scope", question: "Wants work your AAT licence doesn't cover (e.g. investment advice)?" },
];

export function newChecklist({ ref, clientRef, clientType }) {
  if (!CLIENT_TYPES.includes(clientType)) throw new Error("bad-client-type");
  return {
    ref, clientRef, clientType,
    steps: {},
    redFlags: RED_FLAGS.map((f) => ({ id: f.id, present: null })),
    riskLevel: null,
    decision: null,
    status: "in-progress",
  };
}

export function applicableSteps(c) { return STEPS.filter((s) => s.when(c)); }

/** You confirm a step: method + date. Never called by automation. */
export function confirmStep(c, id, { method, date, by }) {
  if (by !== "Lucindha") throw new Error("only-lucindha-confirms-steps");
  const step = STEPS.find((s) => s.id === id);
  if (!step) throw new Error("bad-step");
  if (!step.methods.includes(method)) throw new Error("bad-method");
  assertDate(date);
  const next = { ...c, steps: { ...c.steps, [id]: { method, date } } };
  if (id === "risk-assessment") next.riskLevel = method;
  return next;
}

/** You answer the red-flag questions (true/false). Unanswered questions block acceptance. */
export function answerRedFlag(c, id, present, { by }) {
  if (by !== "Lucindha") throw new Error("only-lucindha-answers");
  if (typeof present !== "boolean") throw new Error("answer-yes-or-no");
  if (!RED_FLAGS.some((f) => f.id === id)) throw new Error("bad-flag");
  return { ...c, redFlags: c.redFlags.map((f) => (f.id === id ? { ...f, present } : f)) };
}

/** Where things stand. Never decides. */
export function review(c) {
  const open = applicableSteps(c).filter((s) => !c.steps[s.id]).map((s) => s.title);
  const unanswered = c.redFlags.filter((f) => f.present === null).map((f) => RED_FLAGS.find((r) => r.id === f.id).question);
  const raised = c.redFlags.filter((f) => f.present === true).map((f) => RED_FLAGS.find((r) => r.id === f.id).question);
  const stop = [];
  if (raised.length) stop.push("Red flags raised: stop and review personally before going further. If you have a suspicion of money laundering, act as Nominated Officer outside this tool; record nothing here.");
  if (c.steps["engagement-letter"] && !c.steps.identity) stop.push("Engagement letter signed before identity verified: check the order.");
  return {
    status: c.decision ? c.decision.outcome : raised.length ? "stopped-for-review" : open.length || unanswered.length ? "in-progress" : "ready-for-your-decision",
    open, unanswered, raised, stop,
  };
}

/**
 * Records YOUR decision. Acceptance is refused unless every applicable step is confirmed and every
 * red flag answered "no" (or, if any is "yes", you explicitly confirm you've reviewed it and EDD is done).
 */
export function recordDecision(c, { outcome, date, by, reviewedRedFlags = false, confirmedPersonally = false }) {
  if (by !== "Lucindha" || confirmedPersonally !== true) throw new Error("decision-must-be-made-personally-by-lucindha");
  if (!["accepted", "declined"].includes(outcome)) throw new Error("bad-outcome");
  assertDate(date);
  const r = review(c);
  if (outcome === "accepted") {
    if (r.open.length) throw new Error("cannot-accept-steps-open");
    if (r.unanswered.length) throw new Error("cannot-accept-red-flags-unanswered");
    if (r.raised.length && !(reviewedRedFlags && c.steps.edd)) throw new Error("cannot-accept-red-flags-not-reviewed");
    if (c.steps["engagement-letter"].date > date) throw new Error("engagement-letter-after-decision");
  }
  return { ...c, decision: { outcome, date }, status: outcome };
}
