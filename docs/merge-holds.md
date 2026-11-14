# Merge holds (Development Tracker E-15)

**Status:** draft for the director's review.

Nothing is enforced yet. No ruleset or permission has been created or changed. The only GitHub changes are labels (DO NOT MERGE and the `exp-*` test labels) and a closed experiment pull request (#5).

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

`.github/workflows/merge-hold.yml` (job "Merge hold runner") runs `scripts/merge-hold.mjs`. The script reports the check run **Merge hold** on the pull request's head commit, in a fail-safe order:

1. **First, before reading anything,** it posts a **new** "Merge hold" run that is *in progress*. GitHub then stops counting any earlier result on that commit, and merging is blocked at once (tested: PR #5, test 2, step F).
2. It reads the current labels, description, head commit and changed files.
3. It **completes that same run** as a success or a failure.

If the check crashes, times out, is cancelled or can't complete the run, the run stays *in progress*, and merging stays blocked. Every write is retried three times. If the pull request moved to a new commit while the check was running, this run fails, and the run for the new commit decides.

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
- **Minimal access.** Permissions are `checks: write`, which it uses only to post and complete "Merge hold", plus read-only access to contents, issues and pull requests. No secrets are used, and `persist-credentials: false` is set.
- **The token stays with GitHub.** It is sent only to the GitHub API address. Links to other addresses are refused, and it is never printed. Both are tested.
- **Current data only.** Every run reads the current labels, description, head commit and changed files, following every page (up to 1,000 labels and 3,000 files). Any error, unexpected reply or excess fails closed.

### How GitHub really enforces repeated checks (tested on pull request #5)

Both tests used the existing required check "Tests and dependency audit", in the unchanged 'Protect main' ruleset, as the test case. No ruleset was changed.

**Test 1 (13 Nov): lookalike workflow jobs.** Each job ran in its own workflow run.

| Variant | Lookalike job | Genuine job | Merge state |
| --- | --- | --- | --- |
| 1 | failed first | passed later | **blocked** |
| Control | passed | passed | clean |
| 2 | failed later | passed first | **blocked** |

**Test 2 (14 Nov): check runs posted through the Checks API, as this script does.** Each step came from a separate workflow run, all on one commit.

| Step | Posted | Merge state |
| --- | --- | --- |
| B | a new run: failure | **blocked** |
| C | a new run: success. The failure is no longer listed | clean |
| D | the latest run edited to failure | **blocked** |
| E | the same run edited back to success | clean |
| F | a new run in progress, after a pass | **blocked** until it completed |
| G | **nothing**, on a later event | clean: the earlier pass stays valid |

**What this means:**

1. **The director's question: an earlier pass stays valid if a later event posts nothing (step G).** This is why the check now posts *in progress* before doing anything else (step F behaviour). A later event therefore replaces the earlier pass at once. Only if even that first write fails (after three tries) can an earlier pass still count. The job then fails visibly, and the release checklist (A2) requires the "Merge hold" result to be newer than the last label or description change.
2. **Lifting a hold works on the same commit (step C).** A later pass replaces an earlier failure, so removing DO NOT MERGE doesn't need a new commit.
3. **Lookalike workflow jobs can't hide a failure (test 1),** because each workflow run's own check counts separately and any failure blocks.
4. **A lookalike posted through the API could override the genuine result (step C).** The latest API-posted run with the name decides. So a pull request that adds its own workflow with `checks: write` and posts a passing "Merge hold" *after* the genuine failure could unblock itself. This is a **material risk** (see "Remaining risks").

**Restricting the source:** ruleset B requires "Merge hold" from **GitHub Actions only**. It appears as the source "GitHub Actions" in the ruleset form and as `integration_id` 15368 in the API; confirm the source when creating the ruleset. This rejects every other app, but it can't tell two workflows in this repository apart.

### Tests

| Test | Result |
| --- | --- |
| `npm test` | 81 of 81 pass: the 42 existing tests, plus 31 unit tests and 8 integration tests |
| Integration tests | The script runs as a separate process against a local fake GitHub API over real HTTP. Covered: pagination; the in-progress run posted first and then completed; an error after starting; the start failing; the token never printed |
| actionlint 1.7.12, with shellcheck 0.11.0 | 0 errors |
| zizmor 1.32.0 | No findings in `merge-hold.yml`; the `pull_request_target` warning was reviewed and annotated |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| GitHub enforcement tests (#5) | Results in the tables above |

## Remaining risks

1. **A lookalike posted through the API (material).** It needs a pull request that changes a workflow, and the genuine check fails every such pull request until the director has reviewed it at a named commit. The director's review must therefore look for any workflow that requests `checks: write` or posts a check named "Merge hold". The risk needs a deliberate act, similar in effort to disabling a ruleset. These options would reduce it further and need the director's decision:
   - **a. Automatic draft:** while a hold or an unapproved workflow change is present, the check also turns the pull request back into a draft. GitHub never merges a draft, for anyone. This needs `pull-requests: write`.
   - **b. Also require "Merge hold runner",** the job's own check, if the post-merge verification shows that it is reported on the pull request's head commit. Results from separate workflow runs can't override each other (test 1).
   - **c. A separate GitHub identity for sessions,** without the right to change workflows.
2. **The first write fails.** If GitHub refuses the in-progress post three times, an earlier pass can stay valid. The job fails visibly, and checklist A2 covers this case.
3. **One identity.** The director and every session act as `lucindha6`. Who may apply the label or write the approval record is a procedural control.
4. **An admin can always disable a ruleset.** With ruleset B, that is a deliberate, recorded change.
5. **Private repositories** (bookkeeping and portals) on GitHub Free: the check can only warn there.
6. **Unverified until after merging:** whether the job's own check, "Merge hold runner", appears on the pull request's head commit. Verification step 3a checks this.

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
   - 3a. On any pull request, record whether "Merge hold runner" appears on the pull request's head commit (this decides option b above).
4. **Hold test:** open a draft pull request with a one-line docs change, mark it ready, and add DO NOT MERGE. Expected: "Merge hold" fails and the merge button is blocked for the admin account. "Bypass rules" is not offered for this rule.
5. **Release test:** remove the label. Expected: "Merge hold" shows in progress, then passes, and the pull request is mergeable.
   - 5a. **Stale-pass test:** add DO NOT MERGE again. Expected: "Merge hold" turns in progress within seconds (the merge button is blocked) and then fails. Close the pull request without merging.
6. **Lookalike test (job):** on a draft-then-ready pull request, add a workflow whose job is named "Merge hold" and passes. Expected: the genuine check fails (unapproved workflow change) and the pull request is blocked. Close it. A lookalike posted through the API is known to override (test 2, step C), so it is handled by remaining risk 1, not by this test.
7. **Emergency test (optional):** set ruleset B to Disabled and confirm that 'Protect main' still applies unchanged. Then set it back to Active.
8. Export both rulesets again and compare with step 2. Record everything in the tracker (E-15).

**Rollback:** set ruleset B to Disabled, or delete it. 'Protect main' is never edited.

## Private repositories

ll-ai-bookkeeping-assistant and ll-portals are private on GitHub Free, where rulesets are not enforced. The check can be copied there as a visible warning only.
