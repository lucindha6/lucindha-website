// Recognises communication and accessibility preferences. Runs on our own function only;
// the access-needs text is never sent to the AI and is never copied into notices or logs.
import { clean } from "./util.mjs";

const PATTERNS = [
  ["bsl", /\b(bsl|british sign language|sign language|signer|signing)\b/i],
  ["deafblind", /\b(deaf\s?blind|hands[- ]on signing|tactile signing|tactile bsl)\b/i],
  ["interpreter", /\binterpret\w*\b/i],
  ["lipreading", /\blip\s?read\w*\b/i],
  ["captions", /\b(captions?|subtitles?|speech[- ]to[- ]text|stt?r|palantypist|live transcription)\b/i],
  ["relay", /\b(relay uk|text relay|video relay|vrs)\b/i],
  ["documents", /\b(large print|braille|easy read|screen reader|accessible (format|documents?)|audio format)\b/i],
  ["emailOnly", /\b(email only|only email|by email only|prefer email)\b/i],
  ["textOnly", /\b(text only|only text|texts? only|sms only)\b/i],
  ["moreTime", /\b(more time|extra time|breaks?|slower pace)\b/i],
];

/**
 * @returns {{prefs: string[], accessGiven: boolean, unrecognised: boolean}}
 */
export function detectPreferences(accessText, details, methods) {
  const access = clean(accessText, 2000);
  const body = `${access}\n${clean(details, 5000)}`;
  const prefs = new Set();
  for (const [code, re] of PATTERNS) if (re.test(body)) prefs.add(code);
  if (methods.includes("Video call")) prefs.add("video");
  if (methods.includes("Face to face")) prefs.add("faceToFace");
  if (methods.includes("Phone call")) prefs.add("phone");
  if (methods.length === 1 && methods[0] === "Email") prefs.add("emailOnly");
  if (methods.length === 1 && methods[0] === "Text message") prefs.add("textOnly");
  const fromAccess = PATTERNS.some(([, re]) => re.test(access));
  return { prefs: [...prefs], accessGiven: access.length > 0, unrecognised: access.length > 0 && !fromAccess };
}

/** Plain-English summary for the notice: preferences only, never the person's own words. */
export function describePreferences({ prefs, accessGiven, unrecognised }, methods) {
  const labels = {
    bsl: "BSL", deafblind: "Deafblind communication", interpreter: "interpreter mentioned", lipreading: "lipreading",
    captions: "captions or speech-to-text", relay: "Relay UK or video relay", documents: "accessible documents",
    emailOnly: "email only", textOnly: "text only", moreTime: "more time", video: "video call", faceToFace: "face to face", phone: "phone call",
  };
  const parts = [`Contact: ${methods.join(", ").toLowerCase()}`];
  const access = prefs.filter((p) => !["video", "faceToFace", "phone", "emailOnly", "textOnly"].includes(p)).map((p) => labels[p]);
  if (access.length) parts.push(`Communication: ${access.join(", ")}`);
  if (unrecognised) parts.push("Access needs given – please read the original enquiry");
  else if (accessGiven) parts.push("Access needs given – full wording in the original enquiry");
  return parts.join(" · ");
}
