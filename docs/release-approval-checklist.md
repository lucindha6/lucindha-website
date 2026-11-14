# Release approval checklist (draft)

**Status:** draft for the director's review. Linked to Development Tracker row **E-15** (merge-hold control): https://claude.ai/artifact/1xMJxm1PTswiCYPsGJuPRg

**Use it for:** every merge to `main` and every production deployment, in any Lucindha Lawson Ltd repository.

**It is separate from:** the regulatory Pre-launch checklist and the Master Document Register. It does not replace or change them.

The checklist has three parts, completed at different times:

| Part | When | Decides |
| --- | --- | --- |
| **A. Pre-merge approval** | Before merging | Whether this pull request may be merged |
| **B. Production deployment authorisation** | Before anything reaches production | Whether the merged change may go live. **A separate decision from A** |
| **C. Post-merge verification and rollback** | After merging | Whether the result is as expected. It is never needed to approve Part A |

Fill in one copy per release on the pull request. Write "Not applicable" with a reason rather than leaving a line blank.

---

## Part A. Pre-merge approval

### A1. Pull request and tested commit

| Item | Entry |
| --- | --- |
| Repository | |
| Pull request (number and link) | |
| Tested head commit (full SHA) | |
| Base branch commit at the time of testing | |
| Development Tracker row(s) | |

- [ ] The commit to be merged is exactly the tested head commit, and the merge will be locked to it (`expectedHeadSha`).
- [ ] There are no merge conflicts, and the branch is up to date where the ruleset requires it.
- [ ] The pull request is out of draft only after Part A is complete.

### A2. Required automated checks (on the tested head commit)

- [ ] Every check required by the repository rulesets has passed. List each one with its run link.
- [ ] "Merge hold" has passed, and its run was completed **after** the last label, description or commit change on the pull request. Compare the time on the check with the pull request's timeline, because GitHub keeps an earlier pass if a later event posted nothing.
- [ ] The latest "Merge hold" run was posted by the "Merge hold runner" job of the workflow on `main`, not by another workflow (open the check's details).
- [ ] Any other failing check is explained and accepted in writing by the director.
- [ ] `npm run check`, or the repository's equivalent, passes. The count of existing tests is unchanged or higher.

### A3. Merge holds

- [ ] There is **no** DO NOT MERGE label on the pull request.
- [ ] There is no open "Merge hold" notice in the description, or the notice records "Hold lifted by the director on [date]: [evidence]".
- [ ] No Development Tracker row records "MERGE HOLD:" for this repository or pull request, unless it has been lifted with evidence.
- [ ] If workflow or merge-hold files changed:
  - the director's written approval record is in the description, naming the **reviewed commit**, which equals the tested head commit, and the **tracker reference**;
  - only then was the label WORKFLOW CHANGE APPROVED applied;
  - the review looked for any workflow that requests `checks: write` or posts a check named "Merge hold".

| Open merge holds (pull request, tracker row, condition) | Lifted by / date / evidence |
| --- | --- |
| None, or list them | |

### A4. Accessibility verification

- [ ] Automated accessibility checks have passed (axe or equivalent, plus keyboard and title checks where the repository has them).
- [ ] The manual checks this change needs are complete and recorded on the pull request:
  - keyboard only
  - screen readers (VoiceOver, TalkBack, NVDA)
  - braille display, where required
  - 200 % and 400 % zoom
  - reflow at 320 px
  - the colour themes

  Give the tracker references, for example B-17 or D-11. An earlier merge is never accessibility sign-off.
- [ ] Every status has a written label. Nothing relies on audio or colour alone.
- [ ] Nothing describes the service as WCAG 2.2 AA compliant unless the manual checks are complete.

### A5. Security and dependency checks

- [ ] The dependency audit shows no high or critical issues, or each one is explained.
- [ ] The GitHub secret scan and the Netlify deploy-preview secret scan show no matches.
- [ ] There are no secrets, tokens or personal data in the change, its logs or its test output.
- [ ] Security headers and rules are unchanged, or the change is approved.
- [ ] Fictional data only, unless the director has approved otherwise in writing.
- [ ] For dependency updates, the compatibility evidence is recorded.

### A6. Director merge approval

| Item | Entry |
| --- | --- |
| Approval wording (quoted) | |
| Date and time | |
| Where it was given (conversation, pull request, tracker) | |
| Scope: this pull request and this commit SHA only | |
| Conditions attached, and evidence that each is met | |

- [ ] The approval names this pull request and commit, and covers nothing else.
- [ ] **This is merge approval only.** It does not authorise a production deployment (see Part B).

---

## Part B. Production deployment authorisation

Complete this before merging when a merge publishes automatically (for example, the website and bookkeeping), or before any later publish.

| Item | Entry |
| --- | --- |
| Does merging publish to production automatically? | Yes / No (for example, portals publishing is locked) |
| Production site and current deploy ID (before) | |
| Deployment authorisation wording (quoted), **separate from the merge approval in A6** | |
| Date, time and where it was given | |
| Deploy window and who checks the result | |

- [ ] The deployment authorisation is a separate written statement from the merge approval, with its own date and wording. A merge approval alone never authorises going live.
- [ ] If publishing is locked, the lock is confirmed immediately before merging, from the Netlify current deploy and its lock state.
- [ ] Environment variables, form settings, function regions and plans are unchanged, or each change is authorised separately (for example, ACK_MODE stays TEST, and CR-01 is separate).
- [ ] The rollback route is agreed, and the previous production deploy ID is recorded above.

---

## Part C. Post-merge verification and rollback

This part is filled in after merging. It records the outcome and is not a condition of the Part A approval.

- [ ] `main` is at the expected merge commit, and the checks on `main` passed.
- [ ] Production is as authorised in Part B: either unchanged (publishing locked, or the build cancelled), or the new deploy is ready, with its ID, commit and time recorded.
- [ ] A smoke test has been done where applicable: pages load, forms work, there are no console errors, and the noindex state is as expected.
- [ ] The Development Tracker has been updated with the evidence.
- [ ] **If something is wrong**, the director decides on a rollback:
  - restore the previous deploy in Netlify (Deploys → previous deploy → Publish), and/or
  - open a revert pull request, which goes through Part A again.

  Settings changes are reversed by their own recorded steps.

## Sign-off

| Part | Director | Date | Decision |
| --- | --- | --- | --- |
| A. Merge approval | Lucindha Lawson | | Approved / Not approved |
| B. Deployment authorisation | Lucindha Lawson | | Authorised / Not authorised / Not applicable |
| C. Post-merge verification | Recorded by | | Verified / Rolled back |

## Labels

| Label | Meaning | Who applies it |
| --- | --- | --- |
| DO NOT MERGE | A release hold. The "Merge hold" check fails while it is present | Anyone may add it; only the director removes it |
| WORKFLOW CHANGE APPROVED | The director has reviewed the workflow change at the commit named in her written record | Only the director, after writing the approval record |
