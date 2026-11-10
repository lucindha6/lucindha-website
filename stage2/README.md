# Stage 2 – enquiry reply drafts (Phase 2: template-first, fictional data only)

Status: **not deployed.** No Microsoft app, no AI provider and no Netlify site exist for it yet.
Stage 1 (the live acknowledgement in `netlify/functions/submission-created.mjs`) is not touched, and
the main site neither publishes (`publish = "site"`) nor runs (`netlify/functions`) anything in `stage2/`.

## What it does

For each genuine submission of the website's `enquiry` form (and no other form):

| Enquiry | What appears in Outlook |
|---|---|
| Ordinary accounting enquiry | **One template draft** in Drafts (category *Template draft – review*) + one notice |
| Sensitive (complaint, privacy request, AML, HMRC dispute, debt, health, bank or tax numbers…) | **Notice only – no draft.** You reply personally from the Netlify notification |
| Unsure (community work, no service, odd instructions, not English, long, urgent…) | **Notice only – no draft** |
| A different enquiry from the same person within 24 h | Its own reference + a *follow-up* notice. Any unsent earlier draft is re-labelled *Follow-up received – check first* |
| An exact repeat within 24 h | A short *repeat – nothing new* notice |

It **never sends email**. The Microsoft app would get Application Mail.ReadWrite (never Mail.Send),
limited to one mailbox by an Exchange RBAC for Applications scope (first drafts-test@, later hello@).
Without that scope Mail.ReadWrite would cover every mailbox in the tenant, so the scope is essential.

Every sentence of a draft comes from `config/approved-facts.json`, which is **marked not approved**.
Live mode refuses to run until it is approved.

## Identifiers

- Records are stored under a **64-character internal key** (SHA-256 of Netlify's unique submission id),
  so two enquiries can never overwrite or block each other.
- The reference you see (e.g. `ENQ-7KQ3MX`, 6 characters) is reserved atomically; if two enquiries
  ever produced the same one, the second gets a different reference.

## Notices (forgery-resistant)

Notices are created **inside the mailbox** by the Stage 2 app (same permission, same mailbox). There is
no public form any more, so nobody outside can create one, and notices are no longer stored on Netlify.
A genuine notice has the subject prefix `[Stage 2]`, the category *Stage 2 notice*, and no external
sender. **An incoming email claiming to be a Stage 2 notice is forged.** Notices never contain links.

## "Have I replied?"

A reply only counts if you sent the draft itself, or a message **to the enquirer** whose **subject
contains the reference**. The Stage 1 acknowledgement (also in Sent Items) and unrelated emails to the
same person never count. Records hold only a keyed fingerprint of the address, not the address itself.

## Future AI (off)

An optional *personaliser* may later replace only the opening paragraph (`DRAFT_PERSONALISER=ai` and
a provider passed in). It is not supplied in Phase 2. It would see only the fixed form values, and any
failure or unsafe answer falls back to the template.

## Settings (Stage 2 site only, Functions scope, Production only, marked secret)

| Variable | Purpose |
|---|---|
| `DRAFT_MODE` | `off` (default) / `test` / `live`. Live also requires `approved: true` in the wording file. |
| `DRAFT_TEST_ALLOWLIST` | Comma-separated addresses that test mode works for |
| `DRAFT_PERSONALISER` | unset (default, template only). `ai` only in a future approved phase |
| `STAGE2_WEBHOOK_SECRET` | The JWS secret set on the main site's webhook notification |
| `STAGE2_HASH_SECRET` | Keys the address and content fingerprints |
| `DRAFTS_MAILBOX` | `drafts-test@…` during testing, later `hello@…` |
| `M365_DRAFTS_TENANT_ID`, `M365_DRAFTS_CLIENT_ID`, `M365_DRAFTS_CLIENT_SECRET` | The separate "Website enquiry drafts" app |

Outlook categories to create by hand in the mailbox: *Template draft – review*, *Follow-up received –
check first*, *Answered – delete draft*, *Stage 2 notice*.

## Tests

```
cd stage2 && npm test      # 76 tests; fictional data; stand-in Microsoft mailbox
node tools/demo.mjs        # data for the Outlook demonstration and reply previews
```

## Integration testing (needs your approval first)

With a test mailbox and the Stage 2 site in test mode, confirm:

1. Stage 2 switched off, returning errors, or slow → the Netlify enquiry email and the Stage 1
   acknowledgement still arrive normally (they are separate Netlify features).
2. Netlify's webhook signature includes `iss: "netlify"` (the code requires it).
3. Notices created in the Inbox show as unread, non-draft messages, sort at the top, and trigger
   Outlook's new-mail alert on phone and computer. If they don't, fall back to drafts-only plus the
   daily summary.
4. The Blobs EU region option, the wording-file import, and the ~10 second function limit, with a real
   `netlify build`.

## Known limits

- Replies you send from lucindha@ rather than hello@ aren't seen, so you might get one unnecessary reminder.
- Replies without the reference in the subject aren't recognised (one reminder at most).
- Keyword screening can miss unusual wording or over-flag; you review everything before it's sent.
- The bank holiday list (lib/workdays.mjs) must be updated every year; a maintenance notice warns you.
