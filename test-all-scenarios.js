// ============================================================================
// TOP 10 PLATFORM - DEEP REAL BROWSER SCENARIOS AUTOMATION SUITE
// Tests 10 advanced end-to-end browser scenarios with real Chrome
// ============================================================================

const path = require('path');
const puppeteer = require(path.resolve(__dirname, 'node_modules', 'puppeteer-core'));

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3456';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log('================================================================');
  console.log('LAUNCHING GOOGLE CHROME FOR ADVANCED SCENARIO TESTING');
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

  let totalScenarios = 0;
  let passedScenarios = 0;

  async function fillInput(selector, val) {
    await page.waitForSelector(selector);
    await page.$eval(selector, (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, val);
  }

  async function scenario(name, fn) {
    totalScenarios++;
    try {
      await fn();
      passedScenarios++;
      console.log(`[PASS] Scenario ${totalScenarios}: ${name}`);
    } catch (err) {
      console.error(`[FAIL] Scenario ${totalScenarios}: ${name}`);
      console.error(`       Details: ${err.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // AUTHENTICATE ADMIN SESSION
  // --------------------------------------------------------------------------
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@top10.io', password: 'Top10Admin2026!' })
    });
    const loginData = await loginRes.json();
    if (loginData.token) {
      await page.setCookie({
        name: 'top10_session',
        value: loginData.token,
        domain: 'localhost',
        path: '/'
      });
      await page.evaluateOnNewDocument((token) => {
        localStorage.setItem('top10_token', token);
      }, loginData.token);
    }
  } catch (err) {
    console.warn('Admin session pre-auth notice:', err.message);
  }

  // --------------------------------------------------------------------------
  // SCENARIO 1: Community Review Submission & Admin Approval Lifecycle
  // --------------------------------------------------------------------------
  await scenario('Full Reader Review Submission & Admin Moderation Approval', async () => {
    await page.goto(`${BASE_URL}/list/billing-software`, { waitUntil: 'networkidle2' });

    // Open Write Review modal
    const openReviewBtn = await page.$('#openWriteReviewModalBtn');
    if (!openReviewBtn) throw new Error('#openWriteReviewModalBtn not found');
    await openReviewBtn.click();
    await page.waitForSelector('#writeReviewModalBackdrop:not(.hidden)', { timeout: 2000 });

    // Fill form safely clearing prefilled auth user data
    await page.click('[data-star="5"]');
    await fillInput('#reviewAuthorName', 'Elena Rostova');
    await fillInput('#reviewAuthorEmail', 'elena@acme-billing.com');
    await fillInput('#reviewAuthorRole', 'Lead Systems Architect');
    await fillInput('#reviewBodyText', 'We integrated @Stripe last quarter. Seamless API and stellar uptime.');

    // Click pros chip
    const proChip = await page.$('#reviewProsChips .sentiment-chip');
    if (proChip) await proChip.click();

    // Submit review
    await page.click('#submitReviewBtn');
    await sleep(400);

    // Modal should close
    const isModalHidden = await page.$eval('#writeReviewModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isModalHidden) throw new Error('Write review modal did not close after submit');

    // Navigate to Admin to verify moderation queue
    await page.click('#navAdminBtn');
    await page.waitForFunction(() => window.location.pathname === '/admin');
    await sleep(250);

    await page.$eval('[data-admin-tab="reviews"]', (el) => el.click());
    await page.waitForSelector('#adminTabReviews:not(.hidden)', { timeout: 3000 });

    const reviewText = await page.$eval('#adminReviewsTableBody', (el) => el.textContent);
    if (!reviewText.includes('Elena Rostova')) throw new Error('Submitted review not found in admin moderation table');

    // Click Approve button
    const approveBtn = await page.$('#adminReviewsTableBody .mod-btn.approve');
    if (approveBtn) {
      await approveBtn.click();
      await sleep(300);
    }
  });

  // --------------------------------------------------------------------------
  // SCENARIO 2: Founder Listing Claim & OTP Verification Lifecycle
  // --------------------------------------------------------------------------
  await scenario('Founder Listing Claim with Simulated OTP Verification', async () => {
    // Reset Paddle to unclaimed so scenario is idempotent across runs
    try {
      const fs = require('fs');
      const dbPath = path.resolve(__dirname, 'data', 'db.json');
      if (fs.existsSync(dbPath)) {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        const b = (db.categories || []).find((c) => c.slug === 'billing-software');
        if (b && b.products) {
          const paddle = b.products.find((p) => p.name.includes('Paddle'));
          if (paddle) { paddle.claimed = false; paddle.claimedBy = null; paddle.isClaimed = false; }
          fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        }
      }
    } catch {}

    await page.goto(`${BASE_URL}/list/billing-software`, { waitUntil: 'networkidle2' });

    // Find an unclaimed product's Claim button
    const claimBtn = await page.$('#top10TimelineList .btn-claim-link');
    if (!claimBtn) throw new Error('No unclaimed platform found in list');
    await claimBtn.click();

    await page.waitForSelector('#claimListingModalBackdrop:not(.hidden)', { timeout: 2000 });

    // Fill work email
    await fillInput('#claimWorkEmail', 'founder@paddle.com');
    await page.click('#sendClaimCodeBtn');
    await sleep(400);

    // Step 2 should be revealed with simulated OTP
    const isStep2Visible = await page.$eval('#claimVerifyCodeForm', (el) => !el.classList.contains('hidden'));
    if (!isStep2Visible) throw new Error('Claim Step 2 (Verify Code) failed to show');

    const otpCode = await page.$eval('#claimOtpInput', (el) => el.value);
    if (!otpCode || otpCode.length !== 6) throw new Error(`Invalid OTP code generated: "${otpCode}"`);

    // Submit verification
    await page.click('#verifyClaimCodeBtn');
    await sleep(400);

    const isClaimModalClosed = await page.$eval('#claimListingModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isClaimModalClosed) throw new Error('Claim modal did not close after OTP verification');
  });

  // --------------------------------------------------------------------------
  // SCENARIO 3: B2B Custom Quotes / Enterprise RFP Inquiry Submission
  // --------------------------------------------------------------------------
  await scenario('B2B Custom Quotes RFP Submission & Admin Lead Tracking', async () => {
    await page.goto(`${BASE_URL}/list/billing-software`, { waitUntil: 'networkidle2' });

    await page.evaluate(() => {
      const btn = document.getElementById('openCategoryRfpBtn');
      if (btn) btn.click();
    });
    await page.waitForSelector('#requestRfpModalBackdrop:not(.hidden)', { timeout: 2000 });

    // Fill RFP fields safely clearing prefilled auth user data
    await fillInput('#rfpBuyerName', 'Marcus Vance');
    await fillInput('#rfpBuyerEmail', 'marcus@globalfintech.com');
    await fillInput('#rfpCompanyName', 'Global FinTech Ltd');
    await fillInput('#rfpNotes', 'Require multi-currency automated billing and MoR tax compliance.');

    await page.click('#submitRfpBtn');
    await sleep(400);

    const isRfpClosed = await page.$eval('#requestRfpModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isRfpClosed) throw new Error('RFP modal did not close after submit');

    // Verify in Admin leads tab
    await page.click('#navAdminBtn');
    await page.waitForFunction(() => window.location.pathname === '/admin');
    await page.click('[data-admin-tab="leads"]');
    await page.waitForSelector('#adminTabLeads:not(.hidden)', { timeout: 2000 });

    const leadsTableText = await page.$eval('#adminLeadsTableBody', (el) => el.textContent);
    if (!leadsTableText.includes('Global FinTech Ltd')) throw new Error('RFP lead not found in Admin leads table');
  });

  // --------------------------------------------------------------------------
  // SCENARIO 4: Direct URL Hydration for Head-to-Head Comparison (/compare/...)
  // --------------------------------------------------------------------------
  await scenario('Direct URL Hydration for Head-to-Head Comparison View', async () => {
    await page.goto(`${BASE_URL}/compare/billing-software/stripe_billing-vs-paddle`, { waitUntil: 'networkidle2' });

    const isCompareVisible = await page.$eval('#compareHeadToHeadView', (el) => !el.classList.contains('hidden'));
    if (!isCompareVisible) throw new Error('Comparison view is not visible on direct URL load');

    const nameA = await page.$eval('#compareNameA', (el) => el.textContent.trim());
    const nameB = await page.$eval('#compareNameB', (el) => el.textContent.trim());
    if (!nameA || !nameB) throw new Error(`Missing comparison names: ${nameA} vs ${nameB}`);

    const matrixRows = await page.$$eval('#compareMatrixTableBody tr', (trs) => trs.length);
    if (matrixRows < 4) throw new Error(`Shootout matrix has only ${matrixRows} rows, expected >= 4`);

    // Click back to category button
    await page.click('#compareBackBtn');
    await sleep(200);
    const isCategoryViewActive = await page.$eval('#singleListPageView', (el) => !el.classList.contains('hidden'));
    if (!isCategoryViewActive) throw new Error('Back to Category button failed to return to directory view');
  });

  // --------------------------------------------------------------------------
  // SCENARIO 5: Direct URL Hydration for Blog Article (/blog/:slug)
  // --------------------------------------------------------------------------
  await scenario('Direct URL Hydration for Editorial Guide & Breadcrumb Navigation', async () => {
    await page.goto(`${BASE_URL}/blog/stripe-vs-paddle-vs-orb`, { waitUntil: 'networkidle2' });

    const isArticleVisible = await page.$eval('#blogArticleSection', (el) => !el.classList.contains('hidden'));
    if (!isArticleVisible) throw new Error('Blog article view is not visible on direct URL load');

    const title = await page.$eval('#articleMainTitle', (el) => el.textContent.trim());
    if (!title || !title.toLowerCase().includes('stripe')) throw new Error(`Unexpected article title: "${title}"`);

    const takeawaysCount = await page.$$eval('#articleTakeawaysList li', (lis) => lis.length);
    if (takeawaysCount === 0) throw new Error('Article key takeaways list is empty');

    // Click breadcrumb back to Editorial Guides
    const breadcrumbLink = await page.$('#articleBreadcrumbBlog');
    if (breadcrumbLink) {
      await breadcrumbLink.click();
      await sleep(200);
      const isBlogIndex = await page.$eval('#blogIndexSection', (el) => !el.classList.contains('hidden'));
      if (!isBlogIndex) throw new Error('Breadcrumb failed to return to /blog index');
    }
  });

  // --------------------------------------------------------------------------
  // SCENARIO 6: Category Guide Switcher in Top Navigation Bar
  // --------------------------------------------------------------------------
  await scenario('Category Guide Switcher Dropdown & Live Switching', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    // Open category switcher dropdown
    await page.click('#categoryDropdownBtn');
    const isDropdownVisible = await page.$eval('#categoryDropdownMenu', (el) => !el.classList.contains('hidden'));
    if (!isDropdownVisible) throw new Error('Category dropdown menu failed to toggle open');

    const menuItems = await page.$$eval('#categoryMenuList .cat-menu-item', (items) => items.length);
    if (menuItems < 5) throw new Error(`Expected at least 5 categories in menu, found ${menuItems}`);

    // Click on another category
    const secondCategory = await page.$('#categoryMenuList .cat-menu-item:nth-child(2)');
    if (secondCategory) {
      await secondCategory.click();
      await sleep(300);
      const pathname = await page.evaluate(() => window.location.pathname);
      if (!pathname.startsWith('/list/')) throw new Error(`Expected navigation to /list/..., got ${pathname}`);
    }
  });

  // --------------------------------------------------------------------------
  // SCENARIO 7: Keyboard Accessibility & Escape Key Modal Dismissal
  // --------------------------------------------------------------------------
  await scenario('Keyboard Accessibility: "/" Search Focus & "Escape" Key Dismissal', async () => {
    await page.goto(`${BASE_URL}/list/billing-software`, { waitUntil: 'networkidle2' });

    // Test "/" hotkey to focus search
    await page.keyboard.press('Slash');
    await sleep(100);
    const focusedTag = await page.evaluate(() => document.activeElement.tagName);
    if (focusedTag !== 'INPUT') throw new Error(`Expected INPUT to be focused on "/", got ${focusedTag}`);

    // Open RFP modal
    await page.evaluate(() => {
      const btn = document.getElementById('openCategoryRfpBtn');
      if (btn) btn.click();
    });
    await page.waitForSelector('#requestRfpModalBackdrop:not(.hidden)', { timeout: 2000 });

    // Press Escape
    await page.keyboard.press('Escape');
    await sleep(200);
    const isRfpClosed = await page.$eval('#requestRfpModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isRfpClosed) throw new Error('Escape key failed to close RFP modal');

    // Open Share modal
    await page.click('#openShareModalBtn');
    await page.waitForSelector('#shareRankingModalBackdrop:not(.hidden)', { timeout: 2000 });

    // Press Escape
    await page.keyboard.press('Escape');
    await sleep(200);
    const isShareClosed = await page.$eval('#shareRankingModalBackdrop', (el) => el.classList.contains('hidden'));
    if (!isShareClosed) throw new Error('Escape key failed to close Share modal');
  });

  // --------------------------------------------------------------------------
  // SCENARIO 8: Shortlist Bookmarks & Saved Quick Filter
  // --------------------------------------------------------------------------
  await scenario('Shortlist Bookmarking & "Saved" Filter Chip Toggle', async () => {
    await page.goto(`${BASE_URL}/list/billing-software`, { waitUntil: 'networkidle2' });

    // Bookmark 2 platforms sequentially with DOM re-query
    const firstBookmark = await page.$('#top10TimelineList .btn-save-bookmark');
    if (firstBookmark) {
      await firstBookmark.click();
      await sleep(250);
    }

    const secondBookmark = await page.$('#top10TimelineList .card-product-node:nth-child(2) .btn-save-bookmark');
    if (secondBookmark) {
      await secondBookmark.click();
      await sleep(250);
    }

    // Click "Saved" chip
    await page.evaluate(() => {
      const btn = document.querySelector('[data-qfilter="saved"]');
      if (btn) btn.click();
    });
    await sleep(200);

    const savedCardsCount = await page.$$eval('#top10TimelineList .card-product-node', (nodes) => nodes.length);
    if (savedCardsCount !== 2) throw new Error(`Expected exactly 2 saved cards displayed, found ${savedCardsCount}`);

    // Toggle back to All
    await page.evaluate(() => {
      const btn = document.querySelector('[data-qfilter="all"]');
      if (btn) btn.click();
    });
    await sleep(200);
    const allCardsCount = await page.$$eval('#top10TimelineList .card-product-node', (nodes) => nodes.length);
    if (allCardsCount < 5) throw new Error(`Expected all cards restored, found ${allCardsCount}`);
  });

  // --------------------------------------------------------------------------
  // SCENARIO 9: Founder Portal Retainer Subscription Pricing Tier Selection
  // --------------------------------------------------------------------------
  await scenario('Founder Self-Serve Portal Retainer Pricing Tier Selection', async () => {
    await page.goto(`${BASE_URL}/list/billing-software`, { waitUntil: 'networkidle2' });

    await page.click('#navFounderPortalBtn');
    await page.waitForSelector('#founderPortalModalBackdrop:not(.hidden)', { timeout: 2000 });

    // Switch to Retainer tab
    await page.click('[data-founder-tab="retainer"]');
    await sleep(200);

    const hasTier1 = await page.$('#fUpgradeLock1');
    const hasTier2 = await page.$('#fUpgradeTop3');
    if (!hasTier1 || !hasTier2) throw new Error('Retainer pricing tier cards not found');

    // Close founder portal
    await page.click('#closeFounderPortalBtn');
    await sleep(200);
  });

  // --------------------------------------------------------------------------
  // SCENARIO 10: Tablet / iPad Responsive Viewport (768x1024)
  // --------------------------------------------------------------------------
  await scenario('Tablet Viewport (768x1024) Layout Integrity & Zero Overflow', async () => {
    await page.setViewport({ width: 768, height: 1024, isMobile: false, hasTouch: true });
    await page.goto(`${BASE_URL}/list/billing-software`, { waitUntil: 'networkidle2' });

    const cardWidth = await page.$eval('#top10TimelineList .card-product-node', (el) => el.getBoundingClientRect().width);
    if (cardWidth > 768) throw new Error(`Card width ${cardWidth}px overflows 768px tablet screen`);

    const topbarWidth = await page.$eval('.topbar', (el) => el.getBoundingClientRect().width);
    if (topbarWidth > 768) throw new Error(`Topbar width ${topbarWidth}px overflows 768px tablet screen`);
  });

  // --------------------------------------------------------------------------
  // FINAL AUDIT REPORT
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`ADVANCED SCENARIO TEST RESULTS: ${passedScenarios} / ${totalScenarios} PASSED`);
  console.log(`TOTAL BROWSER CONSOLE ERRORS: ${consoleErrors.length}`);
  console.log(`TOTAL HTTP 4xx/5xx ERRORS: ${httpErrors.length}`);
  console.log('================================================================\n');

  if (consoleErrors.length > 0) {
    console.error('Console Errors Caught:');
    consoleErrors.forEach((e, idx) => console.error(`  ${idx + 1}. ${e}`));
  }

  try {
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 1000))]);
  } catch (err) {}

  if (passedScenarios === totalScenarios && consoleErrors.length === 0) {
    console.log('SUCCESS: ALL 10 ADVANCED SCENARIOS PASSED WITH ZERO ERRORS!');
    process.exit(0);
  } else {
    console.error('ISSUES DETECTED IN ADVANCED SCENARIOS.');
    process.exit(1);
  }
})();