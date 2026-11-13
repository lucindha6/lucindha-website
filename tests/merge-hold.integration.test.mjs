// Integration tests for the merge hold check (E-15): runs scripts/merge-hold.mjs as a
// separate process, exactly as the workflow does, against a local fake GitHub API on
// 127.0.0.1 with real HTTP, Link-header pagination and a real event file.
// Fictional data only; nothing leaves this computer.
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

let server;
let api;
let dir;
const state = { labels: [], files: [], status: 200, authHeaders: [] };

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'merge-hold-'));
  server = createServer((req, res) => {
    state.authHeaders.push(req.headers.authorization);
    const url = new URL(req.url, api);
    const pageNo = Number(url.searchParams.get('page') ?? 1);
    let list;
    if (url.pathname === `/repos/${REPO}/issues/5/labels`) list = state.labels.map((name) => ({ name }));
    else if (url.pathname === `/repos/${REPO}/pulls/5/files`) list = state.files.map((filename) => ({ filename }));
    if (!list || state.status !== 200) {
      res.writeHead(list ? state.status : 404, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    const size = 2; // small pages, so pagination is exercised
    const chunk = list.slice((pageNo - 1) * size, pageNo * size);
    const headers = { 'content-type': 'application/json' };
    if (pageNo * size < list.length) {
      const next = new URL(url);
      next.searchParams.set('page', String(pageNo + 1));
      headers.link = `<${next}>; rel="next"`;
    }
    res.writeHead(200, headers);
    res.end(JSON.stringify(chunk));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  api = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

async function check({ labels = [], files = ['site/index.html'], status = 200, args = [] } = {}) {
  Object.assign(state, { labels, files, status, authHeaders: [] });
  const eventPath = join(dir, 'event.json');
  const summaryPath = join(dir, `summary-${Math.random()}.md`);
  await writeFile(eventPath, JSON.stringify({ action: 'labeled', pull_request: { number: 5 } }));
  await writeFile(summaryPath, '');
  const child = spawn(process.execPath, [SCRIPT, ...args], {
    env: { PATH: process.env.PATH, GITHUB_TOKEN: TOKEN, GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: REPO, GITHUB_API_URL: api, GITHUB_STEP_SUMMARY: summaryPath },
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const code = await new Promise((resolve) => child.on('close', resolve));
  return { code, out, summary: await readFile(summaryPath, 'utf8'), auth: state.authHeaders };
}

test('integration: passes without a DO NOT MERGE label', async () => {
  const r = await check({ labels: ['documentation', 'dependencies', 'javascript'] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^PASS/);
  assert.match(r.summary, /Merge hold: PASS/);
});

test('integration: fails with a DO NOT MERGE label on a later page', async () => {
  const r = await check({ labels: ['a', 'b', 'c', 'DO NOT MERGE'] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^FAIL: Merge hold in place/);
});

test('integration: fails on an unapproved workflow change listed on a later page', async () => {
  const r = await check({ files: ['site/a.html', 'site/b.html', 'site/c.html', '.github/workflows/new.yml'] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /WORKFLOW CHANGE APPROVED/);
});

test('integration: passes a workflow change once approved', async () => {
  const r = await check({ labels: ['WORKFLOW CHANGE APPROVED'], files: ['.github/workflows/new.yml'] });
  assert.equal(r.code, 0, r.out);
});

test('integration: fails closed when the API errors', async () => {
  const r = await check({ status: 502 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /fails closed.*502/);
});

test('integration: token sent only as an Authorization header, never printed', async () => {
  const r = await check({ labels: ['DO NOT MERGE'] });
  assert.ok(r.auth.length > 0);
  assert.ok(r.auth.every((h) => h === `Bearer ${TOKEN}`));
  assert.equal(r.out.includes(TOKEN), false);
  assert.equal(r.summary.includes(TOKEN), false);
});
