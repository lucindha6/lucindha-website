// Notifications to hello@. Stage 2 cannot send email, so it posts a short message to a hidden
// form on ITS OWN Netlify site ("stage2-notice"); that site's form notification emails hello@.
// Notices hold the reference, a status, the services ticked, the reason codes for any flag and a
// short summary of contact/communication preferences (e.g. "video call · BSL"). They never hold
// names, email addresses, enquiry text or the access-needs wording, and never contain links.
// They are stored as form submissions on the Stage 2 site, so they are personal data: see README.

export const NOTICE_FORM = "stage2-notice";

export function noticeText({ ref, status, services = [], reasons = [], notes = [], prefsSummary = "", extra = "" }) {
  const titles = {
    "draft-ready": "AI draft ready to review",
    sensitive: "Sensitive – please reply personally",
    manual: "Manual review needed",
    duplicate: "Duplicate submission – no new draft",
    "duplicate-needs-review": "Follow-up needs your judgement – earlier draft re-labelled",
    reminder: "No reply yet after 2 working days",
    "already-answered": "Already answered – no draft made",
    failed: "Stage 2 problem – please reply from the original enquiry",
  };
  const lines = [
    `${titles[status] || status} · ${ref}`,
    "",
    services.length ? `Services: ${services.join(", ")}` : null,
    prefsSummary || null,
    reasons.length ? `Why: ${reasons.join(", ")}` : null,
    notes.length ? `Note: ${notes.join(", ")} (handle securely)` : null,
    extra || null,
    "",
    status === "draft-ready" || status === "sensitive" || status === "manual"
      ? `Open Drafts in hello@ and look for "(ref ${ref})". The original enquiry is in the usual Netlify notification.`
      : null,
  ].filter((l) => l !== null);
  return { subject: `${titles[status] || status} · ${ref}`, message: lines.join("\n") };
}

export function formNotifier(siteUrl, fetchFn = fetch) {
  return async (notice) => {
    const res = await fetchFn(`${siteUrl}/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ "form-name": NOTICE_FORM, "bot-field": "", subject: notice.subject, message: notice.message }),
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    if (res.status >= 400) throw new Error(`notice-${res.status}`);
  };
}
