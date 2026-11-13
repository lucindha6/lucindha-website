// Integration tests for the merge hold check (E-15): runs scripts/merge-hold.mjs as a
// separate process, exactly as the workflow does, against a local fake GitHub API on
// 127.0.0.1 with real HTTP, Link-header pagination, a real event file and the
// Checks API POST. Fictional data only; nothing leaves this computer.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'merge-hold.mjs');
const TOKEN = 'ghs_fictionalIntegrationToken1111111111111';
const REPO = 'example-owner/example-repo';
const HEAD = 'c'.repeat(40);

let server;
let api;
let dir;
const state = {};

function reset(overrides) {
  Object.assign(state, { labels: [], files: ['site/index.html'], body: '', head: HEAD, status: 200, postStatus: 201, authHeaders: [], posted: [] }, overrides);
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'merge-hold-'));
  server = createServer((req, res) => {
    state.authHeaders.push(req.headers.authorization);
    const url = new URL(req.url, api);
    const json = (code, value, headers = {}) => {
      res.writeHead(code, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(value));
    };
    if (req.method === 'POST' && url.pathname === `/repos/${REPO}/check-runs`) {
      let data = '';
      req.on('data', (d) => (data += d));
      req.on('end', () => {
        state.posted.push(JSON.parse(data));
        json(state.postStatus, {});
      });
      return;
    }
    if (state.status !== 200) return json(state.status, {});
    if (url.pathname === `/repos/${REPO}/pulls/5`) return json(200, { head: { sha: state.head }, body: state.body });
    let list;
    if (url.pathname === `/repos/${REPO}/issues/5/labels`) list = state.labels.map((name) => ({ name }));
    else if (url.pathname === `/repos/${REPO}/pulls/5/files`) list = state.files.map((filename) => ({ filename }));
    if (!list) return json(404, {});
    const size = 2; // small pages, so pagination is exercised
    const pageNo = Number(url.searchParams.get('page') ?? 1);
    const headers = {};
    if (pageNo * size < list.length) {
      const next = new URL(url);
      next.searchParams.set('page', String(pageNo + 1));
      headers.link = `<${next}>; rel="next"`;
    }
    return json(200, list.slice((pageNo - 1) * size, pageNo * size), headers);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  api = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

async function check(overrides = {}) {
  reset(overrides);
  const eventPath = join(dir, 'event.json');
  const summaryPath = join(dir, `summary-${Math.random()}.md`);
  await writeFile(eventPath, JSON.stringify({ action: 'labeled', pull_request: { number: 5 } }));
  await writeFile(summaryPath, '');
  const child = spawn(process.execPath, [SCRIPT], {
    env: {
      PATH: process.env.PATH,
      GITHUB_TOKEN: TOKEN,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: REPO,
      GITHUB_API_URL: api,
      GITHUB_STEP_SUMMARY: summaryPath,
      MERGE_HOLD_POST_CHECK: 'true',
    },
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const code = await new Promise((resolve) => child.on('close', resolve));
  return { code, out, summary: await readFile(summaryPath, 'utf8'), auth: state.authHeaders, posted: state.posted };
}

const record = (commit) =>
  `Director workflow-change approval\n- Approved by: Lucindha Lawson (director)\n- Approval date: 2026-11-20\n- Reviewed commit: ${commit}\n- Tracker: E-15\n`;

test('integration: passes without a DO NOT MERGE label, and posts a success check run on the head commit', async () => {
  const r = await check({ labels: ['documentation', 'dependencies', 'javascript'] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^PASS/);
  assert.equal(r.posted.length, 1);
  assert.deepEqual([r.posted[0].name, r.posted[0].head_sha, r.posted[0].conclusion], ['Merge hold', HEAD, 'success']);
});

test('integration: fails with a DO NOT MERGE label on a later page, and posts a failure', async () => {
  const r = await check({ labels: ['a', 'b', 'c', 'DO NOT MERGE'] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^FAIL: Merge hold in place/);
  assert.equal(r.posted[0].conclusion, 'failure');
});

test('integration: an unapproved workflow change on a later page fails', async () => {
  const r = await check({ files: ['site/a.html', 'site/b.html', 'site/c.html', '.github/workflows/new.yml'] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /WORKFLOW CHANGE APPROVED/);
});

test('integration: the label without the written record fails', async () => {
  const r = await check({ labels: ['WORKFLOW CHANGE APPROVED'], files: ['.github/workflows/new.yml'], body: 'approved' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /approval record is incomplete/);
});

test('integration: label and record for the current head commit pass; a later push fails', async () => {
  const ok = await check({ labels: ['WORKFLOW CHANGE APPROVED'], files: ['.github/workflows/new.yml'], body: record(HEAD) });
  assert.equal(ok.code, 0, ok.out);
  const stale = await check({ labels: ['WORKFLOW CHANGE APPROVED'], files: ['.github/workflows/new.yml'], body: record(HEAD), head: 'd'.repeat(40) });
  assert.equal(stale.code, 1, stale.out);
});

test('integration: fails closed when the API errors, and posts nothing it has not checked', async () => {
  const r = await check({ status: 502 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /fails closed.*502/);
  assert.equal(r.posted.length, 0);
});

test('integration: token sent only as an Authorization header, never printed', async () => {
  const r = await check({ labels: ['DO NOT MERGE'] });
  assert.ok(r.auth.length > 0);
  assert.ok(r.auth.every((h) => h === `Bearer ${TOKEN}`));
  assert.equal(r.out.includes(TOKEN), false);
  assert.equal(r.summary.includes(TOKEN), false);
  assert.equal(JSON.stringify(r.posted).includes(TOKEN), false);
});
