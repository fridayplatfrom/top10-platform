// ============================================================================
// TOP 10 PLATFORM - COMPLETE DASHBOARD & CREATOR SUITE BROWSER AUDIT
// Tests: Executive Overview, Sales Analytics, Blog CRUD, List CRUD & Product Manager
// ============================================================================

const path = require('path');
const puppeteer = require(path.resolve(__dirname, 'node_modules', 'puppeteer-core'));

const CHROME_PATH = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/chromium');
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3456';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE_URL).hostname)) {
  throw new Error('Browser audits must target an isolated loopback server.');
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log('================================================================');
  console.log('LAUNCHING DASHBOARD & CREATOR SUITE AUDIT IN GOOGLE CHROME');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--window-size=1280,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const consoleErrors = [];
  const httpErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.error(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
    console.error(`[PAGE EXCEPTION] ${err.message}`);
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      httpErrors.push({ status: res.status(), url: res.url() });
      console.warn(`[HTTP ${res.status()}] ${res.url()}`);
    }
  });

  let totalTests = 0;
  let passedTests = 0;

  async function test(name, fn) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`[PASS] Dashboard Flow ${totalTests}: ${name}`);
    } catch (err) {
      console.error(`[FAIL] Dashboard Flow ${totalTests}: ${name}`);
      console.error(`       Details: ${err.message}`);
    }
  }

  // Authenticate Admin Session for Real Browser Testing
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@top10.io', password: process.env.TEST_ADMIN_PASSWORD || 'Top10Admin2026!' })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok || !loginData.token) throw new Error('Isolated audit admin login failed');
    if (loginData.token) {
      await page.setCookie({
        name: 'top10_session',
        value: loginData.token,
        domain: new URL(BASE_URL).hostname,
        path: '/'
      });
      await page.evaluateOnNewDocument((token) => {
        localStorage.setItem('top10_token', token);
      }, loginData.token);
    }
  } catch (err) {
    await browser.close();
    throw err;
  }

  // --------------------------------------------------------------------------
  // FLOW 1: Open Dashboard via Topbar Link & Check Hydration
  // --------------------------------------------------------------------------
  await test('Navigate to Dashboard from Topbar and verify Command Center hydration', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    const dashboardNavBtn = await page.$('#navAdminBtn');
    if (!dashboardNavBtn) throw new Error('#navAdminBtn not found in topbar');
    await dashboardNavBtn.click();
    await page.waitForFunction(() => window.location.pathname === '/admin');

    const heading = await page.$eval('.admin-title', (el) => el.textContent);
    if (!heading.includes('Dashboard') && !heading.includes('Command Center')) {
      throw new Error(`Unexpected dashboard title: ${heading}`);
    }

    const revKpi = await page.$eval('#adminKpiRevenue', (el) => el.textContent.trim());
    if (!revKpi.startsWith('$')) throw new Error(`Invalid revenue KPI: ${revKpi}`);

    const dirsKpi = await page.$eval('#adminKpiCategories', (el) => parseInt(el.textContent));
    if (isNaN(dirsKpi) || dirsKpi < 10) throw new Error(`Invalid active directories KPI: ${dirsKpi}`);
  });

  // --------------------------------------------------------------------------
  // FLOW 2: Platform Overview & Sales Analytics Tab
  // --------------------------------------------------------------------------
  await test('Platform Overview & Sales Revenue Analytics Tab & Live Stream', async () => {
    await page.click('[data-admin-tab="overview"]');
    await page.waitForSelector('#adminTabOverview:not(.hidden)', { timeout: 2000 });

    const heroRev = await page.$eval('#dashHeroTotalRevenue', (el) => el.textContent.trim());
    if (!heroRev.startsWith('$')) throw new Error(`Invalid hero revenue: ${heroRev}`);

    const launchesRev = await page.$eval('#dashRevLaunches', (el) => el.textContent.trim());
    const bidsRev = await page.$eval('#dashRevBids', (el) => el.textContent.trim());
    const mrrRev = await page.$eval('#dashRevMrr', (el) => el.textContent.trim());
    const leadsRev = await page.$eval('#dashRevLeads', (el) => el.textContent.trim());

    if (!launchesRev.startsWith('$') || !bidsRev.startsWith('$') || !mrrRev.startsWith('$') || !leadsRev.startsWith('$')) {
      throw new Error('One or more revenue stream card values are malformed');
    }

    // Check category performance breakdown table
    const perfRows = await page.$$eval('#dashCategoryPerfTableBody tr', (trs) => trs.length);
    if (perfRows === 0) throw new Error('Category performance table is empty');

    // Check live sales feed
    const feedHtml = await page.$eval('#dashSalesFeedContainer', (el) => el.innerHTML);
    if (!feedHtml) throw new Error('Live sales feed container is empty');
  });

  // --------------------------------------------------------------------------
  // FLOW 3: Review Moderation & Buyer RFP Leads Management Tabs
  // --------------------------------------------------------------------------
  await test('Review Moderation & Buyer RFP Leads Management Tabs', async () => {
    await page.click('[data-admin-tab="reviews"]');
    await page.waitForSelector('#adminTabReviews:not(.hidden)', { timeout: 2000 });

    const hasReviewsTable = await page.$('#adminReviewsTableBody');
    if (!hasReviewsTable) throw new Error('Reviews moderation table not found');

    await page.click('[data-admin-tab="leads"]');
    await page.waitForSelector('#adminTabLeads:not(.hidden)', { timeout: 2000 });

    const hasLeadsTable = await page.$('#adminLeadsTableBody');
    if (!hasLeadsTable) throw new Error('Buyer RFP leads table not found');
  });

  // --------------------------------------------------------------------------
  // FLOW 4: Directory & List Manager Tab & New Directory Creation
  // --------------------------------------------------------------------------
  await test('Directory & List Manager: Live Directory Creation & Edit Modal', async () => {
    await page.click('[data-admin-tab="categories"]');
    await page.waitForSelector('#adminTabCategories:not(.hidden)', { timeout: 2000 });

    // Open Create Directory Modal
    await page.click('#adminNewCategoryBtn');
    await page.waitForSelector('#categoryEditorModalBackdrop:not(.hidden)', { timeout: 2000 });

    const testCatSlug = `vector-search-${Date.now().toString().slice(-4)}`;
    const testCatTitle = `Top 10 Vector Search Engines ${Date.now().toString().slice(-4)}`;

    // Fill directory form
    await page.type('#catEditTitle', testCatTitle);
    await page.$eval('#catEditSlug', (el, s) => { el.value = s; }, testCatSlug);
    await page.type('#catEditIcon', '🔍');
    await page.type('#catEditTagline', 'High-throughput similarity search engines for AI and RAG architectures.');
    await page.type('#catEditDescription', 'Comprehensive benchmarks and verified directory for production vector databases.');

    // Save Directory
    await page.click('#saveCategoryEditorBtn');
    await sleep(600);

    const isCatModalClosed = await page.$eval('#categoryEditorModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isCatModalClosed) throw new Error('Category editor modal failed to close');

    // Verify directory appears in table
    const catTableText = await page.$eval('#adminCategoriesTableBody', (el) => el.textContent);
    if (!catTableText.includes(testCatTitle)) {
      throw new Error('New directory not found in categories table');
    }

    // Clean up test directory
    const delCatBtn = await page.$(`[data-del-cat="${testCatSlug}"]`);
    if (delCatBtn) {
      page.once('dialog', async (dialog) => await dialog.accept());
      await delCatBtn.click();
      await sleep(500);
    }
  });

  // --------------------------------------------------------------------------
  // FLOW 5: Product & Bid Master Controller Tab
  // --------------------------------------------------------------------------
  await test('Product & Bid Master Controller: Search Filter & Edit Modal', async () => {
    await page.click('[data-admin-tab="products"]');
    await page.waitForSelector('#adminTabProducts:not(.hidden)', { timeout: 2000 });

    // Test live search filter
    await page.type('#adminProductSearchInput', 'Stripe');
    await sleep(200);
    const filteredRows = await page.$$eval('#adminProductsTableBody tr', (trs) => trs.length);
    if (filteredRows === 0) throw new Error('Search for "Stripe" returned 0 rows');

    // Click Edit on the product
    const editBtn = await page.$('#adminProductsTableBody .admin-prod-edit-btn');
    if (!editBtn) throw new Error('Product edit button not found');
    await editBtn.click();
    await page.waitForSelector('#adminProductEditorModalBackdrop:not(.hidden)', { timeout: 2000 });

    const prodNameInput = await page.$eval('#adminProdEditName', (el) => el.value);
    if (!prodNameInput.toLowerCase().includes('stripe')) {
      throw new Error(`Expected prefilled product name Stripe, got ${prodNameInput}`);
    }

    // Dismiss modal
    await page.click('#cancelAdminProductEditorBtn');
    await sleep(200);
    const isProdModalClosed = await page.$eval('#adminProductEditorModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isProdModalClosed) throw new Error('Product editor modal failed to close');
  });

  // --------------------------------------------------------------------------
  // FLOW 6: Sales & Revenue Ledger Tab & Recurring Subscriptions
  // --------------------------------------------------------------------------
  await test('Sales & Revenue Ledger: Active PayPal Retainers (MRR) & Transaction Audit', async () => {
    await page.click('[data-admin-tab="transactions"]');
    await page.waitForSelector('#adminTabTransactions:not(.hidden)', { timeout: 2000 });

    const subRows = await page.$$eval('#adminSubscriptionsTableBody tr', (trs) => trs.length);
    if (subRows === 0) throw new Error('Subscriptions table failed to render rows');

    const txRows = await page.$$eval('#adminTransactionsTableBody tr', (trs) => trs.length);
    if (txRows === 0) throw new Error('Transactions audit table failed to render rows');
  });

  // Editorial browsing only: no publishing or scheduler actions.
  await test('Editorial dashboard filtering and search reset', async () => {
    await page.click('[data-admin-tab="editorial"]');
    await page.waitForSelector('#adminTabEditorial:not(.hidden)');
    const initial = await page.$eval('#adminEditorialTableBody', el => el.textContent);
    if (!initial.trim()) throw new Error('Editorial table did not hydrate');
    await page.type('#adminEditorialSearchInput', 'audit-no-match-782f');
    await page.waitForFunction(() => !document.querySelector('#adminEditorialTableBody .ed-edit-btn'));
    await page.$eval('#adminEditorialSearchInput', el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(expected => document.querySelector('#adminEditorialTableBody').textContent === expected, {}, initial);
    for (const status of ['draft', 'scheduled', 'published', 'all']) {
      await page.click(`[data-ed-filter="${status}"]`);
      const active = await page.$eval(`[data-ed-filter="${status}"]`, el => el.classList.contains('active'));
      if (!active) throw new Error(`Editorial filter ${status} did not activate`);
    }
  });

  // --------------------------------------------------------------------------
  // FLOW 7: Quick Action Buttons & Keyboard Accessibility
  // --------------------------------------------------------------------------
  await test('Quick Action Header Buttons & Escape Key Dismissal', async () => {
    // Test + New Directory header button
    await page.click('#adminHeaderNewCatBtn');
    await page.waitForSelector('#categoryEditorModalBackdrop:not(.hidden)', { timeout: 2000 });
    await page.keyboard.press('Escape');
    await sleep(200);
    let isHidden = await page.$eval('#categoryEditorModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isHidden) throw new Error('Escape key failed to close category editor modal');

    // Test Exit to Site button
    await page.click('#adminExitBtn');
    await page.waitForFunction(() => window.location.pathname === '/');
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`DASHBOARD AUDIT RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log(`TOTAL BROWSER CONSOLE ERRORS: ${consoleErrors.length}`);
  console.log(`TOTAL HTTP 4xx/5xx ERRORS: ${httpErrors.length}`);
  console.log('================================================================\n');

  try {
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 1000))]);
  } catch (err) {}

  if (passedTests === totalTests && consoleErrors.length === 0 && httpErrors.length === 0) {
    console.log('All covered dashboard flows passed; this is not production certification.');
    process.exit(0);
  } else {
    process.exit(1);
  }
})();
