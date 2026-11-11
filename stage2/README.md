# Stage 2 – enquiry reply drafts (template-first; Phase 3 planning, fictional data only)

Status: **not deployed.** No Microsoft app, no AI provider and no Netlify site exist for it yet.
Stage 1 (the live acknowledgement in `netlify/functions/submission-created.mjs`) is not touched, and
the main site neither publishes (`publish = "site"`) nor runs (`netlify/functions`) anything in `stage2/`.

## What it does

For each genuine submission of the website's `enquiry` form (and no other form):

| Enquiry | What appears in Outlook |
|---|---|
| Ordinary accounting enquiry | **One template draft** in Drafts (category *Template draft – review*) + one notice |
| Community work (sport and coaching, talks, workshops, "not sure yet") | **One template draft that only asks questions** (activity, aims, dates, place, access, and whether it's paid, a collaboration or voluntary). It never states a fee, a date, availability or a booking |
| "Something else" clearly from the media | **One questions-only media draft**. Anything about personal history or health goes to you |
| Other "Something else", accounting and community mixed, mentions of roles not yet public | **Notice only – no draft** |
| Sensitive (complaint, privacy request, AML, HMRC dispute, debt, health, bank or tax numbers…) | **Notice only – no draft.** You reply personally from the Netlify notification |
| Unsure (community work, no service, odd instructions, not English, long, urgent…) | **Notice only – no draft** |
| A different enquiry of the SAME kind (accounting, community, media or other) from the same person within 24 h | Its own reference + a *follow-up* notice. Any unsent earlier draft is re-labelled *Follow-up received – check first*, or *Sensitive follow-up – do not send* if the new message is sensitive or unsure |
| An exact repeat within 24 h | A short *repeat – nothing new* notice |
| A different KIND of enquiry from the same person (e.g. accounting, then a talk) | Handled separately, each with its own draft or notice; the notice mentions the other reference |

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

## Alerts and notices

- **The alert** on your phone and computer is the Netlify enquiry email you already receive for every
  enquiry. It is real email, so it alerts like any other message. Stage 2 doesn't change it.
- **Notices** say what Stage 2 did. Each one is saved as an **unaddressed draft** in a top-level folder
  called **Stage 2 notices** (or in Drafts if that folder doesn't exist). Creating drafts is fully
  supported by Microsoft with Mail.ReadWrite and isn't affected by the 31 December 2026 restriction
  on changing non-draft messages. A notice has no recipient, so it can't be sent.
- Microsoft provides **no supported way** for an app to place an unread, non-draft message in the
  Inbox without permission to send email (the known workaround relies on an undocumented MAPI flag,
  and phone alerts aren't guaranteed), so Stage 2 doesn't do that.
- Nobody outside can create a notice. A genuine notice is in the *Stage 2 notices* folder, has no
  recipient, starts with `[Stage 2]` and has the *Stage 2 notice* category. **An email that arrives
  claiming to be a Stage 2 notice is forged.** Notices never contain links.

## "Have I replied?"

A reply only counts if you sent the draft itself, or a message **to the enquirer** whose **subject
contains the reference**. The Stage 1 acknowledgement (also in Sent Items) and unrelated emails to the
same person never count. Deleting a draft does not close an enquiry; only a reply does. Records hold only a
keyed fingerprint of the address, not the address itself.

The daily check also reports an enquiry that stopped part-way, a notice that couldn't be delivered, and
retries a draft label that couldn't be changed.

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
check first*, *Sensitive follow-up – do not send*, *Answered – delete draft*, *Stage 2 notice*.
Folder to create: **Stage 2 notices** (top level).

## Tests

```
cd stage2 && npm test      # 112 tests; fictional data; stand-in Microsoft mailbox
node tools/demo.mjs        # data for the Outlook demonstration and reply previews
```

## Integration testing (needs your approval first)

With a test mailbox and the Stage 2 site in test mode, confirm:

1. Stage 2 switched off, returning errors, or slow → the Netlify enquiry email and the Stage 1
   acknowledgement still arrive normally (they are separate Netlify features).
2. Netlify's webhook signature includes `iss: "netlify"` (the code requires it).
3. Reply drafts and notices appear correctly in Outlook on the web, Windows/Mac and iPhone, and the
   Netlify enquiry email still alerts your phone and computer.
4. The Blobs EU region option, the wording-file import, and the ~10 second function limit, with a real
   `netlify build`.

## Known limits

- Replies you send from lucindha@ rather than hello@ aren't seen, so you might get one unnecessary reminder.
- Replies without the reference in the subject aren't recognised (one reminder at most).
- Keyword screening can miss unusual wording or over-flag; you review everything before it's sent.
- The bank holiday list (lib/workdays.mjs) must be updated every year; a maintenance notice warns you.
