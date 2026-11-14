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
  Object.assign(state, { labels: [], files: ['site/index.html'], body: '', head: HEAD, eventHead: HEAD, status: 200, postStatus: 201, authHeaders: [], writes: [], runs: {} }, overrides);
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
    const write = (handle) => {
      let data = '';
      req.on('data', (d) => (data += d));
      req.on('end', () => handle(JSON.parse(data)));
    };
    if (req.method === 'POST' && url.pathname === `/repos/${REPO}/check-runs`) {
      return write((body) => {
        state.writes.push({ method: 'POST', body });
        if (state.postStatus >= 300) return json(state.postStatus, {});
        const id = 900 + Object.keys(state.runs).length;
        state.runs[id] = { ...body };
        return json(201, { id });
      });
    }
    const patch = url.pathname.match(new RegExp(`^/repos/${REPO}/check-runs/(\\d+)$`));
    if (req.method === 'PATCH' && patch) {
      return write((body) => {
        state.writes.push({ method: 'PATCH', id: Number(patch[1]), body });
        Object.assign(state.runs[patch[1]], body);
        return json(200, {});
      });
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
  await writeFile(eventPath, JSON.stringify({ action: 'labeled', pull_request: { number: 5, head: { sha: state.eventHead } } }));
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
  const runs = Object.values(state.runs);
  return { code, out, summary: await readFile(summaryPath, 'utf8'), auth: state.authHeaders, writes: state.writes, runs };
}

const record = (commit) =>
  `Director workflow-change approval\n- Approved by: Lucindha Lawson (director)\n- Approval date: 2026-11-20\n- Reviewed commit: ${commit}\n- Tracker: E-15\n`;

test('integration: posts "Merge hold" in progress first, then completes it as a success', async () => {
  const r = await check({ labels: ['documentation', 'dependencies', 'javascript'] });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.writes.map((w) => w.method), ['POST', 'PATCH']);
  assert.deepEqual([r.writes[0].body.name, r.writes[0].body.head_sha, r.writes[0].body.status], ['Merge hold', HEAD, 'in_progress']);
  assert.equal(r.runs.length, 1);
  assert.deepEqual([r.runs[0].status, r.runs[0].conclusion], ['completed', 'success']);
});

test('integration: fails with a DO NOT MERGE label on a later page, and posts a failure', async () => {
  const r = await check({ labels: ['a', 'b', 'c', 'DO NOT MERGE'] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^FAIL: Merge hold in place/m);
  assert.deepEqual([r.runs[0].status, r.runs[0].conclusion], ['completed', 'failure']);
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

test('integration: an API error after starting completes "Merge hold" as a failure', async () => {
  const r = await check({ status: 502 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /fails closed.*502/);
  assert.deepEqual([r.runs[0].status, r.runs[0].conclusion], ['completed', 'failure']);
});

test('integration: if the in-progress run cannot be posted, nothing is read and the job fails visibly', async () => {
  const r = await check({ postStatus: 403 });
  assert.equal(r.code, 1, r.out);
  assert.equal(r.writes.filter((w) => w.method === 'POST').length, 3);
  assert.match(r.out, /earlier result on this commit may still count/);
});

test('integration: token sent only as an Authorization header, never printed', async () => {
  const r = await check({ labels: ['DO NOT MERGE'] });
  assert.ok(r.auth.length > 0);
  assert.ok(r.auth.every((h) => h === `Bearer ${TOKEN}`));
  assert.equal(r.out.includes(TOKEN), false);
  assert.equal(r.summary.includes(TOKEN), false);
  assert.equal(JSON.stringify(r.writes).includes(TOKEN), false);
});
