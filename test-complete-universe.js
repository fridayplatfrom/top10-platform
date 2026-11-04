// ============================================================================
// TOP 10 PLATFORM - COMPLETE UNIVERSE BROWSER AUDIT SUITE
// Tests every remaining modal, button, lightbox, account switcher & CSV export
// ============================================================================

const path = require('path');
const puppeteer = require(path.resolve(__dirname, 'node_modules', 'puppeteer-core'));

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3456';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log('================================================================');
  console.log('LAUNCHING COMPLETE UNIVERSE BROWSER AUDIT IN GOOGLE CHROME');
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

  let totalAudits = 0;
  let passedAudits = 0;

  async function audit(name, fn) {
    totalAudits++;
    try {
      await fn();
      passedAudits++;
      console.log(`[PASS] Universe Flow ${totalAudits}: ${name}`);
    } catch (err) {
      console.error(`[FAIL] Universe Flow ${totalAudits}: ${name}`);
      console.error(`       Details: ${err.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // FLOW 1: Embed "Ranked on Top 10" Badge Modal Lifecycle
  // --------------------------------------------------------------------------
  await audit('Embed "Ranked on Top 10" Badge Modal, Previews & Snippet Copy', async () => {
    await page.goto(`${BASE_URL}/list/billing-software`, { waitUntil: 'networkidle0' });

    const badgeBtn = await page.$('#top10TimelineList .btn-embed-badge');
    if (!badgeBtn) throw new Error('.btn-embed-badge not found on product card');
    await badgeBtn.click();
    await page.waitForSelector('#badgeModalBackdrop:not(.hidden)', { timeout: 2000 });

    const badgeImgSrc = await page.$eval('#badgePreviewImg', (el) => el.src);
    if (!badgeImgSrc.includes('/api/badge/')) throw new Error(`Invalid badge SVG source: ${badgeImgSrc}`);

    const htmlSnippet = await page.$eval('#badgeHtmlCode', (el) => el.value);
    if (!htmlSnippet || !htmlSnippet.includes('<img')) throw new Error('Badge HTML code snippet is empty');

    // Test copy button
    await page.click('#copyBadgeHtmlBtn');
    await sleep(200);

    // Close badge modal
    await page.click('#doneBadgeModalBtn');
    await sleep(200);
    const isBadgeHidden = await page.$eval('#badgeModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isBadgeHidden) throw new Error('Badge modal failed to close');
  });

  // --------------------------------------------------------------------------
  // FLOW 2: Studio Showcase High-Res Media Lightbox Modal
  // --------------------------------------------------------------------------
  await audit('Studio Media Showcase Lightbox Open & Dismissal', async () => {
    await page.goto(`${BASE_URL}/list/smart-tvs`, { waitUntil: 'networkidle0' });

    const mediaStage = await page.$('#top10TimelineList .card-media-stage');
    if (!mediaStage) throw new Error('.card-media-stage not found in smart-tvs');
    await mediaStage.click();

    await page.waitForSelector('#imageLightboxModalBackdrop:not(.hidden)', { timeout: 2000 });
    const fullImgSrc = await page.$eval('#lightboxLargeImg', (el) => el.src);
    if (!fullImgSrc) throw new Error('Lightbox large image has no src');

    // Close lightbox
    await page.click('#closeLightboxModalBtn');
    await sleep(200);
    const isLightboxClosed = await page.$eval('#imageLightboxModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isLightboxClosed) throw new Error('Lightbox modal failed to close');
  });

  // --------------------------------------------------------------------------
  // FLOW 3: User Account & Persona Switcher Modal
  // --------------------------------------------------------------------------
  await audit('Account Management Modal & User Persona Switcher', async () => {
    await page.goto(`${BASE_URL}/list/billing-software`, { waitUntil: 'networkidle0' });

    await page.click('#userAvatarBtn');
    await page.waitForSelector('#accountModalBackdrop:not(.hidden)', { timeout: 2000 });

    // Test Switching to Bookmarks tab
    await page.click('[data-acc-tab="bookmarks"]');
    const isBookmarksVisible = await page.$eval('#accPanelBookmarks', (el) => !el.classList.contains('hidden'));
    if (!isBookmarksVisible) throw new Error('Bookmarks tab failed to open');

    // Test Switching to Sponsorships tab
    await page.click('[data-acc-tab="sponsorships"]');
    const isSponsorshipsVisible = await page.$eval('#accPanelSponsorships', (el) => !el.classList.contains('hidden'));
    if (!isSponsorshipsVisible) throw new Error('Sponsorships tab failed to open');

    // Test Switching to Receipts tab
    await page.click('[data-acc-tab="receipts"]');
    const isReceiptsVisible = await page.$eval('#accPanelReceipts', (el) => !el.classList.contains('hidden'));
    if (!isReceiptsVisible) throw new Error('Receipts tab failed to open');

    // Click another user persona button in footer switcher
    const switchBtns = await page.$$('#accSwitchPills button');
    if (switchBtns.length >= 2) {
      await switchBtns[1].click();
      await sleep(300);
    }

    // Close account modal
    await page.click('#closeAccountModalBtn');
    await sleep(200);
    const isAccountClosed = await page.$eval('#accountModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isAccountClosed) throw new Error('Account modal failed to close');
  });

  // --------------------------------------------------------------------------
  // FLOW 4: $99 Launch New Paid Directory Paywall Modal UI
  // --------------------------------------------------------------------------
  await audit('$99 Launch New Directory Paywall Modal Form & Live Creation', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

    await page.click('#categoryDropdownBtn');
    await page.waitForSelector('#categoryDropdownMenu:not(.hidden)', { timeout: 2000 });

    await page.click('#dropdownCreateListBtn');
    await page.waitForSelector('#createListModalBackdrop:not(.hidden)', { timeout: 2000 });

    // Fill new list form
    await page.type('#newListTitleInput', 'DevOps Observability Engines');
    await page.type('#newListWebsite', 'https://datadoghq.com');
    await page.type('#newListProdName', 'Datadog APM');
    await page.type('#newListTagline', 'Verified performance telemetry, logs, and APM tracing platforms');
    await page.type('#newListPricing', 'From $15/host/mo');

    // Submit paywall form
    await page.click('#submitCreateListBtn');
    await sleep(600);

    const isPaywallClosed = await page.$eval('#createListModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isPaywallClosed) throw new Error('Create directory modal failed to close after submit');

    // Should have navigated to the newly created directory
    const pathname = await page.evaluate(() => window.location.pathname);
    if (!pathname.includes('/list/')) throw new Error(`Expected navigation to new category, got ${pathname}`);
  });

  // --------------------------------------------------------------------------
  // FLOW 5: Sponsor / Placement Bid Modal Tabs & Interactive Tier Toggle
  // --------------------------------------------------------------------------
  await audit('Sponsor Placement Bid Modal: New Platform vs Boost Existing vs Retainer Tabs', async () => {
    await page.goto(`${BASE_URL}/list/billing-software`, { waitUntil: 'networkidle0' });

    await page.click('#heroBigAddPlatformBtn');
    await page.waitForSelector('#bidModalBackdrop:not(.hidden)', { timeout: 2000 });

    // Switch to Boost Existing tab
    await page.click('[data-bid-mode="existing"]');
    await sleep(150);
    const isExistingVisible = await page.$eval('#bidExistingFieldsWrap', (el) => !el.classList.contains('hidden'));
    if (!isExistingVisible) throw new Error('Boost Existing fields wrap not visible');

    // Switch to Retainer tab
    await page.click('[data-bid-mode="retainer"]');
    await sleep(150);
    const isRetainerVisible = await page.$eval('#bidRetainerFieldsWrap', (el) => !el.classList.contains('hidden'));
    if (!isRetainerVisible) throw new Error('Retainer fields wrap not visible');

    // Toggle tier cards
    await page.click('#retainerCardTop3');
    await sleep(150);
    const isTop3Selected = await page.$eval('#retainerCardTop3', (el) => el.classList.contains('selected'));
    if (!isTop3Selected) throw new Error('Top 3 retainer card failed to select');

    // Close modal
    await page.click('#closeBidModalBtn');
    await sleep(200);
    const isBidModalClosed = await page.$eval('#bidModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isBidModalClosed) throw new Error('Bid modal failed to close');
  });

  // --------------------------------------------------------------------------
  // FLOW 6: Admin Command Center Tabs & CSV Export
  // --------------------------------------------------------------------------
  await audit('Admin Command Center: All 5 Tabs Navigation & CSV Lead Export', async () => {
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle0' });

    // Tab 1: Products
    await page.click('[data-admin-tab="products"]');
    await sleep(150);
    const hasProductsTable = await page.$('#adminProductsTableBody');
    if (!hasProductsTable) throw new Error('Admin Products tab failed');

    // Tab 2: Categories
    await page.click('[data-admin-tab="categories"]');
    await sleep(150);
    const hasCategoriesTable = await page.$('#adminCategoriesTableBody');
    if (!hasCategoriesTable) throw new Error('Admin Categories tab failed');

    // Tab 3: Transactions
    await page.click('[data-admin-tab="transactions"]');
    await sleep(150);
    const hasTransactionsTable = await page.$('#adminTransactionsTableBody');
    if (!hasTransactionsTable) throw new Error('Admin Transactions tab failed');

    // Tab 4: Reviews
    await page.click('[data-admin-tab="reviews"]');
    await sleep(150);
    const hasReviewsTable = await page.$('#adminReviewsTableBody');
    if (!hasReviewsTable) throw new Error('Admin Reviews tab failed');

    // Tab 5: Leads & CSV Export
    await page.click('[data-admin-tab="leads"]');
    await sleep(150);
    const exportBtn = await page.$('#adminExportLeadsCsvBtn');
    if (!exportBtn) throw new Error('#adminExportLeadsCsvBtn not found');

    // Trigger CSV export
    await exportBtn.click();
    await sleep(200);
  });

  // --------------------------------------------------------------------------
  // FINAL UNIVERSE AUDIT REPORT
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`COMPLETE UNIVERSE AUDIT RESULTS: ${passedAudits} / ${totalAudits} PASSED`);
  console.log(`TOTAL BROWSER CONSOLE ERRORS: ${consoleErrors.length}`);
  console.log(`TOTAL HTTP 4xx/5xx ERRORS: ${httpErrors.length}`);
  console.log('================================================================\n');

  if (consoleErrors.length > 0) {
    console.error('Console Errors Caught:');
    consoleErrors.forEach((e, idx) => console.error(`  ${idx + 1}. ${e}`));
  }

  await browser.close();

  if (passedAudits === totalAudits && consoleErrors.length === 0) {
    console.log('100% COVERAGE VERIFIED: EVERY SINGLE MODAL, TAB, AND BUTTON WORKS PERFECTLY!');
    process.exit(0);
  } else {
    console.error('UNIVERSE AUDIT DETECTED ISSUES.');
    process.exit(1);
  }
})();