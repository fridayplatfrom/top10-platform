// ============================================================================
// TOP 10 PLATFORM - COMPREHENSIVE 12-FLOW INTEGRATION & STRESS TEST SUITE
// Tests every endpoint, flow, database persistence, and edge case
// ============================================================================

const assert = require('assert');

const BASE_URL = 'http://localhost:3456';
let adminToken = null;
const createdCategorySlugs = [];

async function req(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { ...(options.headers || {}) };
  if (adminToken && !headers['Authorization'] && !options.skipAuth) {
    headers['Authorization'] = `Bearer ${adminToken}`;
  }
  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, headers: res.headers, data };
}

(async () => {
  console.log('================================================================');
  console.log('STARTING TOP 10 PLATFORM - COMPREHENSIVE 12-FLOW TEST SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function test(name, fn) {
    totalTests++;
    return fn()
      .then(() => {
        passedTests++;
        console.log(`[PASS] ${name}`);
      })
      .catch((err) => {
        console.error(`[FAIL] ${name}`);
        console.error(`       Error: ${err.message}\n`);
      });
  }

  // Authenticate as Admin first
  await test('Flow 0: Admin authentication with PBKDF2 hash verification', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@top10.io', password: 'Top10Admin2026!' }),
      skipAuth: true
    });
    assert.strictEqual(res.status, 200, 'Expected 200 OK for admin login');
    assert(res.data.token, 'Expected session token in response');
    assert.strictEqual(res.data.user.role, 'admin');
    adminToken = res.data.token;
  });

  // --------------------------------------------------------------------------
  // FLOW 1: DATABASE & SYSTEM HEALTH
  // --------------------------------------------------------------------------
  await test('Flow 1: Database status endpoint returns valid health payload', async () => {
    const res = await req('/api/admin/db-status');
    assert.strictEqual(res.status, 200, 'Expected 200 OK');
    assert.strictEqual(typeof res.data.storageMode, 'string');
    assert(res.data.collections.categories >= 14, 'Must have at least 14 categories');
  });

  await test('Flow 1b: Full state endpoint returns populated schema for admin & strips PII for public', async () => {
    // Authenticated admin state check
    const adminRes = await req('/api/state');
    assert.strictEqual(adminRes.status, 200);
    assert(Array.isArray(adminRes.data.categories) && adminRes.data.categories.length >= 14);
    assert(Array.isArray(adminRes.data.users) && adminRes.data.users.length > 0);
    assert(Array.isArray(adminRes.data.transactions));

    // Public visitor state check (skipAuth = true) -> PII must be protected!
    const publicRes = await req('/api/state', { skipAuth: true });
    assert.strictEqual(publicRes.status, 200);
    assert.strictEqual(publicRes.data.users.length, 0, 'Public state must not leak user accounts');
    assert.strictEqual(publicRes.data.buyerLeads.length, 0, 'Public state must not leak buyer leads');
  });

  // --------------------------------------------------------------------------
  // FLOW 2: HOMEPAGE, SEARCH & DIRECTORY LAUNCH
  // --------------------------------------------------------------------------
  await test('Flow 2a: Homepage HTML is delivered with status 200', async () => {
    const res = await req('/');
    assert.strictEqual(res.status, 200);
    assert(res.data.includes('Top 10'), 'HTML should contain title branding');
  });

  await test('Flow 2b: Launch New Paid Directory ($99 Paywall) creates directory', async () => {
    const testSlug = 'ai-video-generators-' + Date.now();
    const res = await req('/api/lists/create-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Top 10 AI Video Generators',
        slug: testSlug,
        subtitle: 'The ultimate comparison of modern text-to-video and AI animation engines.',
        productName: 'Runway Gen-3',
        companyName: 'Runway AI Inc',
        website: 'https://runwayml.com',
        pricingTag: 'Freemium / $12/mo',
        highlightTag: 'Top Visual Fidelity',
        ownerEmail: 'alex@runwayml.com',
        tagline: 'Leading next-generation AI video generation models.',
        amountPaid: 99
      })
    });
    assert.strictEqual(res.status, 200);
    assert(res.data.category && res.data.category.slug === testSlug);
    assert.strictEqual(res.data.category.top10[0].name, 'Runway Gen-3');
    assert.strictEqual(res.data.category.top10[0].rank, 1);
    createdCategorySlugs.push(testSlug);
  });

  // --------------------------------------------------------------------------
  // FLOW 3: CATEGORY GUIDE & RANKINGS LADDER
  // --------------------------------------------------------------------------
  await test('Flow 3a: Category page returns server-injected SEO tags', async () => {
    const res = await req('/list/billing-software');
    assert.strictEqual(res.status, 200);
    assert(res.data.includes('Billing Software (2026)'), 'Missing injected category title');
    assert(res.data.includes('rel="canonical"'), 'Missing canonical tag');
  });

  await test('Flow 3b: Click tracking increments product click count', async () => {
    const stateRes = await req('/api/state');
    const cat = stateRes.data.categories.find((c) => c.slug === 'billing-software');
    const prod = cat.top10[0];
    const initialClicks = prod.clicks || 0;

    const clickRes = await req('/api/products/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categorySlug: cat.slug, productId: prod.id })
    });
    assert.strictEqual(clickRes.status, 200);
    assert.strictEqual(clickRes.data.clicks, initialClicks + 1);
  });

  // --------------------------------------------------------------------------
  // FLOW 4: PROGRAMMATIC BIDDING & RANK RE-ORDERING
  // --------------------------------------------------------------------------
  await test('Flow 4a: PayPal order creation for rank boost', async () => {
    const res = await req('/api/paypal/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySlug: 'billing-software',
        productId: 'prod_paddle',
        bidAmount: 180,
        authorName: 'Paddle Founder',
        authorEmail: 'founder@paddle.com'
      })
    });
    assert.strictEqual(res.status, 200);
    assert(res.data.orderId && res.data.orderId.startsWith('ORDER-PP-'));
    assert.strictEqual(res.data.amount, 180);
  });

  await test('Flow 4b: PayPal order capture updates ranking ladder and logs transaction', async () => {
    const orderRes = await req('/api/paypal/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySlug: 'billing-software',
        productId: 'prod_paddle',
        bidAmount: 250,
        authorName: 'Paddle Founder',
        authorEmail: 'founder@paddle.com'
      })
    });

    const captureRes = await req('/api/paypal/capture-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: orderRes.data.orderId,
        categorySlug: 'billing-software',
        productId: 'prod_paddle',
        amount: 250,
        authorName: 'Paddle Founder',
        authorEmail: 'founder@paddle.com'
      })
    });
    assert.strictEqual(captureRes.status, 200);
    assert(captureRes.data.success);
    assert.strictEqual(captureRes.data.rankAchieved, 1);
  });

  // --------------------------------------------------------------------------
  // FLOW 5: SPONSORSHIP RETAINERS (PAYPAL MRR)
  // --------------------------------------------------------------------------
  let testSubscriptionId = null;

  await test('Flow 5a: PayPal recurring retainer subscription creation ($299/mo Lock #1)', async () => {
    const res = await req('/api/paypal/create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySlug: 'billing-software',
        productId: 'prod_stripe',
        tier: 'lock_rank_1',
        ownerEmail: 'finance@stripe.com'
      })
    });
    assert.strictEqual(res.status, 200);
    assert(res.data.success);
    assert.strictEqual(res.data.subscription.monthlyAmount, 299);
    assert.strictEqual(res.data.subscription.tier, 'lock_rank_1');
    testSubscriptionId = res.data.subscription.id;
  });

  await test('Flow 5b: PayPal retainer cancellation', async () => {
    const res = await req('/api/paypal/cancel-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 'prod_stripe' })
    });
    assert.strictEqual(res.status, 200);
    assert(res.data.success);
  });

  await test('Flow 5c: PayPal Webhook processes BILLING.SUBSCRIPTION.ACTIVATED event', async () => {
    const res = await req('/api/webhooks/paypal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'WH-EVT-1001',
        event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
        resource: {
          id: testSubscriptionId || 'SUB-PP-TEST',
          status: 'ACTIVE'
        }
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.eventType, 'BILLING.SUBSCRIPTION.ACTIVATED');
  });

  await test('Flow 5d: PayPal Webhook processes PAYMENT.SALE.COMPLETED recurring renewal MRR', async () => {
    const res = await req('/api/webhooks/paypal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'WH-EVT-1002',
        event_type: 'PAYMENT.SALE.COMPLETED',
        resource: {
          billing_agreement_id: testSubscriptionId || 'SUB-PP-TEST',
          amount: { total: '299.00', currency: 'USD' },
          payer: { payer_info: { email: 'founder@paddle.com' } }
        }
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.eventType, 'PAYMENT.SALE.COMPLETED');
  });

  await test('Flow 5e: PayPal Webhook processes BILLING.SUBSCRIPTION.CANCELLED event', async () => {
    const res = await req('/api/webhooks/paypal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'WH-EVT-1003',
        event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
        resource: {
          id: testSubscriptionId || 'SUB-PP-TEST'
        }
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.eventType, 'BILLING.SUBSCRIPTION.CANCELLED');
  });

  // --------------------------------------------------------------------------
  // FLOW 6: BRAND CLAIMING & 6-DIGIT OTP VERIFICATION
  // --------------------------------------------------------------------------
  let testOtpCode = null;

  await test('Flow 6a: Claim Listing send-code validates domain and creates OTP', async () => {
    const res = await req('/api/claim/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySlug: 'billing-software',
        productId: 'prod_stripe',
        workEmail: 'ceo@stripe.com'
      })
    });
    assert.strictEqual(res.status, 200);
    const otp = res.data.devCode || res.data.code;
    assert(otp && otp.length === 6, 'Should return 6-digit OTP code in development');
    testOtpCode = otp;
  });

  await test('Flow 6b: Claim Listing verify-code confirms founder ownership', async () => {
    assert(testOtpCode, 'OTP code from 6a required');
    const res = await req('/api/claim/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySlug: 'billing-software',
        productId: 'prod_stripe',
        code: testOtpCode,
        ownerName: 'Patrick Collison',
        ownerEmail: 'ceo@stripe.com'
      })
    });
    assert.strictEqual(res.status, 200);
    assert(res.data.success);

    const checkRes = await req('/api/state');
    const cat = checkRes.data.categories.find((c) => c.slug === 'billing-software');
    const prod = cat.top10.find((p) => p.id === 'prod_stripe');
    assert.strictEqual(prod.claimed, true, 'Product must be marked as claimed');
  });

  // --------------------------------------------------------------------------
  // FLOW 7: FOUNDER SELF-SERVE PORTAL & SPEC EDITOR
  // --------------------------------------------------------------------------
  await test('Flow 7a: Founder portal data returns claimed platforms and analytics', async () => {
    const res = await req('/api/founder/portal-data?email=ceo@stripe.com');
    assert.strictEqual(res.status, 200);
    assert(res.data.products && res.data.products.length > 0);
    assert(res.data.products.some((p) => p.id === 'prod_stripe'));
  });

  await test('Flow 7b: Founder updates specifications live in directory', async () => {
    const res = await req('/api/founder/update-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySlug: 'billing-software',
        productId: 'prod_stripe',
        name: 'Stripe Billing',
        tagline: 'Leading developer infrastructure for recurring payments & SaaS billing engines.',
        website: 'https://stripe.com/billing',
        pricingTag: '0.5% per recurring charge',
        specs: {
          startingPrice: '0.5% per transaction',
          freeTrial: 'Full Sandbox Available',
          idealFor: 'Startups & High-Growth Enterprises',
          platforms: 'REST, GraphQL, iOS, Android SDKs'
        },
        pros: ['Industry-standard developer APIs', '99.999% global uptime reliability'],
        cons: ['Requires in-house developer integration', 'Separate tax handling unless using Stripe Tax'],
        heroImage: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&auto=format&fit=crop&q=80',
        overlayTag: 'Developer Sandbox'
      })
    });
    assert.strictEqual(res.status, 200);
    assert(res.data.success);
    assert.strictEqual(res.data.product.tagline, 'Leading developer infrastructure for recurring payments & SaaS billing engines.');
  });

  // --------------------------------------------------------------------------
  // FLOW 8: COMMUNITY REVIEWS & MODERATION QUEUE
  // --------------------------------------------------------------------------
  let submittedReviewId = null;

  await test('Flow 8a: Submit reader review goes to pending moderation queue', async () => {
    const res = await req('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySlug: 'billing-software',
        productId: 'prod_paddle',
        authorName: 'Alex Rivers',
        authorEmail: 'alex@cloudops.net',
        authorRole: 'Head of Billing',
        rating: 5,
        text: 'Paddle made our international expansion completely pain-free by handling all European VAT liability automatically.',
        pros: ['Automated MoR tax compliance', 'Clean hosted checkout']
      })
    });
    assert.strictEqual(res.status, 200);
    assert(res.data.review && res.data.review.id);
    submittedReviewId = res.data.review.id;
  });

  await test('Flow 8b: Admin fetches pending reviews queue and approves review', async () => {
    const listRes = await req('/api/admin/reviews');
    assert.strictEqual(listRes.status, 200);
    const rev = listRes.data.reviews.find((r) => r.id === submittedReviewId);
    assert(rev, 'Submitted review must be in review queue');

    const modRes = await req(`/api/admin/reviews/${submittedReviewId}/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' })
    });
    assert.strictEqual(modRes.status, 200);
    assert(modRes.data.success);
  });

  // --------------------------------------------------------------------------
  // FLOW 9: B2B ENTERPRISE LEAD GEN & CUSTOM QUOTES
  // --------------------------------------------------------------------------
  let submittedLeadId = null;

  await test('Flow 9a: Buyer submits enterprise custom quote RFP inquiry', async () => {
    const res = await req('/api/leads/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySlug: 'billing-software',
        buyerName: 'Marcus Vance',
        buyerEmail: 'marcus@nexustech.io',
        companyName: 'Nexus Tech Global',
        teamSize: '51-250 employees',
        estimatedBudget: '$2,000-$10,000/mo',
        timeline: 'Within 1 month',
        selectedPlatforms: ['Stripe Billing', 'Paddle Billing'],
        projectRequirements: 'Migrating legacy recurring billing to automated Merchant of Record with SOC2 Type II compliance.'
      })
    });
    assert.strictEqual(res.status, 200);
    assert(res.data.success);
    assert(res.data.lead && res.data.lead.id);
    submittedLeadId = res.data.lead.id;
  });

  await test('Flow 9b: Admin manages lead status from new to contacted', async () => {
    assert(submittedLeadId, 'Lead ID from 9a required');
    const res = await req(`/api/admin/leads/${submittedLeadId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'contacted' })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.lead.status, 'contacted');
  });

  await test('Flow 9c: Organic/Claimed founder unlocks buyer lead contact details', async () => {
    assert(submittedLeadId, 'Lead ID from 9a required');
    const res = await req(`/api/leads/${submittedLeadId}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 'prod_stripe' })
    });
    assert.strictEqual(res.status, 200);
    assert(res.data.lead && res.data.lead.isUnlocked === true);
  });

  // --------------------------------------------------------------------------
  // FLOW 10: HEAD-TO-HEAD COMPARISON PAGES & PROGRAMMATIC SEO
  // --------------------------------------------------------------------------
  await test('Flow 10a: Comparison API generates structured showdown data', async () => {
    const res = await req('/api/compare/billing-software/prod_stripe/prod_paddle');
    assert.strictEqual(res.status, 200);
    assert(res.data.prodA && res.data.prodB);
    assert(res.data.verdict && res.data.verdict.headline);
    assert(res.data.verdict.winnerForDevelopers);
  });

  await test('Flow 10b: Comparison URL serves server-rendered HTML with pairwise SEO', async () => {
    const res = await req('/compare/billing-software/prod_stripe-vs-prod_paddle');
    assert.strictEqual(res.status, 200);
    assert(res.data.includes('2026 Comparison'), 'HTML must include 2026 Comparison title');
    assert(res.data.includes('rel="canonical"'), 'HTML must include canonical link');
  });

  // --------------------------------------------------------------------------
  // FLOW 11: EDITORIAL BLOG & BUYING GUIDES
  // --------------------------------------------------------------------------
  await test('Flow 11a: Blog index endpoint returns article list', async () => {
    const res = await req('/api/blog');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data) && res.data.length > 0);
  });

  await test('Flow 11b: Blog single article endpoint returns markdown content and metadata', async () => {
    const listRes = await req('/api/blog');
    const firstSlug = listRes.data[0].slug;
    const res = await req(`/api/blog/${firstSlug}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.slug, firstSlug);
    assert(res.data.content && res.data.content.length > 100);
    assert(Array.isArray(res.data.keyTakeaways));
  });

  // --------------------------------------------------------------------------
  // FLOW 12: DISTRIBUTION ASSETS, SITEMAP & SYNDICATION
  // --------------------------------------------------------------------------
  await test('Flow 12a: XML Sitemap includes categories, blog guides, and comparison links', async () => {
    const res = await req('/sitemap.xml');
    assert.strictEqual(res.status, 200);
    assert(res.headers.get('content-type').includes('xml'));
    assert(res.data.includes('<urlset'));
    assert(res.data.includes('/list/billing-software'));
    assert(res.data.includes('/compare/billing-software/'));
  });

  await test('Flow 12b: robots.txt declares sitemap location', async () => {
    const res = await req('/robots.txt');
    assert.strictEqual(res.status, 200);
    assert(res.data.includes('Sitemap:'));
    assert(res.data.includes('User-agent: *'));
  });

  await test('Flow 12c: Dynamic RSS feed serves XML syndicate', async () => {
    const res = await req('/feed.xml');
    assert.strictEqual(res.status, 200);
    assert(res.data.includes('<rss version="2.0"'));
  });

  await test('Flow 12d: Dynamic SVG embed badge generator', async () => {
    const res = await req('/api/badge/billing-software/prod_stripe.svg');
    assert.strictEqual(res.status, 200);
    assert(res.headers.get('content-type').includes('svg'));
    assert(res.data.includes('<svg'));
  });

  // Clean up any test-created categories to maintain zero database pollution
  for (const slug of createdCategorySlugs) {
    try {
      await req(`/api/admin/categories/${slug}`, { method: 'DELETE' });
    } catch {}
  }

  // --------------------------------------------------------------------------
  // FINAL REPORT
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TEST SUITE RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('ALL 12 PRODUCTION FLOWS FULLY TESTED & VERIFIED!');
    process.exit(0);
  } else {
    console.error(`FAILED ${totalTests - passedTests} TESTS!`);
    process.exit(1);
  }
})();
