# Automatic enquiry acknowledgement

When someone sends the enquiry form on www.lucindhalawson.co.uk, they get a short
automatic email from **hello@lucindhalawson.co.uk** confirming it arrived.

Nothing about the form or Netlify's own notification email changes. If the
acknowledgement ever fails, the enquiry still reaches hello@ as before and an
alert is sent (see Monitoring).

## How it works

1. Netlify Forms saves the enquiry and runs its spam filter, as it does now.
2. For each **verified** (non-spam) enquiry, Netlify runs the function
   `netlify/functions/submission-created.mjs`. Netlify signs this event and
   checks the signature itself, so the function cannot be triggered from outside.
3. The function checks the enquiry (spam trap, consent, valid email, no web
   addresses in the name, not one of our own addresses, duplicates, limits) and sends the acknowledgement through
   **Microsoft Graph** as hello@. The app can send **only** as hello@
   (Exchange "RBAC for Applications").
4. A copy is saved in hello@'s **Sent Items**.

The logic is in `netlify/lib/ack.mjs`. Tests are in `tests/` (run `npm test`).

## Switching it on and off

Set in Netlify → Project configuration → Environment variables, then redeploy
(Deploys → Trigger deploy → Deploy project). Changes only take effect after a redeploy.

| Variable | Value | Notes |
|---|---|---|
| `ACK_MODE` | `off` / `test` / `live` | Missing = off. `test` only emails addresses in the allowlist. |
| `ACK_TEST_ALLOWLIST` | `you@example.com,other@example.com` | Only used in test mode. |
| `ACK_FROM` | `hello@lucindhalawson.co.uk` | The shared mailbox it sends as. |
| `ACK_ALERT_TO` | (optional) | Where failure alerts go. Defaults to `ACK_FROM`. |
| `ACK_HASH_SECRET` | a long random string | Required. Scrambles email fingerprints. Mark as secret. |
| `M365_TENANT_ID` | Directory (tenant) ID | From Microsoft Entra. |
| `M365_CLIENT_ID` | Application (client) ID | From Microsoft Entra. |
| `M365_CLIENT_SECRET` | Client secret **value** | Mark as secret. Never put it in GitHub, email or chat. |

Set the scope of each variable to **Functions** only.

**To turn it off quickly:** set `ACK_MODE` to `off` and redeploy.

## Microsoft 365 set-up (one-off)

The PowerShell commands are in the `microsoft365` repository:
`exchange/website-acknowledgement-setup.ps1`.

1. **Microsoft Entra admin centre → App registrations → New registration**
   - Name: `Website enquiry acknowledgements`
   - Accounts in this organisational directory only
   - No redirect URI
2. Copy the **Application (client) ID** and **Directory (tenant) ID**.
3. **Certificates & secrets → New client secret** – description `Netlify`,
   expiry 12 months. Copy the **Value** (not the Secret ID) straight into
   Netlify as `M365_CLIENT_SECRET`. Put a reminder in your calendar 2 weeks
   before it expires.
4. **API permissions:** do **not** add `Mail.Send` here. If it is listed, remove
   it. (A permission granted here would let the app send as *any* mailbox.)
5. **Enterprise applications →** open the same app → copy its **Object ID**.
6. Run the PowerShell script to allow the app to send as hello@ only, and check it.

## Data protection (UK GDPR)

- No AI services are involved.
- The acknowledgement never repeats the enquiry or any access needs. The only
  visitor input it uses is the first name (letters only, no web addresses) and
  which of the form's five contact options they ticked.
- Logs contain only the Netlify submission id, a result code and an HTTP status.
- Netlify Blobs (EU region, Frankfurt) holds only: submission ids with a status
  (deleted after 30 days), a keyed hash of the email address with send times
  (deleted once older than yesterday, so at most about 48 hours) and a daily
  counter, for duplicate and abuse protection.
- Processors: Netlify (hosting and forms) and Microsoft (email), both already in
  the privacy notice.

## Limits

- One acknowledgement per submission, even if Netlify sends the event twice.
- One per email address within 10 minutes (for double-clicks).
- At most 3 per email address per day, so nobody can use the form to flood
  someone else's inbox.
- At most 50 per day for the whole site. If this is reached, sending pauses until
  the next day and an alert is sent, because it usually means the form is being abused.

## Monitoring

- **Netlify → Logs → Functions → submission-created** shows one line per enquiry:
  `sent`, `skipped` (with a reason) or `failed`.
- **hello@ Sent Items** holds every acknowledgement sent.
- **Alerts:** if an acknowledgement can't be sent, the function submits a short
  message to a hidden Netlify form called **ack-alert** (`site/forms/ack-alert.html`).
  Netlify emails it to you like any form, so the alert still arrives when the
  Microsoft connection is broken (the usual cause is an expired client secret).
  In Netlify → Forms → Form notifications, make sure an email notification to
  hello@ covers **ack-alert** (an "Any form" notification does). If that route
  fails, the alert is sent through Microsoft instead, as "Website acknowledgement
  not sent". Alerts contain the time and submission id only.

## Test checklist (before launch)

1. Deploy with `ACK_MODE` unset. Send an enquiry. The enquiry and Netlify's
   notification arrive as before; the function log says `disabled`.
2. Add the Microsoft and other variables, `ACK_MODE=test`, your address in the
   allowlist. Redeploy.
3. Send an enquiry from an allowlisted address → acknowledgement arrives from
   hello@, replying goes to hello@, a copy is in Sent Items.
4. Send from an address not on the allowlist → no acknowledgement.
5. Send twice within 10 minutes → only one acknowledgement.
6. Choose "Text message" with no mobile number → email asks for a number.
7. Fill in access needs → email thanks you but does not repeat them.
8. Check the email on a phone, with a screen reader, and that it is not in junk.
   In the message headers, SPF, DKIM and DMARC should say `pass`.
9. Put a wrong value in `M365_CLIENT_SECRET`, redeploy, send an enquiry → an
   **ack-alert** notification arrives from Netlify. Put the right value back and redeploy.
10. Check the function log shows no `internal` errors (this confirms the EU
    storage region and the Blobs package work on Netlify).
11. Set `ACK_MODE=live`, redeploy, send one final enquiry.

## Undo

Set `ACK_MODE=off` and redeploy, or revert the commit that added
`netlify/`, `package.json`, `tests/`, `site/forms/ack-alert.html` and the
`[functions]` block in `netlify.toml`.
