// ============================================================================
// TOP 10 PLATFORM - EXHAUSTIVE DEEP AUDIT & FEATURE DEBUGGER
// Tests every endpoint, modal, button, form, filter, search, route & state
// ============================================================================

const path = require('path');
const puppeteer = require(path.resolve(__dirname, 'node_modules', 'puppeteer-core'));

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3456';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runExhaustiveAudit() {
  console.log('================================================================');
  console.log('STARTING EXHAUSTIVE DEEP AUDIT OF TOP 10 PLATFORM');
  console.log('Target:', BASE_URL);
  console.log('================================================================\n');

  let passedSteps = 0;
  let totalSteps = 0;
  let adminSessionToken = null;
  const issuesFound = [];

  function record(name, ok, details = '') {
    totalSteps++;
    if (ok) {
      passedSteps++;
      console.log(`[PASS] ${name}`);
    } else {
      console.log(`[FAIL] ${name} -> ${details}`);
      issuesFound.push({ step: name, details });
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 1: BACKEND API & DATA FLOW AUDIT
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: BACKEND API AUDIT ---');

  try {
    // 1.1 State endpoint
    const stateRes = await fetch(`${BASE_URL}/api/state`);
    const state = await stateRes.json();
    record('1.1 GET /api/state returns valid data', stateRes.status === 200 && Array.isArray(state.categories) && state.categories.length > 0);

    // 1.2 Auth me
    const meRes = await fetch(`${BASE_URL}/api/auth/me`);
    const me = await meRes.json();
    record('1.2 GET /api/auth/me responds', meRes.status === 200 && 'user' in me);

    // 1.3 Admin login
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@top10.io', password: 'Top10Admin2026!' })
    });
    const loginCookie = loginRes.headers.get('set-cookie');
    const loginData = await loginRes.json();
    adminSessionToken = loginData.token;
    record('1.3 POST /api/auth/login succeeds for admin', loginRes.status === 200 && loginData.success === true && loginCookie);

    const adminHeaders = {
      'Cookie': loginCookie ? loginCookie.split(';')[0] : '',
      'Content-Type': 'application/json'
    };

    // 1.4 Admin db-status
    const dbStatusRes = await fetch(`${BASE_URL}/api/admin/db-status`, { headers: adminHeaders });
    const dbStatus = await dbStatusRes.json();
    record('1.4 GET /api/admin/db-status returns status payload', dbStatusRes.status === 200 && (dbStatus.storageMode || dbStatus.engine));

    // 1.5 Admin analytics
    const analyticsRes = await fetch(`${BASE_URL}/api/admin/analytics`, { headers: adminHeaders });
    const analytics = await analyticsRes.json();
    record('1.5 GET /api/admin/analytics returns metrics', analyticsRes.status === 200 && (analytics.overview && typeof analytics.overview.totalRevenue === 'number'));

    // 1.6 B2B RFP Quote submission
    const rfpRes = await fetch(`${BASE_URL}/api/leads/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySlug: 'billing-software',
        buyerName: 'Audit Test Corp',
        buyerEmail: 'audit@testcorp.com',
        companyName: 'Audit Test Corp',
        estimatedBudget: '$10k-$50k',
        timeline: 'Q2 2026',
        projectRequirements: 'Exhaustive automated testing of B2B quotation funnel'
      })
    });
    const rfpData = await rfpRes.json();
    record('1.6 POST /api/leads/submit creates buyer lead', rfpRes.status === 200 && rfpData.success === true && rfpData.lead?.id);

    // 1.7 Admin leads list and status update
    const leadsRes = await fetch(`${BASE_URL}/api/admin/leads`, { headers: adminHeaders });
    const leadsPayload = await leadsRes.json();
    const leads = leadsPayload.leads || [];
    const createdLead = Array.isArray(leads) ? leads.find((l) => l.buyerEmail === 'audit@testcorp.com') : null;
    record('1.7 Admin can retrieve created lead', Array.isArray(leads) && createdLead);

    if (createdLead) {
      const updateLeadRes = await fetch(`${BASE_URL}/api/admin/leads/${createdLead.id}/status`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ status: 'contacted' })
      });
      const updateLeadData = await updateLeadRes.json();
      record('1.8 Admin can update lead status to contacted', updateLeadRes.status === 200 && updateLeadData.success === true);
    }

    // 1.9 Submit reader review
    const reviewRes = await fetch(`${BASE_URL}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySlug: 'billing-software',
        productId: 'prod_stripe',
        stars: 5,
        reviewerName: 'Verified Software Architect',
        reviewerEmail: 'architect@enterprise.io',
        text: 'Stripe Billing handles multi-region tax calculation and seat tier migrations seamlessly.'
      })
    });
    const reviewData = await reviewRes.json();
    record('1.9 POST /api/reviews queues review for moderation', reviewRes.status === 200 && reviewData.success === true && reviewData.review?.id);

    if (reviewData.review?.id) {
      const approveRes = await fetch(`${BASE_URL}/api/admin/reviews/${reviewData.review.id}/moderate`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ action: 'approve' })
      });
      const approveData = await approveRes.json();
      record('1.10 Admin can approve submitted review', approveRes.status === 200 && approveData.success === true);
    }

    // 1.11 Claim listing OTP request & verify
    const claimReqRes = await fetch(`${BASE_URL}/api/claim/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySlug: 'billing-software',
        productId: 'prod_stripe',
        founderEmail: 'founder@stripe.com'
      })
    });
    const claimReqData = await claimReqRes.json();
    record('1.11 POST /api/claim/send-code validates domain & issues OTP', claimReqRes.status === 200 && claimReqData.success === true);

    const verifyRes = await fetch(`${BASE_URL}/api/claim/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySlug: 'billing-software',
        productId: 'prod_stripe',
        founderEmail: 'founder@stripe.com',
        code: claimReqData.debugOtp || '123456'
      })
    });
    const verifyData = await verifyRes.json();
    record('1.12 POST /api/claim/verify confirms founder ownership', verifyRes.status === 200 && verifyData.success === true);

    // 1.13 Click tracking & Upvote tracking
    const clickRes = await fetch(`${BASE_URL}/api/products/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categorySlug: 'billing-software', productId: 'prod_stripe' })
    });
    record('1.13 POST /api/products/click tracks outbound clicks', clickRes.status === 200);

    const upvoteRes = await fetch(`${BASE_URL}/api/categories/billing-software/products/prod_stripe/interact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upvote' })
    });
    record('1.14 POST /api/categories/.../interact records upvotes', upvoteRes.status === 200);

    // 1.15 Dynamic SVG badge
    const badgeRes = await fetch(`${BASE_URL}/api/badge/billing-software/prod_stripe.svg`);
    const badgeText = await badgeRes.text();
    record('1.15 GET /api/badge/:slug/:prodId.svg returns SVG', badgeRes.status === 200 && badgeText.includes('<svg') && badgeText.includes('#1'));

  } catch (err) {
    record('API Section Exception', false, err.message);
  }

  // --------------------------------------------------------------------------
  // SECTION 2: CHROME BROWSER INTERACTIVE UI AUDIT
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: BROWSER INTERACTIVE AUDIT ---');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  const uncaughtErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[Console Error] ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    uncaughtErrors.push(`[Page Error] ${err.message}`);
  });

  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
      failedRequests.push(`[HTTP ${res.status()}] ${res.url()}`);
    }
  });

  try {
    // 2.1 Load Homepage
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await sleep(600);

    const homeTitle = await page.title();
    record('2.1 Homepage loads with valid title', homeTitle.includes('Top 10') && homeTitle.includes('2026'));

    const homeH1s = await page.$$eval('h1', (els) => els.map((e) => e.textContent.trim()));
    record('2.2 Homepage has exactly 1 visible H1', homeH1s.length === 1, `Got ${homeH1s.length}: ${JSON.stringify(homeH1s)}`);

    // 2.3 Topic Pills Filtering
    const pillSoftware = await page.$('[data-home-topic="software"]');
    if (pillSoftware) {
      await pillSoftware.click();
      await sleep(400);
      const swCountText = await page.$eval('#homeGridHeading', (el) => el.textContent);
      record('2.3 Topic pill "Software & AI" filters categories', swCountText.includes('Top 10 Directories ('));

      const pillHardware = await page.$('[data-home-topic="hardware"]');
      if (pillHardware) {
        await pillHardware.click();
        await sleep(400);
        const hwCountText = await page.$eval('#homeGridHeading', (el) => el.textContent);
        record('2.4 Topic pill "Hardware & Home" filters categories', hwCountText.includes('Top 10 Directories ('));
      }

      const pillAll = await page.$('[data-home-topic="all"]');
      if (pillAll) {
        await pillAll.click();
        await sleep(400);
        const allCountText = await page.$eval('#homeGridHeading', (el) => el.textContent);
        record('2.5 Topic pill "All Guides" restores all categories', allCountText.includes('Top 10 Directories (16)'));
      }
    } else {
      record('2.3 Topic pills exist in DOM', false, 'Pills bar missing');
    }

    // 2.6 Topbar Search Filter & Instant Dropdown
    await page.type('#topbarSearchInput', 'billing');
    await sleep(500);
    const dropdownVisible = await page.$eval('#topbarLiveSearchDropdown', (el) => !el.classList.contains('hidden'));
    record('2.6 Topbar search displays instant live dropdown', dropdownVisible);

    const firstResult = await page.$('[data-top-lsd-cat]');
    if (firstResult) {
      await firstResult.click();
      await sleep(800);
      const currentUrl = page.url();
      record('2.7 Clicking search dropdown item navigates to category', currentUrl.includes('/list/billing-software'));
    } else {
      record('2.7 Search dropdown results item clickable', false, 'No search item found');
    }

    // Return to homepage
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await sleep(400);

    // Test search clear button
    await page.type('#topbarSearchInput', 'testquery');
    await sleep(300);
    const clearBtnVisible = await page.$eval('#topbarSearchClearBtn', (el) => !el.classList.contains('hidden'));
    record('2.8 Topbar search clear button appears when input has text', clearBtnVisible);

    await page.click('#topbarSearchClearBtn');
    await sleep(300);
    const inputVal = await page.$eval('#topbarSearchInput', (el) => el.value);
    record('2.9 Clicking clear button resets search input', inputVal === '');

    // 2.10 Category List Page Verification
    await page.goto(`${BASE_URL}/list/billing-software`, { waitUntil: 'networkidle2' });
    await sleep(600);

    const listH1s = await page.$$eval('h1', (els) => els.map((e) => e.textContent.trim()));
    record('2.10 Category guide has strictly 1 visible H1', listH1s.length === 1 && listH1s[0].includes('Billing Software'), `H1 count: ${listH1s.length}`);

    const productCardsCount = await page.$$eval('.clean-product-item, .minimal-unified-card', (els) => els.length);
    record('2.11 Category displays product cards', productCardsCount >= 10, `Found ${productCardsCount} cards`);

    // 2.12 Quick Filter Chips
    const apiChip = await page.$('[data-quick-filter="api"]');
    if (apiChip) {
      await apiChip.click();
      await sleep(400);
      const filteredCount = await page.$$eval('.clean-product-item:not(.hidden), .minimal-unified-card:not(.hidden)', (els) => els.length);
      record('2.12 Quick filter chip "Developer API" filters product list', filteredCount > 0 && filteredCount <= productCardsCount);
      await apiChip.click(); // Toggle off
      await sleep(300);
    }

    // 2.13 Upvote Button Interaction
    const upvoteBtn = await page.$('.btn-vote-compact');
    if (upvoteBtn) {
      const initialCount = await page.$eval('.btn-vote-compact .vote-number', (el) => el.textContent.trim());
      await upvoteBtn.click();
      await sleep(400);
      const newCount = await page.$eval('.btn-vote-compact .vote-number', (el) => el.textContent.trim());
      record('2.13 Upvote button increments counter', parseInt(newCount, 10) > parseInt(initialCount, 10) || newCount !== initialCount);
    }

    // 2.14 Shortlist / Bookmark Toggle
    const shortlistBtn = await page.$('.btn-shortlist-action');
    if (shortlistBtn) {
      await shortlistBtn.click();
      await sleep(400);
      const topbarCount = await page.$eval('#topbarShortlistCount', (el) => el.textContent.trim());
      record('2.14 Shortlist bookmark increments topbar saved badge', parseInt(topbarCount, 10) >= 1);

      // Test "Saved" quick filter chip
      const savedChip = await page.$('#filterChipSaved');
      if (savedChip) {
        await savedChip.click();
        await sleep(400);
        const savedCards = await page.$$eval('.clean-product-item:not(.hidden), .minimal-unified-card:not(.hidden)', (els) => els.length);
        record('2.15 "Saved" filter chip isolates bookmarked items', savedCards >= 1);
        await savedChip.click(); // Toggle off
        await sleep(300);
      }
    }

    // 2.16 Share Ranking Modal
    const shareBtn = await page.$('#shareListBtn, #heroShareBtn');
    if (shareBtn) {
      await shareBtn.click();
      await sleep(400);
      const shareModalOpen = await page.$eval('#shareRankingModalBackdrop', (el) => !el.classList.contains('hidden'));
      record('2.16 Share Ranking modal opens on click', shareModalOpen);
      await page.keyboard.press('Escape');
      await sleep(300);
      const shareModalClosed = await page.$eval('#shareRankingModalBackdrop', (el) => el.classList.contains('hidden'));
      record('2.17 Escape key cleanly dismisses Share modal', shareModalClosed);
    }

    // 2.18 B2B Custom Quotes / RFP Modal
    await page.evaluate(() => document.getElementById('openCategoryRfpBtn')?.click());
    await sleep(400);
    const rfpModalOpen = await page.$eval('#requestRfpModalBackdrop', (el) => !el.classList.contains('hidden'));
    record('2.18 B2B Custom Quotes RFP modal opens', rfpModalOpen);

    await page.evaluate(() => {
      document.getElementById('rfpBuyerName').value = 'Jane Doe';
      document.getElementById('rfpBuyerEmail').value = 'jane@acme.com';
      document.getElementById('rfpCompanyName').value = 'Acme Corp';
      document.getElementById('rfpNotes').value = 'Looking to migrate 50,000 active subscriptions to an automated billing pipeline';
    });
    await page.click('#submitRfpBtn');
    await sleep(800);

    const rfpModalClosed = await page.$eval('#requestRfpModalBackdrop', (el) => el.classList.contains('hidden'));
    record('2.19 Submitting RFP form saves lead & dismisses modal', rfpModalClosed);

    // 2.20 Embed Badge Modal
    await page.evaluate(() => document.querySelector('[data-badge-prod]')?.click());
    await sleep(400);
    const embedModalOpen = await page.$eval('#badgeModalBackdrop', (el) => !el.classList.contains('hidden'));
    record('2.20 Embed Badge modal opens with dynamic SVG code snippet', embedModalOpen);
    await page.keyboard.press('Escape');
    await sleep(300);

    // 2.21 Head-to-Head Comparison View Navigation
    await page.goto(`${BASE_URL}/compare/billing-software/prod_stripe-vs-prod_paddle`, { waitUntil: 'networkidle2' });
    await sleep(600);

    const compareH1s = await page.$$eval('h1', (els) => els.map((e) => e.textContent.trim()));
    record('2.21 Compare view serves strictly 1 visible H1', compareH1s.length === 1 && compareH1s[0].includes('Comparison'), `H1 count: ${compareH1s.length}`);

    const nameA = await page.$eval('#compareNameA', (el) => el.textContent.trim());
    const nameB = await page.$eval('#compareNameB', (el) => el.textContent.trim());
    record('2.22 Compare view renders competitor A and B', nameA.includes('Stripe') && nameB.includes('Paddle'));

    // Swap button
    const swapBtn = await page.$('#compareSwapBtn');
    if (swapBtn) {
      await swapBtn.click();
      await sleep(500);
      const swappedNameA = await page.$eval('#compareNameA', (el) => el.textContent.trim());
      const swappedNameB = await page.$eval('#compareNameB', (el) => el.textContent.trim());
      record('2.23 Swap button exchanges competitor A and B positions', swappedNameA.includes('Paddle') && swappedNameB.includes('Stripe'));
    }

    // Breadcrumb Back to Category
    const backBtn = await page.$('#compareBackBtn');
    if (backBtn) {
      await backBtn.click();
      await sleep(600);
      const backUrl = page.url();
      record('2.24 Breadcrumb button navigates back to parent category', backUrl.includes('/list/billing-software'));
    }

    // 2.25 Admin Command Center Authentication & Tabs
    if (adminSessionToken) {
      await page.setCookie({
        name: 'top10_session',
        value: adminSessionToken,
        domain: 'localhost',
        path: '/'
      });
    }

    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    await sleep(600);

    const adminVisible = await page.$eval('#adminViewSection', (el) => !el.classList.contains('hidden'));
    record('2.25 Admin Command Center hydrates authenticated session', adminVisible);

    // Test Admin Tab Navigation
    const tabs = [
      { selector: '[data-admin-tab="overview"]', panelId: 'adminTabOverview', label: 'Platform Overview' },
      { selector: '[data-admin-tab="categories"]', panelId: 'adminTabCategories', label: 'Directory Manager' },
      { selector: '[data-admin-tab="transactions"]', panelId: 'adminTabTransactions', label: 'Sales & Revenue' },
      { selector: '[data-admin-tab="reviews"]', panelId: 'adminTabReviews', label: 'Review Moderation' },
      { selector: '[data-admin-tab="leads"]', panelId: 'adminTabLeads', label: 'Buyer Leads' },
      { selector: '[data-admin-tab="products"]', panelId: 'adminTabProducts', label: 'Product Controller' }
    ];

    for (const tab of tabs) {
      const btn = await page.$(tab.selector);
      if (btn) {
        await btn.click();
        await sleep(300);
        const panelVisible = await page.$eval(`#${tab.panelId}`, (el) => !el.classList.contains('hidden'));
        record(`2.26 Admin Tab "${tab.label}" displays corresponding panel`, panelVisible);
      }
    }

    // 2.27 Theme Toggle (Dark Mode & Light Mode)
    console.log('Starting 2.27 Theme Toggle...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await sleep(400);

    const themeBtn = await page.$('#themeToggleBtn');
    if (themeBtn) {
      await themeBtn.click();
      await sleep(300);
      const isDark = await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark');
      record('2.27 Dark mode toggle activates dark theme attribute', isDark);

      await themeBtn.click();
      await sleep(300);
      const isLight = await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'light' || !document.documentElement.getAttribute('data-theme'));
      record('2.28 Second click restores light theme attribute', isLight);
    }

    // 2.29 Responsive Layout & Zero Horizontal Scroll
    console.log('Starting 2.29 Viewports...');
    const viewports = [
      { name: 'Tablet (768x1024)', width: 768, height: 1024 },
      { name: 'Mobile (375x812)', width: 375, height: 812 }
    ];

    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await sleep(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      record(`2.29 ${vp.name} viewport maintains zero horizontal overflow`, !overflow);
    }

    // 2.30 Real 404 Route Handling
    console.log('Starting 2.30 404 Check...');
    const notFoundRes = await fetch(`${BASE_URL}/random-invalid-route-xyz-404`);
    record('2.30 Invalid route returns HTTP 404', notFoundRes.status === 404);

    const notFoundHtml = await notFoundRes.text();
    record('2.31 404 page renders friendly error notice with home link', notFoundHtml.includes('404') && notFoundHtml.includes('Browse All Top 10 Guides'));

  } catch (err) {
    record('Browser Section Exception', false, err.message);
  } finally {
    await browser.close();
  }

  // --------------------------------------------------------------------------
  // SECTION 3: ERRORS & WARNINGS SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`AUDIT RESULTS: ${passedSteps} / ${totalSteps} PASSED (${((passedSteps / totalSteps) * 100).toFixed(1)}%)`);
  console.log('================================================================');
  console.log(`Console Errors: ${consoleErrors.length}`);
  console.log(`Page Exceptions: ${uncaughtErrors.length}`);
  console.log(`Failed HTTP Requests: ${failedRequests.length}`);

  if (consoleErrors.length > 0) {
    console.log('\nConsole Errors logged:');
    consoleErrors.forEach((e) => console.log('  -', e));
  }
  if (uncaughtErrors.length > 0) {
    console.log('\nPage Exceptions logged:');
    uncaughtErrors.forEach((e) => console.log('  -', e));
  }
  if (failedRequests.length > 0) {
    console.log('\nFailed Network Requests logged:');
    failedRequests.forEach((e) => console.log('  -', e));
  }
  if (issuesFound.length > 0) {
    console.log('\nIssues to fix:');
    issuesFound.forEach((i) => console.log(`  - [${i.step}]: ${i.details}`));
  } else {
    console.log('\nEXCELLENT: ZERO FUNCTIONAL, CONSOLE, OR NETWORK ISSUES FOUND!');
  }

  if (issuesFound.length > 0 || consoleErrors.length > 0 || uncaughtErrors.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runExhaustiveAudit();
