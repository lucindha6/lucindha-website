# Merge holds (Development Tracker E-15)

**Status:** draft for the director's review.

Nothing is enforced yet. No ruleset or permission has been created or changed. The only GitHub changes are the label DO NOT MERGE and a closed experiment pull request (#5).

**Related:**

- [Release approval checklist](release-approval-checklist.md)
- [Ruleset B configuration](rulesets/merge-hold.json) (not applied)
- Development Tracker row E-15: https://claude.ai/artifact/1xMJxm1PTswiCYPsGJuPRg

## Why

On 13 November 2026, Bookkeeping #23 and Portals #1 were merged while the Development Tracker recorded a hold on them. The hold existed only in the tracker. The pull requests and merge messages did not show it, and nothing checked the tracker at merge time.

## The rule

A release hold is recorded in all three places. Only the director lifts it, in all three.

| Place | How a hold is recorded | How it is lifted |
| --- | --- | --- |
| The pull request | The label **DO NOT MERGE**, plus this notice at the top of the description: "**Merge hold:** [reason]. Conditions to lift: [conditions]. Tracker row: [ID]." | The director removes the label and adds "Hold lifted by the director on [date]: [evidence]" |
| Development Tracker | The row's "Depends on / blocker" column starts "MERGE HOLD:" and names the conditions | The approval and its evidence are recorded in the Evidence column |
| Release approval checklist | Part A, section 3, lists every open hold | It is checked at every approval |

A session never removes a DO NOT MERGE label, and never adds WORKFLOW CHANGE APPROVED or an approval record.

## The automatic check

`.github/workflows/merge-hold.yml` (job "Merge hold runner") runs `scripts/merge-hold.mjs`. The script posts its verdict as the check run **Merge hold** on the pull request's **current head commit**.

The verdict is a failure while either of these is true:

1. **A hold label is present.** The label is DO NOT MERGE; spelling variants also count, such as `do-not-merge` and `Do_Not_Merge`. Nothing lifts this except the director removing the label.
2. **A protected file has changed without approval.** Protected files are anything under `.github/workflows/` or `.github/actions/`, and `scripts/merge-hold.mjs`; a renamed file counts under its old name too. Approval needs both of these:
   - the label **WORKFLOW CHANGE APPROVED**, and
   - the director's written approval record in the pull request description, naming the **reviewed commit**, which must be the current head commit, and the **tracker reference**.

   The label alone is never enough. Any later push changes the head commit, so it needs a fresh approval.

### The written approval record

The director adds this to the pull request description, then applies the label:

```
Director workflow-change approval
- Approved by: Lucindha Lawson (director)
- Approval date: YYYY-MM-DD
- Reviewed commit: <full 40-character commit SHA>
- Tracker: E-15
```

The same approval, quoted, also goes in the Development Tracker Evidence column and in Part A, section 6, of the release checklist.

**Limit:** GitHub can't show who typed a description, because the director and every session act as `lucindha6`. The record ties the approval to one reviewed commit and leaves a written trail. The rule that only the director writes it is procedural.

### Protection against an untrusted pull request

- **The check can't be changed by the pull request it checks.** It runs on `pull_request_target`, so the workflow and script always come from `main`.
- **No pull request code runs.** The workflow checks out the base commit only. The description is read as data by the script and is never put into a shell command.
- **Minimal access.** Permissions are `checks: write`, which it uses only to post "Merge hold", plus read-only access to contents, issues and pull requests. No secrets are used, and `persist-credentials: false` is set.
- **The token stays with GitHub.** It is sent only to the GitHub API address. Links to other addresses are refused, and it is never printed. Both are tested.
- **Current data only.** Every run reads the current labels, description, head commit and changed files, following every page (up to 1,000 labels and 3,000 files). Any error, unexpected reply or excess fails closed. If posting the check run fails, the required check stays missing, which also blocks merging.

### Lookalike checks: tested (pull request #5, 13 Nov 2026)

**Question:** can a pull request add its own workflow that reports a passing check with the required name, and so undermine a failing genuine one?

**Test:** the existing required check "Tests and dependency audit", in the unchanged 'Protect main' ruleset, with a lookalike job of the same name from GitHub Actions.

| Variant | Lookalike | Genuine | Finished last | Merge state |
| --- | --- | --- | --- | --- |
| 1 | failed | passed | genuine | **blocked** |
| Control | passed | passed | – | **clean** |
| 2 | failed | passed | lookalike | **blocked** |

**Result:** any failing run with the required name blocks the merge, whichever finishes last. A passing lookalike can't hide a failing genuine "Merge hold". Since a lookalike needs a workflow change, the genuine check also fails on that change unless the director has approved it.

**Restricting the source:** the ruleset can require "Merge hold" from **GitHub Actions only**. This is shown in the ruleset form as the source "GitHub Actions" and in the API as `integration_id` 15368; confirm the source when creating the ruleset. This rejects any other app or integration. It can't separate two workflows in the same repository, because both are GitHub Actions; the test above is what covers that case.

**Remaining risk (low):** if the genuine check never reports on a commit and a lookalike reports a pass, the requirement would look met. For that to happen, the genuine workflow on `main` would have to be broken or not triggered while a lookalike runs. Any lookalike is a workflow change, which the genuine check fails whenever it runs. Verification step 6 below checks this case before the ruleset is relied on.

### Tests

| Test | Result |
| --- | --- |
| `npm test` | 75 of 75 pass: the 42 existing tests, plus 26 new unit tests and 7 new integration tests |
| Integration tests | The script runs as a separate process against a local fake GitHub API over real HTTP, with pagination and the Checks API |
| actionlint 1.7.12, with shellcheck 0.11.0 | 0 errors |
| zizmor 1.32.0 | No findings in `merge-hold.yml`; the `pull_request_target` warning was reviewed and annotated |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Live run of the earlier version on this pull request (since removed) | Passed with no label, failed with DO NOT MERGE; the token was masked |

## Ruleset B (chosen by the director, 13 Nov 2026): configuration and verification

**Design:** a separate ruleset "Merge hold" with no bypass. 'Protect main' and its administrator bypass are left unchanged. The full configuration is in `docs/rulesets/merge-hold.json`:

- **Target:** the default branch.
- **Enforcement:** Active, only once approved.
- **Bypass list:** empty.
- **One rule:** require the status check "Merge hold" from GitHub Actions.
- **Up to date with main:** not required by this ruleset, because 'Protect main' already handles that.

**Activation needs the director's final approval.** These steps follow the merge of this pull request.

1. Create the label WORKFLOW CHANGE APPROVED, with the description in the checklist.
2. Record the current state: export 'Protect main' (Settings → Rules → Rulesets → Protect main → Export), so you can show afterwards that it is unchanged.
3. Create ruleset B as configured, with Active enforcement and no bypass actors.
4. **Hold test:** open a draft pull request with a one-line docs change, mark it ready, and add DO NOT MERGE. Expected: "Merge hold" fails and the merge button is blocked for the admin account. "Bypass rules" is not offered for this rule.
5. **Release test:** remove the label. Expected: "Merge hold" passes and the pull request is mergeable. Close it without merging.
6. **Lookalike test:** on a draft-then-ready pull request, add a workflow whose job is named "Merge hold" and passes. Expected: the genuine check fails (unapproved workflow change) and the pull request is blocked. Close it.
7. **Emergency test (optional):** set ruleset B to Disabled and confirm that 'Protect main' still applies unchanged. Then set it back to Active.
8. Export both rulesets again and compare with step 2. Record everything in the tracker (E-15).

**Rollback:** set ruleset B to Disabled, or delete it. 'Protect main' is never edited.

## Private repositories

ll-ai-bookkeeping-assistant and ll-portals are private on GitHub Free, where rulesets are not enforced. The check can be copied there as a visible warning only.
