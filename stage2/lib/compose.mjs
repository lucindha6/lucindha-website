// Builds the draft reply. Everything except the AI's opening paragraph comes from
// approved business information (config/approved-facts.json). Sensitive and manual-review
// enquiries get a plain reply shell with NO AI text, so you always have one draft per enquiry.
import { escapeHtml, joinNatural } from "./util.mjs";

export const CATEGORIES = {
  ordinary: "AI draft – review",
  sensitive: "Sensitive – reply personally",
  manual: "Manual review",
};

export function subjectFor(ref) {
  return `Your enquiry to Lucindha Lawson (ref ${ref})`;
}

function accessibilitySentences(prefs, facts) {
  const a = facts.accessibility;
  const out = [];
  const add = (s) => s && !out.includes(s) && out.push(s);
  if (prefs.includes("deafblind")) add(a.deafblind);
  if (prefs.includes("bsl")) add(a.bsl);
  if (prefs.includes("emailOnly")) add(a.emailOnly);
  if (prefs.includes("textOnly")) add(a.textOnly);
  if (prefs.includes("documents")) add(a.documents);
  if (prefs.includes("video") && (prefs.includes("captions") || prefs.includes("interpreter") || prefs.includes("lipreading"))) add(a.videoSupport);
  if (prefs.includes("faceToFace")) add(a.faceToFace);
  if (prefs.includes("phone")) add(a.phone); // null until approved: falls back to the general sentence
  if (!out.length) add(a.general);
  return out;
}

/**
 * @param route 'ordinary' | 'sensitive' | 'manual'
 * @param intro the validated AI opening (ordinary only)
 */
export function composeDraft({ route, ref, first, services, prefs, intro, facts }) {
  const greeting = first ? `Hello ${first},` : "Hello,";
  const sig = facts.signature;
  let paras;

  if (route !== "ordinary") {
    paras = ["[Write your reply here. This enquiry was not sent to the AI.]"];
  } else {
    const lines = services.map((s) => {
      const p = facts.services[s]?.price;
      return p ? `${s}: ${p}` : `${s}: ${facts.sentences.noPrice}`;
    });
    const questions = services.flatMap((s) => facts.services[s]?.questions || []).slice(0, 3);
    paras = [
      intro,
      { list: lines, lead: "My published starting prices:" },
      facts.sentences.quote,
      questions.length ? { list: questions, lead: questions.length === 1 ? "To help me prepare your quote, could you tell me:" : "To help me prepare your quote, could you tell me:" } : null,
      ...accessibilitySentences(prefs, facts),
      facts.sentences.freeChat,
      facts.sentences.meetings,
      facts.sentences.qualifications,
    ].filter(Boolean);
  }

  const text = [greeting, "", ...paras.flatMap((p) => (typeof p === "string" ? [p, ""] : [p.lead, ...p.list.map((l) => `- ${l}`), ""])), ...sig].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a">`
    + `<p>${escapeHtml(greeting)}</p>`
    + paras.map((p) => (typeof p === "string" ? `<p>${escapeHtml(p)}</p>` : `<p>${escapeHtml(p.lead)}</p><ul>${p.list.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`)).join("")
    + `<p>${sig.map(escapeHtml).join("<br>")}</p></div>`;

  return { subject: subjectFor(ref), text, html, category: CATEGORIES[route] };
}

export function servicesPhrase(services) {
  return joinNatural(services.map((s) => s.toLowerCase())) || "your enquiry";
}
