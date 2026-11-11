# Stage 3 – specialist inboxes, data retention and health checks (DEVELOPMENT ONLY)

Status: **fictional data only, not deployed, not connected to anything.** Approved scope: Gate S3-1
(11 November 2026). No Microsoft app, no permission, no Netlify site, no scheduled task, no real
complaint, privacy request or client information. Stage 1 (live) and Stage 2 (test mode) are not
touched: Stage 3 lives only in `stage3/`, copies the few helpers it needs, and imports nothing from them.

Run: `cd stage3 && npm test` (automated tests) · `node tools/demo.mjs` (fictional walkthrough)

## What's here

| Part | File | What it does |
|---|---|---|
| Calendar | `lib/calendar.mjs` | UK working days and bank holidays, ICO calendar-month rule, UK dates of emails |
| Deadlines | `lib/deadlines.mjs` | Complaints (5 working days to acknowledge, 4 weeks to respond); privacy requests (ICO rules); media (2-working-day target) |
| Case tracker | `lib/cases.mjs` | New case vs follow-up, other-channel requests, events, daily reminders, short notices |
| Retention dry run | `lib/retention.mjs`, `tools/retention-dry-run.mjs` | Reports what *would* be deleted under the proposed schedule, with exceptions. **Cannot delete.** |
| Health report | `lib/health.mjs` | Weekly OK / CHECK / ACTION summary from counts and dates only |
| Wording | `config/acknowledgements.json` | Proposed auto-reply and template wording, **not approved** |

## Acknowledgements: two layers (refinement 1)

Exchange's standard **automatic replies** go **once per sender** while they're switched on. The list
of people already replied to is cleared only when automatic replies are turned off and on again, or
their settings are changed. A server-side **"reply using a specific message" rule** replies to
**every** message, including every follow-up in a conversation, and it can't tell a new complaint
from a reply about an existing one.

So Stage 3 separates the two jobs:

1. **Receipt (automatic, no app, no permission).** Built-in automatic replies on complaints@,
   privacy@ and media@, using the approved wording, say "this is an automatic reply" and explain what
   happens next. They make no promise about outcomes. Because they go once per sender, a person
   writing again later may not get a second automatic receipt. That's acceptable, because layer 2
   is what counts.
2. **Formal acknowledgement (you, per case).** Stage 3 decides whether each message is a **new case**
   or a **follow-up**:
   - **Follow-up:** the subject carries that case's reference *and* comes from the same sender, or
     the message is in the same email thread.
   - **New case:** anything else. It's never merged automatically. If the same person already has an
     open case, the new one is *linked* to it and you decide whether it's a duplicate.

   It works out the deadline for every new case and reminds you once before it's due, and once if
   it's overdue. You write and send the formal acknowledgement yourself, using the templates in
   `config/acknowledgements.json`. Stage 3 never sends anything.

To work on real mail, Stage 3 would later need read access to those mailboxes (Gate S3-3: a separate
app, mailbox-limited by RBAC, never Mail.Send). Nothing is connected now.

## Privacy request deadlines (refinement 2)

Following the ICO's right of access guidance and UK GDPR Art. 12(3):

- **Receipt:** requests can arrive by **any channel** (email to any inbox, letter, phone, video, in
  person, social media) and needn't say "subject access". Messages to complaints@ or media@ are
  scanned locally for privacy wording, which opens a linked privacy case from that day. Requests made
  any other way can be logged by hand with their real receipt date (`logCase`).
- **One calendar month:** the corresponding date in the next month, or the last day of that month if
  there isn't one (31 Jan → 28 Feb). If that day is a weekend or bank holiday, the deadline moves to
  the next working day.
- **ID:** if you need to confirm identity, the clock **starts when the ID arrives**. Ask promptly: a
  warning appears if the request for ID came more than 5 days after the request arrived. You get one
  nudge if ID hasn't arrived after 10 working days. There's no "overdue" notice while the clock hasn't
  started.
- **Clarification:** the clock **pauses on the day you ask** and restarts the day after the answer
  arrives. The deadline moves on by the number of days paused, counted in days.
- **Extension:** for complex or numerous requests, up to **two further months**, but only if you tell
  the person, with reasons, **within the first month**. Stage 3 reminds you and warns if the notice
  was late.

Fees, refusals and exemptions are your decisions and aren't automated.

## Retention (refinement 3)

**Dry run only.** `lib/retention.mjs` has no code that deletes, moves or changes anything, and a test
checks the whole of Stage 3 for delete, send or internet calls. The proposed schedule comes from your
privacy notice and is marked **not approved**.

- **Not yet decided:** retention periods for complaints and privacy requests are marked *NEEDS YOUR
  DECISION*. Unknown categories are always kept.
- **Exceptions:** an open case, a legal hold, the enquirer becoming a client, or a regulatory hold
  always means **keep**.
- **No access token needed:** the tool reads a file **you** export from Netlify, so it needs no
  Netlify access token.

## Stage 3 boundaries

Never: sending email, deleting anything, sending message text to AI, storing names, addresses,
subjects or message text, or deciding a complaint or privacy request.
