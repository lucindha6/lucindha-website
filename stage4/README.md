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
npm test        # 36 tests (24 core + 12 from the independent review)
npm run demo    # fictional clients, end to end
```

## Decisions outstanding (before any of this can be used for real)

The roadmap document has the full list. In short: ICO registration number, PII insurer, continuity alternate, VAT status, how long quotes are valid, your real availability, prices, AAT template wording for every letter section, ID verification method/provider, PEP and sanctions screening method, where the tracker lives (Microsoft Lists needs its own gate), and whether booking stays request-based.

## Independent review (11 Nov 2026)

An independent reviewer found 17 issues (2 high, 7 medium, 8 low). All are fixed, and each has a regression test in `tests/review-fixes.test.mjs`. Main changes: anything that looks unfinished (`[...]`, `{...}`, `<<...>>`, TBC) blocks a letter; letters need your final read-through approval; a decided checklist is locked; only exactly `true` counts as your confirmation; EDD comes after the red flags and risk rating and is cleared if they change; a PEP always needs source of funds and wealth and can't be rated low risk; a booking can't be offered after its hold lapses or confirmed when someone else has the time; the tracker accepts references only; wider detection of investment, pension, audit and immigration wording with the right reason; and imports are limited to an approved list.
