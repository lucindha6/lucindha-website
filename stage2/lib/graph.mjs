// Microsoft Graph access for the SEPARATE "Website enquiry drafts" app.
// It only ever: creates a draft in one mailbox, reads a message it created, and searches
// that mailbox's Sent Items for a reply. There is deliberately NO send function in Stage 2,
// and the app is never given Mail.Send, so even a bug or a stolen key cannot send email.
//
// Phase 1: the real client below is written but NOT used or tested against Microsoft
// (no app is registered yet). The automated tests use mockGraph().

const GRAPH = "https://graph.microsoft.com/v1.0";
const REF_PROP = "String {5e1f3f6e-7a41-4d1e-9c4b-0c2b1d7f0a11} Name LLEnquiryRef"; // hidden property holding the reference

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
    const res = await fetchFn(`${GRAPH}/users/${mailbox}${path}`, {
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
    /** Looks through hello@ Sent Items (newest first, all pages) for a message to this address. */
    async hasReplySince(address, sinceIso) {
      const a = address.toLowerCase();
      const filter = encodeURIComponent(`sentDateTime ge ${sinceIso}`);
      let path = `/mailFolders/sentitems/messages?$filter=${filter}&$orderby=sentDateTime desc&$select=toRecipients,ccRecipients,sentDateTime&$top=100`;
      for (let page = 0; page < 10 && path; page++) {
        const res = await call(path);
        if (!res.ok) throw new Error(`graph-search-${res.status}`);
        const j = await res.json();
        if ((j.value || []).some((m) => [...(m.toRecipients || []), ...(m.ccRecipients || [])].some((r) => r.emailAddress?.address?.toLowerCase() === a))) return true;
        const next = j["@odata.nextLink"];
        path = next ? next.slice(next.indexOf(`/users/`)).replace(/^\/users\/[^/]+/, "") : null;
      }
      return false;
    },
    async setCategory(id, category) {
      const res = await call(`/messages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ categories: [category] }) });
      if (!res.ok) throw new Error(`graph-patch-${res.status}`);
    },
  };
}

/** In-memory stand-in for one mailbox, used by tests and the demonstration. */
export function mockGraph({ failCreate = false } = {}) {
  const drafts = new Map(); // id -> message
  const sent = []; // {to, at}
  let n = 0;
  return {
    drafts,
    sent,
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
    async hasReplySince(address, sinceIso) {
      return sent.some((s) => s.to.toLowerCase() === address.toLowerCase() && s.at >= sinceIso);
    },
    async setCategory(id, category) {
      const m = drafts.get(id);
      if (m) m.category = category;
    },
    // test helpers: what you would do in Outlook
    youSendDraft(id, atIso) {
      const m = drafts.get(id);
      m.isDraft = false;
      sent.push({ to: m.to, at: atIso });
    },
    youReplySeparately(to, atIso) {
      sent.push({ to, at: atIso });
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
