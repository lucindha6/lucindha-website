# Website protection: checks, lockfile and branch protection

Prepared 13 November 2026 for Lucindha's review. **Nothing here is switched on
until she approves it.**

## What this pull request adds

| File | What it does |
| --- | --- |
| `.github/workflows/checks.yml` | Runs the enquiry acknowledgement tests and a dependency audit on every pull request and every change to `main`. |
| `package-lock.json` | Records the exact version of every package the enquiry function uses, so each Netlify build installs the same code. |
| `docs/website-protection.md` | This page. |

It changes nothing in `site/` (the published pages) or in `netlify/` (the
function), and no Netlify setting.

## Branch protection: settings to apply by hand, after approval

The pull request cannot switch these on. After Lucindha approves, she applies
them herself in GitHub:

1. Open the repository, then **Settings**, then **Branches** (or **Rules**,
   then **Rulesets**).
2. Add a rule for the branch `main`:
   - **Require a pull request before merging**: on. Required approvals: 0
     (she is the only reviewer; GitHub does not let an author approve their
     own pull request).
   - **Require status checks to pass**: on. Choose the check named
     **Tests and dependency audit**. It appears in the list only after this
     workflow has run once.
   - **Require branches to be up to date before merging**: on.
   - **Block force pushes**: on.
   - **Restrict deletions**: on.
   - **Do not allow bypassing the above settings**: leave off, so she can
     still make an urgent fix as the owner (record any bypass).
3. Save.

To undo: delete the rule. Nothing else depends on it.

## Effect on day-to-day work

- Every change to the live site goes through a pull request. Netlify builds
  a free deploy preview for it (team login required), and the checks run.
- Merging still publishes straight away, exactly as today.
- Each production deploy still uses 15 Netlify credits; previews use none.

## Rollback

Revert this pull request's merge commit in a new pull request. The site and
the function do not depend on the workflow or the lockfile to run.
