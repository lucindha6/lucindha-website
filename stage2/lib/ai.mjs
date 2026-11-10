// The AI step. Phase 1 uses a MOCK only: no provider, no account, no network.
//
// Structured-only input: the AI is given ONLY the services ticked, the client type and the
// contact methods, as fixed values from the form's own option lists. It never receives the
// enquirer's name, email, phone, enquiry text or access-needs text (see buildAiInput and its tests).
// Its only job is to write a short opening paragraph; everything else in the draft comes from
// approved business information assembled by our own code.
import { ACCOUNTING_SERVICES, CLIENT_TYPES, CONTACT_METHODS } from "./screen.mjs";
import { joinNatural } from "./util.mjs";

const ALLOWED_KEYS = ["services", "clientType", "contactMethods"];

/** The ONLY function that builds what the AI sees. Values are re-checked against fixed lists. */
export function buildAiInput({ services, clientType, methods }) {
  return {
    services: services.filter((s) => ACCOUNTING_SERVICES.includes(s)),
    clientType: CLIENT_TYPES.includes(clientType) ? clientType : "",
    contactMethods: methods.filter((m) => CONTACT_METHODS.includes(m)),
  };
}

export function assertMinimalInput(input) {
  const keys = Object.keys(input);
  if (keys.some((k) => !ALLOWED_KEYS.includes(k))) throw new Error("ai-input-not-minimal");
  return input;
}

/**
 * Mock AI provider for Phase 1 and the automated tests.
 * behaviour: 'ok' (default) | 'fail' | 'timeout' | 'unsure' | 'judgement' | 'unsafe' | 'malformed'
 */
export function mockAi(behaviour = "ok") {
  const calls = [];
  return {
    calls,
    name: "mock",
    async draftIntro(input) {
      assertMinimalInput(input);
      calls.push(input);
      if (behaviour === "fail") throw new Error("provider-unavailable");
      if (behaviour === "timeout") throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
      if (behaviour === "malformed") return { nonsense: true };
      const what = joinNatural(input.services.map((s) => s.toLowerCase()));
      const base = {
        intro: `Thank you for getting in touch about ${what}. I'd be glad to look at how I can help.`,
        needsJudgement: false,
        sensitive: false,
        confidence: "high",
      };
      if (behaviour === "unsure") return { ...base, confidence: "low" };
      if (behaviour === "judgement") return { ...base, needsJudgement: true };
      if (behaviour === "unsafe") {
        return { ...base, intro: "Great news, I can take you on straight away and you should claim all your expenses. I'll do it for £50 by Friday at 3pm." };
      }
      return base;
    },
  };
}

/** Placeholder for a real provider. Deliberately not implemented in Phase 1. */
export function realAi() {
  return {
    name: "disabled",
    async draftIntro() {
      throw new Error("real-ai-not-enabled-in-phase-1");
    },
  };
}

/** Accepts only a well-formed, confident, non-sensitive answer. Anything else → manual review. */
export function checkAiAnswer(ans) {
  if (!ans || typeof ans !== "object" || typeof ans.intro !== "string") return { ok: false, reason: "ai-malformed" };
  if (ans.sensitive === true) return { ok: false, reason: "ai-thinks-sensitive" };
  if (ans.needsJudgement === true) return { ok: false, reason: "ai-needs-judgement" };
  if (ans.confidence !== "high") return { ok: false, reason: "ai-unsure" };
  return { ok: true, intro: ans.intro.trim() };
}
