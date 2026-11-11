# Stage 4: onboarding tools (development only)

Gate S4-1, fictional data only. This branch (`feature/stage4-onboarding`) is **not merged, not deployed and not connected to anything**. It has no Netlify function, no Microsoft Graph code, and no network, email, calendar or delete calls (a test enforces this). It imports nothing from Stages 1–3.

## What's here

| Part | File | What it does | What it never does |
|---|---|---|---|
| Draft quotation builder | `lib/quote.mjs` | Lists your published starting prices for the services asked about, shows year-end accounts plus Corporation Tax once (from £850), suggests matching packages, flags unlisted services and anything about investment, pensions, mortgages, insurance, audit or legal advice | Set a fee (each one is "[enter your fee]" until you enter it), send, or go beyond "ready for review" |
| Engagement letter structure | `lib/engagement.mjs` | AAT Client Care 5.1 items (a)–(p), checks for scope schedules for each service, practice details, licensed services only, (k) investment statement, (o) AAT referral; 5.3 new-letter check; 5.9 disengagement checklist | Contain legal wording. Every section reads **[AAT SAMPLE WORDING NOT SUPPLIED OR APPROVED]** until you supply wording and mark it approved |
| Onboarding and AML checklist | `lib/onboarding.mjs` | Customer due diligence steps by client type (individuals; companies, partnerships and charities get organisation and beneficial-owner checks), 9 red-flag questions, enhanced due diligence when high risk or any flag is raised, source of funds where high risk | Tick anything itself, store ID document details, record suspicions (you're the Nominated Officer; that stays outside any tool), or accept a client. Acceptance needs your explicit, personal decision and is refused while anything is open |
| Client pipeline tracker | `lib/pipeline.mjs` | Stages from enquiry to engaged, allowed moves, "no progress" nudges, a Microsoft Lists column design | Store names, contact details, figures or notes; move anyone to "engaged" or "declined" without your personal decision |
| Booking requests | `lib/booking.mjs` | Checks requested chat times against your availability (2 working days' notice, 4 weeks ahead, bank holidays, clashes, 2 a day), drafts an offer or alternatives, holds a tentative slot for 3 days | Book, write to a calendar, send, or confirm. Only you record "offered", "confirmed", "held" or "cancelled" |

`config/proposed-pricing.json` and `config/availability.json` are both `"approved": false`.

## Try it

```
cd stage4
npm test        # 61 tests
npm run demo    # fictional clients, end to end
```

## Decisions outstanding (before any of this can be used for real)

The roadmap document has the full list. In short: ICO registration number, PII insurer, continuity alternate, VAT status, how long quotes are valid, your real availability, prices, AAT template wording for every letter section, ID verification method/provider, PEP and sanctions screening method, where the tracker lives (Microsoft Lists needs its own gate), and whether booking stays request-based.

## Independent review (11 Nov 2026)

An independent reviewer found 17 issues (2 high, 7 medium, 8 low). All are fixed, and each has a regression test in `tests/review-fixes.test.mjs`. Main changes: anything that looks unfinished (`[...]`, `{...}`, `<<...>>`, TBC) blocks a letter; letters need your final read-through approval; a decided checklist is locked; only exactly `true` counts as your confirmation; EDD comes after the red flags and risk rating and is cleared if they change; a PEP always needs source of funds and wealth and can't be rated low risk; a booking can't be offered after its hold lapses or confirmed when someone else has the time; the tracker accepts references only; wider detection of investment, pension, audit and immigration wording with the right reason; and imports are limited to an approved list.

## 11 November 2026 update (your decisions)

- **Bookings**: request-based only. The offered slot is held internally for **24 hours** (`holdHours` in `config/availability.json`). When the hold expires only that internal hold is released (`expireHolds`): nothing is declined, sent or put in a calendar. Double bookings, clashes with your own diary (`busy`), confirming after a lapsed hold, and confirming after the chat time (with British Summer Time handled) are refused. **Every confirmation needs your personal approval** (`confirmedPersonally: true`). Written, BSL, captions and deafblind options are kept, with access flags in each draft.
- **Quotes**: valid for **30 days** from the date you approve and issue them, with the expiry date shown (`quoteValidityDays`). Each quote has scope, exclusions, assumptions, fees, VAT treatment, payment terms and additional-work sections, all blocked placeholders until you approve the wording. Fees stay "[enter your fee]" until you enter them. **You approve every quote** (`approveQuote`), and any later change withdraws the approval. £850 is shown once. **Payroll is excluded** unless you separately authorise it.
- **Engagement letters**: the (a)–(p) structure was checked against AAT's current Client Care Policy (version 1, issued 1 July 2025) and matches it. Clarified (l) to include suspicious activity reporting, (n) the commission or fee-reduction treatment, and (p) the six-or-fewer-clients route. Checks were added for (l), (m) and (p), and PII territorial coverage was added as a practice detail. `isFinal` is true only after your final approval following the last change.
- **AML**: PEP checks and sanctions screening are now separate steps. Sanctions screening is against the **UK Sanctions List** (FCDO; the single UK list since 28 Jan 2026). A possible sanctions match stops everything, and acceptance is impossible through the checklist. Identity checks are manual and risk-based, with no electronic provider option. The checklist sets out the firm-wide prerequisites it relies on (risk assessment, policies, Nominated Officer, training, records, supervision). Ongoing-monitoring reminders follow risk level (intervals PROPOSED: 3, 2 and 1 years).
- **Pipeline**: still reference-only, with no Microsoft Lists or SharePoint code (a test checks this). Reminders only.

### Second independent review (11 Nov 2026)

Fixed: unreadable diary entries are refused, not ignored; the slot length comes from config; the hold length must be set. Approvals are now tied to the exact content approved (a fingerprint), so a quote or letter changed after approval no longer counts as approved or final. A checklist whose risk level doesn't match your recorded assessment is refused. A quote can't be issued with a past date. Payroll mentioned in free text is flagged. "Investigate" no longer counts as investment. Insolvency and probate are flagged. "You agree to do..." is no longer treated as a placeholder. Electronic address checks are removed. PEPs get the enhanced (12-month) monitoring interval. Month-end dates are handled.

### AML trigger events (approved for fictional-data development, 11 Nov 2026)

`recordTrigger` lets you record, as a code, an event that brings a client's monitoring review forward: change of ownership, becoming a PEP, a high-risk country, a possible sanctions match, unusual activity, new services, pressure or reluctance, adverse information, or guidance changes. Suspicions are deliberately not a code here; they stay in your Nominated Officer log. `recordMonitoringReview` records your completed review and re-rated risk, and clears open triggers. A possible sanctions match must be resolved outside the tool first, and PEP or high-risk-country clients can't be re-rated low. The intervals stay PROPOSED.

After a third independent review: review and trigger dates are checked (not in the future, not before acceptance or a previous review, and a review only clears triggers on or before its date), and `recordSanctionsResolution` lets you record, as a code, a false positive or a report to OFSI. A reported match stays flagged.
