# Stage 2 – AI-assisted enquiry drafts (Phase 1: fictional data only)

Status: **Phase 1, not deployed.** No Microsoft app, no AI provider, no Netlify site exists for it yet.
Stage 1 (the live acknowledgement in `netlify/functions/submission-created.mjs`) is not touched.

## What it does

For each genuine enquiry from the website's `enquiry` form, it creates **one draft** in a single
mailbox, plus **one short notice** to hello@. It **never sends email**: the Microsoft app it would use
gets Mail.ReadWrite on one mailbox only, never Mail.Send, and the code contains no send function.

- Ordinary accounting enquiries: an AI-written opening paragraph, plus approved prices, questions,
  accessibility and meeting sentences (`config/approved-facts.json`).
- Sensitive, unsure or failed: an empty reply with the same reference, and no AI.
- The AI ("structured only") sees only the services ticked, the client type and the contact methods.

## Why a separate Netlify site

Netlify gives every function on a site the same environment variables, so functions on one site can't
keep secrets from each other. Stage 2 therefore runs as its **own Netlify site**, with base directory
`stage2/` in this repository. It holds only Stage 2 secrets and is reached through Netlify's **signed
form webhook** (HTTP POST notification on the `enquiry` form only, with a JWS secret). The main
website then holds no Stage 2 secrets, and the Stage 2 site holds no Stage 1 secret.

## Settings (Stage 2 site only, Functions scope, Production only, marked secret)

| Variable | Purpose |
|---|---|
| `DRAFT_MODE` | `off` (default) / `test` / `live`. Live also requires `approved: true` in the facts file. |
| `DRAFT_TEST_ALLOWLIST` | Comma-separated addresses that test mode works for |
| `DRAFT_INPUT_MODE` | `structured` (default). `screened-text` is not to be used without new approval. |
| `STAGE2_WEBHOOK_SECRET` | The JWS secret set on the main site's webhook notification |
| `STAGE2_HASH_SECRET` | Scrambles email addresses for duplicate checks |
| `DRAFTS_MAILBOX` | `drafts-test@…` during testing, later `hello@…` |
| `M365_DRAFTS_TENANT_ID`, `M365_DRAFTS_CLIENT_ID`, `M365_DRAFTS_CLIENT_SECRET` | The separate "Website enquiry drafts" app |

## Tests

```
cd stage2 && npm test      # 54 tests; fictional data; stand-in AI and Microsoft
node tools/demo.mjs        # data for the Outlook workflow demonstration
```

## Not yet done (later phases, each needs approval)

A real AI provider; the Microsoft app and test mailbox; the separate Netlify site; the webhook on the
main site's `enquiry` form; approval of every line in `config/approved-facts.json`; the DPIA and
privacy notice.
