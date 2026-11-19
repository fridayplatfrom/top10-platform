// Isolated functional audit. Never connects to a deployed server or existing DB.
// Run: node test-publisher-lifecycle.js (port 3471 must be free).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const crypto = require('node:crypto');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'top10-publisher-'));
const dbPath = path.join(temp, 'seed.json');
const key = `lifecycle_${crypto.randomBytes(16).toString('hex')}`;
const base = 'http://127.0.0.1:3471';
fs.writeFileSync(dbPath, JSON.stringify({ categories: [], users: [], transactions: [], platformStats: {} }));
const server = spawn(process.execPath, ['server.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: '3471', DB_PATH: dbPath, PUBLISH_API_KEY: key,
    DB_USER: '', MYSQL_USER: '', DB_NAME: '', MYSQL_DATABASE: '',
    DB_PASSWORD: '', MYSQL_PASSWORD: '', ADMIN_PASSWORD: crypto.randomBytes(20).toString('hex') },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
server.stdout.on('data', b => { logs += b; });
server.stderr.on('data', b => { logs += b; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let failures = 0, passes = 0;
async function api(route, method = 'GET', body) {
  const response = await fetch(base + route, { method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${route}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function check(name, fn) {
  try { await fn(); passes++; console.log('PASS', name); }
  catch (error) { failures++; console.log('FAIL', name, '-', error.message); }
}
async function article(slug) {
  return (await api('/api/publish/articles')).articles.find(a => a.slug === slug);
}
(async () => {
  try {
    // Readiness is this child process's listen log, not an unrelated listener.
    for (let i = 0; i < 100 && !logs.includes('running at'); i++) {
      if (server.exitCode !== null) throw new Error(logs);
      await sleep(100);
    }
    if (!logs.includes('running at')) throw new Error('Server did not become ready: ' + logs);
    await api('/api/publish/categories', 'POST', { name: 'Lifecycle Topic', slug: 'lifecycle-topic' });
    const author = (await api('/api/publish/authors', 'POST', { name: 'Lifecycle Author', bio: 'Original biography', role: 'Reviewer' })).author;
    await api('/api/publish/article', 'POST', { title: 'Lifecycle original title', slug: 'lifecycle', status: 'draft', topic: 'lifecycle-topic', authorId: author.id, tags: ['#Example', 'example', 'Second'], products: ['One', 'Two'] });
    await check('draft, author, topic and tag normalization persist', async () => {
      const a = await article('lifecycle');
      assert.equal(a.status, 'draft'); assert.equal(a.authorId, author.id);
      assert.equal(a.topic, 'lifecycle-topic'); assert.deepEqual(a.tags, ['example', 'second']);
    });
    await check('title edit updates public-facing editorial headline', async () => {
      await api('/api/publish/article/lifecycle', 'PATCH', { title: 'Lifecycle revised title' });
      assert.equal((await article('lifecycle')).editorialTitle, 'Lifecycle revised title');
    });
    await check('author profile edit propagates to assigned articles', async () => {
      await api('/api/publish/authors', 'POST', { ...author, name: 'Lifecycle Renamed', bio: 'Revised biography' });
      const a = await article('lifecycle');
      assert.equal(a.authorName, 'Lifecycle Renamed'); assert.equal(a.authorBio, 'Revised biography');
    });
    await check('empty products array clears existing product selections', async () => {
      await api('/api/publish/article/lifecycle', 'PATCH', { products: [] });
      const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8')).categories.find(a => a.slug === 'lifecycle');
      assert.equal(raw.products.length, 0);
    });
    await check('schedule can be cleared while returning article to draft', async () => {
      await api('/api/publish/article/lifecycle', 'PATCH', { status: 'scheduled', scheduledAt: new Date(Date.now() + 3600000).toISOString() });
      await api('/api/publish/article/lifecycle', 'PATCH', { status: 'draft', scheduledAt: null });
      const a = await article('lifecycle'); assert.equal(a.status, 'draft'); assert.equal(a.scheduledAt, null);
    });
    await check('publish-now clears schedule and exposes published state', async () => {
      const a = (await api('/api/publish/article/lifecycle/publish-now', 'POST', {})).article;
      assert.equal(a.status, 'published'); assert.equal(a.scheduledAt, null);
      assert.ok(a.publishedAt);
    });
    await check('public taxonomy counts published article', async () => {
      const topics = (await api('/api/taxonomy/categories')).categories;
      assert.equal(topics.find(t => t.slug === 'lifecycle-topic').articlesCount, 1);
    });
    await check('tag deletion removes assigned tag', async () => {
      await api('/api/admin/tags/example', 'DELETE');
      assert.ok(!(await article('lifecycle')).tags.includes('example'));
    });
    await check('due schedule is promoted with intended publication date', async () => {
      const at = new Date(Date.now() + 1200).toISOString();
      await api('/api/publish/article', 'POST', { title: 'Due schedule', slug: 'lifecycle-due', status: 'scheduled', scheduledAt: at });
      await sleep(1300);
      await api('/api/admin/scheduler/run', 'POST', {});
      const a = await article('lifecycle-due'); assert.equal(a.status, 'published'); assert.equal(a.publishedAt, at);
    });
    await check('built-in taxonomy and author deletions return a conflict rather than pretending to delete', async () => {
      for (const route of ['/api/admin/taxonomy/categories/hardware', '/api/admin/authors/auth_bill_roberts']) {
        const res = await fetch(base + route, { method: 'DELETE', headers: { 'X-API-Key': key } });
        assert.equal(res.status, 409);
      }
      assert.ok((await api('/api/taxonomy/categories')).categories.some(t => t.slug === 'hardware'));
      assert.ok((await api('/api/authors')).authors.some(a => a.id === 'auth_bill_roberts'));
    });
    await check('custom article deletion is durable', async () => {
      await api('/api/publish/article/lifecycle', 'DELETE'); assert.equal(await article('lifecycle'), undefined);
    });
  } finally {
    if (server.exitCode === null) { const exit = once(server, 'exit'); server.kill('SIGTERM'); await exit; }
    fs.rmSync(temp, { recursive: true, force: true });
  }
  console.log(`Publisher lifecycle: ${passes} passed, ${failures} failed`);
  process.exitCode = failures ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
