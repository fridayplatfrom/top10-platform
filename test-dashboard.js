// ============================================================================
// TOP 10 PLATFORM - COMPLETE DASHBOARD & CREATOR SUITE BROWSER AUDIT
// Tests: Executive Overview, Sales Analytics, Blog CRUD, List CRUD & Product Manager
// ============================================================================

const path = require('path');
const puppeteer = require(path.resolve(__dirname, 'node_modules', 'puppeteer-core'));

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3456';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log('================================================================');
  console.log('LAUNCHING DASHBOARD & CREATOR SUITE AUDIT IN GOOGLE CHROME');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
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

  // --------------------------------------------------------------------------
  // FLOW 1: Open Dashboard via Topbar Link & Check Hydration
  // --------------------------------------------------------------------------
  await test('Navigate to Dashboard from Topbar and verify Command Center hydration', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

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
  // FLOW 3: Blog & Editorial Manager Tab & Live Publication Lifecycle
  // --------------------------------------------------------------------------
  await test('Blog & Editorial Manager: Table, Write Modal, Live Markdown Preview & Publish', async () => {
    await page.click('[data-admin-tab="blogs"]');
    await page.waitForSelector('#adminTabBlogs:not(.hidden)', { timeout: 2000 });

    const articleRows = await page.$$eval('#adminBlogsTableBody tr', (trs) => trs.length);
    if (articleRows === 0) throw new Error('Blogs table failed to render published articles');

    // Click + Write New Article
    await page.click('#adminNewBlogBtn');
    await page.waitForSelector('#blogEditorModalBackdrop:not(.hidden)', { timeout: 2000 });

    // Fill blog editor form
    await page.type('#blogEditTitle', 'Vector Search Engine Benchmarks 2026');
    await page.type('#blogEditSubtitle', 'Comprehensive speed and recall benchmarks across modern HNSW vector indexes.');
    await page.type('#blogEditAuthorName', 'Alex Rivera');
    await page.type('#blogEditTakeaways', 'HNSW graph indexing delivers sub-5ms recall\nQuantization drops RAM footprint by 65%');
    await page.type('#blogEditContent', '## Vector Search in 2026\n\nVector databases are now standard infrastructure for AI search applications.');

    // Test live preview tab
    await page.click('#blogTabPreviewBtn');
    await sleep(200);
    const previewContent = await page.$eval('#blogPreviewPane', (el) => el.innerHTML);
    if (!previewContent.includes('<h2>Vector Search in 2026</h2>')) {
      throw new Error(`Markdown preview failed: ${previewContent}`);
    }

    // Switch back to Write mode and submit
    await page.click('#blogTabWriteBtn');
    await page.click('#saveBlogEditorBtn');
    await sleep(600);

    const isBlogModalClosed = await page.$eval('#blogEditorModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isBlogModalClosed) throw new Error('Blog editor modal failed to close');

    // Verify new article row in blogs table
    const updatedTableText = await page.$eval('#adminBlogsTableBody', (el) => el.textContent);
    if (!updatedTableText.includes('Vector Search Engine Benchmarks 2026')) {
      throw new Error('Newly created blog article not found in blogs table');
    }

    // Clean up test article
    const delBtn = await page.$('[data-del-blog="vector-search-engine-benchmarks-2026"]');
    if (delBtn) {
      page.once('dialog', async (dialog) => await dialog.accept());
      await delBtn.click();
      await sleep(500);
    }
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

    // Test + Write Article header button
    await page.click('#adminHeaderNewBlogBtn');
    await page.waitForSelector('#blogEditorModalBackdrop:not(.hidden)', { timeout: 2000 });
    await page.keyboard.press('Escape');
    await sleep(200);
    isHidden = await page.$eval('#blogEditorModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isHidden) throw new Error('Escape key failed to close blog editor modal');

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

  await browser.close();

  if (passedTests === totalTests && consoleErrors.length === 0) {
    console.log('100% DASHBOARD SUCCESS: COMPLETE DASHBOARD IS PRODUCTION-READY!');
    process.exit(0);
  } else {
    process.exit(1);
  }
})();
