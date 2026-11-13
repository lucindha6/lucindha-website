# Release approval checklist (draft)

**Status:** draft for the director's review. This checklist is linked to Development Tracker row **E-15** (merge-hold control): https://claude.ai/artifact/1xMJxm1PTswiCYPsGJuPRg

**Use it for:** every merge to `main` and every production deployment, in any Lucindha Lawson Ltd repository.

**It is separate from:** the regulatory Pre-launch checklist and the Master Document Register, which it does not replace or change.

Fill in one copy per release, as a comment or section on the pull request. A release is approved only when every applicable line is complete, the evidence is recorded and the director has signed it off. Write "Not applicable" with a reason rather than leaving a line blank.

---

## 1. Pull request and tested commit

| Item | Entry |
| --- | --- |
| Repository | |
| Pull request (number and link) | |
| Tested head commit (full SHA) | |
| Base branch and its commit at the time of testing | |
| Development Tracker row(s) | |
| Draft status | Must be "ready for review" only after this checklist is complete |

- [ ] The commit to be merged is exactly the tested head commit. The merge is locked to this SHA (`expectedHeadSha`), and there have been no pushes since testing.
- [ ] There are no merge conflicts, and the branch is up to date with `main` where the ruleset requires it.

## 2. Required automated checks

- [ ] Every check required by the repository ruleset has passed on the tested head commit (list each one with its result and run link).
- [ ] "Merge hold" has passed on the tested head commit.
- [ ] Any other checks that run on the pull request have passed, or a failure is explained and accepted in writing by the director.
- [ ] `npm run check` (or the repository's equivalent) passes, and the existing tests still pass (state the count).

## 3. Merge holds

- [ ] The pull request has **no** DO NOT MERGE label.
- [ ] The pull request description has no open "Merge hold" notice, or the notice records "Hold lifted by the director on [date]: [evidence]".
- [ ] No Development Tracker row records "MERGE HOLD:" for this repository or pull request, or the hold has been lifted with evidence.
- [ ] If workflow files changed, the director has reviewed them and added "WORKFLOW CHANGE APPROVED".

| Open merge holds (pull request, tracker row, condition) | Lifted by / date / evidence |
| --- | --- |
| None, or list them | |

## 4. Accessibility verification

- [ ] The automated accessibility checks passed (axe or equivalent, keyboard and title checks where the repository has them).
- [ ] The manual checks required for this change are complete and recorded on the pull request: keyboard only, screen readers (VoiceOver, TalkBack, NVDA), braille display where required, 200 % and 400 % zoom, reflow at 320 px, and the colour themes. Give the tracker references (for example B-17, D-11).
- [ ] Every status has a written label, and nothing relies on audio or colour alone.
- [ ] The portals and website are not described as WCAG 2.2 AA compliant unless the manual checks are complete.

An earlier merge is never accessibility sign-off.

## 5. Security and dependency checks

- [ ] The dependency audit shows no high or critical issues (`npm audit --audit-level=high`), or each one is explained.
- [ ] The secret scan (GitHub and Netlify deploy scan) shows no matches.
- [ ] No secrets, tokens or personal data are in the change, its logs or its test output.
- [ ] Security headers and rules (for example `netlify.toml` and `securityRules.test.ts`) are unchanged, or the change is approved.
- [ ] Fictional data only, unless the director has approved otherwise in writing.
- [ ] Dependabot or other dependency updates: compatibility evidence is recorded.

## 6. Director approval evidence

| Item | Entry |
| --- | --- |
| Approval wording (quoted) | |
| Date and time | |
| Where it was given (conversation, pull request comment, tracker) | |
| Conditions attached | |
| Scope (which pull request and SHA only) | |

- [ ] The approval names this pull request and does not extend to any other.
- [ ] Any conditions in the approval are met, with evidence.

## 7. Production deployment authorisation

- [ ] It is stated whether this merge publishes to production automatically (for example: bookkeeping and the website deploy on merge; portals publishing is locked).
- [ ] If it publishes, the director has separately authorised the production deployment.
- [ ] If publishing is locked, the lock is confirmed immediately before merging (Netlify current deploy and its lock state).
- [ ] Environment variables, form settings, function regions and plans are unchanged, or the change is approved separately (for example ACK_MODE stays TEST; CR-01 is separate).

## 8. After merging: verification and rollback

- [ ] `main` is at the expected merge commit, and the checks on `main` passed.
- [ ] Production is as expected: either unchanged (publishing locked, or the build was cancelled) or the new deploy is ready, with its ID, commit and time recorded.
- [ ] A smoke test of the live change was done, where applicable (pages load, forms work, no console errors).
- [ ] The Development Tracker has been updated with the evidence.
- [ ] **Rollback plan:** the previous production deploy ID is recorded, so it can be restored in Netlify (Deploys → previous deploy → Publish) with the director's approval. A revert pull request is prepared if the code must be undone. Data or settings changes have their own reversal steps.
- [ ] Rollback trigger: who decides (the director) and what would cause it.

## Sign-off

| Role | Name | Date | Decision |
| --- | --- | --- | --- |
| Director | Lucindha Lawson | | Approved / Not approved |
