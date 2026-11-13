// Unit tests for scripts/merge-hold.mjs (E-15). Fictional data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, isHoldLabel, isProtectedPath, nextLink, fetchAllPages, run } from '../scripts/merge-hold.mjs';

const TOKEN = 'ghs_fictionalTokenForTestsOnly000000000000';
const API = 'https://api.example.com';

function page(body, link) {
  return { ok: true, status: 200, json: async () => body, headers: { get: (h) => (h === 'link' ? link ?? null : null) } };
}

// A fake GitHub API: routes keyed by URL.
function fakeApi(routes, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    const route = routes[url];
    if (!route) return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };
    return route;
  };
}

function routesFor({ labels = [], files = ['site/index.html'] } = {}) {
  return {
    [`${API}/repos/example-owner/example-repo/issues/7/labels?per_page=100`]: page(labels.map((name) => ({ name }))),
    [`${API}/repos/example-owner/example-repo/pulls/7/files?per_page=100`]: page(files.map((filename) => ({ filename }))),
  };
}

function runWith({ routes = routesFor(), argv = [], event = { pull_request: { number: 7 } }, env = {} } = {}) {
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
      ...env,
    },
    argv,
    fetchImpl: fakeApi(routes, calls),
    readFileImpl: async () => JSON.stringify(event),
    appendFileImpl: async (_path, text) => summary.push(text),
    log: (line) => lines.push(line),
  }).then((code) => ({ code, lines, summary, calls }));
}

test('no labels and an ordinary change: pass', () => {
  assert.equal(evaluate({ labels: [], files: ['site/index.html'] }).held, false);
});

test('DO NOT MERGE label: fail, whatever the files', () => {
  const result = evaluate({ labels: ['dependencies', 'DO NOT MERGE'], files: [] });
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

test('a workflow change without approval: fail', () => {
  const result = evaluate({ labels: [], files: ['.github/workflows/sneaky.yml'] });
  assert.equal(result.held, true);
  assert.equal(result.reason, 'workflow-change');
});

test('a workflow change with WORKFLOW CHANGE APPROVED: pass', () => {
  assert.equal(evaluate({ labels: ['workflow-change-approved'], files: ['.github/workflows/x.yml'] }).held, false);
});

test('approval does not lift a hold', () => {
  assert.equal(evaluate({ labels: ['WORKFLOW CHANGE APPROVED', 'DO NOT MERGE'], files: ['.github/workflows/x.yml'] }).held, true);
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

test('run: pass without a hold label (exit 0)', async () => {
  const { code, lines, summary } = await runWith();
  assert.equal(code, 0);
  assert.match(lines.join(''), /^PASS/);
  assert.match(summary.join(''), /Merge hold: PASS/);
});

test('run: fail with a hold label (exit 1)', async () => {
  const { code, lines } = await runWith({ routes: routesFor({ labels: ['DO NOT MERGE'] }) });
  assert.equal(code, 1);
  assert.match(lines.join(''), /^FAIL: Merge hold in place/);
});

test('run: --only-hold-label skips the file list', async () => {
  const { code, calls, lines } = await runWith({ routes: routesFor({ files: ['.github/workflows/x.yml'] }), argv: ['--only-hold-label'] });
  assert.equal(code, 0);
  assert.equal(calls.some((c) => c.url.includes('/files')), false);
  assert.match(lines.join(''), /demonstration/);
});

test('run: API refusal, missing token or non-PR event fail closed', async () => {
  assert.equal((await runWith({ routes: {} })).code, 1);
  assert.equal((await runWith({ env: { GITHUB_TOKEN: '' } })).code, 1);
  assert.equal((await runWith({ event: { push: {} } })).code, 1);
  assert.equal((await runWith({ env: { GITHUB_REPOSITORY: '../../x' } })).code, 1);
});

test('the token is never printed, in the log or the summary', async () => {
  for (const options of [{}, { routes: routesFor({ labels: ['DO NOT MERGE'] }) }, { routes: {} }]) {
    const { lines, summary } = await runWith(options);
    assert.equal(lines.join('\n').includes(TOKEN), false);
    assert.equal(summary.join('').includes(TOKEN), false);
  }
});
