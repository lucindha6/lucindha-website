// Microsoft Graph access for the SEPARATE "Website enquiry drafts" app.
// It only ever: creates a draft in one mailbox, saves a short notice as an unaddressed draft,
// reads a message it created, sets a category, and searches Sent Items for a reply that
// carries the enquiry's reference. There is deliberately NO send function in Stage 2,
// and the app is never given Mail.Send, so even a bug or a stolen key cannot send email.
//
// Phase 1–2: the real client below is written but NOT used or tested against Microsoft
// (no app is registered yet). The automated tests use mockGraph(). Points to confirm in
// integration testing are marked VERIFY.

const GRAPH = "https://graph.microsoft.com/v1.0";
const REF_PROP = "String {5e1f3f6e-7a41-4d1e-9c4b-0c2b1d7f0a11} Name LLEnquiryRef"; // hidden property holding the reference
const NOTICE_PROP = "String {5e1f3f6e-7a41-4d1e-9c4b-0c2b1d7f0a11} Name LLStage2Notice"; // marks genuine notices
export const NOTICE_FOLDER = "Stage 2 notices"; // a top-level folder you create in the mailbox

/** True only if a sent message's subject carries one of these references (not just the address). */
export function subjectHasRef(subject, refs) {
  const s = String(subject || "");
  return refs.some((r) => new RegExp(`\\(ref ${r}\\)|\\b${r}\\b`).test(s));
}

export function realGraph(env, fetchFn = fetch) {
  let token = null;
  let deletedFolderId = null;
  let noticeFolderId = null;
  const mailbox = encodeURIComponent(env.DRAFTS_MAILBOX);
  async function getToken() {
    if (token && token.exp - 60_000 > Date.now()) return token.value;
    const res = await fetchFn(`https://login.microsoftonline.com/${encodeURIComponent(env.M365_DRAFTS_TENANT_ID)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.M365_DRAFTS_CLIENT_ID, client_secret: env.M365_DRAFTS_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`graph-token-${res.status}`);
    const j = await res.json();
    token = { value: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 };
    return token.value;
  }
  async function call(path, init = {}) {
    // Absolute Graph links (e.g. @odata.nextLink) are used as given, but only on Graph itself.
    const url = path.startsWith("https://") ? path : `${GRAPH}/users/${mailbox}${path}`;
    if (!url.startsWith(`${GRAPH}/`)) throw new Error("graph-bad-link");
    const res = await fetchFn(url, {
      ...init,
      headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json", Prefer: 'IdType="ImmutableId"', ...(init.headers || {}) },
      signal: AbortSignal.timeout(4000),
    });
    return res;
  }
  return {
    async createDraft({ to, subject, html, category, ref }) {
      const res = await call("/mailFolders/drafts/messages", {
        method: "POST",
        body: JSON.stringify({
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: to } }],
          categories: [category],
          singleValueExtendedProperties: [{ id: REF_PROP, value: ref }],
        }),
      });
      if (!res.ok) throw new Error(`graph-create-${res.status}`);
      return (await res.json()).id;
    },
    /**
     * Saves a notice as an UNADDRESSED draft in your "Stage 2 notices" folder. If that folder doesn't
     * exist, it fails with the clear error "stage2-notices-folder-missing" (it never quietly uses
     * Drafts instead); the daily check then puts one setup warning in Drafts so you can see it. Creating drafts is fully supported by Microsoft with Mail.ReadWrite,
     * and isn't affected by the 31 December 2026 restriction. With no recipient, a notice can't be
     * sent. Notices don't alert your phone themselves: the alert is the Netlify enquiry email you
     * already get for every enquiry.
     */
    async createNotice({ subject, message }) {
      if (noticeFolderId === null) {
        const name = encodeURIComponent(`displayName eq '${NOTICE_FOLDER.replace(/'/g, "''")}'`);
        const f = await call(`/mailFolders?$filter=${name}&$select=id`);
        if (!f.ok) throw new Error(`graph-folder-${f.status}`);
        noticeFolderId = (await f.json()).value?.[0]?.id || null;
        if (!noticeFolderId) throw new Error("stage2-notices-folder-missing");
      }
      const res = await call(`/mailFolders/${encodeURIComponent(noticeFolderId)}/messages`, {
        method: "POST",
        body: JSON.stringify({
          subject,
          body: { contentType: "Text", content: message },
          categories: ["Stage 2 notice"],
          singleValueExtendedProperties: [{ id: NOTICE_PROP, value: "1" }],
        }),
      });
      if (!res.ok) throw new Error(`graph-notice-${res.status}`);
      return (await res.json()).id;
    },
    /** True if the "Stage 2 notices" folder exists (used by the daily set-up check). */
    async noticeFolderExists() {
      const name = encodeURIComponent(`displayName eq '${NOTICE_FOLDER.replace(/'/g, "''")}'`);
      const f = await call(`/mailFolders?$filter=${name}&$select=id`);
      if (!f.ok) throw new Error(`graph-folder-${f.status}`);
      return Boolean((await f.json()).value?.[0]?.id);
    },
    /** A clearly labelled, unaddressed set-up warning in Drafts (used only when the notices folder is missing). */
    async createSetupWarning({ subject, message }) {
      const res = await call("/mailFolders/drafts/messages", {
        method: "POST",
        body: JSON.stringify({ subject, body: { contentType: "Text", content: message }, categories: ["Stage 2 notice"] }),
      });
      if (!res.ok) throw new Error(`graph-setup-warning-${res.status}`);
    },
    /** Returns null ONLY when Microsoft says the item doesn't exist; any other problem throws. */
    async getMessage(id) {
      const res = await call(`/messages/${encodeURIComponent(id)}?$select=id,isDraft,toRecipients,parentFolderId`);
      if (res.status === 404) {
        const err = await res.json().catch(() => ({}));
        if (err?.error?.code === "ErrorItemNotFound") return null;
        throw new Error("graph-get-404-other"); // e.g. wrong mailbox: never treat as "deleted"
      }
      if (!res.ok) throw new Error(`graph-get-${res.status}`);
      const m = await res.json();
      if (!deletedFolderId) {
        const f = await call(`/mailFolders/deleteditems?$select=id`);
        if (!f.ok) throw new Error(`graph-folder-${f.status}`);
        deletedFolderId = (await f.json()).id;
      }
      return { id: m.id, isDraft: m.isDraft, to: m.toRecipients?.[0]?.emailAddress?.address || "", deleted: m.parentFolderId === deletedFolderId };
    },
    /**
     * One scan of Sent Items since the oldest open enquiry (newest first, up to 1,000 messages):
     * subject, recipients and time only. The caller matches references and recipients locally.
     */
    async sentSince(sinceIso) {
      const out = [];
      const filter = encodeURIComponent(`sentDateTime ge ${sinceIso}`);
      let path = `/mailFolders/sentitems/messages?$filter=${filter}&$orderby=sentDateTime desc&$select=subject,toRecipients,ccRecipients,sentDateTime&$top=100`;
      for (let page = 0; page < 10 && path; page++) {
        const res = await call(path);
        if (!res.ok) throw new Error(`graph-search-${res.status}`);
        const j = await res.json();
        for (const m of j.value || []) {
          out.push({
            subject: m.subject || "",
            at: m.sentDateTime || "",
            recipients: [...(m.toRecipients || []), ...(m.ccRecipients || [])].map((r) => r.emailAddress?.address?.toLowerCase()).filter(Boolean),
          });
        }
        path = j["@odata.nextLink"] || null;
      }
      return out;
    },
    async setCategory(id, category) {
      const res = await call(`/messages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ categories: [category] }) });
      if (!res.ok) throw new Error(`graph-patch-${res.status}`);
    },
  };
}

/** In-memory stand-in for one mailbox, used by tests and the demonstration. */
export function mockGraph({ failCreate = false, failNotice = false, noNoticeFolder = false } = {}) {
  const drafts = new Map(); // id -> message
  const sent = []; // {to, at, subject}
  const notices = []; // notices saved by Stage 2 in the "Stage 2 notices" folder
  let n = 0;
  return {
    drafts,
    sent,
    notices,
    setupWarnings: [],
    async noticeFolderExists() { return !noNoticeFolder; },
    async createSetupWarning(w) { this.setupWarnings.push(w); },
    async createNotice(notice) {
      if (noNoticeFolder) throw new Error("stage2-notices-folder-missing");
      if (failNotice) throw new Error("graph-notice-503");
      notices.push({ ...notice, category: "Stage 2 notice", folder: "Stage 2 notices", to: [] });
      return `notice-${notices.length}`;
    },
    async createDraft(m) {
      if (failCreate) throw new Error("graph-create-503");
      const id = `msg-${++n}`;
      drafts.set(id, { id, isDraft: true, ...m });
      return id;
    },
    async getMessage(id) {
      const m = drafts.get(id);
      return m ? { id, isDraft: m.isDraft, to: m.to, deleted: !!m.deleted } : null;
    },
    failSent: false,
    async sentSince(sinceIso) {
      if (this.failSent) throw new Error("graph-search-503");
      return sent.filter((s) => s.at >= sinceIso).map((s) => ({ subject: s.subject, at: s.at, recipients: [s.to.toLowerCase()] }));
    },
    async setCategory(id, category) {
      const m = drafts.get(id);
      if (m) m.category = category;
    },
    // test helpers: what you would do in Outlook
    youSendDraft(id, atIso) {
      const m = drafts.get(id);
      // In Outlook a sent draft becomes a new item in Sent Items (its id changes), so the
      // original id no longer finds it. Modelled here so tests can't rely on the id.
      drafts.delete(id);
      sent.push({ to: m.to, at: atIso, subject: m.subject });
    },
    youReplySeparately(to, atIso, subject = "Re: your enquiry") {
      sent.push({ to, at: atIso, subject });
    },
    stage1AcknowledgementSent(to, atIso) {
      sent.push({ to, at: atIso, subject: "Thank you for your enquiry – Lucindha Lawson" });
    },
    youDeleteDraft(id) {
      // In Outlook a deleted draft moves to Deleted Items, keeping its immutable id.
      drafts.get(id).deleted = true;
    },
    youEmptyDeletedItems(id) {
      drafts.delete(id);
    },
  };
}
