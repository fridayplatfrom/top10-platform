const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const {
  ensureTenRealProducts,
  enrichCategoryEditorial,
  ensureDefaultEightCategories,
  DEFAULT_SITE_OG_IMAGE,
  getCategoryFeatureMeta,
  buildSeoJsonLd,
  buildLlmsTxt
} = require('./editorial-enrichment');
const { BLOG_ARTICLES } = require('./blog-data');
const { EDITORIAL_AUTHORS, DEFAULT_TOPIC_CATEGORIES, getAuthorsPool, resolveAuthor } = require('./authors-data');
const { initMariaDb, withDb, getDbState, saveDbState, getDbStatus } = require('./db');

const PORT = process.env.PORT || 3456;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ============================================================================
// PRODUCTION-GRADE AUTHENTICATION & SECURE SESSIONS
// ============================================================================
const isProduction = process.env.NODE_ENV === 'production';
const adminEmail = (process.env.ADMIN_EMAIL || 'admin@top10.io').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;
const publishKey = process.env.EDITORIAL_PUBLISH_KEY;
const editor = { id: 'usr_admin', name: 'Editor', email: adminEmail, role: 'admin', avatarText: 'ED', avatarBg: '#111827' };
const loginAttempts = new Map();
const sessionLifetime = 8 * 60 * 60 * 1000;
const sessionCookie = 'Path=/; HttpOnly; SameSite=Strict' + (isProduction ? '; Secure' : '');

function matchesSecret(candidate, secret) {
  const digest = value => crypto.createHash('sha256').update(value).digest();
  return Boolean(secret && candidate && crypto.timingSafeEqual(digest(candidate), digest(secret)));
}

function sessionId(token) {
  return crypto.createHmac('sha256', adminPassword).update(token).digest('hex');
}

function getSessionToken(req) {
  return (req?.headers.cookie || '').match(/(?:^|;\s*)top10_session=([a-f0-9]{64})(?:;|$)/)?.[1];
}

function getSession(req) {
  const token = getSessionToken(req);
  if (!token || !adminPassword) return null;
  const expiresAt = getDbState().editorSessions?.[sessionId(token)];
  return expiresAt > Date.now() ? editor : null;
}

function allowLogin(req) {
  const now = Date.now();
  const ip = req.socket.remoteAddress;
  for (const [address, entry] of loginAttempts) {
    if (entry.until <= now) loginAttempts.delete(address);
  }
  if (!loginAttempts.has(ip)) {
    if (loginAttempts.size >= 1000) return false;
    loginAttempts.set(ip, { attempts: 0, until: now + 15 * 60 * 1000 });
  }
  const entry = loginAttempts.get(ip);
  entry.attempts += 1;
  return entry.attempts <= 12;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, pass, ...clean } = user;
  return clean;
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session || session.role !== 'admin') {
    sendJson(res, 401, { error: 'Admin authorization required' }, req);
    return null;
  }
  return session;
}

function hasPublishingKey(req) {
  const auth = req.headers.authorization || '';
  const candidate = req.headers['x-api-key'] || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  return typeof candidate === 'string' && matchesSecret(candidate.trim(), publishKey);
}

function requirePublisherOrAdmin(req, res) {
  const session = getSession(req);
  if (session) return { type: 'admin_session', session };

  if (hasPublishingKey(req)) {
    return { type: 'api_key', apiKey: { id: 'env_key', name: 'Editorial Publishing Key' } };
  }
  sendJson(res, 401, { error: 'Editor session or valid publishing key required' }, req);
  return null;
}

function normalizeTagsInput(tagsInput) {
  let list = [];
  if (Array.isArray(tagsInput)) {
    list = tagsInput;
  } else if (typeof tagsInput === 'string') {
    list = tagsInput.split(',');
  }
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const clean = String(raw || '').trim().toLowerCase().replace(/^#/, '');
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

function normalizeTopicCategories(existingTopics) {
  const map = new Map();
  for (const def of DEFAULT_TOPIC_CATEGORIES) {
    map.set(def.slug, { ...def });
  }
  if (Array.isArray(existingTopics)) {
    for (const tc of existingTopics) {
      if (tc && (tc.slug || tc.name)) {
        const slug = String(tc.slug || tc.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (slug) {
          map.set(slug, { ...(map.get(slug) || {}), ...tc, slug, name: tc.name || tc.title || slug });
        }
      }
    }
  }
  return Array.from(map.values());
}

function ensureEditorialStore(parsed) {
  let dirty = false;
  if (!Array.isArray(parsed.authors) || parsed.authors.length < EDITORIAL_AUTHORS.length) {
    parsed.authors = getAuthorsPool(parsed.authors);
    dirty = true;
  }
  if (!Array.isArray(parsed.topicCategories) || parsed.topicCategories.length === 0) {
    parsed.topicCategories = normalizeTopicCategories([]);
    dirty = true;
  } else {
    parsed.topicCategories = normalizeTopicCategories(parsed.topicCategories);
  }
  if (!Array.isArray(parsed.tags)) {
    parsed.tags = [];
    dirty = true;
  }
  return dirty;
}

function isPubliclyPublished(cat) {
  if (!cat) return false;
  const st = cat.status || 'published';
  if (st === 'published') return true;
  if (st === 'scheduled' && cat.scheduledAt) {
    const ts = Date.parse(cat.scheduledAt);
    return !Number.isNaN(ts) && ts <= Date.now();
  }
  return false;
}

function promoteDueScheduledCategories(db) {
  if (!db || !Array.isArray(db.categories)) return [];
  const now = Date.now();
  const promoted = [];
  for (const cat of db.categories) {
    if (cat.status === 'scheduled' && cat.scheduledAt) {
      const dueTs = Date.parse(cat.scheduledAt);
      if (!Number.isNaN(dueTs) && dueTs <= now) {
        cat.status = 'published';
        cat.publishedAt = cat.scheduledAt;
        cat.updatedAt = new Date().toISOString();
        promoted.push(cat);
      }
    }
  }
  return promoted;
}

async function runScheduledPublisher() {
  try {
    const db = readDb();
    const promoted = promoteDueScheduledCategories(db);
    if (promoted.length > 0) {
      await saveDbState(db);
      for (const cat of promoted) {
        console.log(`[Scheduler] Auto-published scheduled article: ${cat.title} (/list/${cat.slug})`);
      }
    }
    return promoted;
  } catch (err) {
    if (err.statusCode !== 409) console.error('[Scheduler Error]', err.message);
    return [];
  }
}

function readDb() {
  const parsed = getDbState();
  parsed.categories = ensureDefaultEightCategories(parsed.categories);
  if (!parsed.platformStats) parsed.platformStats = {};
  if (!parsed.subscriptions) parsed.subscriptions = [];
  if (!parsed.reviews) parsed.reviews = [];
  if (!parsed.claims) parsed.claims = [];
  ensureEditorialStore(parsed);
  parsed.articles = [];
  return parsed;
}

function writeDb(data) {
  return saveDbState(data);
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function findProductInCat(cat, idOrName) {
  if (!cat || !cat.products || !idOrName) return null;
  const target = String(idOrName).trim().toLowerCase();
  const targetWords = target.replace(/^prod_/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return (
    cat.products.find((p) => p.id.toLowerCase() === target) ||
    cat.products.find((p) => p.id.toLowerCase().replace(/^prod_/, '') === targetWords.replace(/\s+/g, '_')) ||
    cat.products.find((p) => p.id.toLowerCase().replace(/^prod_/, '').replace(/[^a-z0-9]+/g, ' ') === targetWords) ||
    cat.products.find((p) => (p.name || '').toLowerCase() === target) ||
    cat.products.find((p) => (p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').includes(targetWords)) ||
    cat.products.find((p) => targetWords.includes((p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' '))) ||
    cat.products.find((p) => targetWords.split(' ')[0] && (p.name || '').toLowerCase().includes(targetWords.split(' ')[0])) ||
    null
  );
}

function enrichCategory(cat, platformStats, customAuthors = []) {
  const minEntry = Number(platformStats.minEntryBid || 49);
  const minInc = Number(platformStats.minOutbidIncrement || 25);

  const rankedAll = ensureTenRealProducts(cat).map((item, index) => {
    const {
      ownerEmail, claimedBy, claimedAt, retainerSubscription, claimed, isClaimed,
      hasHighlightBorder, hasPinnedCta, amountPaid, priceToTakeSlot, ...product
    } = item;
    return { ...product, amountPaid: 0, isOrganic: true, rank: index + 1 };
  });

  const top10 = rankedAll.slice(0, 10);
  const pushedOut = rankedAll.slice(10);

  const slotLadder = [];
  for (let r = 1; r <= 10; r++) {
    const holder = top10.find((p) => p.rank === r) || null;
    const currentBid = holder ? Number(holder.amountPaid || 0) : 0;
    const requiredBid = currentBid > 0 ? currentBid + minInc : minEntry;
    slotLadder.push({
      rank: r,
      holderName: holder ? holder.name : 'Empty Slot',
      holderId: holder ? holder.id : null,
      isOrganic: holder ? currentBid === 0 : true,
      currentBid,
      requiredBid
    });
  }

  const poolTotal = rankedAll.reduce((acc, p) => acc + Number(p.amountPaid || 0), 0);
  const highestBid = rankedAll.length > 0 ? Number(rankedAll[0].amountPaid || 0) : 0;
  const paidSlotsCount = top10.filter((p) => Number(p.amountPaid || 0) > 0).length;
  const openOrganicSlots = 10 - paidSlotsCount;

  const baseEnriched = {
    ...cat,
    products: rankedAll,
    top10,
    pushedOut,
    slotLadder,
    computedStats: {
      poolTotal,
      highestBid,
      paidSlotsCount,
      openOrganicSlots,
      minToEnterTop10:
        top10.length === 10 && Number(top10[9].amountPaid || 0) > 0
          ? Number(top10[9].amountPaid) + minInc
          : minEntry
    }
  };

  return enrichCategoryEditorial(baseEnriched, customAuthors);
}

function buildTagSummary(categories = [], registeredTags = []) {
  const counts = new Map();
  for (const t of registeredTags) {
    const clean = typeof t === 'string' ? t : t?.slug || t?.name;
    if (clean) counts.set(clean, 0);
  }
  for (const c of categories) {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    for (const t of tags) {
      const clean = String(t || '').trim().toLowerCase();
      if (clean) counts.set(clean, (counts.get(clean) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([slug, count]) => ({ slug, name: slug, count }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

function getPublicState(user) {
  const db = readDb();
  const isAdmin = user && user.role === 'admin';
  const authors = db.authors || EDITORIAL_AUTHORS;
  const allEnriched = (db.categories || []).map((c) => {
    const enriched = enrichCategory(c, db.platformStats, authors);
    const comments = (enriched.comments || []).filter((cmt) => {
      if (isAdmin) return true;
      return cmt.status === 'approved' || !cmt.status || cmt.type === 'system_event';
    });
    if (isAdmin) return { ...enriched, comments };
    const publicComments = [];
    return {
      ...enriched,
      comments: publicComments
    };
  });

  const categories = allEnriched.filter(isPubliclyPublished);
  const publicAuthors = authors.map((a) => {
    if (isAdmin) return a;
    const { email, ...safe } = a;
    return safe;
  });

  const totalRevenue = categories.reduce((sum, c) => sum + c.computedStats.poolTotal, 0);
  const totalPaidListings = categories.reduce((sum, c) => sum + c.computedStats.paidSlotsCount, 0);

  return {
    platformStats: {
      minEntryBid: db.platformStats?.minEntryBid || 49,
      minOutbidIncrement: db.platformStats?.minOutbidIncrement || 25,
      totalVolume: totalRevenue,
      totalPaidListings,
      totalCategories: categories.length
    },
    articles: (db.articles && db.articles.length > 0 ? db.articles : BLOG_ARTICLES).map((a) => ({
      ...a,
      content: a.contentHtml || a.content || '',
      keyTakeaways: a.takeaways || a.keyTakeaways || [],
      takeaways: a.takeaways || a.keyTakeaways || []
    })),
    categories,
    editorialArticles: isAdmin ? allEnriched : [],
    authors: publicAuthors,
    topicCategories: db.topicCategories || DEFAULT_TOPIC_CATEGORIES,
    tags: buildTagSummary(categories, db.tags || []),
    currentUser: sanitizeUser(user),
    buyerLeads: [],
    transactions: [],
    users: [],
    claims: [],
    subscriptions: [],
    reviews: []
  };
}

function getFullState() {
  const db = readDb();
  const authors = db.authors || EDITORIAL_AUTHORS;
  const allEnriched = db.categories.map((c) => enrichCategory(c, db.platformStats, authors));
  const categories = allEnriched.filter(isPubliclyPublished);
  const totalRevenue = categories.reduce((sum, c) => sum + c.computedStats.poolTotal, 0);
  const totalPaidListings = categories.reduce((sum, c) => sum + c.computedStats.paidSlotsCount, 0);

  return {
    platformStats: {
      ...db.platformStats,
      totalRevenue,
      totalPaidListings
    },
    users: (db.users || []).map(sanitizeUser),
    authors,
    topicCategories: db.topicCategories || DEFAULT_TOPIC_CATEGORIES,
    tags: buildTagSummary(categories, db.tags || []),
    editorialArticles: allEnriched,
    transactions: db.transactions || [],
    categoryRequests: db.categoryRequests || [],
    outbidAlerts: db.outbidAlerts || [],
    buyerLeads: db.buyerLeads || [],
    articles: (db.articles && db.articles.length > 0 ? db.articles : BLOG_ARTICLES).map((a) => ({
      ...a,
      content: a.contentHtml || a.content || '',
      keyTakeaways: a.takeaways || a.keyTakeaways || [],
      takeaways: a.takeaways || a.keyTakeaways || []
    })),
    categories
  };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 2e6) req.destroy();
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        const err = new Error('Malformed JSON payload');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendResponse(req, res, status, contentType, content, extraHeaders = {}) {
  const headers = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...extraHeaders
  };

  const acceptEncoding = (req && req.headers['accept-encoding']) || '';
  let payload = content;
  if (typeof payload === 'string') {
    payload = Buffer.from(payload, 'utf8');
  }

  // Compress with gzip if supported and payload >= 512 bytes
  if (acceptEncoding.includes('gzip') && Buffer.isBuffer(payload) && payload.length >= 512) {
    try {
      const gzipped = zlib.gzipSync(payload);
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      headers['Content-Length'] = gzipped.length;
      res.writeHead(status, headers);
      return res.end(gzipped);
    } catch {}
  }

  if (Buffer.isBuffer(payload)) {
    headers['Content-Length'] = payload.length;
  }
  res.writeHead(status, headers);
  res.end(payload);
}

function sendJson(res, status, payload, req = null, extraHeaders = {}) {
  const jsonStr = JSON.stringify(payload);
  if (req) {
    return sendResponse(req, res, status, 'application/json; charset=utf-8', jsonStr, {
      'Cache-Control': 'no-store',
      ...extraHeaders
    });
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...extraHeaders
  });
  res.end(jsonStr);
}

function render404(res, req, base, message = 'The requested Top 10 directory, buying guide, or page could not be found.') {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>404 — Page Not Found | Top 10</title>
  <meta name="robots" content="noindex, follow" />
  <link rel="stylesheet" href="/styles.css" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</head>
<body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#F9FAFB;font-family:Inter,sans-serif;margin:0;padding:20px;text-align:center;">
  <div style="max-width:540px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:14px;padding:48px 32px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.05);">
    <div style="font-size:56px;font-weight:900;color:#111827;letter-spacing:-0.04em;line-height:1;margin-bottom:12px;">404</div>
    <div style="font-size:14px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px;">Directory Not Found</div>
    <p style="font-size:15px;color:#4B5563;line-height:1.6;margin-bottom:28px;">${escapeXml(message)}</p>
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
      <a href="/" style="display:inline-flex;align-items:center;height:42px;padding:0 20px;border-radius:8px;background:#111827;color:#B8FF01;font-size:13.5px;font-weight:700;text-decoration:none;">Browse All Top 10 Guides</a>
    </div>
  </div>
</body>
</html>`;
  return sendResponse(req, res, 404, 'text/html; charset=utf-8', html);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function getBaseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

// ============================================================================
// REAL-TIME SERVER-SENT EVENTS (SSE) LIVE AUCTION & OUTBID BROADCASTER
// ============================================================================
function guideSummaries(categories) {
  return categories.filter(isPubliclyPublished).map(cat => {
    const meta = getCategoryFeatureMeta(cat);
    return {
      slug: cat.slug,
      title: meta.editorialTitle || cat.title,
      description: meta.description,
      url: '/list/' + encodeURIComponent(cat.slug),
      publishedAt: cat.publishedAt || (cat.status === 'scheduled' ? cat.scheduledAt : null)
    };
  }).sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
}

function guideCoverUrl(value) {
  const url = typeof value === 'string' ? value.trim() : '';
  return /^(?:https:\/\/|\/(?![\/\\]))/i.test(url) ? url : '';
}

function renderGuideArchive(categories, topicCategories) {
  const summaries = new Map(guideSummaries(categories).map(guide => [guide.slug, guide]));
  const topicNames = new Map(topicCategories.map(topic => [topic.slug, topic.name]));
  const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });
  const guides = categories.map(category => {
    const summary = summaries.get(category.slug);
    const meta = getCategoryFeatureMeta(category);
    const date = Number(Date.parse(summary.publishedAt || meta.isoDate));
    return {
      ...summary,
      cover: guideCoverUrl(meta.coverImage),
      topic: meta.topic,
      topicName: topicNames.get(meta.topic) || 'Buying guides',
      author: meta.authorName,
      date: Number.isFinite(date) ? date : 0,
      hasRankings: Boolean(category.top10?.length)
    };
  }).sort((a, b) => b.date - a.date);
  const featured = guides.find(guide => guide.cover && guide.hasRankings) || guides[0];
  const topics = new Map(guides.map(guide => [guide.topic, guide.topicName]));
  const image = (guide, eager = false) => guide.cover
    ? `<img src="${escapeXml(guide.cover)}" alt="" width="1200" height="675" decoding="async" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}>`
    : '';
  const byline = guide => `<p class="guide-index-byline">${escapeXml(guide.author)}${guide.date ? `
    <span aria-hidden="true">·</span><time datetime="${new Date(guide.date).toISOString()}">${dateFormat.format(guide.date)}</time>` : ''}</p>`;
  const topicFilters = [...topics].map(([slug, name]) => `
    <button type="button" data-guide-filter="${escapeXml(slug)}" aria-pressed="false">${escapeXml(name)}</button>`).join('');
  const rows = guides.map(guide => `
    <li class="guide-index-row" data-guide-topic="${escapeXml(guide.topic)}">
      <a class="guide-index-row-link" href="${escapeXml(guide.url)}">
        <span class="guide-index-thumb">${image(guide)}</span>
        <div class="guide-index-row-copy">
          <p class="guide-index-topic">${escapeXml(guide.topicName)}</p>
          <h3>${escapeXml(guide.title)}</h3>
          <p class="guide-index-excerpt">${escapeXml(guide.description)}</p>
          ${byline(guide)}
        </div>
        <span class="guide-index-arrow" aria-hidden="true">↗</span>
      </a>
    </li>`).join('');

  return `<main id="blogIndexSection" class="guide-archive">
    <div class="guide-index-shell">
      <header class="guide-index-head">
        <h1>Top 10 buying guides</h1>
        <p>Browse ranked picks and buying advice across software, hardware, and everyday products.</p>
      </header>
      ${featured ? `<section class="guide-index-feature" aria-labelledby="guide-feature-title">
        <a class="guide-index-feature-image" href="${escapeXml(featured.url)}" tabindex="-1" aria-hidden="true">${image(featured, true)}</a>
        <div class="guide-index-feature-copy">
          <p class="guide-index-topic">Featured guide · ${escapeXml(featured.topicName)}</p>
          <h2 id="guide-feature-title"><a href="${escapeXml(featured.url)}">${escapeXml(featured.title)}</a></h2>
          <p class="guide-index-excerpt">${escapeXml(featured.description)}</p>
          ${byline(featured)}
          <a class="guide-index-feature-cta" href="${escapeXml(featured.url)}">Read the guide <span aria-hidden="true">↗</span></a>
        </div>
      </section>` : ''}
      <section class="guide-index-library" aria-labelledby="guide-index-title">
        <h2 id="guide-index-title">All guides</h2>
        <div class="guide-index-controls" hidden>
          <div class="guide-index-filters" role="group" aria-label="Filter by topic">
            <button type="button" data-guide-filter="" aria-pressed="true">All topics</button>${topicFilters}
          </div>
          <input type="search" class="guide-index-search" aria-label="Search guides" placeholder="Search guides">
        </div>
        <ul class="guide-index-list">${rows}</ul>
        <p class="guide-index-empty" role="status"${guides.length ? ' hidden' : ''}>${guides.length ? 'No guides match your filters.' : 'No guides are published yet.'}</p>
      </section>
    </div>
  </main>`;
}

function marketplaceRoute(method, pathname) {
  return /^\/api\/(?:paypal|founder|claim|leads|category-requests|subscribers)(?:\/|$)/.test(pathname)
    || /^\/api\/admin\/(?:leads|category-requests|api-keys|reviews)(?:\/|$)/.test(pathname)
    || /^\/api\/categories\/[^/]+\/(?:bid|comments|products\/[^/]+\/(?:lead|interact))(?:\/|$)/.test(pathname)
    || /^\/api\/(?:webhooks\/paypal|lists\/create-paid|products\/click|user\/profile|admin\/product\/reset-bid|admin\/settings|events\/live-bids)\/?$/.test(pathname)
    || (method === 'PUT' && /^\/api\/categories\/[^/]+\/products\/[^/]+$/.test(pathname))
    || (method !== 'GET' && /^\/api\/blog(?:\/|$)/.test(pathname))
    || (method === 'POST' && /^\/api\/(?:reviews|categories\/[^/]+\/reviews)(?:\/|$)/.test(pathname));
}

const server = http.createServer(async (req, res) => {
  try {
    const base = getBaseUrl(req);
    const parsedUrl = new URL(req.url, base);
    const pathname = parsedUrl.pathname;
    if (marketplaceRoute(req.method, pathname)) {
      return sendJson(res, 404, { error: 'This feature is unavailable' }, req);
    }
    const asset = pathname !== '/index.html' && !pathname.startsWith('/api/')
      && path.extname(pathname) && fs.existsSync(path.join(PUBLIC_DIR, pathname));
    const handle = () => handleRequest(req, res, base, parsedUrl, pathname);
    if (asset) return await handle();
    await withDb(handle);
  } catch (err) {
    if (res.headersSent || res.destroyed) return;
    const status = err.statusCode || 500;
    if (status >= 500) console.error('Request failed:', err);
    sendJson(res, status, { error: status === 500 ? 'Internal Server Error' : err.message }, req);
  }
});

async function handleRequest(req, res, base, parsedUrl, pathname) {
    // Zero-404 Native SVG Favicons for Chrome and modern browsers
    if (req.method === 'GET' && (pathname === '/favicon.ico' || pathname === '/favicon.svg')) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="8" fill="#111827"/>
        <path d="M8 24L13.5 8H17L11.5 24H8Z" fill="#FFFFFF"/>
        <path d="M16 24L21.5 8H25L19.5 24H16Z" fill="#F59E0B"/>
      </svg>`;
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=604800, immutable'
      });
      return res.end(svg);
    }

    // Dynamic Crisp Vector Favicon / Logo Generator (Zero 404s, High Performance)
    if (req.method === 'GET' && pathname === '/api/favicon') {
      const domain = parsedUrl.searchParams.get('domain') || '';
      const rawText = parsedUrl.searchParams.get('text') || domain[0] || '★';
      const text = rawText.toUpperCase().slice(0, 2);
      const bg = parsedUrl.searchParams.get('bg') || '#111827';
      const color = parsedUrl.searchParams.get('color') || '#FFFFFF';

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="14" fill="${escapeXml(bg)}"/>
        <text x="50%" y="54%" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="32" font-weight="800" fill="${escapeXml(color)}" dominant-baseline="middle" text-anchor="middle">${escapeXml(text)}</text>
      </svg>`;

      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=604800, immutable'
      });
      return res.end(svg);
    }

    // 1. GET /api/state (Sanitized for public visitors, full view for admin)
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { status: 'ready' }, req);
    }

    if (req.method === 'GET' && pathname === '/api/state') {
      const session = getSession(req);
      return sendJson(res, 200, getPublicState(session), req);
    }

    // 1-auth. GET /api/auth/me (Current authenticated user session)
    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const session = getSession(req);
      return sendJson(res, 200, { user: sanitizeUser(session) }, req);
    }

    // 1-logout. POST /api/auth/logout
    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      const token = getSessionToken(req);
      if (token && getSession(req)) {
        const db = readDb();
        delete db.editorSessions[sessionId(token)];
        await writeDb(db);
      }
      return sendJson(res, 200, { success: true }, req, {
        'Set-Cookie': 'top10_session=; ' + sessionCookie + '; Max-Age=0'
      });
    }

    if (req.method === 'GET' && pathname === '/api/admin/db-status') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, getDbStatus(), req);
    }

    // 1-analytics. GET /api/admin/analytics (Platform Sales, Revenue & Conversion Command Center - Admin only)
    if (req.method === 'GET' && pathname === '/api/admin/analytics') {
      if (!requireAdmin(req, res)) return;
      const db = readDb();
      const txs = db.transactions || [];
      const subs = db.subscriptions || [];
      const cats = db.categories || [];
      const articles = (db.articles && db.articles.length > 0 ? db.articles : BLOG_ARTICLES);
      const leads = db.buyerLeads || [];
      const reviews = [];
      for (const cat of cats) {
        for (const c of (cat.comments || [])) {
          if (c.type === 'comment' || !c.type) reviews.push(c);
        }
      }

      let launchRevenue = 0;
      let bidRevenue = 0;
      let subscriptionRevenue = 0;
      let leadUnlockRevenue = 0;

      txs.forEach((t) => {
        const amt = Number(t.amount || 0);
        if (t.type === 'list_creation') launchRevenue += amt;
        else if (t.type === 'bid' || t.type === 'placement_bid') bidRevenue += amt;
        else if (t.type === 'retainer_subscription' || t.type === 'retainer_renewal') subscriptionRevenue += amt;
        else if (t.type === 'lead_unlock') leadUnlockRevenue += amt;
        else bidRevenue += amt;
      });

      const totalRevenue = launchRevenue + bidRevenue + subscriptionRevenue + leadUnlockRevenue;

      let mrr = 0;
      const activeSubs = subs.filter((s) => s.status === 'active');
      activeSubs.forEach((s) => {
        mrr += Number(s.monthlyAmount || (s.tier === 'top1' ? 299 : 149));
      });

      let totalDirectoryViews = 0;
      let totalClicks = 0;
      let totalProducts = 0;

      const categoryBreakdown = cats.map((cat) => {
        const catViews = Number(cat.monthlyViews || 0);
        totalDirectoryViews += catViews;

        let catClicks = 0;
        let topBid = 0;
        let topProduct = '-';

        (cat.products || []).forEach((p) => {
          totalProducts++;
          catClicks += Number(p.clicks || 0);
          totalClicks += Number(p.clicks || 0);
          const pBid = Number(p.amountPaid || 0);
          if (pBid > topBid) {
            topBid = pBid;
            topProduct = p.name;
          }
        });

        const catRevenue = txs
          .filter((t) => t.categorySlug === cat.slug)
          .reduce((sum, t) => sum + Number(t.amount || 0), 0);

        return {
          title: cat.title,
          slug: cat.slug,
          icon: cat.icon || '📁',
          monthlyViews: catViews,
          productCount: (cat.products || []).length,
          totalClicks: catClicks,
          categoryRevenue: catRevenue,
          topProduct,
          topBid
        };
      });

      const ctr = totalDirectoryViews > 0 ? ((totalClicks / totalDirectoryViews) * 100).toFixed(2) : '3.85';

      const authorsPool = db.authors || EDITORIAL_AUTHORS;
      const enrichedCats = cats.map((c) => enrichCategory(c, db.platformStats, authorsPool));
      const publishedArts = enrichedCats.filter((c) => (c.status || 'published') === 'published');
      const scheduledArts = enrichedCats
        .filter((c) => c.status === 'scheduled')
        .sort((a, b) => new Date(a.scheduledAt || 0).getTime() - new Date(b.scheduledAt || 0).getTime());
      const draftArts = enrichedCats.filter((c) => c.status === 'draft');

      const authorStatsMap = new Map();
      for (const a of authorsPool) {
        authorStatsMap.set(a.id, {
          id: a.id,
          name: a.name,
          role: a.role,
          avatar: a.avatar,
          articlesCount: 0,
          scheduledCount: 0,
          totalViews: 0,
          totalClicks: 0
        });
      }
      const articleMetrics = [];
      for (const ec of enrichedCats) {
        const meta = getCategoryFeatureMeta(ec, authorsPool);
        const views = Number(ec.monthlyViews || 0);
        const clicks = [...(ec.top10 || []), ...(ec.pushedOut || [])].reduce((s, p) => s + Number(p.clicks || 0), 0);
        const aEntry = authorStatsMap.get(meta.authorId) || {
          id: meta.authorId,
          name: meta.authorName,
          role: meta.authorRole,
          avatar: meta.authorAvatar,
          articlesCount: 0,
          scheduledCount: 0,
          totalViews: 0,
          totalClicks: 0
        };
        if ((ec.status || 'published') === 'scheduled') aEntry.scheduledCount += 1;
        else if ((ec.status || 'published') === 'published') aEntry.articlesCount += 1;
        aEntry.totalViews += views;
        aEntry.totalClicks += clicks;
        authorStatsMap.set(aEntry.id, aEntry);

        articleMetrics.push({
          slug: ec.slug,
          title: ec.title,
          editorialTitle: meta.editorialTitle,
          status: ec.status || 'published',
          scheduledAt: ec.scheduledAt || null,
          publishedAt: ec.publishedAt || meta.isoDate,
          topic: meta.topic,
          tags: meta.tags,
          authorId: meta.authorId,
          authorName: meta.authorName,
          authorRole: meta.authorRole,
          authorAvatar: meta.authorAvatar,
          views,
          clicks,
          ctr: views > 0 ? ((clicks / views) * 100).toFixed(1) + '%' : '0.0%'
        });
      }

      const tagStats = buildTagSummary(enrichedCats, db.tags || []);
      const topicCategories = db.topicCategories || DEFAULT_TOPIC_CATEGORIES;
      const topicStats = topicCategories.map((tc) => ({
        ...tc,
        count: enrichedCats.filter((ec) => (ec.topic || 'software') === tc.slug).length
      }));

      return sendJson(res, 200, {
        overview: {
          totalRevenue,
          mrr,
          activeSubscriptionsCount: activeSubs.length,
          totalDirectoryViews,
          totalClicks,
          ctr: `${ctr}%`,
          totalCategories: cats.length,
          totalProducts,
          totalArticles: publishedArts.length,
          publishedArticlesCount: publishedArts.length,
          scheduledArticlesCount: scheduledArts.length,
          draftArticlesCount: draftArts.length,
          totalAuthors: authorsPool.length,
          totalTags: tagStats.length,
          totalTopicCategories: topicCategories.length,
          totalLeads: leads.length,
          unlockedLeadsCount: leads.filter((l) => l.isUnlocked).length,
          totalReviews: reviews.length,
          approvedReviews: reviews.filter((r) => r.status === 'approved').length,
          pendingReviews: reviews.filter((r) => r.status === 'pending').length
        },
        revenueByStream: {
          launches: { total: launchRevenue, count: txs.filter((t) => t.type === 'list_creation').length, label: '$99 Directory Launches' },
          bids: { total: bidRevenue, count: txs.filter((t) => t.type === 'bid' || t.type === 'placement_bid').length, label: 'Programmatic Placement Bids' },
          subscriptions: { total: subscriptionRevenue, count: activeSubs.length, label: 'PayPal MRR Retainers' },
          leadUnlocks: { total: leadUnlockRevenue, count: txs.filter((t) => t.type === 'lead_unlock').length, label: 'Enterprise Lead Unlocks ($49)' }
        },
        editorialAnalytics: {
          scheduledQueue: scheduledArts.map((c) => {
            const m = getCategoryFeatureMeta(c, authorsPool);
            return {
              slug: c.slug,
              title: c.title,
              editorialTitle: m.editorialTitle,
              scheduledAt: c.scheduledAt,
              authorName: m.authorName,
              authorAvatar: m.authorAvatar,
              topic: m.topic,
              tags: m.tags
            };
          }),
          articleMetrics: articleMetrics.sort((a, b) => b.views - a.views),
          authorStats: Array.from(authorStatsMap.values()).sort((a, b) => b.totalViews - a.totalViews),
          tagStats,
          topicStats
        },
        categoryBreakdown,
        recentTransactions: txs.slice(0, 15),
        activeSubscriptions: activeSubs
      });
    }

    // ------------------------------------------------------------------------
    // 1-pub. DIRECT ARTICLE PUBLISHING, AUTHORS, TAGS, CATEGORIES & SCHEDULING API
    // Supports BOTH Admin Session Cookie/Bearer AND X-API-Key Header
    // ------------------------------------------------------------------------

    function buildStructuredProductItem(item, index, slug, catTitle) {
      const palette = ['#2563EB', '#059669', '#7C3AED', '#EA580C', '#0284C7', '#4F46E5', '#0D9488', '#DC2626', '#334155', '#9333EA'];
      if (typeof item === 'string') {
        const clean = item.trim();
        return {
          id: `prod_${slug}_${Date.now()}_${index}`,
          name: clean,
          companyName: clean,
          tagline: `Verified contender in ${catTitle}.`,
          website: 'https://example.com',
          pricingTag: 'Flexible Pricing',
          highlightTag: '@Editor Pick',
          logoText: clean.slice(0, 2).toUpperCase(),
          logoBg: palette[index % palette.length],
          logoColor: '#FFFFFF',
          amountPaid: 0,
          isOrganic: true,
          ownerEmail: '',
          clicks: Math.max(120, 850 - index * 70),
          upvotes: Math.max(18, 95 - index * 7),
          updatedAt: new Date().toISOString()
        };
      }
      const pName = (item.name || item.title || `Pick #${index + 1}`).trim();
      const pid = item.id || `prod_${slug}_${pName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${index}`;
      return {
        id: pid,
        name: pName,
        companyName: (item.companyName || item.company || pName).trim(),
        tagline: (item.tagline || item.summary || `Featured top choice in ${catTitle}.`).trim(),
        website: (item.website || item.url || 'https://example.com').trim(),
        pricingTag: (item.pricingTag || item.pricing || item.startingPrice || 'Custom / Free Tier').trim(),
        highlightTag: (item.highlightTag || item.badge || `@Rank #${index + 1} Pick`).trim(),
        editorialSummary: item.editorialSummary || item.description || undefined,
        pros: Array.isArray(item.pros) ? item.pros : undefined,
        cons: Array.isArray(item.cons) ? item.cons : undefined,
        specs: item.specs && typeof item.specs === 'object' ? item.specs : undefined,
        media: item.media || (item.image || item.heroImage ? { heroImage: item.image || item.heroImage } : undefined),
        logoText: (item.logoText || pName.slice(0, 2)).toUpperCase(),
        logoBg: item.logoBg || palette[index % palette.length],
        logoColor: item.logoColor || '#FFFFFF',
        amountPaid: 0,
        isOrganic: true,
        ownerEmail: item.ownerEmail || '',
        clicks: Number(item.clicks ?? Math.max(120, 850 - index * 70)),
        upvotes: Number(item.upvotes ?? Math.max(18, 95 - index * 7)),
        updatedAt: new Date().toISOString()
      };
    }

    function applyEditorialFieldsToCategory(cat, body, db) {
      if (body.authorId || body.authorName || body.author) {
        const resolved = resolveAuthor(db.authors, {
          authorId: body.authorId,
          authorName: body.authorName || (typeof body.author === 'string' ? body.author : body.author?.name),
          authorRole: body.authorRole || body.author?.role,
          authorAvatar: body.authorAvatar || body.author?.avatar,
          authorBio: body.authorBio || body.author?.bio
        });
        cat.authorId = resolved.id;
        cat.authorName = resolved.name;
        cat.authorRole = body.authorRole || resolved.role;
        cat.authorAvatar = body.authorAvatar || resolved.avatar;
        cat.authorBio = body.authorBio || resolved.bio;
      }
      if (body.editorialTitle !== undefined) cat.editorialTitle = String(body.editorialTitle).trim();
      if (body.editorialIntro !== undefined) cat.editorialIntro = String(body.editorialIntro).trim();
      if (body.methodology !== undefined) cat.methodology = String(body.methodology).trim();
      if (body.coverImage !== undefined && String(body.coverImage).trim()) {
        cat.coverImage = String(body.coverImage).trim();
      }
      if (body.topic !== undefined || body.categoryGroup !== undefined) {
        const rawTopic = String(body.topic || body.categoryGroup || 'software').trim();
        const topicSlug = rawTopic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'software';
        cat.topic = topicSlug;
        db.topicCategories = normalizeTopicCategories(db.topicCategories);
        if (!db.topicCategories.some((tc) => tc.slug === topicSlug)) {
          db.topicCategories.push({
            slug: topicSlug,
            name: body.topicName || body.categoryName || rawTopic,
            icon: body.topicIcon || '📂',
            description: body.topicDescription || `${rawTopic} guides and rankings.`
          });
        }
      }
      if (body.tags !== undefined) {
        const normTags = normalizeTagsInput(body.tags);
        cat.tags = normTags;
        db.tags = Array.isArray(db.tags) ? db.tags : [];
        for (const t of normTags) {
          if (!db.tags.includes(t)) db.tags.push(t);
        }
      }
      if (body.seo && typeof body.seo === 'object') {
        cat.seo = {
          metaTitle: body.seo.metaTitle || cat.seo?.metaTitle || '',
          metaDescription: body.seo.metaDescription || cat.seo?.metaDescription || '',
          focusKeyword: body.seo.focusKeyword || cat.seo?.focusKeyword || ''
        };
      }
      // Publication Status & Scheduling
      const reqStatus = body.status === undefined ? null : String(body.status).toLowerCase();
      if (reqStatus !== null && !['published', 'scheduled', 'draft'].includes(reqStatus)) {
        const err = new Error('status must be published, scheduled, or draft');
        err.statusCode = 400;
        throw err;
      }
      const reqSched = body.scheduledAt ? String(body.scheduledAt).trim() : null;
      if (body.scheduledAt === null) {
        if (reqStatus === 'scheduled') {
          const err = new Error('scheduledAt ISO timestamp is required when status is scheduled');
          err.statusCode = 400;
          throw err;
        }
        cat.scheduledAt = null;
        if (!reqStatus && cat.status === 'scheduled') cat.status = 'draft';
      }
      if (reqSched) {
        const ts = Date.parse(reqSched);
        if (Number.isNaN(ts)) {
          const err = new Error('Invalid scheduledAt ISO date-time string');
          err.statusCode = 400;
          throw err;
        }
        cat.scheduledAt = new Date(ts).toISOString();
        if (reqStatus === 'draft') {
          cat.status = 'draft';
        } else if (ts > Date.now()) {
          cat.status = 'scheduled';
        } else {
          cat.status = 'published';
          cat.publishedAt = cat.scheduledAt;
        }
      } else if (reqStatus) {
        if (reqStatus === 'scheduled' && !cat.scheduledAt) {
          const err = new Error('scheduledAt ISO timestamp is required when status is scheduled');
          err.statusCode = 400;
          throw err;
        }
        cat.status = reqStatus;
        if (reqStatus === 'published' && !cat.publishedAt) {
          cat.publishedAt = new Date().toISOString();
        }
      } else if (!cat.status) {
        cat.status = 'published';
        if (!cat.publishedAt) cat.publishedAt = new Date().toISOString();
      }
    }

    // 1-pub-a. GET /api/authors (Human Editorial Author Directory)
    if (req.method === 'GET' && pathname === '/api/authors') {
      const db = readDb();
      const session = getSession(req);
      const isAuthorized = (session && session.role === 'admin') || hasPublishingKey(req);
      const authors = (db.authors || EDITORIAL_AUTHORS).map((a) => {
        const count = (db.categories || []).filter((c) => {
          const m = getCategoryFeatureMeta(c, db.authors);
          return m.authorId === a.id && (isAuthorized || isPubliclyPublished(c));
        }).length;
        if (isAuthorized) return { ...a, articlesCount: count };
        const { email, ...safe } = a;
        return { ...safe, articlesCount: count };
      });
      return sendJson(res, 200, { authors }, req);
    }

    // 1-pub-b. POST /api/admin/authors | /api/publish/authors (Create/Update Author)
    if (req.method === 'POST' && (pathname === '/api/admin/authors' || pathname === '/api/publish/authors')) {
      if (!requirePublisherOrAdmin(req, res)) return;
      const body = await parseBody(req);
      const name = (body.name || '').trim();
      if (!name) return sendJson(res, 400, { error: 'Author name is required' }, req);
      const db = readDb();
      const id = body.id || `auth_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString().slice(-4)}`;
      const newAuthor = {
        id,
        name,
        role: (body.role || body.jobTitle || 'Senior Contributor').trim(),
        avatar: (body.avatar || body.image || EDITORIAL_AUTHORS[db.authors.length % EDITORIAL_AUTHORS.length].avatar).trim(),
        bio: (body.bio || `${name} researches and reviews software, hardware, and digital products for Top 10.`).trim(),
        location: (body.location || 'Remote').trim(),
        email: (body.email || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@top10.io`).trim(),
        expertise: Array.isArray(body.expertise)
          ? body.expertise
          : normalizeTagsInput(body.expertise || ''),
        twitter: (body.twitter || '').trim(),
        linkedin: (body.linkedin || '').trim(),
        verified: body.verified !== false,
        custom: true,
        createdAt: new Date().toISOString()
      };
      const existingIdx = db.authors.findIndex((a) => a.id === id);
      if (existingIdx !== -1) {
        const previous = db.authors[existingIdx];
        db.authors[existingIdx] = { ...previous, ...newAuthor, custom: previous.custom, createdAt: previous.createdAt || newAuthor.createdAt };
        for (const article of db.categories.filter((item) => item.authorId === id)) {
          for (const [field, profileField] of Object.entries({
            authorName: 'name', authorRole: 'role', authorAvatar: 'avatar', authorBio: 'bio'
          })) {
            if (!article[field] || article[field] === previous[profileField]) article[field] = newAuthor[profileField];
          }
        }
      } else db.authors.push(newAuthor);
      await writeDb(db);
      return sendJson(res, 201, { success: true, author: newAuthor, state: getPublicState(getSession(req)) }, req);
    }

    // 1-pub-c. DELETE /api/admin/authors/:id
    const authorIdMatch = pathname.match(/^\/api\/admin\/authors\/([^/]+)$/);
    if (req.method === 'DELETE' && authorIdMatch) {
      if (!requirePublisherOrAdmin(req, res)) return;
      const aId = authorIdMatch[1];
      if (EDITORIAL_AUTHORS.some((author) => author.id === aId)) {
        return sendJson(res, 409, { error: 'Built-in authors cannot be deleted' }, req);
      }
      const db = readDb();
      const idx = (db.authors || []).findIndex((a) => a.id === aId);
      if (idx === -1) return sendJson(res, 404, { error: 'Author not found' }, req);
      db.authors.splice(idx, 1);
      await writeDb(db);
      return sendJson(res, 200, { success: true, state: getPublicState(getSession(req)) }, req);
    }

    // 1-pub-d. GET /api/taxonomy/categories & POST /api/admin/taxonomy/categories | /api/publish/categories
    if (req.method === 'GET' && pathname === '/api/taxonomy/categories') {
      const db = readDb();
      const visibleCats = (db.categories || []).filter(isPubliclyPublished);
      const topics = (db.topicCategories || DEFAULT_TOPIC_CATEGORIES).map((tc) => {
        const mCount = visibleCats.filter((c) => getCategoryFeatureMeta(c, db.authors).topic === tc.slug).length;
        return { ...tc, articlesCount: mCount };
      });
      return sendJson(res, 200, { categories: topics }, req);
    }

    if (req.method === 'POST' && (pathname === '/api/admin/taxonomy/categories' || pathname === '/api/publish/categories')) {
      if (!requirePublisherOrAdmin(req, res)) return;
      const body = await parseBody(req);
      const name = (body.name || body.title || '').trim();
      if (!name) return sendJson(res, 400, { error: 'Category name is required' }, req);
      const slug = (body.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!slug) return sendJson(res, 400, { error: 'Valid category slug required' }, req);
      const db = readDb();
      const existing = db.topicCategories.find((tc) => tc.slug === slug);
      if (existing && !body.upsert) {
        return sendJson(res, 409, { error: `Topic category "${slug}" already exists` }, req);
      }
      const topicObj = {
        slug,
        name,
        icon: (body.icon || '📂').trim(),
        description: (body.description || `${name} guides and benchmark comparisons.`).trim()
      };
      if (existing) Object.assign(existing, topicObj);
      else db.topicCategories.push(topicObj);
      await writeDb(db);
      return sendJson(res, 201, { success: true, category: topicObj, state: getPublicState(getSession(req)) }, req);
    }

    const delTopicMatch = pathname.match(/^\/api\/admin\/taxonomy\/categories\/([^/]+)$/);
    if (req.method === 'DELETE' && delTopicMatch) {
      if (!requirePublisherOrAdmin(req, res)) return;
      const slug = delTopicMatch[1];
      if (DEFAULT_TOPIC_CATEGORIES.some((topic) => topic.slug === slug)) {
        return sendJson(res, 409, { error: 'Built-in categories cannot be deleted' }, req);
      }
      const db = readDb();
      const idx = (db.topicCategories || []).findIndex((tc) => tc.slug === slug);
      if (idx === -1) return sendJson(res, 404, { error: 'Topic category not found' }, req);
      db.topicCategories.splice(idx, 1);
      await writeDb(db);
      return sendJson(res, 200, { success: true, state: getPublicState(getSession(req)) }, req);
    }

    // 1-pub-e. GET /api/tags & POST /api/admin/tags | /api/publish/tags & DELETE /api/admin/tags/:slug
    if (req.method === 'GET' && pathname === '/api/tags') {
      const db = readDb();
      const visibleCats = (db.categories || []).filter(isPubliclyPublished);
      return sendJson(res, 200, { tags: buildTagSummary(visibleCats, db.tags || []) }, req);
    }

    if (req.method === 'POST' && (pathname === '/api/admin/tags' || pathname === '/api/publish/tags')) {
      if (!requirePublisherOrAdmin(req, res)) return;
      const body = await parseBody(req);
      const incoming = normalizeTagsInput(body.tags || body.tag || body.name || '');
      if (incoming.length === 0) return sendJson(res, 400, { error: 'At least one tag name is required' }, req);
      const db = readDb();
      for (const t of incoming) {
        if (!db.tags.includes(t)) db.tags.push(t);
      }
      await writeDb(db);
      return sendJson(res, 201, { success: true, added: incoming, tags: buildTagSummary(db.categories, db.tags), state: getPublicState(getSession(req)) }, req);
    }

    const delTagMatch = pathname.match(/^\/api\/admin\/tags\/([^/]+)$/);
    if (req.method === 'DELETE' && delTagMatch) {
      if (!requirePublisherOrAdmin(req, res)) return;
      const tagSlug = decodeURIComponent(delTagMatch[1]).toLowerCase();
      const db = readDb();
      db.tags = (db.tags || []).filter((t) => t !== tagSlug);
      for (const c of (db.categories || [])) {
        if (Array.isArray(c.tags)) {
          c.tags = c.tags.filter((t) => t !== tagSlug);
        }
      }
      await writeDb(db);
      return sendJson(res, 200, { success: true, state: getPublicState(getSession(req)) }, req);
    }

    // 1-pub-f. GET /api/publish/articles | /api/admin/articles
    if (req.method === 'GET' && (pathname === '/api/publish/articles' || pathname === '/api/admin/articles')) {
      if (!requirePublisherOrAdmin(req, res)) return;
      const db = readDb();
      const statusFilter = parsedUrl.searchParams.get('status');
      const topicFilter = parsedUrl.searchParams.get('topic');
      const authorFilter = parsedUrl.searchParams.get('authorId');
      const tagFilter = parsedUrl.searchParams.get('tag');
      let list = (db.categories || []).map((c) => enrichCategory(c, db.platformStats, db.authors));
      if (statusFilter) list = list.filter((a) => (a.status || 'published') === statusFilter);
      if (topicFilter) list = list.filter((a) => a.topic === topicFilter);
      if (authorFilter) list = list.filter((a) => a.authorId === authorFilter);
      if (tagFilter) list = list.filter((a) => Array.isArray(a.tags) && a.tags.includes(tagFilter.toLowerCase()));
      const limitParam = parsedUrl.searchParams.get('limit');
      const offsetParam = parsedUrl.searchParams.get('offset');
      if (limitParam !== null || offsetParam !== null) {
        const limit = limitParam === null ? 50 : Number(limitParam);
        const offset = offsetParam === null ? 0 : Number(offsetParam);
        if ((limitParam !== null && !/^\d+$/.test(limitParam)) ||
            (offsetParam !== null && !/^\d+$/.test(offsetParam)) ||
            !Number.isInteger(limit) || limit < 1 || limit > 100 ||
            !Number.isSafeInteger(offset) || offset < 0) {
          return sendJson(res, 400, { error: 'limit must be an integer from 1 to 100; offset must be a nonnegative safe integer' }, req);
        }
        const articles = list.slice(offset, offset + limit);
        const nextOffset = offset + articles.length < list.length ? offset + articles.length : null;
        return sendJson(res, 200, { count: articles.length, total: list.length, limit, offset, nextOffset, articles }, req);
      }
      return sendJson(res, 200, { count: list.length, articles: list }, req);
    }

    // 1-pub-g. POST /api/publish/article | /api/admin/publish/article | /api/articles (Direct Full Article Publishing & Scheduling API)
    if (
      req.method === 'POST' &&
      (pathname === '/api/publish/article' || pathname === '/api/admin/publish/article' || pathname === '/api/articles')
    ) {
      if (!requirePublisherOrAdmin(req, res)) return;
      const body = await parseBody(req);
      const rawTitle = (body.title || body.editorialTitle || '').trim();
      if (!rawTitle) return sendJson(res, 400, { error: 'Article title is required' }, req);

      const db = readDb();
      const slug = (body.slug || rawTitle)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `guide-${Date.now()}`;

      const existingIdx = db.categories.findIndex((c) => c.slug === slug);
      if (existingIdx !== -1 && !body.upsert) {
        return sendJson(res, 409, { error: `An article with slug "${slug}" already exists. Pass upsert: true to update.` }, req);
      }

      const shortName = rawTitle.replace(/^Top\s+10\s+/i, '').trim() || rawTitle;
      const title = rawTitle.toLowerCase().startsWith('top 10') ? rawTitle : `Top 10 ${rawTitle}`;
      const existingCat = existingIdx !== -1 ? db.categories[existingIdx] : null;

      const rawProducts = Array.isArray(body.products) ? body.products : (Array.isArray(body.items) ? body.items : null);
      const mappedProducts = rawProducts !== null
        ? rawProducts.map((p, idx) => buildStructuredProductItem(p, idx, slug, title))
        : (existingCat?.products || []);

      const targetCat = existingCat || {
        id: slug,
        slug,
        title,
        shortName,
        subtitle: body.subtitle || `${shortName} · 2026 Buying Guide & Live Rankings`,
        tagline: body.tagline || body.subtitle || body.description || `Curated Top 10 buying guide for ${shortName}.`,
        description: body.description || body.editorialIntro || `Comprehensive comparison and verified benchmark directory for ${title}.`,
        icon: body.icon || '📝',
        iconText: (body.iconText || shortName.slice(0, 2)).toUpperCase(),
        iconBg: body.iconBg || '#111827',
        iconColor: body.iconColor || '#B8FF01',
        updatedAgo: 'just now',
        monthlyViews: Number(body.monthlyViews || 1500),
        criteria: Array.isArray(body.criteria) && body.criteria.length > 0 ? body.criteria : [
          'Core capabilities and benchmark reliability',
          'Pricing transparency and value at scale',
          'Verified user adoption and editorial score'
        ],
        faqs: Array.isArray(body.faqs) ? body.faqs : [],
        metrics: {
          monthlyViews: String(body.monthlyViews || '1.5k'),
          buyerClicks: '420',
          poolRevenue: '$0',
          topBid: '$0'
        },
        products: mappedProducts,
        comments: [],
        createdAt: new Date().toISOString()
      };

      if (existingCat) {
        if (body.title) targetCat.title = title;
        if (body.tagline !== undefined) targetCat.tagline = String(body.tagline).trim();
        if (body.subtitle !== undefined) targetCat.subtitle = String(body.subtitle).trim();
        if (body.description !== undefined) targetCat.description = String(body.description).trim();
        if (body.icon !== undefined) targetCat.icon = String(body.icon).trim();
        if (body.monthlyViews !== undefined) targetCat.monthlyViews = Number(body.monthlyViews) || targetCat.monthlyViews;
        if (Array.isArray(body.criteria)) targetCat.criteria = body.criteria;
        if (Array.isArray(body.faqs)) targetCat.faqs = body.faqs;
        if (rawProducts !== null) targetCat.products = mappedProducts;
      }

      if (!body.editorialTitle && body.title) {
        targetCat.editorialTitle = rawTitle;
      }
      applyEditorialFieldsToCategory(targetCat, body, db);
      targetCat.updatedAt = new Date().toISOString();

      if (existingIdx === -1) {
        db.categories.push(targetCat);
      }
      await writeDb(db);
      const enriched = enrichCategory(targetCat, db.platformStats, db.authors);
      if (targetCat.status === 'published') {
      }
      return sendJson(
        res,
        existingIdx === -1 ? 201 : 200,
        {
          success: true,
          url: `${base}/list/${targetCat.slug}`,
          status: targetCat.status,
          scheduledAt: targetCat.scheduledAt || null,
          article: enriched,
          state: getPublicState(getSession(req))
        },
        req
      );
    }

    // 1-pub-h. PUT/PATCH/DELETE /api/publish/article/:slug & POST /api/publish/article/:slug/publish-now
    const pubNowMatch = pathname.match(/^\/api\/(?:publish|admin)\/articles?\/([^/]+)\/publish-now$/);
    if (req.method === 'POST' && pubNowMatch) {
      if (!requirePublisherOrAdmin(req, res)) return;
      const slug = pubNowMatch[1];
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Article not found' }, req);
      cat.status = 'published';
      cat.publishedAt = new Date().toISOString();
      cat.scheduledAt = null;
      cat.updatedAt = new Date().toISOString();
      await writeDb(db);
      return sendJson(res, 200, { success: true, article: enrichCategory(cat, db.platformStats, db.authors), state: getPublicState(getSession(req)) }, req);
    }

    const pubArticleMatch = pathname.match(/^\/api\/(?:publish|admin)\/articles?\/([^/]+)$/);
    if (req.method === 'GET' && pubArticleMatch) {
      if (!requirePublisherOrAdmin(req, res)) return;
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === pubArticleMatch[1]);
      if (!cat) return sendJson(res, 404, { error: 'Article not found' }, req);
      return sendJson(res, 200, { article: enrichCategory(cat, db.platformStats, db.authors) }, req);
    }

    if ((req.method === 'PUT' || req.method === 'PATCH') && pubArticleMatch) {
      if (!requirePublisherOrAdmin(req, res)) return;
      const slug = pubArticleMatch[1];
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Article not found' }, req);

      if (body.title !== undefined) {
        const title = String(body.title).trim();
        if (!title) return sendJson(res, 400, { error: 'Article title is required' }, req);
        if (!cat.editorialTitle || cat.editorialTitle === cat.title || cat.title === `Top 10 ${cat.editorialTitle}`) {
          cat.editorialTitle = title;
        }
        cat.title = title;
      }
      if (body.tagline !== undefined) cat.tagline = String(body.tagline).trim();
      if (body.subtitle !== undefined) cat.subtitle = String(body.subtitle).trim();
      if (body.description !== undefined) cat.description = String(body.description).trim();
      if (body.icon !== undefined) cat.icon = String(body.icon).trim();
      if (body.monthlyViews !== undefined) cat.monthlyViews = Number(body.monthlyViews) || cat.monthlyViews;
      if (Array.isArray(body.criteria)) cat.criteria = body.criteria;
      if (Array.isArray(body.faqs)) cat.faqs = body.faqs;
      if (Array.isArray(body.products)) {
        cat.products = body.products.map((p, idx) => buildStructuredProductItem(p, idx, slug, cat.title));
      }
      applyEditorialFieldsToCategory(cat, body, db);
      cat.updatedAt = new Date().toISOString();
      await writeDb(db);
      return sendJson(res, 200, { success: true, article: enrichCategory(cat, db.platformStats, db.authors), state: getPublicState(getSession(req)) }, req);
    }

    if (req.method === 'DELETE' && pubArticleMatch) {
      if (!requirePublisherOrAdmin(req, res)) return;
      const slug = pubArticleMatch[1];
      const db = readDb();
      const idx = db.categories.findIndex((c) => c.slug === slug);
      if (idx === -1) return sendJson(res, 404, { error: 'Article not found' }, req);
      db.categories.splice(idx, 1);
      await writeDb(db);
      return sendJson(res, 200, { success: true, state: getPublicState(getSession(req)) }, req);
    }

    // 1-pub-i. POST /api/admin/scheduler/run & GET/POST /api/admin/api-keys
    if (req.method === 'POST' && pathname === '/api/admin/scheduler/run') {
      if (!requirePublisherOrAdmin(req, res)) return;
      const promoted = await runScheduledPublisher();
      return sendJson(res, 200, {
        success: true,
        promotedCount: promoted.length,
        promotedSlugs: promoted.map((c) => c.slug),
        state: getPublicState(getSession(req))
      }, req);
    }

    if (req.method === 'GET' && /^\/api\/blog(?:\/[^/]+)?$/.test(pathname)) {
      const guides = guideSummaries(readDb().categories);
      if (pathname === '/api/blog') return sendJson(res, 200, guides, req);
      const guide = guides.find(item => item.slug === pathname.slice('/api/blog/'.length));
      return guide ? sendJson(res, 200, guide, req) : sendJson(res, 404, { error: 'Guide unavailable' }, req);
    }

    // 1b. GET /api/badge/:slug/:productId.svg (Dynamic Live Rank SVG Badge for Company Websites)
    const badgeMatch = pathname.match(/^\/api\/badge\/([^/]+)\/([^/.]+)\.svg$/);
    if (req.method === 'GET' && badgeMatch) {
      const [, slug, prodId] = badgeMatch;
      const db = readDb();
      const rawCat = db.categories.find((c) => c.slug === slug && isPubliclyPublished(c));
      if (!rawCat) {
        res.writeHead(404, { 'Cache-Control': 'no-store' });
        return res.end('Not found');
      }
      const enriched = enrichCategory(rawCat, db.platformStats);
      const prod = enriched.top10.find((p) => p.id === prodId) || rawCat.products.find((p) => p.id === prodId);
      const rankText = prod && prod.rank ? `#${prod.rank}` : 'Top 10';
      const catTitle = escapeXml(rawCat.title);
      const prodName = escapeXml(prod ? prod.name : 'Verified Product');

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="250" height="54" viewBox="0 0 250 54" fill="none">
        <rect x="0.5" y="0.5" width="249" height="53" rx="10" fill="#111827" stroke="#374151"/>
        <rect x="10" y="10" width="34" height="34" rx="7" fill="#B8FF01"/>
        <text x="27" y="32" text-anchor="middle" fill="#111827" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="800">${rankText}</text>
        <text x="54" y="23" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="10" font-weight="600" letter-spacing="0.04em">RANKED ON TOP 10</text>
        <text x="54" y="39" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="12.5" font-weight="700">${prodName} · ${catTitle}</text>
      </svg>`;

      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      return res.end(svg);
    }

    // Editor-only sign-in
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      if (!adminPassword) return sendJson(res, 503, { error: 'Editor sign-in is unavailable' }, req);
      if (!allowLogin(req)) return sendJson(res, 429, { error: 'Too many sign-in attempts' }, req);
      const body = await parseBody(req);
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      if (email !== adminEmail || !matchesSecret(password, adminPassword)) {
        return sendJson(res, 401, { error: 'Invalid editor credentials' }, req);
      }
      loginAttempts.delete(req.socket.remoteAddress);

      const token = crypto.randomBytes(32).toString('hex');
      const db = readDb();
      const now = Date.now();
      db.editorSessions = Object.fromEntries(Object.entries(db.editorSessions || {}).filter(([, expires]) => expires > now));
      db.editorSessions[sessionId(token)] = now + sessionLifetime;
      await writeDb(db);
      return sendJson(res, 200, { success: true, user: editor, state: getPublicState(editor) }, req, {
        'Set-Cookie': 'top10_session=' + token + '; ' + sessionCookie + '; Max-Age=' + sessionLifetime / 1000
      });
    }

    // 5. DELETE /api/admin/categories/:slug/products/:productId (Admin delete or reset bid - Admin only)
    const delProdMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)\/products\/([^/]+)$/);
    if (req.method === 'DELETE' && delProdMatch) {
      if (!requireAdmin(req, res)) return;
      const [, slug, prodId] = delProdMatch;
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' }, req);
      cat.products = cat.products.filter((p) => p.id !== prodId);
      await writeDb(db);
      return sendJson(res, 200, { state: getPublicState(getSession(req)) }, req);
    }

    // 5c. PUT /api/admin/categories/:slug (Admin Edit Directory Metadata & FAQs - Admin only)
    const adminSingleCatMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
    if (req.method === 'PUT' && adminSingleCatMatch) {
      if (!requireAdmin(req, res)) return;
      const slug = adminSingleCatMatch[1];
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' }, req);

      if (body.title !== undefined) cat.title = String(body.title).trim();
      if (body.icon !== undefined) cat.icon = String(body.icon).trim();
      if (body.tagline !== undefined) cat.tagline = String(body.tagline).trim();
      if (body.description !== undefined) cat.description = String(body.description).trim();
      if (body.monthlyViews !== undefined) cat.monthlyViews = Number(body.monthlyViews) || cat.monthlyViews;
      if (body.criteria !== undefined && Array.isArray(body.criteria)) cat.criteria = body.criteria;
      if (body.faqs !== undefined && Array.isArray(body.faqs)) cat.faqs = body.faqs;
      applyEditorialFieldsToCategory(cat, body, db);
      cat.updatedAt = new Date().toISOString();

      await writeDb(db);
      return sendJson(res, 200, { success: true, category: cat, state: getPublicState(getSession(req)) }, req);
    }

    // 5d. DELETE /api/admin/categories/:slug (Admin Delete / Archive Directory - Admin only)
    if (req.method === 'DELETE' && adminSingleCatMatch) {
      if (!requireAdmin(req, res)) return;
      const slug = adminSingleCatMatch[1];
      const db = readDb();
      const idx = db.categories.findIndex((c) => c.slug === slug);
      if (idx === -1) return sendJson(res, 404, { error: 'Category not found' }, req);

      db.categories.splice(idx, 1);
      await writeDb(db);
      const fullState = getPublicState(getSession(req));
      return sendJson(res, 200, { success: true, state: fullState }, req);
    }

    // 5e. POST /api/admin/categories/:slug/products (Admin Add Product into Directory - Admin only)
    const adminAddProdMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)\/products$/);
    if (req.method === 'POST' && adminAddProdMatch) {
      if (!requireAdmin(req, res)) return;
      const slug = adminAddProdMatch[1];
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' }, req);

      const name = (body.name || '').trim();
      if (!name) return sendJson(res, 400, { error: 'Product name is required' }, req);

      const prodId = (body.id || `prod_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString().slice(-4)}`);

      const newProd = {
        id: prodId,
        name,
        company: body.company || name,
        logo: body.logo || name.slice(0, 2).toUpperCase(),
        website: body.website || 'https://example.com',
        startingPrice: body.startingPrice || body.pricingTag || 'Free Trial Available',
        tagline: body.tagline || `${name} delivers next-generation performance.`,
        highlight: body.highlight || body.badge || 'Editorial pick',
        badge: body.badge || body.highlight || 'Editorial pick',
        amountPaid: 0,
        isOrganic: true,
        upvotes: 0,
        clicks: 0,
        specs: Array.isArray(body.specs) ? body.specs : ['Enterprise Security', 'Cloud-Native Architecture', 'REST & GraphQL APIs', '99.99% SLA Uptime'],
        pros: Array.isArray(body.pros) ? body.pros : ['Modern UX', 'Fast onboarding', 'Comprehensive documentation'],
        cons: Array.isArray(body.cons) ? body.cons : ['Advanced tiers require sales engagement'],
        addedAt: new Date().toISOString()
      };

      if (!cat.products) cat.products = [];
      cat.products.push(newProd);
      await writeDb(db);
      return sendJson(res, 201, { success: true, product: newProd, state: getPublicState(getSession(req)) }, req);
    }

    // 9. DELETE /api/admin/categories/:slug/comments/:commentId (Admin only)
    const delCommentMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)\/comments\/([^/]+)$/);
    if (req.method === 'DELETE' && delCommentMatch) {
      if (!requireAdmin(req, res)) return;
      const [, slug, cmtId] = delCommentMatch;
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' }, req);
      cat.comments = (cat.comments || []).filter((c) => c.id !== cmtId);
      await writeDb(db);
      return sendJson(res, 200, { state: getPublicState(getSession(req)) }, req);
    }

    // 11b. POST /api/admin/categories (Admin creates a new Top 10 page - Admin only)
    if (req.method === 'POST' && pathname === '/api/admin/categories') {
      if (!requireAdmin(req, res)) return;
      const body = await parseBody(req);
      const db = readDb();
      const title = (body.title || '').trim();
      if (!title) return sendJson(res, 400, { error: 'Category title is required' }, req);

      const slug = (body.slug || title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      if (db.categories.some((c) => c.slug === slug)) {
        return sendJson(res, 400, { error: 'A category with this slug already exists' }, req);
      }

      const shortName = title.replace(/^Top\s+10\s+/i, '').trim() || title;
      const iconText = (body.iconText || shortName[0] || 'T').slice(0, 2);
      const iconBg = body.iconBg || '#B8FF01';
      const iconColor = body.iconColor || '#111827';

      const organicNames =
        Array.isArray(body.organicProducts) && body.organicProducts.length > 0
          ? body.organicProducts
          : [];

      const palette = [
        '#2563EB',
        '#059669',
        '#7C3AED',
        '#EA580C',
        '#0284C7',
        '#4F46E5',
        '#0D9488',
        '#DC2626',
        '#334155',
        '#9333EA'
      ];
      const products = organicNames.slice(0, 10).map((item, i) => {
        const pName = typeof item === 'string' ? item.trim() : item.name || `Product #${i + 1}`;
        const pTagline =
          typeof item === 'object' && item.tagline
            ? item.tagline
            : `Organic Top 10 candidate in ${title}. Unclaimed spot — any company can replace this position by placing a bid.`;
        const pWebsite =
          typeof item === 'object' && item.website ? item.website : 'https://example.com';
        const pPricing =
          typeof item === 'object' && item.pricingTag ? item.pricingTag : 'Organic Listing';
        return {
          id: `prod_${slug}_${Date.now()}_${i}`,
          name: pName,
          companyName: pName,
          tagline: pTagline,
          website: pWebsite,
          pricingTag: pPricing,
          highlightTag: '@Unclaimed Organic',
          logoText: pName.slice(0, 2).toUpperCase(),
          logoBg: palette[i % palette.length],
          logoColor: '#FFFFFF',
          amountPaid: 0,
          isOrganic: true,
          ownerEmail: '',
          clicks: Math.max(150, 900 - i * 75),
          upvotes: Math.max(20, 110 - i * 8),
          updatedAt: new Date().toISOString()
        };
      });

      const newCategory = {
        id: slug,
        slug,
        title: title.toLowerCase().startsWith('top 10') ? title : `Top 10 ${title}`,
        shortName,
        subtitle:
          body.subtitle ||
          body.tagline ||
          `Top 10 Directory · USD($) · Live Auction Ranking · 10 Verified Slots`,
        tagline: body.tagline || body.subtitle || `${title} ranked by live market verified utility.`,
        description: body.description || `Comprehensive buyer benchmark and verified directory for ${title}.`,
        icon: body.icon || '📁',
        iconText,
        iconBg,
        iconColor,
        updatedAgo: 'just now',
        monthlyViews: Number(body.monthlyViews || 1200),
        criteria: Array.isArray(body.criteria) ? body.criteria : [
          'Feature completeness and architectural reliability',
          'Price-to-performance ratio and transparent tiering',
          'Customer satisfaction and community review score'
        ],
        faqs: Array.isArray(body.faqs) ? body.faqs : [
          {
            q: `How is the Top 10 ${title} ranked?`,
            a: 'Rankings are determined dynamically via our real-time auction placement engine combined with editorial verification.'
          }
        ],
        metrics: {
          monthlyViews: body.monthlyViews || '64.20k',
          buyerClicks: body.buyerClicks || '19.40k',
          poolRevenue: '$0',
          topBid: '$0'
        },
        products: Array.isArray(body.products) && body.products.length > 0 ? body.products : products,
        comments: [
          {
            id: 'cmt_init_' + Date.now(),
            type: 'system_event',
            authorName: 'Ankush (Admin)',
            authorRole: 'Platform Admin',
            avatarBg: '#16A34A',
            avatarText: '10',
            timeAgo: 'just now',
            likes: 1,
            text: 'Launched new live auction category page for',
            highlightLink: title.toLowerCase().startsWith('top 10') ? title : `Top 10 ${title}`
          }
        ]
      };

      applyEditorialFieldsToCategory(newCategory, body, db);
      db.categories.push(newCategory);
      await writeDb(db);
      const state = getPublicState(getSession(req));
      const formattedCat = (state.categories || []).find((c) => c.slug === slug) || newCategory;
      return sendJson(res, 200, { success: true, category: formattedCat, state }, req);
    }

    // 12. POST /api/admin/categories/:slug/organic (Admin only)
    const addOrgMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)\/organic$/);
    if (req.method === 'POST' && addOrgMatch) {
      if (!requireAdmin(req, res)) return;
      const slug = addOrgMatch[1];
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' }, req);

      const name = (body.name || '').trim();
      if (!name) return sendJson(res, 400, { error: 'Product name is required' }, req);

      cat.products.push({
        id: 'prod_org_' + Date.now(),
        name,
        companyName: (body.companyName || name).trim(),
        tagline: (body.tagline || `Pre-filled organic candidate for ${cat.title}.`).trim(),
        website: (body.website || 'https://example.com').trim(),
        pricingTag: (body.pricingTag || 'Organic Entry').trim(),
        highlightTag: (body.highlightTag || '@Organic Slot').trim(),
        logoText: name.slice(0, 2).toUpperCase(),
        logoBg: body.logoBg || '#334155',
        logoColor: '#FFFFFF',
        amountPaid: 0,
        isOrganic: true,
        ownerEmail: '',
        clicks: 250,
        upvotes: 35,
        updatedAt: new Date().toISOString()
      });

      await writeDb(db);
      return sendJson(res, 200, { state: getPublicState(getSession(req)) }, req);
    }

    // 12c. POST /api/admin/product/update (Admin inline product editor - Admin only)
    if (req.method === 'POST' && pathname === '/api/admin/product/update') {
      if (!requireAdmin(req, res)) return;
      const body = await parseBody(req);
      const db = readDb();
      const { categorySlug, productId, pricingTag, tagline, name } = body;
      const cat = (db.categories || []).find((c) => c.slug === categorySlug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' }, req);
      const prod = (cat.products || []).find((p) => p.id === productId);
      if (!prod) return sendJson(res, 404, { error: 'Product not found' }, req);

      if (pricingTag !== undefined) prod.pricingTag = pricingTag.trim();
      if (tagline !== undefined) prod.tagline = tagline.trim();
      if (name !== undefined) prod.name = name.trim();
      prod.updatedAt = new Date().toISOString();

      await writeDb(db);
      return sendJson(res, 200, { product: prod, state: getPublicState(getSession(req)) }, req);
    }

    // 13. GET /sitemap.xml (Dynamic SEO XML Sitemap for Google, Bing & AI Indexing)
    if (req.method === 'GET' && pathname === '/sitemap.xml') {
      const db = readDb();
      const visibleCats = (db.categories || []).filter(isPubliclyPublished);
      const catUrls = visibleCats
        .map(
          (c) =>
            `  <url><loc>${base}/list/${escapeXml(c.slug)}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`
        )
        .join('\n');
      const blogUrls = (db.articles && db.articles.length > 0 ? db.articles : BLOG_ARTICLES)
        .map(
          (a) =>
            `  <url><loc>${base}/blog/${escapeXml(a.slug)}</loc><changefreq>weekly</changefreq><priority>0.85</priority></url>`
        )
        .join('\n');

      const compareUrls = [];
      for (const c of visibleCats) {
        const prods = (c.products || []).slice(0, 3);
        if (prods.length >= 2) {
          compareUrls.push(`  <url><loc>${base}/compare/${escapeXml(c.slug)}/${escapeXml(prods[0].id)}-vs-${escapeXml(prods[1].id)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
          if (prods.length >= 3) {
            compareUrls.push(`  <url><loc>${base}/compare/${escapeXml(c.slug)}/${escapeXml(prods[0].id)}-vs-${escapeXml(prods[2].id)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
            compareUrls.push(`  <url><loc>${base}/compare/${escapeXml(c.slug)}/${escapeXml(prods[1].id)}-vs-${escapeXml(prods[2].id)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
          }
        }
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n  <url><loc>${base}/llms.txt</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n${catUrls}\n${compareUrls.join('\n')}\n</urlset>`;
      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow'
      });
      return res.end(xml);
    }

    // 13b. GET /llms.txt (AI & LLM Crawler Structured Markdown Guide for Perplexity, ChatGPT, Claude)
    if (req.method === 'GET' && (pathname === '/llms.txt' || pathname === '/llms-full.txt')) {
      const state = getFullState();
      const md = buildLlmsTxt(state.categories || [], base);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(md);
    }

    // 13c. GET /robots.txt (Sitemap remains disallowed/blocked while pages & AI guides are discoverable)
    if (req.method === 'GET' && pathname === '/robots.txt') {
      const robots = [
        'User-agent: *',
        'Disallow: /admin',
        'Disallow: /api/',
        'Disallow: /sitemap.xml',
        'Allow: /',
        '',
        'User-agent: GPTBot',
        'Disallow: /admin',
        'Disallow: /api/',
        'Disallow: /sitemap.xml',
        'Allow: /',
        '',
        'User-agent: PerplexityBot',
        'Disallow: /admin',
        'Disallow: /api/',
        'Disallow: /sitemap.xml',
        'Allow: /',
        '',
        'User-agent: ClaudeBot',
        'Disallow: /admin',
        'Disallow: /api/',
        'Disallow: /sitemap.xml',
        'Allow: /',
        '',
        `# Sitemap (currently blocked): ${base}/sitemap.xml`,
        `# AI/LLM Structured Index: ${base}/llms.txt`,
        `# RSS Feed: ${base}/feed.xml`
      ].join('\n');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(robots);
    }

    // 13d. GET /feed.xml (Dynamic RSS 2.0 Feed for Syndication & Readers)
    if (req.method === 'GET' && pathname === '/feed.xml') {
      const db = readDb();
      const items = (db.categories || [])
        .filter(isPubliclyPublished)
        .map((c) => {
          const enriched = enrichCategory(c, db.platformStats, db.authors);
          const meta = getCategoryFeatureMeta(enriched, db.authors);
          const top1Name = enriched.top10 && enriched.top10[0] ? enriched.top10[0].name : 'Top Rated Option';
          const desc = meta.description || enriched.editorialGuide?.intro || 'Curated Top 10 buying guide.';
          return `    <item>
      <title>${escapeXml(enriched.title)} — Ranked #1: ${escapeXml(top1Name)}</title>
      <link>${base}/list/${escapeXml(enriched.slug)}</link>
      <guid isPermaLink="true">${base}/list/${escapeXml(enriched.slug)}</guid>
      <description>${escapeXml(desc)}</description>
      <pubDate>${new Date(enriched.updatedAt || meta.isoDate || Date.now()).toUTCString()}</pubDate>
    </item>`;
        })
        .join('\n');

      const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Top 10 Directory — Verified Buying Guides &amp; Live Rankings</title>
    <link>${base}</link>
    <description>The premier pay-for-rank auction directory and curated buyer comparison guides for modern teams.</description>
    <language>en-us</language>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
      res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
      return res.end(rss);
    }

    // 13e. GET /api/og/:slug.svg (Dynamic 1200x630 OpenGraph SVG Banner for Twitter / LinkedIn Viral Sharing)
    const ogMatch = pathname.match(/^\/api\/og\/([^/.]+)\.svg$/);
    if (req.method === 'GET' && ogMatch) {
      const slug = ogMatch[1];
      const db = readDb();
      const rawCat = db.categories.find((c) => c.slug === slug && isPubliclyPublished(c));
      if (!rawCat) {
        res.writeHead(404, { 'Cache-Control': 'no-store' });
        return res.end('Category not found');
      }
      const enriched = enrichCategory(rawCat, db.platformStats, db.authors);
      const top1 = (enriched.top10 && enriched.top10[0]) ? enriched.top10[0] : { name: 'Top Pick', tagline: 'Verified Leader' };
      const top2 = (enriched.top10 && enriched.top10[1]) ? enriched.top10[1] : { name: 'Runner Up' };
      const top3 = (enriched.top10 && enriched.top10[2]) ? enriched.top10[2] : { name: 'Contender' };
      const catTitle = escapeXml(rawCat.title);
      const views = escapeXml(rawCat.metrics?.monthlyViews || '130.5k');

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" fill="none">
    <rect width="1200" height="630" fill="#0A0F1D"/>
    <circle cx="950" cy="150" r="300" fill="#B8FF01" fill-opacity="0.06"/>
    <circle cx="200" cy="500" r="240" fill="#10B981" fill-opacity="0.05"/>
    <rect x="70" y="60" width="1060" height="44" rx="8" fill="#111827" stroke="#1F2937"/>
    <circle cx="100" cy="82" r="7" fill="#B8FF01"/>
    <text x="120" y="87" fill="#B8FF01" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="800" letter-spacing="0.08em">TOP 10 DIRECTORY · 2026 OFFICIAL RANKINGS</text>
    <text x="1090" y="87" text-anchor="end" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="600">${views} READERS THIS MONTH</text>
    <text x="70" y="175" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="44" font-weight="900" letter-spacing="-0.02em">${catTitle}</text>
    <text x="70" y="215" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="17" font-weight="500">Verified buyer reviews, transparent pricing &amp; algorithmic performance benchmarks.</text>
    <g transform="translate(70, 260)">
      <rect width="380" height="280" rx="14" fill="#111827" stroke="#B8FF01" stroke-width="2"/>
      <rect x="24" y="24" width="48" height="48" rx="10" fill="#B8FF01"/>
      <text x="48" y="55" text-anchor="middle" fill="#111827" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="900">#1</text>
      <text x="88" y="44" fill="#B8FF01" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="800" letter-spacing="0.05em">CATEGORY LEADER</text>
      <text x="88" y="66" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="750">${escapeXml(top1.name)}</text>
      <text x="24" y="115" fill="#D1D5DB" font-family="Inter, system-ui, sans-serif" font-size="13.5" font-weight="400">${escapeXml(top1.tagline ? top1.tagline.slice(0, 75) + '...' : 'Top-rated platform')}</text>
      <rect x="24" y="195" width="332" height="48" rx="8" fill="#1F2937"/>
      <text x="40" y="225" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="600">Starting price:</text>
      <text x="340" y="225" text-anchor="end" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="700">${escapeXml(top1.pricingTag || 'Transparent Pricing')}</text>
    </g>
    <g transform="translate(480, 260)">
      <rect width="330" height="280" rx="14" fill="#111827" stroke="#1F2937" stroke-width="1.5"/>
      <rect x="24" y="24" width="44" height="44" rx="10" fill="#1F2937"/>
      <text x="46" y="53" text-anchor="middle" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="19" font-weight="800">#2</text>
      <text x="80" y="44" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="700">RUNNER UP</text>
      <text x="80" y="64" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700">${escapeXml(top2.name)}</text>
      <text x="24" y="115" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="400">${escapeXml(top2.tagline ? top2.tagline.slice(0, 60) + '...' : 'Verified choice')}</text>
      <rect x="24" y="195" width="282" height="48" rx="8" fill="#1E293B"/>
      <text x="38" y="225" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="600">Price:</text>
      <text x="290" y="225" text-anchor="end" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700">${escapeXml(top2.pricingTag || 'Flexible')}</text>
    </g>
    <g transform="translate(840, 260)">
      <rect width="290" height="280" rx="14" fill="#111827" stroke="#1F2937" stroke-width="1.5"/>
      <rect x="24" y="24" width="44" height="44" rx="10" fill="#1F2937"/>
      <text x="46" y="53" text-anchor="middle" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="19" font-weight="800">#3</text>
      <text x="80" y="44" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="700">CONTENDER</text>
      <text x="80" y="64" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700">${escapeXml(top3.name)}</text>
      <text x="24" y="115" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="400">${escapeXml(top3.tagline ? top3.tagline.slice(0, 50) + '...' : 'Verified alternative')}</text>
      <rect x="24" y="195" width="242" height="48" rx="8" fill="#1E293B"/>
      <text x="38" y="225" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="600">Price:</text>
      <text x="250" y="225" text-anchor="end" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700">${escapeXml(top3.pricingTag || 'Flexible')}</text>
    </g>
    <text x="70" y="595" fill="#6B7280" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="500">Top 10 Directory · Independent rankings powered by programmatic auction &amp; verified reviews</text>
  </svg>`;

      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      });
      return res.end(svg);
    }

    // 14. GET /embed/:slug (Embeddable Mini Top 10 Widget for Bloggers & Partners)
    const embedMatch = pathname.match(/^\/embed\/([^/]+)$/);
    if (req.method === 'GET' && embedMatch) {
      const slug = embedMatch[1];
      const db = readDb();
      const rawCat = db.categories.find((c) => c.slug === slug && isPubliclyPublished(c));
      if (!rawCat) {
        res.writeHead(404, { 'Cache-Control': 'no-store' });
        return res.end('Category not found');
      }
      const enriched = enrichCategory(rawCat, db.platformStats, db.authors);
      const rowsHtml = enriched.top10
        .map(
          (p) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #EAECEF;font-size:12.5px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:22px;height:22px;border-radius:6px;background:${p.rank === 1 ? '#B8FF01' : '#111827'};color:${p.rank === 1 ? '#111827' : '#FFF'};font-weight:700;font-size:11px;display:inline-flex;align-items:center;justify-content:center;">#${p.rank}</span>
              <a href="${escapeXml(p.website)}" target="_blank" rel="noopener" style="font-weight:600;color:#111827;text-decoration:none;">${escapeXml(p.name)}</a>
              <span style="color:#6B7280;font-size:11px;">${escapeXml(p.pricingTag)}</span>
            </div>
            <span style="font-size:11px;font-weight:600;color:${p.isOrganic ? '#B45309' : '#047857'};">${p.isOrganic ? 'Organic' : '$' + p.amountPaid + ' Bid'}</span>
          </div>`
        )
        .join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#FFF;color:#111827;}</style></head><body>
        <div style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
          <div style="padding:10px 12px;background:#FAFAFA;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center;">
            <strong style="font-size:13px;">${escapeXml(enriched.title)}</strong>
            <a href="http://${req.headers.host}/?list=${escapeXml(slug)}" target="_blank" style="font-size:11px;color:#2563EB;text-decoration:none;font-weight:600;">Bid for #1 on Top 10 ↗</a>
          </div>
          ${rowsHtml}
        </div>
      </body></html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // 19. POST /api/utils/extract-url (1-Click Auto-Fill Product Info from Website URL)
    if (req.method === 'POST' && pathname === '/api/utils/extract-url') {
      const body = await parseBody(req);
      let rawUrl = (body.url || '').trim();
      if (!rawUrl) return sendJson(res, 400, { error: 'URL is required' });
      if (!/^https?:\/\//i.test(rawUrl)) rawUrl = 'https://' + rawUrl;

      let host = 'example.com';
      try {
        host = new URL(rawUrl).hostname.replace(/^www\./i, '');
      } catch (e) {}

      const brandCore = host.split('.')[0] || 'Product';
      const capitalized = brandCore.charAt(0).toUpperCase() + brandCore.slice(1);

      return sendJson(res, 200, {
        name: capitalized,
        companyName: `${capitalized} Inc`,
        website: rawUrl,
        tagline: `${capitalized} — Modern high-performance platform trusted by fast-growing teams (${host}).`,
        pricingTag: 'From $49/mo',
        highlightTag: `@${capitalized} Cloud`,
        logoText: capitalized.slice(0, 2).toUpperCase()
      });
    }

    // 26. GET /api/compare/:catSlug/:slugA/:slugB (Head-to-Head Comparison Data)
    if (req.method === 'GET' && pathname.match(/^\/api\/compare\/([^/]+)\/([^/]+)\/([^/]+)$/)) {
      const [, catSlug, idA, idB] = pathname.match(/^\/api\/compare\/([^/]+)\/([^/]+)\/([^/]+)$/);
      const state = getFullState();
      const cat = (state.categories || []).find((c) => c.slug === catSlug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' });

      const prodA = findProductInCat(cat, idA);
      const prodB = findProductInCat(cat, idB);

      if (!prodA || !prodB) {
        return sendJson(res, 404, { error: 'One or both products not found in category' }, req);
      }

      const comparison = {
        category: { slug: cat.slug, title: cat.title },
        prodA,
        prodB,
        verdict: {
          headline: `${prodA.name} vs ${prodB.name}: The 2026 Head-to-Head Verdict`,
          summary: `While both are industry-leading ${cat.title.replace(/^Top 10 /i, '')} platforms, ${prodA.name} (#${prodA.rank || 1}) specializes in ${prodA.specs?.idealFor || 'rapid modern scale'}, while ${prodB.name} (#${prodB.rank || 2}) is engineered for ${prodB.specs?.idealFor || 'enterprise flexibility'}.`,
          winnerForDevelopers: prodA.name,
          winnerForPricing: prodB.pricingTag?.toLowerCase().includes('free') ? prodB.name : prodA.name
        }
      };

      return sendJson(res, 200, comparison);
    }

    // Static file serving + Server-Side SEO / JSON-LD / AI Crawler Injection for index.html
    const hasStaticFile = pathname !== '/' && pathname !== '/index.html' && fs.existsSync(path.join(PUBLIC_DIR, pathname)) && !fs.statSync(path.join(PUBLIC_DIR, pathname)).isDirectory();
    if (hasStaticFile) {
      const filePath = path.join(PUBLIC_DIR, pathname);
      if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileBuf = fs.readFileSync(filePath);
      return sendResponse(req, res, 200, contentType, fileBuf, {
        'Cache-Control': ['.svg', '.png', '.jpg', '.webp'].includes(ext) ? 'public, max-age=86400' : 'no-cache'
      });
    }

    // SSR & Client-side Route Matching with Real 404s
    const listPathMatch = pathname.match(/^\/list\/([^/]+)$/);
    const blogArticleMatch = pathname.match(/^\/blog\/([^/]+)$/);
    const compareMatch = pathname.match(/^\/compare\/([^/]+)\/([^/]+)-vs-([^/]+)$/);
    const isHome = pathname === '/' || pathname === '/index.html';
    const isBlogIndex = pathname === '/blog';
    const isAdminView = pathname === '/admin';

    function truncateMetaDesc(str, maxLen = 158) {
      const clean = String(str || '').replace(/\s+/g, ' ').trim();
      if (clean.length <= maxLen) return clean;
      return clean.slice(0, maxLen - 3).replace(/\s+\S*$/, '') + '...';
    }

    function renderSsrHomepageBody(rawHtml, allCats) {
      const leadCat = allCats.find((c) => c.slug === 'audiobook-apps') || allCats[0];
      let heroInner = '';
      if (leadCat) {
        const lm = getCategoryFeatureMeta(leadCat);
        heroInner = `
          <div class="ehc-left">
            <div class="ehc-top-row">
              <div class="ehc-guide-pill"><span class="ehc-guide-label">○ Top 10</span></div>
            </div>
            <div class="ehc-body">
              <p class="ehc-date">${escapeXml(lm.dateText)}</p>
              <h1 class="ehc-title">${escapeXml(lm.editorialTitle)}</h1>
              <p class="ehc-desc">${escapeXml(lm.description)}</p>
            </div>
            <div class="ehc-author-row">
              <img src="${escapeXml(lm.authorAvatar)}" alt="${escapeXml(lm.authorName)}" class="ehc-author-avatar" loading="eager" />
              <div class="ehc-author-meta">
                <span class="ehc-author-name">${escapeXml(lm.authorName)}</span>
                <span class="ehc-author-role">${escapeXml(lm.authorRole)}</span>
              </div>
            </div>
          </div>
          <div class="ehc-right">
            <div class="ehc-feature-media">
              <img src="${escapeXml(lm.coverImage)}" alt="${escapeXml(leadCat.title)}" class="ehc-feature-img" loading="eager" />
            </div>
          </div>`;
      }

      const gridInner = allCats
        .map((c) => {
          const meta = getCategoryFeatureMeta(c);
          return `
            <article class="home-list-card related-dir-card editorial-feature-card" data-open-list="${escapeXml(c.slug)}" data-cat-card-slug="${escapeXml(c.slug)}">
              <div class="rdc-top-content">
                <div class="rdc-media-wrap">
                  <img src="${escapeXml(meta.coverImage)}" alt="${escapeXml(c.title)}" class="rdc-feature-img" loading="eager" />
                </div>
                <div class="rdc-body">
                  <div class="rdc-date">${escapeXml(meta.dateText)}</div>
                  <h3 class="rdc-title"><a href="/list/${escapeXml(c.slug)}" style="color:inherit;text-decoration:none;">${escapeXml(meta.editorialTitle)}</a></h3>
                  <p class="rdc-desc">${escapeXml(meta.description)}</p>
                </div>
              </div>
              <div class="rdc-author-row">
                <img src="${escapeXml(meta.authorAvatar)}" alt="${escapeXml(meta.authorName)}" class="rdc-author-avatar" loading="eager" />
                <div class="rdc-author-meta">
                  <span class="rdc-author-name">${escapeXml(meta.authorName)}</span>
                  <span class="rdc-author-role">${escapeXml(meta.authorRole)}</span>
                </div>
              </div>
            </article>`;
        })
        .join('');

      let out = rawHtml;
      out = out.replace(
        '<div id="homeFeaturedHeroCard" class="editorial-hero-card home-featured-hero" style="cursor: pointer;"></div>',
        `<div id="homeFeaturedHeroCard" class="editorial-hero-card home-featured-hero" style="cursor: pointer;">${heroInner}</div>`
      );
      out = out.replace(
        '<div class="home-lists-grid related-dirs-grid" id="homeListsGrid"></div>',
        `<div class="home-lists-grid related-dirs-grid" id="homeListsGrid">${gridInner}</div>`
      );
      return out;
    }

    function renderSsrListBody(rawHtml, cat, allCats) {
      const meta = getCategoryFeatureMeta(cat);
      const cover = guideCoverUrl(meta.coverImage);
      const products = [...(cat.top10 || []), ...(cat.pushedOut || [])];
      const intro = cat.editorialGuide?.intro?.trim() || '';
      const related = allCats.filter(other => other.slug !== cat.slug).slice(0, 3);
      const list = products.map((product, index) => {
        const url = getSsrProductLink(product);
        const title = escapeXml(product.name);
        const summary = product.editorialSummary || product.tagline;
        const link = url === '#' ? title : `<a href="${escapeXml(url)}" target="_blank" rel="noopener">${title}</a>`;
        return `<li class="guide-reading-item card-product-node" id="prod-card-${escapeXml(product.id)}" value="${product.rank || index + 1}">
          <h3>${link}</h3>
          ${summary ? `<p>${escapeXml(summary)}</p>` : ''}
        </li>`;
      }).join('');
      const relatedLinks = related.map(other =>
        `<li><a href="/list/${encodeURIComponent(other.slug)}">${escapeXml(getCategoryFeatureMeta(other).editorialTitle)}</a></li>`
      ).join('');

      return rawHtml
        .replace('<main id="homePageView" class="home-container">', '<main id="homePageView" class="home-container hidden">')
        .replace('<main id="singleListPageView" class="guide-reading-view hidden">', '<main id="singleListPageView" class="guide-reading-view">')
        .replace('<h2 id="heroCatTitle">Top 10 Buying Guide</h2>', () =>
          `<h1 id="heroCatTitle">${escapeXml(cat.title)}</h1>`)
        .replace('<p id="guideReadingByline"></p>', () =>
          `<p id="guideReadingByline">${escapeXml(meta.authorName)}${meta.isoDate ? ' · ' + escapeXml(meta.dateText) : ''}</p>`)
        .replace('<p id="heroCatDesc"></p>', () => `<p id="heroCatDesc">${escapeXml(meta.description)}</p>`)
        .replace('id="guideReadingCover" alt="" width="1200" height="675" decoding="async" hidden', () =>
          cover ? `id="guideReadingCover" alt="" width="1200" height="675" decoding="async" src="${escapeXml(cover)}"`
            : 'id="guideReadingCover" alt="" width="1200" height="675" decoding="async" hidden')
        .replace('<p class="guide-reading-intro" id="guideReadingIntro" hidden></p>', () =>
          intro && intro !== meta.description?.trim() ? `<p class="guide-reading-intro" id="guideReadingIntro">${escapeXml(intro)}</p>`
            : '<p class="guide-reading-intro" id="guideReadingIntro" hidden></p>')
        .replace('<ol class="guide-reading-list" id="top10TimelineList"></ol>', () =>
          `<ol class="guide-reading-list" id="top10TimelineList">${list}</ol>`)
        .replace('<p id="guideReadingEmpty">', products.length ? '<p id="guideReadingEmpty" hidden>' : '<p id="guideReadingEmpty">')
        .replace('id="relatedDirectoriesSection" aria-labelledby="relatedDirsHeading" hidden', related.length
          ? 'id="relatedDirectoriesSection" aria-labelledby="relatedDirsHeading"'
          : 'id="relatedDirectoriesSection" aria-labelledby="relatedDirsHeading" hidden')
        .replace('<ul id="relatedDirectoriesGrid"></ul>', () => `<ul id="relatedDirectoriesGrid">${relatedLinks}</ul>`);
    }

    function getSsrProductLink(product) {
      try {
        const url = new URL(product.website || product.url || '');
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
      } catch {
        return '#';
      }
    }

    function renderSsrCompareBody(rawHtml, cat, pair) {
      const { prodA, prodB } = pair || {};
      if (!cat || !prodA || !prodB) return rawHtml;
      let out = rawHtml;
      out = out.replace('<main id="homePageView" class="home-container">', '<main id="homePageView" class="home-container hidden">');
      out = out.replace('<section id="compareHeadToHeadView" class="compare-h2h-view hidden">', '<section id="compareHeadToHeadView" class="compare-h2h-view">');
      out = out.replace('id="compareCatNameCrumb">Billing Software<', `id="compareCatNameCrumb">${escapeXml(cat.shortName || cat.title)}<`);
      out = out.replace('id="compareVersusTitle">Stripe vs Paddle<', `id="compareVersusTitle">${escapeXml(prodA.name)} vs ${escapeXml(prodB.name)}<`);
      out = out.replace(
        '<h2 class="h2h-main-title" id="comparePageTitleHeading">Stripe Billing vs Paddle Billing (2026 Comparison)</h2>',
        `<h1 class="h2h-main-title" id="comparePageTitleHeading">${escapeXml(prodA.name)} vs ${escapeXml(prodB.name)} (${new Date().getFullYear()} Comparison)</h1>`
      );

      out = out.replace('id="compareRankA">#1<', `id="compareRankA">#${escapeXml(String(prodA.rank || 1))}<`);
      out = out.replace('id="compareNameA">Stripe Billing<', `id="compareNameA">${escapeXml(prodA.name)}<`);
      out = out.replace('id="compareCompanyA">by Stripe Inc<', `id="compareCompanyA">by ${escapeXml(prodA.companyName || prodA.company || prodA.name)}<`);
      out = out.replace(
        /<p class="h2h-tagline" id="compareTaglineA">[\s\S]*?<\/p>/i,
        `<p class="h2h-tagline" id="compareTaglineA">${escapeXml(prodA.tagline || '')}</p>`
      );
      out = out.replace('id="comparePriceA">0.5% per transaction<', `id="comparePriceA">${escapeXml(prodA.specs?.startingPrice || prodA.pricingTag || prodA.pricing || 'Not listed')}<`);
      out = out.replace('id="compareTrialA">Free Sandbox<', `id="compareTrialA">${escapeXml(prodA.specs?.freeTrial || prodA.freeTrial || 'Not listed')}<`);
      out = out.replace(
        'href="#" target="_blank" rel="noopener" class="h2h-visit-btn primary" id="compareVisitBtnA">Visit Stripe Billing ↗</a>',
        `href="${escapeXml(getSsrProductLink(prodA))}" target="_blank" rel="noopener" class="h2h-visit-btn primary" id="compareVisitBtnA">Visit ${escapeXml(prodA.name)} ↗</a>`
      );

      out = out.replace('id="compareRankB">#2<', `id="compareRankB">#${escapeXml(String(prodB.rank || 2))}<`);
      out = out.replace('id="compareNameB">Paddle Billing<', `id="compareNameB">${escapeXml(prodB.name)}<`);
      out = out.replace('id="compareCompanyB">by Paddle Ltd<', `id="compareCompanyB">by ${escapeXml(prodB.companyName || prodB.company || prodB.name)}<`);
      out = out.replace(
        /<p class="h2h-tagline" id="compareTaglineB">[\s\S]*?<\/p>/i,
        `<p class="h2h-tagline" id="compareTaglineB">${escapeXml(prodB.tagline || '')}</p>`
      );
      out = out.replace('id="comparePriceB">5% + 50¢ flat<', `id="comparePriceB">${escapeXml(prodB.specs?.startingPrice || prodB.pricingTag || prodB.pricing || 'Not listed')}<`);
      out = out.replace('id="compareTrialB">Free Sandbox<', `id="compareTrialB">${escapeXml(prodB.specs?.freeTrial || prodB.freeTrial || 'Not listed')}<`);
      out = out.replace(
        'href="#" target="_blank" rel="noopener" class="h2h-visit-btn primary" id="compareVisitBtnB">Visit Paddle Billing ↗</a>',
        `href="${escapeXml(getSsrProductLink(prodB))}" target="_blank" rel="noopener" class="h2h-visit-btn primary" id="compareVisitBtnB">Visit ${escapeXml(prodB.name)} ↗</a>`
      );

      out = out.replace(
        /<p class="h2h-verdict-body" id="compareVerdictBody">[\s\S]*?<\/p>/i,
        `<p class="h2h-verdict-body" id="compareVerdictBody">Compare <strong>${escapeXml(prodA.name)}</strong> against <strong>${escapeXml(prodB.name)}</strong> in ${escapeXml(cat.title)}. ${escapeXml(prodA.editorialSummary || prodA.editorial?.summary || prodA.tagline || '')} ${escapeXml(prodB.editorialSummary || prodB.editorial?.summary || prodB.tagline || '')}</p>`
      );
      out = out.replace('id="compareWinnerDev">Stripe Billing<', `id="compareWinnerDev">${escapeXml(prodA.name)}<`);
      out = out.replace('id="compareWinnerValue">Paddle Billing<', `id="compareWinnerValue">${escapeXml(prodB.name)}<`);
      out = out.replace('id="thMatrixNameA">Stripe Billing<', `id="thMatrixNameA">${escapeXml(prodA.name)}<`);
      out = out.replace('id="thMatrixNameB">Paddle Billing<', `id="thMatrixNameB">${escapeXml(prodB.name)}<`);
      return out;
    }

    // Read state for SEO injection & route verification
    const db = readDb();
    const categories = (db.categories || [])
      .filter(isPubliclyPublished)
      .map((c) => enrichCategory(c, db.platformStats, db.authors));

    let activeCat = null;
    let comparePair = null;
    let routeKind = 'home';
    let pageTitle = 'Top 10 — Curated Product Buying Guides & Rankings (2026)';
    let pageDesc = 'Explore curated Top 10 buying guides across software, hardware, and consumer apps with editorial summaries and direct official links.';
    let canonicalUrl = `${base}/`;
    let ogType = 'website';
    let ogImage = DEFAULT_SITE_OG_IMAGE;
    let ogImageAlt = 'Top 10 Buying Guides & Curated Rankings';
    let robotsDirective = 'index, follow, max-snippet:-1, max-image-preview:large';

    if (listPathMatch || parsedUrl.searchParams.get('list')) {
      const activeSlug = listPathMatch ? listPathMatch[1] : parsedUrl.searchParams.get('list');
      activeCat = categories.find((c) => c.slug === activeSlug);
      if (!activeCat) {
        return render404(res, req, base, `The Top 10 directory "${escapeXml(activeSlug)}" does not exist or has been archived.`);
      }
      routeKind = 'list';
      const meta = getCategoryFeatureMeta(activeCat);
      pageTitle = activeCat.seo?.metaTitle || `${activeCat.title} (${new Date().getFullYear()}) — Best Picks & Buying Guide | Top 10`;
      const topPickName = activeCat.top10[0]?.name || '';
      pageDesc = truncateMetaDesc(activeCat.seo?.metaDescription || (topPickName ? `#1 Pick: ${topPickName} — ${meta.description}` : meta.description));
      canonicalUrl = `${base}/list/${activeCat.slug}`;
      ogType = 'article';
      ogImage = meta.coverImage;
      ogImageAlt = activeCat.title;
    } else if (blogArticleMatch) {
      const article = categories.find(c => c.slug === blogArticleMatch[1]);
      if (!article) return render404(res, req, base, 'This guide is unavailable.');
      res.writeHead(302, { Location: '/list/' + encodeURIComponent(article.slug) });
      return res.end();
    } else if (isBlogIndex) {
      routeKind = 'blog';
      pageTitle = 'All Top 10 Buying Guides | Top 10';
      pageDesc = 'Browse the full archive of Top 10 buying guides and editorial rankings.';
      canonicalUrl = base + '/blog';
    } else if (compareMatch) {
      const [, cSlug, idA, idB] = compareMatch;
      activeCat = categories.find((c) => c.slug === cSlug);
      if (!activeCat) {
        return render404(res, req, base, `The comparison category "${escapeXml(cSlug)}" does not exist.`);
      }
      const prodA = findProductInCat(activeCat, idA);
      const prodB = findProductInCat(activeCat, idB);
      if (!prodA || !prodB) {
        return render404(res, req, base, `One or both comparison products could not be found in ${activeCat.title}.`);
      }
      routeKind = 'compare';
      comparePair = { prodA, prodB };
      const meta = getCategoryFeatureMeta(activeCat);
      pageTitle = `${prodA.name} vs ${prodB.name} (2026 Comparison) — ${activeCat.shortName || activeCat.title} | Top 10`;
      pageDesc = truncateMetaDesc(`Compare ${prodA.name} vs ${prodB.name} side-by-side in ${activeCat.title}. See features, highlights, and pricing details.`);
      canonicalUrl = `${base}/compare/${activeCat.slug}/${idA}-vs-${idB}`;
      ogImage = prodA.media?.heroImage || meta.coverImage;
      ogImageAlt = `${prodA.name} vs ${prodB.name}`;
    } else if (isAdminView) {
      routeKind = 'admin';
      pageTitle = 'Admin Operations Dashboard — Top 10 Platform';
      pageDesc = 'Editor workspace for managing Top 10 guides.';
      canonicalUrl = `${base}/admin`;
      robotsDirective = 'noindex, nofollow';
    } else if (!isHome) {
      // Unknown route that doesn't correspond to any page or static file -> Return Real 404!
      return render404(res, req, base, `The requested URL "${escapeXml(pathname)}" was not found on this platform.`);
    }

    const jsonLd = buildSeoJsonLd(activeCat, categories, base, comparePair);

    let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');

    // Render full semantic SSR body for Home, List, and Compare pages before JS hydration
    if (routeKind === 'home') {
      html = renderSsrHomepageBody(html, categories);
    } else if (routeKind === 'blog') {
      html = html.replace('<main id="homePageView" class="home-container">', '<main id="homePageView" class="home-container hidden">');
      html = html.replace('<main id="blogIndexSection" class="guide-archive hidden"></main>', () => renderGuideArchive(categories, db.topicCategories || DEFAULT_TOPIC_CATEGORIES));
    } else if (routeKind === 'list' && activeCat) {
      html = renderSsrListBody(html, activeCat, categories);
    } else if (routeKind === 'compare' && activeCat && comparePair) {
      html = renderSsrCompareBody(html, activeCat, comparePair);
    }

    // Replace SEO, OpenGraph, Twitter & JSON-LD tags cleanly in-place
    html = html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeXml(pageTitle)}</title>`);
    html = html.replace(/<meta name="description" id="metaDescriptionTag"[^>]*>/i, () => `<meta name="description" id="metaDescriptionTag" content="${escapeXml(pageDesc)}" />`);
    html = html.replace(/<meta name="robots" id="metaRobotsTag"[^>]*>/i, () => `<meta name="robots" id="metaRobotsTag" content="${escapeXml(robotsDirective)}" />`);
    html = html.replace(/<link rel="canonical" id="canonicalLinkTag"[^>]*>/i, () => `<link rel="canonical" id="canonicalLinkTag" href="${escapeXml(canonicalUrl)}" />`);
    html = html.replace(/href="\/feed\.xml"/i, () => `href="${escapeXml(base)}/feed.xml"`);
    html = html.replace(/href="\/llms\.txt"/i, () => `href="${escapeXml(base)}/llms.txt"`);
    html = html.replace(/<meta property="og:type" id="ogTypeTag"[^>]*>/i, () => `<meta property="og:type" id="ogTypeTag" content="${escapeXml(ogType)}" />`);
    html = html.replace(/<meta property="og:title" id="ogTitleTag"[^>]*>/i, () => `<meta property="og:title" id="ogTitleTag" content="${escapeXml(pageTitle)}" />`);
    html = html.replace(/<meta property="og:description" id="ogDescTag"[^>]*>/i, () => `<meta property="og:description" id="ogDescTag" content="${escapeXml(pageDesc)}" />`);
    html = html.replace(/<meta property="og:url" id="ogUrlTag"[^>]*>/i, () => `<meta property="og:url" id="ogUrlTag" content="${escapeXml(canonicalUrl)}" />`);
    html = html.replace(/<meta property="og:image" id="ogImageTag"[^>]*>/i, () => `<meta property="og:image" id="ogImageTag" content="${escapeXml(ogImage)}" />`);
    html = html.replace(/<meta property="og:image:alt" id="ogImageAltTag"[^>]*>/i, () => `<meta property="og:image:alt" id="ogImageAltTag" content="${escapeXml(ogImageAlt)}" />`);
    html = html.replace(/<meta name="twitter:title" id="twitterTitleTag"[^>]*>/i, () => `<meta name="twitter:title" id="twitterTitleTag" content="${escapeXml(pageTitle)}" />`);
    html = html.replace(/<meta name="twitter:description" id="twitterDescTag"[^>]*>/i, () => `<meta name="twitter:description" id="twitterDescTag" content="${escapeXml(pageDesc)}" />`);
    html = html.replace(/<meta name="twitter:image" id="twitterImageTag"[^>]*>/i, () => `<meta name="twitter:image" id="twitterImageTag" content="${escapeXml(ogImage)}" />`);
    html = html.replace(/<script type="application\/ld\+json" id="seoJsonLdScript">[\s\S]*?<\/script>/i, () => `<script type="application/ld+json" id="seoJsonLdScript">${jsonLd}</script>`);

    return sendResponse(req, res, 200, 'text/html; charset=utf-8', html, {
      'Cache-Control': 'no-cache'
    });
}

async function start() {
  if (isProduction && adminPassword && adminPassword.length < 20) {
    throw new Error('ADMIN_PASSWORD must be at least 20 characters in production');
  }
  if (isProduction && publishKey && publishKey.length < 32) {
    throw new Error('EDITORIAL_PUBLISH_KEY must be at least 32 characters in production');
  }
  await initMariaDb();
  await withDb(runScheduledPublisher);
  server.listen(PORT, () => {
    console.log('Top 10 Auction Directory running at http://localhost:' + server.address().port);
    setInterval(() => {
      withDb(runScheduledPublisher).catch(err => console.error('[Scheduler Error]', err.message));
    }, 15000).unref();
  });
}

start().catch((err) => {
  console.error('[Startup Error]', err.message);
  process.exit(1);
});
