# Merge holds (Development Tracker E-15)

**Status:** draft for the director's review. Nothing is enforced yet: no ruleset, required check, label or permission has been created or changed.

**Related:** [release approval checklist](release-approval-checklist.md). Development Tracker row E-15: https://claude.ai/artifact/1xMJxm1PTswiCYPsGJuPRg

## Why

On 13 November 2026, Bookkeeping #23 and Portals #1 were merged while the Development Tracker recorded a hold on them. The hold existed only in the tracker. Neither the pull requests nor their merge messages showed it, and nothing checked the tracker at merge time.

## The rule

A release hold is recorded in all three places below. Only the director lifts it, and she lifts it in all three.

| Place | How a hold is recorded | How it is lifted |
| --- | --- | --- |
| The pull request | The label **DO NOT MERGE**, plus this notice at the top of the description: "**Merge hold:** [reason]. Conditions to lift: [conditions]. Tracker row: [ID]." | The director removes the label and adds "Hold lifted by the director on [date]: [evidence]" |
| Development Tracker | The row's "Depends on / blocker" column starts "MERGE HOLD:" and states the conditions | The approval and its evidence are recorded in the Evidence column |
| Release approval checklist | Section 3 lists every open hold | It is checked at every release approval |

Before merging, any session checks the label, the notice and the tracker, and stops if any of them shows a hold.

## The automatic check

`.github/workflows/merge-hold.yml` runs `scripts/merge-hold.mjs` and reports the check **Merge hold**. It fails while either of these is true:

1. A **DO NOT MERGE** label is present. Spelling variants also count, such as `do-not-merge` and `Do_Not_Merge`.
2. The pull request changes a file under `.github/workflows/`, a file under `.github/actions/`, or `scripts/merge-hold.mjs`, and the director has not added the label **WORKFLOW CHANGE APPROVED**. Renamed files are checked under their old names too. An approval never lifts a hold.

### Protection against an untrusted pull request

- **The check can't be changed by the pull request it checks.** The workflow uses `pull_request_target`, so GitHub runs the workflow file and the script from `main`. A pull request can't edit its own check or switch it off.
- **No pull request code is run.** The workflow checks out the base commit only. Nothing from the pull request (title, body or branch name) is placed in a shell command.
- **Minimal access.** The token is read-only (`contents`, `issues` and `pull-requests`: read). No secrets are used, and `persist-credentials: false` is set.
- **The token stays with GitHub.** It is sent only to the GitHub API address. A pagination link to any other address is refused, and the token is never printed. Both points are tested.
- **Lookalike checks.** A pull request could add its own workflow that reports a passing check also called "Merge hold". Part 2 of the check fails any such pull request until the director has reviewed it. Whether GitHub prefers the failing or the passing run when two runs share a name has not been tested; that needs a deliberate test on a draft pull request, with the director's approval. Until then, any change to workflow files needs the director's review.

### Reliable reading

- **Current data.** The check reads the *current* labels and changed files from the API, not the event, so re-running an old run can't pass on stale labels.
- **Every page.** It follows every page of the label list (up to 1,000 labels) and of the changed-files list (up to 3,000 files, the most GitHub will list).
- **Fails closed.** Any error, unexpected reply, too many pages, or a list of 3,000 files or more makes the check fail.

### Tests

| Test | Result on `main` 04691ce plus this pull request |
| --- | --- |
| Website test suite (`npm test`) | 68 of 68 pass: the 42 existing tests, 20 new unit tests and 6 new integration tests |
| Integration tests | The script runs as a separate process against a local fake GitHub API over real HTTP, with Link-header pagination and a real event file. Covered: pass, fail with the hold label on a later page, workflow change, approved workflow change, API error, and the token never printed |
| actionlint 1.7.12 (with shellcheck 0.11.0) | 0 errors in all three workflow files |
| zizmor 1.32.0 (workflow security audit) | No findings in the merge-hold workflows. The `pull_request_target` warning was reviewed and annotated. One existing low-confidence note on `checks.yml` (`persist-credentials`) is unchanged and outside this pull request |
| `npm audit --audit-level=high` | 0 vulnerabilities |

### Live demonstration on this draft pull request

The enforced workflow runs from `main`, so it can't run on the pull request that first adds it. The temporary `merge-hold-demonstration.yml` runs this pull request's own script on a plain `pull_request` event. It checks the hold label only and has a different name, so it can never stand in for "Merge hold". **It must be deleted before the pull request is marked ready for review.**

## Administrator bypass: the two approaches compared

**Today:** the website ruleset 'Protect main' (id 27231153) requires a pull request and the check "Tests and dependency audit". It blocks deletion and force pushes. Repository admins may bypass it, for pull requests only. Every session and the director act as `lucindha6`, which is an admin account.

| | **A. Add "Merge hold" to 'Protect main'** | **B. A separate ruleset "Merge hold" (recommended)** |
| --- | --- | --- |
| Change | Add a required check to the existing ruleset. To stop bypass, remove the admin bypass from the whole ruleset | A new ruleset for `main`, with one rule: the "Merge hold" check is required, from GitHub Actions only. It has **no bypass list**. 'Protect main' is not touched |
| Can an admin merge past a hold with the merge button? | Yes, while the bypass stays. If the bypass is removed: no | **No.** Bypass is granted per ruleset, so the bypass on 'Protect main' doesn't apply to the new ruleset |
| Existing emergency recovery (admin bypass of 'Protect main') | **Lost for every rule** if the bypass is removed. A broken test check would then block all merges | **Kept** for the pull request rule and the test check. Only the hold check can't be bypassed |
| Direct pushes to `main` | No change (already blocked by the pull request rule) | No change |
| If GitHub Actions is down, or the hold check itself breaks | With the bypass removed, nothing can merge until it is fixed | Merges wait for the hold check. Break-glass: the director sets the "Merge hold" ruleset to Disabled, merges, then sets it back to Active. This is a deliberate settings change that is recorded in the ruleset history and the audit log |
| Number of settings changed | One ruleset changed (and loosened back if a rollback is ever needed) | One new ruleset; the existing one is unchanged |
| Rollback | Re-add the bypass | Set the new ruleset to Disabled, or delete it |

**What neither approach can do:** GitHub can't tell a routine session from the director, because both act as the admin account `lucindha6`. An admin can always edit or disable a ruleset. B turns "merging past a hold" into "deliberately disabling a ruleset", which is visible and recorded, and which session rules forbid. To make it technically impossible for a session, sessions would need their own GitHub identity without admin rights, so that only the director's own sign-in can change rulesets. That is an option for later, with the director's approval.

**Private repositories:** ll-ai-bookkeeping-assistant and ll-portals are private on GitHub Free, where rulesets are not enforced. There the check is a visible warning only, unless the account plan changes. That would be a purchase and needs approval.

**Recommendation:** B. It meets the final policy (no routine merge past an active hold) and leaves the existing emergency arrangement unchanged.

## Rollout (each step needs the director's approval)

1. ✅ Draft pull request with these files (approved 13 Nov 2026).
2. Delete the demonstration workflow, mark the pull request ready, approve it, and merge it, so "Merge hold" exists on `main`. A check must have run before a ruleset can require it.
3. Create the labels DO NOT MERGE and WORKFLOW CHANGE APPROVED.
4. Create ruleset B. Test it on a draft pull request: it should fail with the label and pass without it, and the merge button should be blocked while the check fails.
5. Copy the workflow and tests to bookkeeping and portals as visible warnings.

No existing protection is removed at any step.
