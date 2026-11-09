# Automatic enquiry acknowledgement

When someone sends the enquiry form on www.lucindhalawson.co.uk, they get a short
automatic email from **hello@lucindhalawson.co.uk** confirming it arrived.

Nothing about the form or Netlify's own notification email changes. If the
acknowledgement ever fails, the enquiry still reaches hello@ as before and an
alert email is sent to hello@.

## How it works

1. Netlify Forms saves the enquiry and runs its spam filter, as it does now.
2. For each **verified** (non-spam) enquiry, Netlify runs the function
   `netlify/functions/submission-created.mjs`. Netlify signs this event and
   checks the signature itself, so the function cannot be triggered from outside.
3. The function checks the enquiry (spam trap, consent, valid email, no links
   in the name, duplicates, daily limit) and sends the acknowledgement through
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
| `ACK_HASH_SECRET` | a long random string | Scrambles email fingerprints. Mark as secret. |
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
- The acknowledgement never repeats the enquiry or any access needs.
- Logs contain only the Netlify submission id, a result code and an HTTP status.
- Netlify Blobs (EU, Frankfurt) holds only: submission ids with a status
  (deleted after 30 days) and a keyed hash of the email address with send times
  (deleted after 48 hours) for duplicate and abuse protection.
- Processors: Netlify (hosting and forms) and Microsoft (email), both already in
  the privacy notice.

## Monitoring

- **Netlify → Logs → Functions → submission-created** shows one line per enquiry:
  `sent`, `skipped` (with a reason) or `failed`.
- **hello@ Sent Items** holds every acknowledgement sent.
- **"Website acknowledgement not sent"** emails arrive at hello@ if sending fails.
  The usual cause is an expired client secret.

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
   alert email arrives. Put the right value back and redeploy.
10. Set `ACK_MODE=live`, redeploy, send one final enquiry.

## Undo

Set `ACK_MODE=off` and redeploy, or revert the commit that added
`netlify/`, `package.json`, `tests/` and the `[functions]` block in `netlify.toml`.
