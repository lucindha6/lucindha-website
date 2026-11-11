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
//  - This checklist SUPPORTS your firm-wide AML risk assessment, policies, controls and procedures
//    (MLR 2017 regs 18-21, 24 and 40); it doesn't replace them.
//  - Identity: manual, risk-based checks (decision 11 Nov 2026). No paid electronic ID provider
//    without your approval.
//  - PEP checks and sanctions screening are separate steps: sanctions screening is against the
//    UK Sanctions List (FCDO), the single UK list since 28 Jan 2026 (the OFSI Consolidated List is
//    no longer updated). A possible sanctions match stops everything: acceptance is impossible here.
//  - Suspicious activity is NEVER recorded here. As a sole practitioner you are the Nominated
//    Officer; suspicions and reports stay in your own confidential log, outside any automation
//    (and beware of tipping off).
import { assertDate, addCalendarMonths } from "./calendar.mjs";

export const CLIENT_TYPES = ["Individual", "Sole trader", "Landlord", "Limited company", "Partnership", "Charity or organisation"];
const flagged = (c, id) => c.redFlags.some((f) => f.id === id && f.present === true);
const ENTITY = new Set(["Limited company", "Partnership", "Charity or organisation"]);

/** Steps; `when` decides whether a step applies. Method names only, never document details. */
export const STEPS = [
  { id: "identity", title: "Identity verified, manually and risk-based (each individual client, or each director/partner/trustee who instructs you)", methods: ["original documents seen in person", "documents seen on video call, copies kept", "certified copies received", "other (your judgement)"], when: () => true },
  { id: "address", title: "Address verified", methods: ["document seen", "certified copy received", "other (your judgement)"], when: () => true },
  { id: "entity", title: "Organisation verified (e.g. Companies House record, charity register)", methods: ["public register checked", "other (your judgement)"], when: (c) => ENTITY.has(c.clientType) },
  { id: "beneficial-owners", title: "Beneficial owners identified and verified (more than 25%, or control)", methods: ["register and documents checked", "other (your judgement)"], when: (c) => ENTITY.has(c.clientType) },
  { id: "register-discrepancy", title: "Companies House register checked against what you found; any material discrepancy reported (reg. 30A)", methods: ["no discrepancy found", "discrepancy reported"], when: (c) => c.clientType === "Limited company" },
  { id: "pep-check", title: "Politically exposed person (PEP) check: client, family members and close associates (reg. 35)", methods: ["client declaration and your own checks", "other (your judgement)"], when: () => true },
  { id: "sanctions-check", title: "Sanctions screening against the UK Sanctions List (FCDO, gov.uk): client, beneficial owners, directors", methods: ["UK Sanctions List searched, no match"], when: () => true },
  { id: "purpose", title: "Purpose and intended nature of the relationship recorded", methods: ["recorded"], when: () => true },
  { id: "risk-assessment", title: "Client risk assessment (your decision: low, medium or high)", methods: ["low", "medium", "high"], when: () => true },
  { id: "edd", title: "Enhanced due diligence (high risk, or any red flag raised)", methods: ["completed"], when: (c) => c.riskLevel === "high" || c.redFlags.some((f) => f.present === true) },
  { id: "source-of-funds", title: "Source of funds and source of wealth established (high risk; always for a PEP, reg. 35)", methods: ["recorded"], when: (c) => c.riskLevel === "high" || flagged(c, "pep") || flagged(c, "high-risk-country") },
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
  { id: "sanctions-match", question: "A possible match on the UK Sanctions List?" },
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

const locked = (c) => { if (c.decision) throw new Error("checklist-decided-start-a-new-review"); };
/** Steps that depend on the answers so far; cleared if those answers change. */
const DEPENDENT = ["edd", "source-of-funds"];
const clearDependent = (steps) => Object.fromEntries(Object.entries(steps).filter(([k]) => !DEPENDENT.includes(k)));

/** You confirm a step: method + date. Never called by automation. Only steps that apply now. */
export function confirmStep(c, id, { method, date, by } = {}) {
  if (by !== "Lucindha") throw new Error("only-lucindha-confirms-steps");
  locked(c);
  const step = STEPS.find((s) => s.id === id);
  if (!step) throw new Error("bad-step");
  if (!step.methods.includes(method)) throw new Error("bad-method");
  assertDate(date);
  if (id === "risk-assessment" && method === "low" && (flagged(c, "pep") || flagged(c, "high-risk-country"))) throw new Error("risk-cannot-be-low-with-pep-or-high-risk-country");
  if (DEPENDENT.includes(id)) {
    if (!c.steps["risk-assessment"] || c.redFlags.some((f) => f.present === null)) throw new Error("answer-red-flags-and-assess-risk-first");
    if (date < c.steps["risk-assessment"].date) throw new Error("dependent-step-before-risk-assessment");
  }
  if (!step.when(id === "risk-assessment" ? { ...c, riskLevel: method } : c)) throw new Error("step-does-not-apply");
  let steps = { ...c.steps };
  if (id === "risk-assessment" && c.riskLevel !== method) steps = clearDependent(steps);
  steps[id] = { method, date };
  const next = { ...c, steps };
  if (id === "risk-assessment") next.riskLevel = method;
  return next;
}

/** You answer the red-flag questions (true/false). Unanswered questions block acceptance. Changing an answer clears EDD. */
export function answerRedFlag(c, id, present, { by } = {}) {
  if (by !== "Lucindha") throw new Error("only-lucindha-answers");
  locked(c);
  if (typeof present !== "boolean") throw new Error("answer-yes-or-no");
  if (!RED_FLAGS.some((f) => f.id === id)) throw new Error("bad-flag");
  const before = c.redFlags.find((f) => f.id === id)?.present;
  let steps = before === present ? c.steps : clearDependent(c.steps);
  let riskLevel = c.riskLevel;
  if (present && ["pep", "high-risk-country"].includes(id) && riskLevel === "low") {
    steps = Object.fromEntries(Object.entries(steps).filter(([k]) => k !== "risk-assessment"));
    riskLevel = null;
  }
  return { ...c, steps, riskLevel, redFlags: c.redFlags.map((f) => (f.id === id ? { ...f, present } : f)) };
}

/** Where things stand. Never decides. */
export function review(c) {
  const open = applicableSteps(c).filter((s) => !c.steps[s.id]).map((s) => s.title);
  const unanswered = c.redFlags.filter((f) => f.present === null).map((f) => RED_FLAGS.find((r) => r.id === f.id).question);
  const raised = c.redFlags.filter((f) => f.present === true).map((f) => RED_FLAGS.find((r) => r.id === f.id).question);
  const stop = [];
  if (flagged(c, "sanctions-match")) stop.push("Possible sanctions match: do NOT proceed or move any money. Check the UK Sanctions List entry, and if it's a match, report to OFSI as required. This client can't be accepted through this checklist.");
  if (raised.length) stop.push("Red flags raised: stop and review personally before going further. If you have a suspicion of money laundering, act as Nominated Officer outside this tool; record nothing here.");
  if (c.steps["engagement-letter"] && !c.steps.identity) stop.push("Engagement letter signed before identity verified: check the order.");
  const notes = [
    "Keep due diligence records for 5 years after the relationship ends (reg. 40), in your own secure records, not here.",
    "This checklist supports your firm-wide risk assessment and AML policies, controls and procedures; it doesn't replace them.",
    "Risk assessment and acceptance are your professional judgement.",
  ];
  return {
    status: c.decision ? c.decision.outcome : raised.length ? "stopped-for-review" : open.length || unanswered.length ? "in-progress" : "ready-for-your-decision",
    open, unanswered, raised, stop, notes,
  };
}

/** Checks the checklist is a genuine one (every question present once, only known steps). */
function wellFormed(c) {
  if (!CLIENT_TYPES.includes(c.clientType)) return false;
  if (!Array.isArray(c.redFlags) || c.redFlags.length !== RED_FLAGS.length) return false;
  if (!RED_FLAGS.every((r) => c.redFlags.filter((f) => f.id === r.id).length === 1)) return false;
  if (!c.steps || typeof c.steps !== "object") return false;
  if ((c.steps["risk-assessment"]?.method ?? null) !== (c.riskLevel ?? null)) return false; // risk level must match your recorded assessment
  return Object.entries(c.steps).every(([k, v]) => { const st = STEPS.find((s) => s.id === k); return st && v && st.methods.includes(v.method) && typeof v.date === "string"; });
}

/**
 * Records YOUR decision, once. Acceptance is refused unless every applicable step is confirmed (dated on
 * or before the decision), every red flag answered, and any raised flag reviewed by you with EDD done.
 */
export function recordDecision(c, { outcome, date, by, reviewedRedFlags = false, confirmedPersonally = false } = {}) {
  if (by !== "Lucindha" || confirmedPersonally !== true) throw new Error("decision-must-be-made-personally-by-lucindha");
  locked(c);
  if (!["accepted", "declined"].includes(outcome)) throw new Error("bad-outcome");
  assertDate(date);
  if (!wellFormed(c)) throw new Error("checklist-not-well-formed");
  const r = review(c);
  if (outcome === "accepted") {
    if (r.open.length) throw new Error("cannot-accept-steps-open");
    if (r.unanswered.length) throw new Error("cannot-accept-red-flags-unanswered");
    if (flagged(c, "sanctions-match")) throw new Error("cannot-accept-possible-sanctions-match");
    if (r.raised.length && !(reviewedRedFlags === true && c.steps.edd)) throw new Error("cannot-accept-red-flags-not-reviewed");
    if (c.steps["engagement-letter"].date > date) throw new Error("engagement-letter-after-decision");
    if (Object.values(c.steps).some((s) => s.date > date)) throw new Error("step-dated-after-decision");
  }
  return { ...c, decision: { outcome, date }, status: outcome };
}

/** PROPOSED ongoing-monitoring intervals (months) by risk level. Your decision; not approved. */
export const MONITORING = { approved: false, months: { low: 36, medium: 24, high: 12 } };

/**
 * Accepted clients whose next ongoing-monitoring review is due (from the monitoring date you set
 * and their risk level). Reminders for you only; nothing is sent.
 */
export function monitoringDue(checklists, today) {
  assertDate(today);
  const out = [];
  for (const c of checklists) {
    if (c.status !== "accepted" || !c.steps["monitoring-date"]) continue;
    const pepOrHigh = c.riskLevel === "high" || c.redFlags.some((f) => ["pep", "high-risk-country"].includes(f.id) && f.present === true);
    const months = pepOrHigh ? MONITORING.months.high : Object.hasOwn(MONITORING.months, c.riskLevel) ? MONITORING.months[c.riskLevel] : null; // PEPs: enhanced ongoing monitoring (reg. 35)
    if (!months) { out.push({ ref: c.ref, due: null, text: `${c.ref}: risk level missing; set the next review yourself.` }); continue; }
    const due = addCalendarMonths(c.decision.date, months);
    if (today >= due) out.push({ ref: c.ref, due, text: `${c.ref}: ongoing-monitoring review due ${due} (${c.riskLevel} risk). Refresh due diligence and re-check sanctions and PEP status.` });
  }
  return out;
}

/** Firm-wide things this checklist relies on. You confirm each in your own AML file; listed for review. */
export const FIRM_PREREQUISITES = [
  "Firm-wide AML risk assessment, written and kept up to date (MLR 2017 reg. 18)",
  "AML policies, controls and procedures (reg. 19), including how you verify identity manually",
  "You as the Nominated Officer, with a confidential log of internal reports and SAR decisions (reg. 21; Proceeds of Crime Act 2002)",
  "AML training and CPD (reg. 24; AAT CPD policy)",
  "Record keeping for 5 years after the relationship ends (reg. 40)",
  "Supervision by AAT for AML",
];
