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

**Safety rules** (from the independent review):

- **Nothing is silently dropped.** Mail that looks automatic (auto-replies, bulk mail, a service's
  no-reply address) opens no case at complaints@ or privacy@, but you get a "check this" notice. A
  request sent through a service, with privacy wording, still opens a case.
- **Privacy wording is checked everywhere.** It's checked in **every** message, subject and body, new
  or follow-up. A privacy request inside a complaint thread opens a linked privacy case. Threads only
  match cases of the same type.
- **Footers don't count.** Privacy wording means request-style wording only ("send me a copy of my
  data", "what information do you hold about me", "delete my details", "right of access"). It's
  checked in the person's **new** text only: quoted earlier messages and signatures are skipped, so a
  footer like "we process personal data in line with data protection law" opens no case. A thread
  that already has a privacy case gets a follow-up notice, not another case.
- **Automatic mail at privacy@ still opens a case.** It always opens a case there, because a request
  sent through a service still has a legal deadline. Messages Stage 3 can't read properly (no date, an
  unreadable sender) get a "needs checking" notice.
- **Interrupted runs finish next time.** A run stopped part-way finishes the job on the next try,
  without sending notices twice.
- **Reminders are confirmed.** A reminder is recorded as sent only after it's delivered.
- **Updates can't overwrite each other.** Case updates use a version check, so two at once can't wipe
  each other's events (Netlify Blobs conditional writes, to verify at integration).
- **Dates are checked.** Recorded dates are checked: not in the future, not before receipt, and an
  answer can't come before its question. A faulty case gets its own "needs attention" notice, and the
  other cases carry on.
- **No free text is stored.** Details belong in your own case file.

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
  the person, with reasons, **within the first month**. Until you record that notice, the normal date
  stands. Stage 3 reminds you 5 working days before the first month ends. A late notice doesn't extend
  the deadline.
- **Overlapping pauses:** they're merged, not counted twice. A clarification asked for after the
  deadline has passed doesn't move it.
- **Bank holidays:** dates beyond the bank holiday list carry a warning to check by hand.
- **hello@ (the main enquiries inbox):** Stage 2 already sends privacy wording there to you as
  *sensitive*. Log any privacy request that arrives there with `logCase` (channel `other-mailbox`) and
  its real receipt date.

Fees, refusals and exemptions are your decisions and aren't automated.

## Retention (refinement 3)

**Dry run only.** `lib/retention.mjs` has no code that deletes, moves or changes anything, and a test
checks the whole of Stage 3 for delete, send or internet calls. The proposed schedule comes from your
privacy notice and is marked **not approved**.

- **Not yet decided:** retention periods for complaints and privacy requests are marked *NEEDS YOUR
  DECISION*. Unknown categories are always kept.
- **Exceptions:** an open case, a legal hold, the enquirer becoming a client, or a regulatory hold
  always means **keep**. So does any **unrecognised or misspelt flag**.
- **Dates:** each item needs an explicit start date for its rule (for example the last contact).
  Creation dates are used only where the rule really counts from creation.
- **No access token needed:** the tool reads a file **you** export from Netlify, so it needs no
  Netlify access token.

## Stage 3 boundaries

Never: sending email, deleting anything, sending message text to AI, storing names, addresses,
subjects or message text, or deciding a complaint or privacy request.

## Known limitation

If two **new** messages in the same brand-new email thread are processed at exactly the same moment,
both can open a case. This errs on the safe side: nothing is lost, and you'd record one as a
duplicate.

## 11 November 2026 update (your decisions and requirements)

All fictional data, still on this branch only. 80 tests pass (50 earlier + 30 in `tests/requirements-nov11.test.mjs`, including fixes from a second independent review: per-right deadlines when a request mixes access with other rights, safer signature handling, privacy cases for automatic-looking requests and new rights raised in replies, no silent drops of own-domain mail, and a health report that can't hide undelivered reminders).

- **Rights told apart** (`lib/rights.mjs`): subject access, rectification, erasure, restriction, portability, objection, objection to direct marketing (absolute), automated decisions, consent withdrawal and data protection complaints. Each has its article, time limit and the exemptions to consider. Unusual wording ("take me off your system", "what do you have on file about me") is recognised. Requests made on someone else's behalf, with legal context, asking for more than one thing, or with no clear right go to you for **manual review**, with a reminder until you record `review-done`. You can correct the rights with `rights-set`.
- **Deadlines follow the Data (Use and Access) Act 2025 changes** (Art. 12A UK GDPR, in force 5 Feb 2026): ID moves the start only with a recorded reason (reasonable doubts, or someone acting for the person); a fee only for manifestly unfounded or excessive requests; the clarification pause applies to **subject access only**, with a recorded reason. Every deadline shows the **original date, each adjustment with its legal basis, and the resulting date**.
- **Data protection complaints** (DPA 2018 s.164A, in force 19 June 2026): acknowledge within 30 days, then a progress-update reminder.
- **Complaints**: your 5-working-day acknowledgement and 4-week response kept. Reminders now go as a deadline approaches, on the day, when overdue, and again every 3 working days until you act.
- **Delivery confirmation**: a notice counts as sent only when the sender returns `{ delivered: true }`; anything else is retried and counted as undelivered for the health report.
- **Retention**: manual monthly review (`tools/monthly-review.mjs`). It shows what's potentially due for deletion, what's kept and why (disputes, claims, preservation notices, insurer, HMRC, AML records, investigations, open privacy requests) and what needs your decision, plus a checklist of places **outside Netlify** (Outlook, OneDrive, software, devices, messages, paper, backups, GitHub). The audit entry holds ids and counts only. Complaint and privacy-request periods stay unapproved. No deletion code, no Netlify token.
- **Health**: received vs processed is reconciled; undelivered reminders, case errors and credential expiry are flagged; missing figures are ACTION, never OK; addresses are stripped.

## 11 November 2026, second set (approved for fictional-data development)

91 tests pass (11 new in `tests/safeguards-nov11b.test.mjs`).

- **Manual privacy check** on every new complaint and media case: the notice asks you to read it for any request about personal data, with a reminder until you record `privacy-check-done` (`none-found` or `privacy-case-logged`). A request you find is logged with its original receipt date.
- **Weekly manual review checklist** (`lib/reviews.mjs`) covering hello@, WhatsApp Business, social media, post, call notes and other mailboxes. It is a backstop only, never a substitute for checking messages promptly. The health report needs its date, and is ACTION if it's more than 7 days old.
- **Monthly sample** of 3 closed complaint and media cases, chosen by a fixed scramble.
- **Part answered**: each right keeps its own deadline and status. `responded` is refused on a multi-right case until every part is answered.
- **Legal deadline and internal target**: the legal date follows ICO's published rules (corresponding date or last day of the month, next working day if a weekend or bank holiday, three calendar months if validly extended). The internal target is never later than the calendar date. Where another reading of the extension gives an earlier date, that date is the target and the case is flagged for you to check (`deadline-checked`).
- **Data protection complaints** follow your 5-working-day acknowledgement (the legal limit is 30 days) and the 4-week response, with a progress-update reminder every 4 weeks until the outcome is recorded (`part-answered` = `dp-complaint`).
- **WhatsApp** added as a channel for manual logging.
