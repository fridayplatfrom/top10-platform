const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

const slug = 'release-smoke-' + randomBytes(5).toString('hex');
const password = randomBytes(32).toString('hex');
const key = randomBytes(32).toString('hex');
const temp = mkdtempSync(join(tmpdir(), 'top10-release-'));
const fixture = join(temp, 'state.json');

function environment() {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^(DB_|MYSQL_|ADMIN_|EDITORIAL_PUBLISH_KEY|PUBLISH_API_KEY|BASE_URL)/.test(name)) delete env[name];
  }
  if (process.env.TOP10_TEST_DB_NAME) {
    assert.match(process.env.TOP10_TEST_DB_NAME, /^top10_test_[a-z0-9_]+$/);
    return {
      ...env, NODE_ENV: 'production',
      DB_HOST: process.env.TOP10_TEST_DB_HOST || '127.0.0.1',
      DB_PORT: process.env.TOP10_TEST_DB_PORT || '3306',
      DB_USER: process.env.TOP10_TEST_DB_USER,
      DB_PASSWORD: process.env.TOP10_TEST_DB_PASSWORD || '',
      DB_NAME: process.env.TOP10_TEST_DB_NAME
    };
  }
  return { ...env, NODE_ENV: 'test', DB_PATH: fixture };
}

async function start() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...environment(), PORT: '0', ADMIN_PASSWORD: password, EDITORIAL_PUBLISH_KEY: key },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server did not start')), 10000);
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
      child.once('error', err => { clearTimeout(timer); reject(err); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/running at http:\/\/localhost:(\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    return { child, base: 'http://127.0.0.1:' + port };
  } catch (error) {
    child.kill();
    throw error;
  }
}

async function stop(server) {
  if (server && server.child.exitCode === null && !server.child.signalCode) {
    const exited = once(server.child, 'exit');
    server.child.kill();
    await exited;
  }
}

function api(server, path, { method = 'GET', body, cookie, publishing = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  if (publishing) headers['x-api-key'] = key;
  return fetch(server.base + path, { method, headers, body: JSON.stringify(body), redirect: 'manual' });
}

test('blog launch routes, editor sessions and durable publishing', async () => {
  let server;
  let second;
  try {
    server = await start();
    assert.equal((await api(server, '/api/health')).status, 200);
    for (const [method, path] of [
      ['GET', '/api/founder/portal-data'],
      ['POST', '/api/paypal/create-order'],
      ['POST', '/api/lists/create-paid'],
      ['POST', '/api/categories/billing-software/bid'],
      ['POST', '/api/claim/send-code'],
      ['POST', '/api/leads/submit'],
      ['GET', '/pricing']
    ]) {
      assert.equal((await api(server, path, { method })).status, 404, path);
    }

    const adminPage = await api(server, '/admin');
    assert.equal(adminPage.headers.get('cache-control'), 'no-store');
    const adminHtml = await adminPage.text();
    const editorScript = adminHtml.match(/<script src="(\/app\.js\?v=[a-f0-9]{16})">/)?.[1];
    assert.ok(editorScript, 'admin page must load a versioned editor script');
    const editorBundle = await api(server, editorScript);
    assert.equal(editorBundle.status, 200);
    assert.match(await editorBundle.text(), /articleMarkdown: catEditArticleMarkdown\.value/);
    assert.match(await (await api(server, '/')).text(), /<script src="\/app\.js">/);

    const archive = await api(server, '/blog');
    assert.equal(archive.status, 200);
    const archiveHtml = await archive.text();
    assert.match(archiveHtml, /Top 10 buying guides/);
    assert.match(archiveHtml, /guide-index-feature-image[\s\S]*?<img[^>]+src=/);
    const guides = await (await api(server, '/api/blog')).json();
    assert.ok(guides.length > 0);
    const guide = await api(server, '/blog/' + guides[0].slug);
    assert.equal(guide.status, 302);
    assert.equal(guide.headers.get('location'), guides[0].url);
    assert.equal((await api(server, '/blog/unknown-guide')).status, 404);

    const login = await api(server, '/api/auth/login', {
      method: 'POST', body: { email: 'admin@top10.io', password }
    });
    assert.equal(login.status, 200);
    const cookieHeader = login.headers.get('set-cookie');
    assert.match(cookieHeader, /HttpOnly; SameSite=Strict/);
    if (process.env.TOP10_TEST_DB_NAME) assert.match(cookieHeader, /; Secure/);
    const cookie = cookieHeader.split(';')[0];
    assert.equal((await (await api(server, '/api/auth/me', { cookie })).json()).user.role, 'admin');
    const created = await api(server, '/api/admin/categories', {
      method: 'POST', cookie,
      body: {
        slug, title: 'Top 10 Smoke Test', status: 'draft', summary: 'Temporary test guide.', products: [],
        articleMarkdown: '## Buyer notes\n\n| Plan | Price |\n|---|---|\n| India | ₹199 |\n\n<script>articleScript()</script>\n\n[Unsafe](javascript:alert(1))'
      }
    });
    assert.ok(created.ok);
    assert.match((await created.json()).category.articleMarkdown, /Buyer notes/);
    assert.equal((await api(server, '/list/' + slug)).status, 404);

    const published = await api(server, '/api/publish/article/' + slug + '/publish-now', { method: 'POST', cookie });
    assert.ok(published.ok);
    second = await start();
    await stop(server);
    server = second;
    second = null;
    const article = await api(server, '/list/' + slug);
    assert.equal(article.status, 200);
    const html = await article.text();
    assert.match(html, /<h2 id="article-buyer-notes">Buyer notes<\/h2>/);
    assert.match(html, /<td>₹199<\/td>/);
    assert.match(html, /&lt;script&gt;articleScript\(\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /href="javascript:|<script>articleScript/);
    assert.equal((await (await api(server, '/api/auth/me', { cookie })).json()).user.role, 'admin');
    assert.equal((await api(server, '/api/auth/logout', { method: 'POST', cookie })).status, 200);
    assert.equal((await (await api(server, '/api/auth/me', { cookie })).json()).user, null);
    assert.equal((await api(server, '/api/publish/article/' + slug, { method: 'DELETE', publishing: true })).status, 200);
    assert.equal((await api(server, '/list/' + slug)).status, 404);
  } finally {
    if (server) await api(server, '/api/publish/article/' + slug, { method: 'DELETE', publishing: true }).catch(() => {});
    await stop(server);
    await stop(second);
    rmSync(temp, { recursive: true, force: true });
  }
});
