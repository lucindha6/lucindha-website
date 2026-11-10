// Notices to you. Phase 2 change: notices are no longer posted to a public Netlify form (which
// anyone on the internet could also post to, and which stored notices on Netlify). Instead the
// Stage 2 Microsoft app places each notice DIRECTLY into the hello@ Inbox, using the same
// mailbox-scoped permission it uses for drafts. Nothing from outside can create one, so:
//
//   A genuine Stage 2 notice is never an incoming email. It has no external sender, it carries
//   the Outlook category "Stage 2 notice", and its subject starts with "[Stage 2]".
//   An email that ARRIVES claiming to be a Stage 2 notice is forged and can be deleted.
//
// Notices hold the reference, status, services ticked, flag reasons and a summary of
// communication preferences. They never hold names, email addresses, enquiry text or the
// access-needs wording, and never contain links or instructions to click anything.

export const NOTICE_CATEGORY = "Stage 2 notice";

const TITLES = {
  "draft-ready": "Template draft ready to review",
  sensitive: "Sensitive – reply personally (no draft made)",
  manual: "Manual review needed (no draft made)",
  repeat: "Repeat submission – nothing new",
  "follow-up": "Follow-up from the same person – new information",
  reminder: "No reply found after 2 working days",
  failed: "Stage 2 problem – please reply from the original enquiry",
  maintenance: "Stage 2 maintenance needed",
};

export function noticeText({ ref, status, services = [], reasons = [], notes = [], prefsSummary = "", extra = "" }) {
  const subjectLine = (r) => `Your enquiry to Lucindha Lawson (ref ${r})`;
  const next = {
    "draft-ready": `Next: open Drafts and look for "(ref ${ref})". Check it, edit if needed, then send it yourself.`,
    sensitive: `Next: read the full enquiry in the Netlify notification and reply personally. Use the subject "${subjectLine(ref)}" so the daily check can see your reply.`,
    manual: `Next: read the full enquiry in the Netlify notification and reply personally. Use the subject "${subjectLine(ref)}" so the daily check can see your reply.`,
    reminder: `If you've already replied without the reference in the subject, you can ignore this. You won't get another reminder for ${ref}.`,
    failed: "Next: reply from the original Netlify notification as usual.",
  }[status];
  const lines = [
    `${TITLES[status] || status} · ${ref}`,
    "",
    services.length ? `Services: ${services.join(", ")}` : null,
    prefsSummary || null,
    reasons.length ? `Why: ${reasons.join(", ")}` : null,
    notes.length ? `Note: ${notes.join(", ")} (handle securely)` : null,
    extra || null,
    next ? "" : null,
    next || null,
  ].filter((l) => l !== null).filter((l, i, all) => !(l === "" && (all[i - 1] === "" || i === all.length - 1)));
  return { subject: `[Stage 2] ${TITLES[status] || status} · ${ref}`, message: lines.join("\n") };
}

/** Delivers notices by creating them inside the drafts mailbox's Inbox (see graph.createNotice). */
export function mailboxNotifier(graph) {
  return async (notice) => graph.createNotice(notice);
}
