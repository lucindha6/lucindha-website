// Unit tests for scripts/merge-hold.mjs (E-15). Fictional data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, isHoldLabel, isProtectedPath, nextLink, fetchAllPages, parseApproval, run } from '../scripts/merge-hold.mjs';

const TOKEN = 'ghs_fictionalTokenForTestsOnly000000000000';
const API = 'https://api.example.com';
const HEAD = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

const approval = (commit = HEAD, extra = '') =>
  `Some description.\n\nDirector workflow-change approval\n- Approved by: Lucindha Lawson (director)\n- Approval date: 2026-11-20\n- Reviewed commit: \`${commit}\`\n- Tracker: E-15\n${extra}`;

function page(body, link) {
  return { ok: true, status: 200, json: async () => body, headers: { get: (h) => (h === 'link' ? link ?? null : null) } };
}

// A fake GitHub API: routes keyed by URL (GET), plus the check-runs POST.
function fakeApi(routes, calls = [], { postStatus = 201 } = {}) {
  return async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === 'POST') return { ok: postStatus < 300, status: postStatus, json: async () => ({}) };
    const route = routes[url];
    if (!route) return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };
    return route;
  };
}

function routesFor({ labels = [], files = ['site/index.html'], body = '', head = HEAD } = {}) {
  return {
    [`${API}/repos/example-owner/example-repo/pulls/7`]: page({ head: { sha: head }, body }),
    [`${API}/repos/example-owner/example-repo/issues/7/labels?per_page=100`]: page(labels.map((name) => ({ name }))),
    [`${API}/repos/example-owner/example-repo/pulls/7/files?per_page=100`]: page(files.map((filename) => ({ filename }))),
  };
}

function runWith({ routes = routesFor(), event = { pull_request: { number: 7 } }, env = {}, postStatus } = {}) {
  const lines = [];
  const summary = [];
  const calls = [];
  return run({
    env: {
      GITHUB_TOKEN: TOKEN,
      GITHUB_EVENT_PATH: '/fictional/event.json',
      GITHUB_REPOSITORY: 'example-owner/example-repo',
      GITHUB_API_URL: API,
      GITHUB_STEP_SUMMARY: '/fictional/summary.md',
      MERGE_HOLD_POST_CHECK: 'true',
      ...env,
    },
    fetchImpl: fakeApi(routes, calls, { postStatus }),
    readFileImpl: async () => JSON.stringify(event),
    appendFileImpl: async (_path, text) => summary.push(text),
    log: (line) => lines.push(line),
  }).then((code) => ({ code, lines, summary, calls, posts: calls.filter((c) => c.options.method === 'POST') }));
}

const W = ['.github/workflows/x.yml'];

test('no labels and an ordinary change: pass', () => {
  assert.equal(evaluate({ labels: [], files: ['site/index.html'], headSha: HEAD }).held, false);
});

test('DO NOT MERGE label: fail, whatever the files', () => {
  const result = evaluate({ labels: ['dependencies', 'DO NOT MERGE'], files: [], headSha: HEAD });
  assert.equal(result.held, true);
  assert.equal(result.reason, 'hold-label');
});

test('spelling variants of the hold label count', () => {
  for (const name of ['do not merge', 'do-not-merge', 'Do_Not_Merge', '  DO  NOT   MERGE ', 'do:not:merge']) {
    assert.equal(isHoldLabel(name), true, name);
  }
});

test('labels that only contain some of the words do not count', () => {
  for (const name of ['do not merge yet?', 'not merge', 'merge', 'DO NOT MERGE 2', '']) {
    assert.equal(isHoldLabel(name), false, name);
  }
});

test('protected paths', () => {
  for (const path of ['.github/workflows/checks.yml', '.github/workflows/new.yml', '.github/actions/x/action.yml', 'scripts/merge-hold.mjs']) {
    assert.equal(isProtectedPath(path), true, path);
  }
  for (const path of ['site/index.html', 'docs/merge-holds.md', 'tests/merge-hold.test.mjs', '.github/dependabot.yml']) {
    assert.equal(isProtectedPath(path), false, path);
  }
});

test('a workflow change without the label: fail', () => {
  const result = evaluate({ labels: [], files: ['.github/workflows/sneaky.yml'], body: approval(), headSha: HEAD });
  assert.equal(result.reason, 'workflow-change');
});

test('the label alone is not approval: fail without a written record', () => {
  const result = evaluate({ labels: ['WORKFLOW CHANGE APPROVED'], files: W, body: 'Looks fine.', headSha: HEAD });
  assert.equal(result.held, true);
  assert.equal(result.reason, 'approval-record');
});

test('label plus a complete record for the current head commit: pass', () => {
  assert.equal(evaluate({ labels: ['workflow-change-approved'], files: W, body: approval(), headSha: HEAD }).held, false);
});

test('a record for an earlier commit is stale: fail', () => {
  const result = evaluate({ labels: ['WORKFLOW CHANGE APPROVED'], files: W, body: approval(OTHER), headSha: HEAD });
  assert.equal(result.reason, 'approval-stale');
});

test('each missing or malformed field of the record fails', () => {
  const bad = [
    approval().replace('Director workflow-change approval', 'Approval'),
    approval().replace('Lucindha Lawson (director)', 'A session'),
    approval().replace('2026-11-20', '20 Nov'),
    approval().replace(`\`${HEAD}\``, 'abc1234'),
    approval().replace('E-15', 'tracker row'),
  ];
  for (const body of bad) {
    assert.equal(evaluate({ labels: ['WORKFLOW CHANGE APPROVED'], files: W, body, headSha: HEAD }).reason, 'approval-record', body);
  }
});

test('parseApproval reads the record', () => {
  const { record, missing } = parseApproval(approval());
  assert.deepEqual(missing, []);
  assert.equal(record.commit, HEAD);
  assert.equal(record.tracker, 'E-15');
});

test('approval never lifts a hold', () => {
  assert.equal(evaluate({ labels: ['WORKFLOW CHANGE APPROVED', 'DO NOT MERGE'], files: W, body: approval(), headSha: HEAD }).reason, 'hold-label');
});

test('missing data fails closed', () => {
  assert.equal(evaluate({ labels: undefined, files: [] }).held, true);
  assert.equal(evaluate({ labels: [], files: undefined }).held, true);
});

test('Link header parsing', () => {
  assert.equal(nextLink(`<${API}/a?page=2>; rel="next", <${API}/a?page=5>; rel="last"`), `${API}/a?page=2`);
  assert.equal(nextLink(`<${API}/a?page=1>; rel="prev"`), null);
  assert.equal(nextLink(null), null);
});

test('pagination: a hold label on page 3 of 3 is found', async () => {
  const base = `${API}/repos/example-owner/example-repo/issues/7/labels?per_page=100`;
  const many = (n, prefix) => Array.from({ length: n }, (_, i) => ({ name: `${prefix}-${i}` }));
  const routes = {
    ...routesFor(),
    [base]: page(many(100, 'a'), `<${base}&page=2>; rel="next"`),
    [`${base}&page=2`]: page(many(100, 'b'), `<${base}&page=3>; rel="next"`),
    [`${base}&page=3`]: page([{ name: 'DO NOT MERGE' }]),
  };
  const { code, calls } = await runWith({ routes });
  assert.equal(code, 1);
  assert.equal(calls.filter((c) => c.url.includes('/labels')).length, 3);
});

test('pagination: too many pages fails closed', async () => {
  const base = `${API}/list`;
  const routes = {};
  for (let i = 1; i <= 12; i += 1) routes[i === 1 ? base : `${base}?page=${i}`] = page([{ name: 'x' }], `<${base}?page=${i + 1}>; rel="next"`);
  await assert.rejects(fetchAllPages({ apiUrl: API, path: '/list', token: TOKEN, maxPages: 10, fetchImpl: fakeApi(routes) }), /More than 10 pages/);
});

test('pagination: a link to another address is refused, and the token is not sent there', async () => {
  const calls = [];
  const routes = { [`${API}/list`]: page([], '<https://evil.example.net/steal?page=2>; rel="next"') };
  await assert.rejects(fetchAllPages({ apiUrl: API, path: '/list', token: TOKEN, maxPages: 10, fetchImpl: fakeApi(routes, calls) }), /another address/);
  assert.equal(calls.some((c) => c.url.startsWith('https://evil.')), false);
});

test('pagination: a workflow file on page 2 of the file list is found', async () => {
  const base = `${API}/repos/example-owner/example-repo/pulls/7/files?per_page=100`;
  const routes = {
    ...routesFor(),
    [base]: page(Array.from({ length: 100 }, (_, i) => ({ filename: `site/p${i}.html` })), `<${base}&page=2>; rel="next"`),
    [`${base}&page=2`]: page([{ filename: '.github/workflows/late.yml' }]),
  };
  const { code, lines } = await runWith({ routes });
  assert.equal(code, 1);
  assert.match(lines.join(''), /late\.yml/);
});

test('a renamed workflow file is caught by its previous name', async () => {
  const routes = routesFor();
  routes[`${API}/repos/example-owner/example-repo/pulls/7/files?per_page=100`] = page([
    { filename: 'old/disabled.yml', previous_filename: '.github/workflows/merge-hold.yml' },
  ]);
  assert.equal((await runWith({ routes })).code, 1);
});

test('run: pass posts a success "Merge hold" check run on the current head commit', async () => {
  const { code, posts, summary } = await runWith();
  assert.equal(code, 0);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, `${API}/repos/example-owner/example-repo/check-runs`);
  const sent = JSON.parse(posts[0].options.body);
  assert.equal(sent.name, 'Merge hold');
  assert.equal(sent.head_sha, HEAD);
  assert.equal(sent.conclusion, 'success');
  assert.match(summary.join(''), /Merge hold: PASS/);
});

test('run: a hold posts a failure check run and exits 1', async () => {
  const { code, posts, lines } = await runWith({ routes: routesFor({ labels: ['DO NOT MERGE'] }) });
  assert.equal(code, 1);
  assert.equal(JSON.parse(posts[0].options.body).conclusion, 'failure');
  assert.match(lines.join('\n'), /^FAIL: Merge hold in place/);
});

test('run: an approved workflow change at the reviewed commit passes', async () => {
  const { code } = await runWith({ routes: routesFor({ labels: ['WORKFLOW CHANGE APPROVED'], files: W, body: approval() }) });
  assert.equal(code, 0);
});

test('run: a push after approval (new head commit) fails', async () => {
  const { code, lines } = await runWith({ routes: routesFor({ labels: ['WORKFLOW CHANGE APPROVED'], files: W, body: approval(), head: OTHER }) });
  assert.equal(code, 1);
  assert.match(lines.join(''), /fresh approval/);
});

test('run: if the check run cannot be posted, the job fails', async () => {
  const { code, lines } = await runWith({ postStatus: 403 });
  assert.equal(code, 1);
  assert.match(lines.join('\n'), /Posting the check run failed with status 403/);
});

test('run: API refusal, missing token or non-PR event fail closed and post nothing', async () => {
  for (const options of [{ routes: {} }, { env: { GITHUB_TOKEN: '' } }, { event: { push: {} } }, { env: { GITHUB_REPOSITORY: '../../x' } }]) {
    const { code } = await runWith(options);
    assert.equal(code, 1);
  }
});

test('the token is never printed, in the log or the summary', async () => {
  for (const options of [{}, { routes: routesFor({ labels: ['DO NOT MERGE'] }) }, { routes: {} }, { postStatus: 500 }]) {
    const { lines, summary } = await runWith(options);
    assert.equal(lines.join('\n').includes(TOKEN), false);
    assert.equal(summary.join('').includes(TOKEN), false);
  }
});
