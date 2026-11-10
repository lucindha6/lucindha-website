// Microsoft Graph access for the SEPARATE "Website enquiry drafts" app.
// It only ever: creates a draft in one mailbox, places a short notice in that mailbox's Inbox,
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
const MESSAGE_FLAGS = "Integer 0x0E07"; // PidTagMessageFlags: 0 = unread and NOT a draft (no unsent flag)
const DELIVERY_TIME = "SystemTime 0x0E06"; // PidTagMessageDeliveryTime, so it sorts as received now

/** True only if a sent message's subject carries one of these references (not just the address). */
export function subjectHasRef(subject, refs) {
  const s = String(subject || "");
  return refs.some((r) => new RegExp(`\\(ref ${r}\\)|\\b${r}\\b`).test(s));
}

export function realGraph(env, fetchFn = fetch) {
  let token = null;
  let deletedFolderId = null;
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
     * Places a notice directly in the Inbox. VERIFY in integration testing: that it shows as a
     * normal unread message (not a draft), that it triggers Outlook's new-mail alert on your
     * phone and computer, and that it sorts at the top.
     */
    async createNotice({ subject, message }) {
      const res = await call("/mailFolders/inbox/messages", {
        method: "POST",
        body: JSON.stringify({
          subject,
          body: { contentType: "Text", content: message },
          from: { emailAddress: { name: "Stage 2 notices", address: env.DRAFTS_MAILBOX } },
          toRecipients: [{ emailAddress: { address: env.DRAFTS_MAILBOX } }],
          categories: ["Stage 2 notice"],
          singleValueExtendedProperties: [
            { id: MESSAGE_FLAGS, value: "0" },
            { id: DELIVERY_TIME, value: new Date().toISOString() },
            { id: NOTICE_PROP, value: "1" },
          ],
        }),
      });
      if (!res.ok) throw new Error(`graph-notice-${res.status}`);
      // Created unread and not a draft, in one step: nothing is changed afterwards, so Microsoft's
      // restriction on editing non-draft messages (from 31 Dec 2026) doesn't affect notices.
      // VERIFY in integration testing that this still works; if it doesn't, the call fails,
      // the record is marked and the daily check tells you.
      return (await res.json()).id;
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
export function mockGraph({ failCreate = false, failNotice = false } = {}) {
  const drafts = new Map(); // id -> message
  const sent = []; // {to, at, subject}
  const inbox = []; // notices placed by Stage 2
  let n = 0;
  return {
    drafts,
    sent,
    inbox,
    async createNotice(notice) {
      if (failNotice) throw new Error("graph-notice-503");
      inbox.push({ ...notice, category: "Stage 2 notice" });
      return `notice-${inbox.length}`;
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
