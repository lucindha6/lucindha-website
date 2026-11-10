// Builds the template draft reply for an ORDINARY enquiry. Every sentence comes from
// config/approved-facts.json; the only things filled in are the person's first name, the
// service names (from the form's fixed list) and which accessibility sentences apply.
//
// Sensitive and manual-review enquiries get NO draft at all (only a notice), so nothing
// pre-addressed or half-written can ever be mistaken for an approved reply.
//
// A future, optional "personaliser" (for example an AI) may supply a replacement opening
// paragraph. It is checked by validate.mjs first; if it is missing or fails, the approved
// template opening is used instead.
import { escapeHtml, joinNatural } from "./util.mjs";

export const CATEGORIES = {
  template: "Template draft – review",
  personalised: "AI draft – review", // only if a personaliser is approved in a future phase
  followUp: "Follow-up received – check first",
  sensitiveFollowUp: "Sensitive follow-up – do not send",
  answeredElsewhere: "Answered – delete draft",
};

export function subjectFor(ref) {
  return `Your enquiry to Lucindha Lawson (ref ${ref})`;
}

export function accessibilitySentences(prefs, facts) {
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

export function servicesPhrase(services, facts) {
  return joinNatural(services.map((s) => facts.services[s]?.phrase || s));
}

/** Returns the draft's parts as a list, so the text and HTML versions always match. */
export function templateParagraphs({ services, prefs, facts, opening }) {
  const f = facts.sentences;
  const lines = services.map((s) => {
    const p = facts.services[s]?.price;
    return `${s}: ${p || f.noPrice}`;
  });
  const questions = [...new Set(services.flatMap((s) => facts.services[s]?.questions || []))].slice(0, 3);
  return [
    opening || f.opening.replace("{services}", servicesPhrase(services, facts)),
    { lead: f.pricesLead, list: lines },
    f.packages,
    f.quote,
    questions.length ? { lead: f.questionsLead, list: questions } : null,
    ...accessibilitySentences(prefs, facts),
    f.freeChat,
    f.meetings,
    f.qualifications,
    f.closing,
  ].filter(Boolean);
}

export function composeDraft({ ref, first, services, prefs, facts, opening = "" }) {
  const greeting = first ? `Hello ${first},` : "Hello,";
  const sig = facts.signature;
  const footer = facts.footer || [];
  const paras = templateParagraphs({ services, prefs, facts, opening });

  const text = [
    greeting, "",
    ...paras.flatMap((p) => (typeof p === "string" ? [p, ""] : [p.lead, ...p.list.map((l) => `- ${l}`), ""])),
    ...sig, "", ...(footer.length ? ["—", ...footer] : []),
  ].join("\n").trim();

  const P = (t) => `<p style="margin:0 0 14px">${escapeHtml(t)}</p>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;max-width:600px">`
    + P(greeting)
    + paras.map((p) => (typeof p === "string" ? P(p) : `${P(p.lead)}<ul style="margin:0 0 14px">${p.list.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`)).join("")
    + `<p style="margin:0 0 20px">${sig.map(escapeHtml).join("<br>")}</p>`
    + (footer.length ? `<hr style="border:0;border-top:1px solid #ccc;margin:20px 0">${footer.map((l) => `<p style="margin:0 0 8px;font-size:14px;color:#444">${escapeHtml(l)}</p>`).join("")}` : "")
    + `</div>`;

  return { subject: subjectFor(ref), text, html, category: opening ? CATEGORIES.personalised : CATEGORIES.template };
}
