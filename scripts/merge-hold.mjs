// Merge hold check (Development Tracker E-15).
//
// The check fails while:
//   1. the pull request has a "DO NOT MERGE" label (a recorded release hold), or
//   2. the pull request changes a workflow or this check's own files, unless BOTH
//      - the label "WORKFLOW CHANGE APPROVED" is present, and
//      - the description holds a written director approval record naming the
//        reviewed commit, which must be the pull request's current head commit,
//        and a Development Tracker reference.
//      A new push changes the head commit, so it needs a fresh approval.
//      An approval never lifts a DO NOT MERGE hold.
//
// The verdict is posted as the check run "Merge hold" on the pull request's
// current head commit (Checks API), so it is always attached to the commit a
// ruleset evaluates, whatever commit the workflow itself ran on.
//
// Safety properties:
// - It is run by .github/workflows/merge-hold.yml on pull_request_target, so the
//   workflow and this script always come from main, never from the pull request.
//   No code from the pull request is checked out or run. The description is read
//   as data by this script and never passed to a shell.
// - It reads the CURRENT labels, description, head commit and changed files from
//   the GitHub API, following every page, so a re-run cannot pass on stale data.
// - It fails closed: any error, unexpected response or too many pages fails it.
// - The token is sent only to the GitHub API address it was given (pagination
//   links to any other address are refused) and is never printed.

import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const HOLD_LABEL = 'DO NOT MERGE';
export const WORKFLOW_APPROVAL_LABEL = 'WORKFLOW CHANGE APPROVED';
export const CHECK_NAME = 'Merge hold';
export const MAX_LABEL_PAGES = 10; // 1,000 labels
export const MAX_FILE_PAGES = 30; // 3,000 files, the most the GitHub API will list

// Files whose change could weaken or imitate this check.
export function isProtectedPath(path) {
  const p = String(path ?? '');
  return p.startsWith('.github/workflows/') || p.startsWith('.github/actions/') || p === 'scripts/merge-hold.mjs';
}

// "DO NOT MERGE", "do-not-merge", "Do_Not_Merge" and "do not  merge" are the same label.
export function normaliseLabel(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[-_:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const sameLabel = (a, b) => normaliseLabel(a) === normaliseLabel(b);
export const isHoldLabel = (name) => sameLabel(name, HOLD_LABEL);

// The written approval record the director adds to the pull request description:
//
//   Director workflow-change approval
//   - Approved by: Lucindha Lawson (director)
//   - Approval date: 2026-11-20
//   - Reviewed commit: <full 40-character commit SHA>
//   - Tracker: E-15
//
// Returns the parsed record, or a list of what is missing.
export function parseApproval(body) {
  const text = String(body ?? '');
  const field = (name) => {
    const match = text.match(new RegExp(`^[ \\t]*[-*]?[ \\t]*${name}:[ \\t]*\`?([^\`\\r\\n]+?)\`?[ \\t]*$`, 'im'));
    return match ? match[1].trim() : null;
  };
  const record = {
    heading: /^[ \t#*]*Director workflow-change approval\b/im.test(text),
    approvedBy: field('Approved by'),
    date: field('Approval date'),
    commit: field('Reviewed commit'),
    tracker: field('Tracker'),
  };
  const missing = [];
  if (!record.heading) missing.push('the heading "Director workflow-change approval"');
  if (!record.approvedBy || !/\bdirector\b/i.test(record.approvedBy)) missing.push('"Approved by:" naming the director');
  if (!record.date || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || Number.isNaN(Date.parse(record.date))) missing.push('"Approval date:" as YYYY-MM-DD');
  if (!record.commit || !/^[0-9a-f]{40}$/.test(record.commit)) missing.push('"Reviewed commit:" as a full 40-character SHA');
  if (!record.tracker || !/^[A-Z]-\d{2}$/.test(record.tracker)) missing.push('"Tracker:" as a row ID such as E-15');
  return { record, missing };
}

export function evaluate({ labels, files, body, headSha }) {
  if (!Array.isArray(labels) || !Array.isArray(files)) {
    return { held: true, reason: 'error', message: 'The labels or changed files could not be read, so the check fails closed.' };
  }
  const hold = labels.find(isHoldLabel);
  if (hold !== undefined) {
    return {
      held: true,
      reason: 'hold-label',
      message: `Merge hold in place: this pull request has the label "${hold}". Only the director removes it, once the conditions recorded in the Development Tracker are met.`,
    };
  }
  const touched = files.filter(isProtectedPath);
  if (touched.length > 0) {
    const list = `${touched.slice(0, 5).join(', ')}${touched.length > 5 ? ', …' : ''}`;
    if (!labels.some((name) => sameLabel(name, WORKFLOW_APPROVAL_LABEL))) {
      return {
        held: true,
        reason: 'workflow-change',
        message: `This pull request changes workflow or merge-hold files (${list}). It needs the director's written approval record and the label "${WORKFLOW_APPROVAL_LABEL}".`,
      };
    }
    const { record, missing } = parseApproval(body);
    if (missing.length > 0) {
      return {
        held: true,
        reason: 'approval-record',
        message: `The label "${WORKFLOW_APPROVAL_LABEL}" is present, but the written approval record is incomplete: missing ${missing.join('; ')}.`,
      };
    }
    if (!/^[0-9a-f]{40}$/.test(String(headSha ?? '')) || record.commit !== headSha) {
      return {
        held: true,
        reason: 'approval-stale',
        message: `The approval record names commit ${record.commit.slice(0, 7)}, but the pull request is now at ${String(headSha ?? 'unknown').slice(0, 7)}. Changes since the review need a fresh approval.`,
      };
    }
  }
  return { held: false, reason: 'none', message: 'No merge hold: no DO NOT MERGE label, and no unapproved workflow change.' };
}

export function nextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of String(linkHeader).split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (match && match[2].split(/\s+/).includes('next')) return match[1];
  }
  return null;
}

function headers(token) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  };
}

function sameOrigin(url, apiUrl) {
  if (new URL(url).origin !== new URL(apiUrl).origin) throw new Error('A link pointed to another address; the check fails closed.');
}

export async function fetchJson({ apiUrl, path, token, fetchImpl = fetch }) {
  const url = `${apiUrl}${path}`;
  sameOrigin(url, apiUrl);
  const response = await fetchImpl(url, { headers: headers(token) });
  if (!response.ok) throw new Error(`GitHub API returned status ${response.status}.`);
  return response.json();
}

// Reads every page of a GitHub list endpoint. Refuses to follow a link to another address.
export async function fetchAllPages({ apiUrl, path, token, maxPages, fetchImpl = fetch }) {
  let url = `${apiUrl}${path}`;
  const items = [];
  for (let page = 1; url; page += 1) {
    if (page > maxPages) throw new Error(`More than ${maxPages} pages; the check fails closed.`);
    sameOrigin(url, apiUrl);
    const response = await fetchImpl(url, { headers: headers(token) });
    if (!response.ok) throw new Error(`GitHub API returned status ${response.status}.`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error('GitHub API returned an unexpected list.');
    items.push(...body);
    url = nextLink(response.headers?.get?.('link'));
  }
  return items;
}

// Posts the verdict as the check run "Merge hold" on the given commit.
export async function postCheckRun({ apiUrl, repository, token, headSha, result, fetchImpl = fetch }) {
  const url = `${apiUrl}/repos/${repository}/check-runs`;
  sameOrigin(url, apiUrl);
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { ...headers(token), 'content-type': 'application/json' },
    body: JSON.stringify({
      name: CHECK_NAME,
      head_sha: headSha,
      status: 'completed',
      conclusion: result.held ? 'failure' : 'success',
      output: { title: result.held ? 'Merge hold: FAIL' : 'Merge hold: PASS', summary: result.message },
    }),
  });
  if (!response.ok) throw new Error(`Posting the check run failed with status ${response.status}.`);
}

export async function run({
  env = process.env,
  fetchImpl = fetch,
  readFileImpl = readFile,
  appendFileImpl = appendFile,
  log = console.log,
} = {}) {
  let result;
  let headSha;
  let common;
  let repository;
  try {
    if (!env.GITHUB_TOKEN) throw new Error('No GitHub token was provided to the check.');
    repository = env.GITHUB_REPOSITORY ?? '';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Repository name is missing or invalid.');
    const event = JSON.parse(await readFileImpl(env.GITHUB_EVENT_PATH, 'utf8'));
    const number = event?.pull_request?.number;
    if (!Number.isInteger(number) || number < 1) throw new Error('This event has no pull request.');
    common = { apiUrl: env.GITHUB_API_URL || 'https://api.github.com', token: env.GITHUB_TOKEN, fetchImpl };
    const pull = await fetchJson({ ...common, path: `/repos/${repository}/pulls/${number}` });
    headSha = pull?.head?.sha;
    if (!/^[0-9a-f]{40}$/.test(String(headSha ?? ''))) throw new Error('The pull request head commit could not be read.');
    const labels = (
      await fetchAllPages({ ...common, path: `/repos/${repository}/issues/${number}/labels?per_page=100`, maxPages: MAX_LABEL_PAGES })
    ).map((label) => label?.name);
    const list = await fetchAllPages({ ...common, path: `/repos/${repository}/pulls/${number}/files?per_page=100`, maxPages: MAX_FILE_PAGES });
    if (list.length >= 3000) throw new Error('The pull request lists 3,000 files or more, so not every file can be checked.');
    const files = list.flatMap((file) => [file?.filename, file?.previous_filename].filter(Boolean));
    result = evaluate({ labels, files, body: pull?.body, headSha });
  } catch (error) {
    result = { held: true, reason: 'error', message: `The check could not run, so it fails closed. ${error.message}` };
  }
  const status = result.held ? 'FAIL' : 'PASS';
  log(`${status}: ${result.message}`);
  if (env.GITHUB_STEP_SUMMARY) {
    await appendFileImpl(env.GITHUB_STEP_SUMMARY, `### Merge hold: ${status}\n\n${result.message}\n`);
  }
  let exitCode = result.held ? 1 : 0;
  if (env.MERGE_HOLD_POST_CHECK === 'true') {
    if (!headSha || !common) {
      log('FAIL: no head commit is known, so no "Merge hold" check run was posted. A required check stays missing, which blocks merging.');
      exitCode = 1;
    } else {
      try {
        await postCheckRun({ ...common, repository, headSha, result });
        log(`Posted check run "${CHECK_NAME}" (${status}) on ${headSha.slice(0, 7)}.`);
      } catch (error) {
        log(`FAIL: ${error.message} A required check stays missing, which blocks merging.`);
        exitCode = 1;
      }
    }
  }
  return exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await run();
}
