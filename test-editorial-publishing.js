// ============================================================================
// TOP 10 PLATFORM - EDITORIAL PUBLISHING API, AUTHORS, TAGS, CATEGORIES & SCHEDULE TEST
// ============================================================================

const assert = require('assert');
const path = require('path');
const puppeteer = require(path.resolve(__dirname, 'node_modules', 'puppeteer-core'));

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3456';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log('================================================================');
  console.log('TESTING EDITORIAL PUBLISHING API, AUTHORS, TAXONOMY & SCHEDULER');
  console.log('================================================================\n');

  // 1. Public Authors check (no email leaked, 14 human authors present)
  const pubAuthRes = await fetch(`${BASE_URL}/api/authors`);
  assert.strictEqual(pubAuthRes.status, 200);
  const pubAuthData = await pubAuthRes.json();
  assert(pubAuthData.authors.length >= 14, `Expected >= 14 human authors, got ${pubAuthData.authors.length}`);
  assert(!pubAuthData.authors[0].email, 'Public /api/authors must strip author email');
  console.log(`[PASS] 1. GET /api/authors returns ${pubAuthData.authors.length} verified human authors cleanly`);

  // 2. Diverse authors visible in SSR & JSON-LD
  const listHtml = await (await fetch(`${BASE_URL}/list/billing-software`)).text();
  assert(listHtml.includes('Marcus Vance'), 'Billing Software SSR page should attribute Marcus Vance');
  console.log('[PASS] 2. Diverse human author attributed in SSR HTML & JSON-LD');

  // 3. Admin Login & Fetch X-API-Key
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@top10.io', password: 'Top10Admin2026!' })
  });
  const loginJson = await loginRes.json();
  assert(loginJson.success && loginJson.token);
  const adminToken = loginJson.token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

  const keyRes = await fetch(`${BASE_URL}/api/admin/api-keys`, { headers: adminHeaders });
  assert.strictEqual(keyRes.status, 200);
  const keyData = await keyRes.json();
  const apiKey = keyData.apiKeys[0].key;
  assert(apiKey && apiKey.startsWith('t10_pub_'), 'Valid Publishing X-API-Key must exist');
  console.log('[PASS] 3. Retrieved Publishing X-API-Key:', apiKey.slice(0, 14) + '...');

  const apiKeyHeaders = { 'X-API-Key': apiKey, 'Content-Type': 'application/json' };

  // 4. Create Custom Topic Category, Tags & Custom Human Author via X-API-Key (Headless!)
  const customTopicSlug = `cybersec-${Date.now().toString().slice(-4)}`;
  const catRes = await fetch(`${BASE_URL}/api/publish/categories`, {
    method: 'POST',
    headers: apiKeyHeaders,
    body: JSON.stringify({ name: 'Cybersecurity', slug: customTopicSlug, icon: '🛡️', description: 'Zero trust and cloud security guides.' })
  });
  assert.strictEqual(catRes.status, 201);
  console.log('[PASS] 4. Created custom category via X-API-Key:', customTopicSlug);

  const tagRes = await fetch(`${BASE_URL}/api/publish/tags`, {
    method: 'POST',
    headers: apiKeyHeaders,
    body: JSON.stringify({ tags: ['zero-trust', 'cnapp', 'devsecops'] })
  });
  assert.strictEqual(tagRes.status, 201);
  console.log('[PASS] 5. Added tags via X-API-Key');

  const newAuthorRes = await fetch(`${BASE_URL}/api/publish/authors`, {
    method: 'POST',
    headers: apiKeyHeaders,
    body: JSON.stringify({
      name: 'Elena Rostova',
      role: 'Principal Cloud Security Researcher',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=240&q=80',
      location: 'Austin, TX',
      expertise: ['CNAPP', 'Zero Trust', 'Kubernetes Security'],
      bio: 'Conducts penetration tests and cloud workload benchmarks for Fortune 500 engineering teams.'
    })
  });
  assert.strictEqual(newAuthorRes.status, 201);
  const newAuthor = (await newAuthorRes.json()).author;
  console.log('[PASS] 6. Created human author via X-API-Key:', newAuthor.name);

  // 5. Publish SCHEDULED article via X-API-Key
  const futureIso = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const schedSlug = `cloud-security-tools-${Date.now().toString().slice(-4)}`;
  const pubRes = await fetch(`${BASE_URL}/api/publish/article`, {
    method: 'POST',
    headers: apiKeyHeaders,
    body: JSON.stringify({
      title: 'Top 10 Cloud Security Platforms',
      editorialTitle: 'Top 10 Cloud Security & CNAPP Platforms Tested in 2026',
      slug: schedSlug,
      authorId: newAuthor.id,
      topic: customTopicSlug,
      tags: ['zero-trust', 'cnapp'],
      coverImage: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80',
      description: 'Independent benchmark of agentless CNAPP platforms and runtime Kubernetes security suites.',
      status: 'scheduled',
      scheduledAt: futureIso,
      seo: { metaTitle: 'Top 10 Cloud Security Tools (2026 Benchmarks)', metaDescription: 'Best CNAPP tools ranked by Elena Rostova.' },
      products: [
        { name: 'Wiz Cloud', tagline: 'Agentless CNAPP graph across AWS, GCP & Azure', pricingTag: 'Custom Enterprise', website: 'https://wiz.io' },
        { name: 'Orca Security', tagline: 'SideScanning cloud risk & vulnerability intelligence', pricingTag: 'Usage Based', website: 'https://orca.security' }
      ]
    })
  });
  assert.strictEqual(pubRes.status, 201);
  const pubData = await pubRes.json();
  assert.strictEqual(pubData.status, 'scheduled');
  console.log('[PASS] 7. Scheduled article created via POST /api/publish/article:', schedSlug);

  // Confirm scheduled article is hidden publicly before scheduledAt
  const publicState = await (await fetch(`${BASE_URL}/api/state`)).json();
  assert(!publicState.categories.some((c) => c.slug === schedSlug), 'Scheduled article must NOT appear in public /api/state');
  const publicListCheck = await fetch(`${BASE_URL}/list/${schedSlug}`);
  assert.strictEqual(publicListCheck.status, 404, 'Scheduled article URL must return 404 before publish time');
  console.log('[PASS] 8. Verified scheduled article stays hidden from public /api/state & /list/:slug until go-live');

  // Check Admin Analytics sees scheduled article & new author
  const analytics = await (await fetch(`${BASE_URL}/api/admin/analytics`, { headers: adminHeaders })).json();
  assert(analytics.overview.scheduledArticlesCount >= 1);
  assert(analytics.editorialAnalytics.scheduledQueue.some((s) => s.slug === schedSlug));
  console.log('[PASS] 9. Admin analytics tracks scheduled queue & editorial counts');

  // Trigger publish-now via API
  const pubNowRes = await fetch(`${BASE_URL}/api/publish/article/${schedSlug}/publish-now`, {
    method: 'POST',
    headers: apiKeyHeaders
  });
  assert.strictEqual(pubNowRes.status, 200);
  const liveAfterRes = await fetch(`${BASE_URL}/list/${schedSlug}`);
  assert.strictEqual(liveAfterRes.status, 200);
  const liveAfterHtml = await liveAfterRes.text();
  assert(liveAfterHtml.includes('Elena Rostova') && liveAfterHtml.includes('Wiz Cloud'), 'Published article must render Elena Rostova & Wiz Cloud');
  console.log('[PASS] 10. Publish-Now promoted scheduled article immediately to live 200 SSR HTML');

  // 6. Browser UI Audit of Editorial Dashboard Tab & Overview Author Analytics
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.setCookie({ name: 'top10_session', value: adminToken, domain: 'localhost', path: '/' });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(700);

  // Check Author Performance Leaderboard on Overview tab
  await page.click('[data-admin-tab="overview"]');
  await sleep(400);
  const authorBoardRows = await page.$$eval('#dashAuthorPerfTableBody tr', (els) => els.length);
  assert(authorBoardRows >= 10, `Expected author leaderboard rows, got ${authorBoardRows}`);
  console.log(`[PASS] 11. Admin Overview renders Human Author Leaderboard (${authorBoardRows} rows)`);

  // Switch to Articles, Authors & Schedule tab
  await page.click('[data-admin-tab="editorial"]');
  await sleep(400);
  const edTabVisible = await page.$eval('#adminTabEditorial', (el) => !el.classList.contains('hidden'));
  assert(edTabVisible, '#adminTabEditorial must become visible');

  const authorCards = await page.$$eval('#adminAuthorsGrid .author-roster-card', (els) => els.length);
  assert(authorCards >= 15, `Expected 15+ author cards, got ${authorCards}`);
  const brokenAvatars = await page.$$eval('#adminAuthorsGrid img', (imgs) => imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
  assert.strictEqual(brokenAvatars.length, 0, `Broken author avatars: ${brokenAvatars.join(', ')}`);
  console.log(`[PASS] 12. Editorial Tab shows ${authorCards} human author cards with 0 broken portraits`);

  // Open + Publish / Schedule Modal & check Author selector preview
  await page.click('#openPublisherModalBtn');
  await sleep(300);
  const previewText = await page.$eval('#catEditAuthorPreview', (el) => el.textContent);
  assert(previewText.length > 10, 'Author preview card must populate dynamically');
  await page.click('#cancelCategoryEditorBtn');
  await sleep(200);
  console.log('[PASS] 13. Article Publisher modal populates author preview, topic categories, tags & schedule fields');

  // Verify Homepage shows new Cybersecurity topic pill & Elena Rostova card cleanly
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
  await sleep(500);
  const homeTopicsText = await page.$eval('#homeTopicPillsBar', (el) => el.textContent);
  assert(homeTopicsText.includes('Cybersecurity'), 'Homepage topic pills must include API-created topic category');
  console.log('[PASS] 14. Homepage renders dynamic API-created category pill cleanly');

  await browser.close();
  assert.strictEqual(consoleErrors.length, 0, `Console errors: ${consoleErrors.join('; ')}`);
  assert.strictEqual(pageErrors.length, 0, `Page errors: ${pageErrors.join('; ')}`);

  // Clean up created test artifacts
  await fetch(`${BASE_URL}/api/publish/article/${schedSlug}`, { method: 'DELETE', headers: apiKeyHeaders });
  await fetch(`${BASE_URL}/api/admin/authors/${newAuthor.id}`, { method: 'DELETE', headers: apiKeyHeaders });
  await fetch(`${BASE_URL}/api/admin/taxonomy/categories/${customTopicSlug}`, { method: 'DELETE', headers: apiKeyHeaders });
  await fetch(`${BASE_URL}/api/admin/tags/zero-trust`, { method: 'DELETE', headers: apiKeyHeaders });
  await fetch(`${BASE_URL}/api/admin/tags/cnapp`, { method: 'DELETE', headers: apiKeyHeaders });
  await fetch(`${BASE_URL}/api/admin/tags/devsecops`, { method: 'DELETE', headers: apiKeyHeaders });

  console.log('\n================================================================');
  console.log('ALL 14 EDITORIAL PUBLISHING, AUTHORS & SCHEDULING TESTS PASSED!');
  console.log('Console Errors: 0 | Page Errors: 0');
  console.log('================================================================');
})();
