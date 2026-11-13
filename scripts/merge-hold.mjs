// Merge hold check (Development Tracker E-15).
//
// The check fails while:
//   1. the pull request has a "DO NOT MERGE" label (a recorded release hold), or
//   2. the pull request changes a workflow or this check's own files, unless the
//      director has added the label "WORKFLOW CHANGE APPROVED".
//
// Safety properties:
// - It is run by .github/workflows/merge-hold.yml on pull_request_target, so the
//   workflow and this script always come from main, never from the pull request.
//   No code from the pull request is checked out or run.
// - It reads the CURRENT labels and changed files from the GitHub API, following
//   every page, so re-running an old run cannot pass on stale or partial data.
// - It fails closed: any error, unexpected response or too many pages fails it.
// - The token is sent only to the GitHub API address it was given (pagination
//   links to any other address are refused) and is never printed.

import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const HOLD_LABEL = 'DO NOT MERGE';
export const WORKFLOW_APPROVAL_LABEL = 'WORKFLOW CHANGE APPROVED';
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

export function evaluate({ labels, files, onlyHoldLabel = false }) {
  if (!Array.isArray(labels) || (!onlyHoldLabel && !Array.isArray(files))) {
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
  if (!onlyHoldLabel) {
    const touched = files.filter(isProtectedPath);
    if (touched.length > 0 && !labels.some((name) => sameLabel(name, WORKFLOW_APPROVAL_LABEL))) {
      return {
        held: true,
        reason: 'workflow-change',
        message: `This pull request changes workflow or merge-hold files (${touched.slice(0, 5).join(', ')}${touched.length > 5 ? ', …' : ''}). The director must review it and add the label "${WORKFLOW_APPROVAL_LABEL}".`,
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

// Reads every page of a GitHub list endpoint. Refuses to follow a link to another address.
export async function fetchAllPages({ apiUrl, path, token, maxPages, fetchImpl = fetch }) {
  const origin = new URL(apiUrl).origin;
  let url = `${apiUrl}${path}`;
  const items = [];
  for (let page = 1; url; page += 1) {
    if (page > maxPages) throw new Error(`More than ${maxPages} pages; the check fails closed.`);
    if (new URL(url).origin !== origin) throw new Error('A pagination link pointed to another address; the check fails closed.');
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`GitHub API returned status ${response.status}.`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error('GitHub API returned an unexpected list.');
    items.push(...body);
    url = nextLink(response.headers?.get?.('link'));
  }
  return items;
}

export async function run({
  env = process.env,
  argv = process.argv.slice(2),
  fetchImpl = fetch,
  readFileImpl = readFile,
  appendFileImpl = appendFile,
  log = console.log,
} = {}) {
  // --only-hold-label is used ONLY by the temporary demonstration workflow on the
  // draft pull request. The enforced workflow comes from main and never passes it.
  const onlyHoldLabel = argv.includes('--only-hold-label');
  let result;
  try {
    if (!env.GITHUB_TOKEN) throw new Error('No GitHub token was provided to the check.');
    const repository = env.GITHUB_REPOSITORY ?? '';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Repository name is missing or invalid.');
    const event = JSON.parse(await readFileImpl(env.GITHUB_EVENT_PATH, 'utf8'));
    const number = event?.pull_request?.number;
    if (!Number.isInteger(number) || number < 1) throw new Error('This event has no pull request.');
    const common = { apiUrl: env.GITHUB_API_URL || 'https://api.github.com', token: env.GITHUB_TOKEN, fetchImpl };
    const labels = (
      await fetchAllPages({ ...common, path: `/repos/${repository}/issues/${number}/labels?per_page=100`, maxPages: MAX_LABEL_PAGES })
    ).map((label) => label?.name);
    let files;
    if (!onlyHoldLabel) {
      const list = await fetchAllPages({ ...common, path: `/repos/${repository}/pulls/${number}/files?per_page=100`, maxPages: MAX_FILE_PAGES });
      if (list.length >= 3000) throw new Error('The pull request lists 3,000 files or more, so not every file can be checked.');
      files = list.flatMap((file) => [file?.filename, file?.previous_filename].filter(Boolean));
    }
    result = evaluate({ labels, files, onlyHoldLabel });
  } catch (error) {
    result = { held: true, reason: 'error', message: `The check could not run, so it fails closed. ${error.message}` };
  }
  const status = result.held ? 'FAIL' : 'PASS';
  const scope = onlyHoldLabel ? ' (demonstration: hold label only)' : '';
  log(`${status}${scope}: ${result.message}`);
  if (env.GITHUB_STEP_SUMMARY) {
    await appendFileImpl(env.GITHUB_STEP_SUMMARY, `### Merge hold${scope}: ${status}\n\n${result.message}\n`);
  }
  return result.held ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await run();
}
