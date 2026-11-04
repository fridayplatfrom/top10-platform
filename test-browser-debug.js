// ============================================================================
// TOP 10 PLATFORM - REAL CHROME BROWSER DEBUGGER & AUTOMATION SUITE
// Tests UI rendering, console errors, user clicks, modals, SPA routes & mobile
// ============================================================================

const path = require('path');
const puppeteer = require(path.resolve(__dirname, 'node_modules', 'puppeteer-core'));

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3456';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log('================================================================');
  console.log('LAUNCHING GOOGLE CHROME FOR REAL-TIME BROWSER DEBUGGING');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const consoleLogs = [];
  const consoleErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    consoleLogs.push({ type, text });
    if (type === 'error') {
      consoleErrors.push(text);
      console.error(`[BROWSER CONSOLE ERROR] ${text}`);
    }
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      console.warn(`[BROWSER HTTP ${res.status()}] ${res.url()}`);
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
    console.error(`[BROWSER UNHANDLED EXCEPTION] ${err.message}`);
  });

  page.on('requestfailed', (req) => {
    failedRequests.push({ url: req.url(), failure: req.failure() });
    console.warn(`[BROWSER FAILED REQUEST] ${req.url()} (${req.failure()?.errorText || 'Unknown'})`);
  });

  let totalBrowserTests = 0;
  let passedBrowserTests = 0;

  async function step(description, fn) {
    totalBrowserTests++;
    try {
      await fn();
      passedBrowserTests++;
      console.log(`[PASS] ${description}`);
    } catch (err) {
      console.error(`[FAIL] ${description}`);
      console.error(`       Details: ${err.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST STEP 1: HOMEPAGE INITIAL HYDRATION
  // --------------------------------------------------------------------------
  await step('1. Load Homepage (/) and check hydration & title', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
    const title = await page.title();
    if (!title.includes('Top 10')) throw new Error(`Unexpected page title: "${title}"`);

    const categoriesCount = await page.$$eval('.home-list-card', (cards) => cards.length);
    if (categoriesCount < 10) throw new Error(`Expected at least 10 category cards, found ${categoriesCount}`);
  });

  // --------------------------------------------------------------------------
  // TEST STEP 2: HOMEPAGE SEARCH & LIVE DROPDOWN
  // --------------------------------------------------------------------------
  await step('2. Type in Homepage search bar and verify live results', async () => {
    await page.type('#homeBigSearchInput', 'billing');
    await page.waitForSelector('#homeLiveSearchDropdown:not(.hidden)', { timeout: 3000 });

    const resultsCount = await page.$$eval('#homeLiveSearchDropdown .lsd-item', (items) => items.length);
    if (resultsCount === 0) throw new Error('Live search returned 0 items for "billing"');

    // Clear search
    await page.click('#clearBigSearchBtn');
    const isHidden = await page.$eval('#homeLiveSearchDropdown', (el) => el.classList.contains('hidden'));
    if (!isHidden) throw new Error('Live search dropdown should close after clearing search');
  });

  // --------------------------------------------------------------------------
  // TEST STEP 3: SPA NAVIGATION TO CATEGORY DIRECTORY
  // --------------------------------------------------------------------------
  await step('3. Click category card and verify seamless SPA navigation to /list/billing-software', async () => {
    await page.click('[data-cat-card-slug="billing-software"]');
    await page.waitForFunction(() => window.location.pathname === '/list/billing-software');

    const heroTitle = await page.$eval('#heroCatTitle', (el) => el.textContent.trim());
    if (!heroTitle.includes('Billing')) throw new Error(`Expected Billing in hero title, got "${heroTitle}"`);

    const productsCount = await page.$$eval('#top10TimelineList .card-product-node', (nodes) => nodes.length);
    if (productsCount === 0) throw new Error('No product cards rendered in top10TimelineList');
  });

  // --------------------------------------------------------------------------
  // TEST STEP 4: QUICK FILTERS & SHORTLIST SAVING
  // --------------------------------------------------------------------------
  await step('4. Test Quick Filter chips (Free sandbox, API, Enterprise) and Shortlist', async () => {
    // Click 'Free Tier / Sandbox' filter
    await page.click('[data-qfilter="free"]');
    await sleep(200);
    const freeCards = await page.$$eval('#top10TimelineList .card-product-node', (nodes) => nodes.length);
    if (freeCards === 0) throw new Error('Free filter returned 0 products');

    // Click 'All' filter
    await page.click('[data-qfilter="all"]');
    await sleep(200);

    // Click bookmark button on first card
    const firstSaveBtn = await page.$('#top10TimelineList .btn-save-bookmark');
    if (firstSaveBtn) {
      await firstSaveBtn.click();
      await sleep(200);
    }
  });

  // --------------------------------------------------------------------------
  // TEST STEP 5: B2B RFP CUSTOM QUOTE MODAL (TRIGGER & CLOSE)
  // --------------------------------------------------------------------------
  await step('5. Open and test B2B Custom Quotes / RFP Modal', async () => {
    await page.click('#openCategoryRfpBtn');
    await page.waitForSelector('#requestRfpModalBackdrop:not(.hidden)', { timeout: 2000 });

    const vendorChipsCount = await page.$$eval('#rfpVendorsPicker .rfp-vendor-chip', (chips) => chips.length);
    if (vendorChipsCount === 0) throw new Error('RFP vendor chips failed to populate');

    // Toggle a vendor chip
    const firstChip = await page.$('#rfpVendorsPicker .rfp-vendor-chip');
    if (firstChip) await firstChip.click();

    // Close modal via Cancel button
    await page.click('#cancelRfpModalBtn');
    await page.waitForFunction(() => document.getElementById('requestRfpModalBackdrop').classList.contains('hidden'));
  });

  // --------------------------------------------------------------------------
  // TEST STEP 6: HEAD-TO-HEAD COMPARISON VIEW (/compare/...)
  // --------------------------------------------------------------------------
  await step('6. Click VS button and verify Head-to-Head Comparison View', async () => {
    const vsBtn = await page.$('#top10TimelineList .btn-compare-vs');
    if (!vsBtn) throw new Error('No VS button found on product card');
    await vsBtn.click();

    await page.waitForSelector('#compareHeadToHeadView:not(.hidden)', { timeout: 3000 });
    const url = page.url();
    if (!url.includes('/compare/')) throw new Error(`Expected comparison URL, got ${url}`);

    const nameA = await page.$eval('#compareNameA', (el) => el.textContent.trim());
    const nameB = await page.$eval('#compareNameB', (el) => el.textContent.trim());
    if (!nameA || !nameB) throw new Error(`Missing comparison product names (${nameA} vs ${nameB})`);

    const matrixRows = await page.$$eval('#compareMatrixTableBody tr', (trs) => trs.length);
    if (matrixRows === 0) throw new Error('Matrix shootout table is empty');

    // Test Back to Category button
    await page.click('#compareBackBtn');
    await page.waitForFunction(() => document.getElementById('compareHeadToHeadView').classList.contains('hidden'));
  });

  // --------------------------------------------------------------------------
  // TEST STEP 7: FOUNDER SELF-SERVE PORTAL
  // --------------------------------------------------------------------------
  await step('7. Open Founder Self-Serve Portal and verify tabs & analytics', async () => {
    await page.click('#navFounderPortalBtn');
    await page.waitForSelector('#founderPortalModalBackdrop:not(.hidden)', { timeout: 3000 });

    const viewsMetric = await page.$eval('#founderMetricViews', (el) => el.textContent.trim());
    if (!viewsMetric) throw new Error('Founder metric views is empty');

    // Switch to Retainers tab
    await page.click('[data-founder-tab="retainer"]');
    const isRetainerVisible = await page.$eval('#founderRetainerPanel', (el) => !el.classList.contains('hidden'));
    if (!isRetainerVisible) throw new Error('Retainer tab failed to show');

    // Switch to Buyer Leads tab
    await page.click('[data-founder-tab="leads"]');
    const isLeadsVisible = await page.$eval('#founderLeadsPanel', (el) => !el.classList.contains('hidden'));
    if (!isLeadsVisible) throw new Error('Leads tab failed to show');

    // Close founder portal
    await page.click('#closeFounderPortalBtn');
    await page.waitForFunction(() => document.getElementById('founderPortalModalBackdrop').classList.contains('hidden'));
  });

  // --------------------------------------------------------------------------
  // TEST STEP 8: VIRAL SOCIAL SHARING MODAL
  // --------------------------------------------------------------------------
  await step('8. Open 1-Click Viral Social Sharing modal', async () => {
    await page.click('#openShareModalBtn');
    await page.waitForSelector('#shareRankingModalBackdrop:not(.hidden)', { timeout: 2000 });

    const shareText = await page.$eval('#sharePostCopyText', (el) => el.value);
    if (!shareText || !shareText.includes('Top 10')) throw new Error(`Invalid share text: "${shareText}"`);

    await page.click('#closeShareModalBtn');
    await page.waitForFunction(() => document.getElementById('shareRankingModalBackdrop').classList.contains('hidden'));
  });

  // --------------------------------------------------------------------------
  // TEST STEP 9: EDITORIAL BLOG NAVIGATION & ARTICLE VIEW
  // --------------------------------------------------------------------------
  await step('9. Navigate to Editorial Blog (/blog) and view teardown article', async () => {
    await page.click('#navBlogBtn');
    await page.waitForFunction(() => window.location.pathname === '/blog');

    const blogCards = await page.$$eval('#blogCardsGrid .blog-card', (cards) => cards.length);
    if (blogCards === 0) throw new Error('No blog cards rendered on /blog');

    // Click first article
    const firstArticle = await page.$('#blogCardsGrid .blog-card');
    if (firstArticle) await firstArticle.click();

    await page.waitForSelector('#blogArticleSection:not(.hidden)', { timeout: 3000 });
    const articleTitle = await page.$eval('#articleMainTitle', (el) => el.textContent.trim());
    if (!articleTitle) throw new Error('Article title is empty');
  });

  // --------------------------------------------------------------------------
  // TEST STEP 10: ADMIN COMMAND CENTER
  // --------------------------------------------------------------------------
  await step('10. Navigate to Admin Command Center (/admin) and test Tabs', async () => {
    await page.click('#navAdminBtn');
    await page.waitForFunction(() => window.location.pathname === '/admin');

    const revenueVal = await page.$eval('#adminKpiRevenue', (el) => el.textContent.trim());
    if (!revenueVal) throw new Error('Admin revenue KPI is empty');

    // Click Reviews tab
    await page.click('[data-admin-tab="reviews"]');
    await page.waitForSelector('#adminTabReviews:not(.hidden)', { timeout: 2000 });

    // Click Leads tab
    await page.click('[data-admin-tab="leads"]');
    await page.waitForSelector('#adminTabLeads:not(.hidden)', { timeout: 2000 });

    const leadsRows = await page.$$eval('#adminLeadsTableBody tr', (trs) => trs.length);
    if (leadsRows === 0) throw new Error('Admin leads table failed to render rows');
  });

  // --------------------------------------------------------------------------
  // TEST STEP 11: DARK / LIGHT THEME TOGGLE
  // --------------------------------------------------------------------------
  await step('11. Test Dark / Light theme toggle in topbar', async () => {
    const initialTheme = await page.$eval('html', (el) => el.getAttribute('data-theme') || 'light');
    await page.click('#themeToggleBtn');
    const newTheme = await page.$eval('html', (el) => el.getAttribute('data-theme'));
    if (initialTheme === newTheme) throw new Error(`Theme toggle failed: was ${initialTheme}, still ${newTheme}`);
    // Toggle back
    await page.click('#themeToggleBtn');
  });

  // --------------------------------------------------------------------------
  // TEST STEP 12: MOBILE VIEWPORT RESPONSIVENESS (375x812 iPhone)
  // --------------------------------------------------------------------------
  await step('12. Test Mobile Viewport (375x812) layout and responsiveness', async () => {
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.goto(`${BASE_URL}/list/billing-software`, { waitUntil: 'networkidle0' });

    // Verify product card is visible and fits mobile viewport
    const cardWidth = await page.$eval('#top10TimelineList .card-product-node', (el) => el.getBoundingClientRect().width);
    if (cardWidth > 375) throw new Error(`Card overflowed mobile screen width: ${cardWidth}px > 375px`);
  });

  // --------------------------------------------------------------------------
  // BROWSER AUDIT REPORT
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`BROWSER AUTOMATION TEST RESULTS: ${passedBrowserTests} / ${totalBrowserTests} PASSED`);
  console.log(`TOTAL CONSOLE ERRORS: ${consoleErrors.length}`);
  console.log(`TOTAL FAILED NETWORK REQUESTS: ${failedRequests.length}`);
  console.log('================================================================\n');

  if (consoleErrors.length > 0) {
    console.error('Browser Errors Caught:');
    consoleErrors.forEach((e, idx) => console.error(`  ${idx + 1}. ${e}`));
  }

  await browser.close();

  if (passedBrowserTests === totalBrowserTests && consoleErrors.length === 0) {
    console.log('PERFECT: ALL BROWSER FLOWS PASSED WITH 0 CONSOLE ERRORS!');
    process.exit(0);
  } else {
    console.error('BROWSER TESTS COMPLETED WITH ISSUES.');
    process.exit(1);
  }
})();
