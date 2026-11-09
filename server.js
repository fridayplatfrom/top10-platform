const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const {
  ensureTenRealProducts,
  enrichCategoryEditorial,
  ensureDefaultEightCategories,
  buildSeoJsonLd,
  buildLlmsTxt
} = require('./editorial-enrichment');
const { BLOG_ARTICLES } = require('./blog-data');
const { initMongo, getDbState, saveDbState, isMongoConnected, getDbStatus } = require('./db');

const PORT = process.env.PORT || 3456;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ============================================================================
// PRODUCTION-GRADE AUTHENTICATION & SECURE SESSIONS
// ============================================================================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Top10Admin2026!';
const sessions = new Map(); // token -> { token, userId, role, email, name, expiresAt }

function hashPassword(password, salt) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, actualSalt, 10000, 64, 'sha512').toString('hex');
  return `${actualSalt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, originalHash] = stored.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const session = {
    token,
    userId: user.id,
    role: user.role || 'viewer',
    email: user.email,
    name: user.name,
    avatarBg: user.avatarBg,
    avatarText: user.avatarText,
    company: user.company,
    expiresAt
  };
  sessions.set(token, session);
  return session;
}

function getSession(req) {
  if (!req) return null;
  const authHeader = req.headers['authorization'] || '';
  let token = null;
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token && req.headers['cookie']) {
    const match = req.headers['cookie'].match(/(?:^|;\s*)top10_session=([^;]+)/);
    if (match) token = match[1];
  }
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...clean } = user;
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

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Authentication required' }, req);
    return null;
  }
  return session;
}

function ensureUserPasswords() {
  const db = readDb();
  let modified = false;
  if (!db.users || !Array.isArray(db.users)) {
    db.users = [];
  }
  let admin = db.users.find((u) => u.role === 'admin' || u.email === 'admin@top10.io');
  if (!admin) {
    admin = {
      id: 'usr_admin',
      name: 'Ankush (Admin)',
      email: 'admin@top10.io',
      company: 'Top 10 HQ',
      role: 'admin',
      avatarBg: '#111827',
      avatarText: 'AD'
    };
    db.users.unshift(admin);
    modified = true;
  }
  if (!admin.passwordHash) {
    admin.passwordHash = hashPassword(ADMIN_PASSWORD);
    modified = true;
  }

  const defaults = [
    { email: 'aaron@stripe.com', pass: 'Stripe2026!', name: 'Aaron Francis', company: 'Stripe Inc', role: 'company', avatarBg: '#059669', avatarText: 'AF' },
    { email: 'travis@maybefinance.com', pass: 'Maybe2026!', name: 'Travis Woods', company: 'Maybe Finance Inc', role: 'company', avatarBg: '#2563EB', avatarText: 'TW' }
  ];
  for (const def of defaults) {
    let u = db.users.find((x) => x.email && x.email.toLowerCase() === def.email.toLowerCase());
    if (!u) {
      u = { id: 'usr_' + Date.now() + Math.random().toString(36).slice(2, 5), ...def };
      u.passwordHash = hashPassword(def.pass);
      db.users.push(u);
      modified = true;
    } else if (!u.passwordHash) {
      u.passwordHash = hashPassword(def.pass);
      modified = true;
    }
  }

  if (modified) {
    writeDb(db);
  }
}

function readDb() {
  const parsed = getDbState();
  parsed.categories = ensureDefaultEightCategories(parsed.categories);
  if (!parsed.subscriptions) parsed.subscriptions = [];
  if (!parsed.reviews) parsed.reviews = [];
  if (!parsed.claims) parsed.claims = [];
  if (!parsed.articles || !Array.isArray(parsed.articles) || parsed.articles.length === 0) {
    parsed.articles = JSON.parse(JSON.stringify(BLOG_ARTICLES || []));
  }
  return parsed;
}

function writeDb(data) {
  saveDbState(data);
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

function enrichCategory(cat, platformStats) {
  const minEntry = Number(platformStats.minEntryBid || 49);
  const minInc = Number(platformStats.minOutbidIncrement || 25);

  const fullProducts = ensureTenRealProducts(cat);

  const sorted = [...fullProducts].sort((a, b) => {
    const paidA = Number(a.amountPaid || 0);
    const paidB = Number(b.amountPaid || 0);
    if (paidB !== paidA) {
      return paidB - paidA;
    }
    if (paidA > 0) {
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    }
    return Number(b.upvotes || 0) - Number(a.upvotes || 0);
  });

  const rankedAll = sorted.map((prod, idx) => {
    const rank = idx + 1;
    const paid = Number(prod.amountPaid || 0);
    const priceToBeatThisSlot = paid > 0 ? paid + minInc : minEntry;
    return {
      ...prod,
      rank,
      isOrganic: paid === 0,
      priceToTakeSlot: priceToBeatThisSlot
    };
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

  return enrichCategoryEditorial(baseEnriched);
}

function getPublicState(user) {
  const db = readDb();
  const isAdmin = user && user.role === 'admin';
  const categories = (db.categories || []).map((c) => {
    const enriched = enrichCategory(c, db.platformStats);
    const comments = (enriched.comments || []).filter((cmt) => {
      if (isAdmin) return true;
      return cmt.status === 'approved' || !cmt.status || cmt.type === 'system_event';
    });
    return {
      ...enriched,
      comments
    };
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
    currentUser: sanitizeUser(user),
    buyerLeads: isAdmin ? (db.buyerLeads || []) : [],
    transactions: isAdmin ? (db.transactions || []) : [],
    users: isAdmin ? (db.users || []).map(sanitizeUser) : [],
    claims: isAdmin ? (db.claims || []) : [],
    subscriptions: isAdmin ? (db.subscriptions || []) : [],
    reviews: isAdmin ? (db.reviews || []) : []
  };
}

function getFullState() {
  const db = readDb();
  const categories = db.categories.map((c) => enrichCategory(c, db.platformStats));
  const totalRevenue = categories.reduce((sum, c) => sum + c.computedStats.poolTotal, 0);
  const totalPaidListings = categories.reduce((sum, c) => sum + c.computedStats.paidSlotsCount, 0);

  return {
    platformStats: {
      ...db.platformStats,
      totalRevenue,
      totalPaidListings
    },
    users: (db.users || []).map(sanitizeUser),
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
      <a href="/" style="display:inline-flex;align-items:center;height:42px;padding:0 20px;border-radius:8px;background:#111827;color:#B8FF01;font-size:13.5px;font-weight:700;text-decoration:none;">Back to All Directories</a>
      <a href="/blog" style="display:inline-flex;align-items:center;height:42px;padding:0 20px;border-radius:8px;background:#F3F4F6;color:#111827;font-size:13.5px;font-weight:600;text-decoration:none;">Browse Buying Guides</a>
    </div>
  </div>
</body>
</html>`;
  return sendResponse(req, res, 404, 'text/html; charset=utf-8', html);
}

async function verifyPayPalOrder(orderId) {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { verified: true, simulated: true };
  }
  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials'
    });
    if (!tokenRes.ok) return { verified: false, error: 'PayPal Authentication Failed' };
    const tokenData = await tokenRes.json();
    const orderRes = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    if (!orderRes.ok) return { verified: false, error: 'Order Not Found' };
    const orderData = await orderRes.json();
    const isCompleted = orderData.status === 'COMPLETED';
    return { verified: isCompleted, status: orderData.status };
  } catch (err) {
    return { verified: false, error: err.message };
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
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
const sseClients = new Set();

function broadcastSse(eventType, payload) {
  if (sseClients.size === 0) return;
  const dataStr = JSON.stringify(payload);
  const msg = `event: ${eventType}\ndata: ${dataStr}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch {
      sseClients.delete(client);
    }
  }
}

// 20-second heartbeat to maintain alive connections across corporate firewalls (only when clients connected)
setInterval(() => {
  if (sseClients.size > 0) {
    broadcastSse('ping', { time: Date.now() });
  }
}, 20000);

const server = http.createServer(async (req, res) => {
  try {
    const base = getBaseUrl(req);
    const parsedUrl = new URL(req.url, base);
    const pathname = parsedUrl.pathname;

    // Real-Time Server-Sent Events (SSE) Stream Endpoint
    if (req.method === 'GET' && pathname === '/api/events/live-bids') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ time: Date.now(), clients: sseClients.size + 1 })}\n\n`);
      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

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
      const session = getSession(req);
      if (session) {
        sessions.delete(session.token);
      }
      return sendJson(res, 200, { success: true }, req, {
        'Set-Cookie': 'top10_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
      });
    }

    // 1-db. GET /api/admin/db-status (Admin only)
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
          totalArticles: articles.length,
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
        categoryBreakdown,
        recentTransactions: txs.slice(0, 15),
        activeSubscriptions: activeSubs
      });
    }

    // 1a. GET /api/blog (List of all editorial buying guides & teardowns)
    if (req.method === 'GET' && pathname === '/api/blog') {
      const db = readDb();
      const articles = (db.articles && db.articles.length > 0 ? db.articles : BLOG_ARTICLES);
      const mapped = articles.map((a) => ({
        ...a,
        content: a.contentHtml || a.content || '',
        keyTakeaways: a.takeaways || a.keyTakeaways || [],
        authorName: typeof a.author === 'object' ? a.author.name : a.author
      }));
      return sendJson(res, 200, mapped);
    }

    // 1a-2. GET /api/blog/:slug (Single editorial article)
    const blogMatch = pathname.match(/^\/api\/blog\/([^/]+)$/);
    if (req.method === 'GET' && blogMatch) {
      const slug = blogMatch[1];
      const db = readDb();
      const articles = (db.articles && db.articles.length > 0 ? db.articles : BLOG_ARTICLES);
      const article = articles.find((a) => a.slug === slug);
      if (!article) return sendJson(res, 404, { error: 'Article not found' });
      return sendJson(res, 200, {
        ...article,
        content: article.contentHtml || article.content || '',
        keyTakeaways: article.takeaways || article.keyTakeaways || [],
        authorName: typeof article.author === 'object' ? article.author.name : article.author
      });
    }

    // 1a-3. POST /api/blog (Create New Blog / Editorial Article - Admin only)
    if (req.method === 'POST' && pathname === '/api/blog') {
      if (!requireAdmin(req, res)) return;
      const body = await parseBody(req);
      const title = (body.title || '').trim();
      if (!title) return sendJson(res, 400, { error: 'Article title is required' }, req);

      const db = readDb();
      if (!db.articles) db.articles = JSON.parse(JSON.stringify(BLOG_ARTICLES || []));

      const rawSlug = (body.slug || title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const slug = rawSlug || `article-${Date.now()}`;

      if (db.articles.some((a) => a.slug === slug)) {
        return sendJson(res, 409, { error: `An article with slug "${slug}" already exists.` }, req);
      }

      const authorName = (body.authorName || body.author || 'Sarah Jenkins').trim();
      const newArticle = {
        id: `art_${Date.now()}`,
        title,
        slug,
        subtitle: (body.subtitle || body.excerpt || '').trim(),
        category: (body.category || 'Buyer Guides').trim(),
        categorySlug: (body.categorySlug || 'billing-software').trim(),
        author: {
          name: authorName,
          role: (body.authorRole || 'Lead Technical Researcher').trim(),
          initials: (authorName.match(/\b\w/g) || ['S', 'J']).join('').slice(0, 2).toUpperCase()
        },
        readTime: (body.readTime || '6 min read').trim(),
        date: body.date || new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        coverEmoji: body.coverEmoji || body.coverIcon || '📝',
        coverGradient: body.coverGradient || 'linear-gradient(135deg, #1e293b, #0f172a)',
        takeaways: Array.isArray(body.takeaways) ? body.takeaways : (body.keyTakeaways || []),
        keyTakeaways: Array.isArray(body.takeaways) ? body.takeaways : (body.keyTakeaways || []),
        contentHtml: body.content || body.contentHtml || '',
        content: body.content || body.contentHtml || '',
        status: body.status || 'published',
        views: 0,
        createdAt: new Date().toISOString()
      };

      db.articles.unshift(newArticle);
      writeDb(db);
      return sendJson(res, 201, { success: true, article: newArticle, state: getPublicState(getSession(req)) }, req);
    }

    // 1a-4. PUT /api/blog/:slug (Update Editorial Article - Admin only)
    if (req.method === 'PUT' && blogMatch) {
      if (!requireAdmin(req, res)) return;
      const slug = blogMatch[1];
      const body = await parseBody(req);
      const db = readDb();
      if (!db.articles) db.articles = JSON.parse(JSON.stringify(BLOG_ARTICLES || []));

      const article = db.articles.find((a) => a.slug === slug);
      if (!article) return sendJson(res, 404, { error: 'Article not found' }, req);

      if (body.title !== undefined) article.title = String(body.title).trim();
      if (body.subtitle !== undefined) article.subtitle = String(body.subtitle).trim();
      if (body.category !== undefined) article.category = String(body.category).trim();
      if (body.categorySlug !== undefined) article.categorySlug = String(body.categorySlug).trim();
      if (body.readTime !== undefined) article.readTime = String(body.readTime).trim();
      if (body.coverEmoji !== undefined || body.coverIcon !== undefined) {
        article.coverEmoji = body.coverEmoji || body.coverIcon;
      }
      if (body.authorName !== undefined || body.author !== undefined) {
        const aName = (body.authorName || body.author || 'Editorial Team').trim();
        article.author = {
          name: aName,
          role: body.authorRole || (article.author ? article.author.role : 'Lead Researcher'),
          initials: (aName.match(/\b\w/g) || ['E', 'D']).join('').slice(0, 2).toUpperCase()
        };
      }
      if (body.takeaways !== undefined || body.keyTakeaways !== undefined) {
        const tk = Array.isArray(body.takeaways) ? body.takeaways : (body.keyTakeaways || []);
        article.takeaways = tk;
        article.keyTakeaways = tk;
      }
      if (body.content !== undefined || body.contentHtml !== undefined) {
        const ct = body.content || body.contentHtml || '';
        article.content = ct;
        article.contentHtml = ct;
      }
      if (body.status !== undefined) article.status = body.status;
      article.updatedAt = new Date().toISOString();

      writeDb(db);
      return sendJson(res, 200, { success: true, article, state: getPublicState(getSession(req)) }, req);
    }

    // 1a-5. DELETE /api/blog/:slug (Delete Editorial Article - Admin only)
    if (req.method === 'DELETE' && blogMatch) {
      if (!requireAdmin(req, res)) return;
      const slug = blogMatch[1];
      const db = readDb();
      if (!db.articles) db.articles = JSON.parse(JSON.stringify(BLOG_ARTICLES || []));

      const idx = db.articles.findIndex((a) => a.slug === slug);
      if (idx === -1) return sendJson(res, 404, { error: 'Article not found' }, req);

      db.articles.splice(idx, 1);
      writeDb(db);
      const fullState = getPublicState(getSession(req));
      broadcastSse('article_deleted', {
        slug,
        timestamp: new Date().toISOString()
      });
      return sendJson(res, 200, { success: true, state: fullState }, req);
    }

    // 1b. GET /api/badge/:slug/:productId.svg (Dynamic Live Rank SVG Badge for Company Websites)
    const badgeMatch = pathname.match(/^\/api\/badge\/([^/]+)\/([^/.]+)\.svg$/);
    if (req.method === 'GET' && badgeMatch) {
      const [, slug, prodId] = badgeMatch;
      const db = readDb();
      const rawCat = db.categories.find((c) => c.slug === slug);
      if (!rawCat) {
        res.writeHead(404);
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

    // 2. POST /api/auth/login (Secure Authentication with PBKDF2 Password Verification & Session Cookie)
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const body = await parseBody(req);
      const db = readDb();
      const email = (body.email || '').trim().toLowerCase();
      const password = (body.password || '').trim();

      if (!email) {
        return sendJson(res, 400, { error: 'Email is required' }, req);
      }

      let user = db.users.find((u) => u.email && u.email.toLowerCase() === email);

      // Admin authorization check
      if (email === 'admin@top10.io' || (user && user.role === 'admin')) {
        if (!password) {
          return sendJson(res, 401, { error: 'Admin password is required' }, req);
        }
        if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
          return sendJson(res, 401, { error: 'Invalid admin credentials' }, req);
        }
      } else if (user) {
        // Existing user with password hash
        if (user.passwordHash) {
          if (!password || !verifyPassword(password, user.passwordHash)) {
            return sendJson(res, 401, { error: 'Invalid password' }, req);
          }
        } else if (password) {
          // Upgrade user with password hash
          user.passwordHash = hashPassword(password);
          writeDb(db);
        }
      } else {
        // Create new user
        const name = (body.name || email.split('@')[0]).trim();
        const company = (body.company || `${name} Co`).trim();
        const initials =
          name
            .split(/\s+/)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'CO';
        const colors = ['#2563EB', '#059669', '#7C3AED', '#EA580C', '#0D9488', '#DB2777'];
        user = {
          id: 'usr_' + Date.now(),
          name,
          email,
          company,
          role: 'company',
          avatarBg: colors[db.users.length % colors.length],
          avatarText: initials
        };
        if (password) {
          user.passwordHash = hashPassword(password);
        }
        db.users.push(user);
        writeDb(db);
      }

      const session = createSession(user);
      return sendJson(
        res,
        200,
        {
          success: true,
          token: session.token,
          user: sanitizeUser(user),
          state: getPublicState(session)
        },
        req,
        {
          'Set-Cookie': `top10_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
        }
      );
    }

    // 3. POST /api/categories/:slug/bid
    const bidMatch = pathname.match(/^\/api\/categories\/([^/]+)\/bid$/);
    if (req.method === 'POST' && bidMatch) {
      const slug = bidMatch[1];
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' });

      // Snapshot previous ranks of paid products before applying this bid
      const beforeEnriched = enrichCategory(cat, db.platformStats);
      const prevRanksMap = {};
      beforeEnriched.top10.forEach((p) => {
        if (!p.isOrganic) prevRanksMap[p.id] = p.rank;
      });

      const paymentAmount = Number(body.paymentAmount || 0);
      if (!paymentAmount || paymentAmount < 1) {
        return sendJson(res, 400, { error: 'Valid payment amount is required' });
      }

      let targetProduct = null;
      const existingProductId = body.existingProductId;

      if (existingProductId) {
        targetProduct = cat.products.find((p) => p.id === existingProductId);
        if (!targetProduct) {
          return sendJson(res, 404, { error: 'Product not found in this category' });
        }
        targetProduct.amountPaid = Number(targetProduct.amountPaid || 0) + paymentAmount;
        targetProduct.isOrganic = false;
        targetProduct.updatedAt = new Date().toISOString();
        if (body.ownerEmail) targetProduct.ownerEmail = body.ownerEmail.trim();
        if (body.hasHighlightBorder) targetProduct.hasHighlightBorder = true;
        if (body.hasPinnedCta) targetProduct.hasPinnedCta = true;
      } else {
        const name = (body.name || '').trim();
        if (!name) return sendJson(res, 400, { error: 'Product name is required' });
        const companyName = (body.companyName || name).trim();
        const tagline = (body.tagline || 'Verified product in ' + cat.title).trim();
        const website = (body.website || 'https://example.com').trim();
        const pricingTag = (body.pricingTag || 'Custom Pricing').trim();
        const rawHighlight = (body.highlightTag || 'Featured Pick').trim();
        const highlightTag = rawHighlight.startsWith('@') ? rawHighlight : `@${rawHighlight}`;
        const logoText = (body.logoText || name.slice(0, 2).toUpperCase()).trim().slice(0, 3);
        const logoBg = body.logoBg || '#111827';
        const logoColor = body.logoColor || '#B8FF01';

        targetProduct = {
          id: 'prod_' + Date.now(),
          name,
          companyName,
          tagline,
          website,
          pricingTag,
          highlightTag,
          logoText,
          logoBg,
          logoColor,
          amountPaid: paymentAmount,
          isOrganic: false,
          hasHighlightBorder: Boolean(body.hasHighlightBorder),
          hasPinnedCta: Boolean(body.hasPinnedCta),
          ownerEmail: (body.ownerEmail || '').trim(),
          clicks: 120,
          upvotes: 18,
          updatedAt: new Date().toISOString()
        };
        cat.products.push(targetProduct);
      }

      const enriched = enrichCategory(cat, db.platformStats);
      const rankedProd = enriched.top10.find((p) => p.id === targetProduct.id);
      const newRank = rankedProd ? rankedProd.rank : 11;

      // Detect any paid products that got pushed down by this bid and record Outbid Alerts!
      if (!db.outbidAlerts) db.outbidAlerts = [];
      // Remove any resolved alert for the product that just boosted
      db.outbidAlerts = db.outbidAlerts.filter((a) => a.productId !== targetProduct.id);

      const minInc = Number(db.platformStats.minOutbidIncrement || 25);
      enriched.top10.forEach((p) => {
        if (p.id !== targetProduct.id && prevRanksMap[p.id] && p.rank > prevRanksMap[p.id]) {
          const targetSlotHolder = enriched.top10.find((x) => x.rank === prevRanksMap[p.id]);
          const reclaimCost = targetSlotHolder
            ? Math.max(minInc, Number(targetSlotHolder.amountPaid) + minInc - Number(p.amountPaid))
            : minInc;
          db.outbidAlerts = db.outbidAlerts.filter((a) => a.productId !== p.id);
          db.outbidAlerts.unshift({
            id: 'alert_' + Date.now() + '_' + p.id,
            categorySlug: cat.slug,
            categoryTitle: cat.title,
            productId: p.id,
            productName: p.name,
            oldRank: prevRanksMap[p.id],
            newRank: p.rank,
            overtakenBy: targetProduct.name,
            reclaimAmount: reclaimCost,
            createdAt: new Date().toISOString()
          });
        }
      });

      cat.updatedAgo = 'just now';
      cat.comments.unshift({
        id: 'cmt_' + Date.now(),
        type: 'bid_event',
        authorName: body.authorName || targetProduct.companyName || targetProduct.name,
        authorRole: 'Verified Sponsor',
        avatarBg: targetProduct.logoBg || '#111827',
        avatarText: (targetProduct.logoText || 'SP').slice(0, 2),
        timeAgo: 'just now',
        likes: 1,
        text: existingProductId
          ? `added $${paymentAmount} (Total: $${targetProduct.amountPaid}) to claim`
          : `paid $${paymentAmount} to list ${targetProduct.name} at`,
        highlightPill: `Rank #${newRank} · ${cat.title}`,
        attachments: []
      });

      if (!db.transactions) db.transactions = [];
      db.transactions.unshift({
        id: 'tx_' + Date.now(),
        categorySlug: cat.slug,
        categoryTitle: cat.title,
        productName: targetProduct.name,
        companyEmail: targetProduct.ownerEmail || body.ownerEmail || 'sponsor@company.com',
        amount: paymentAmount,
        rankAchieved: newRank,
        createdAt: new Date().toISOString()
      });

      writeDb(db);
      const fullState = getFullState();
      broadcastSse('bid_placed', {
        categorySlug: cat.slug,
        categoryTitle: cat.title,
        productId: targetProduct.id,
        productName: targetProduct.name,
        newRank,
        amountPaid: paymentAmount,
        totalPaid: targetProduct.amountPaid,
        timestamp: new Date().toISOString(),
        state: fullState
      });
      return sendJson(res, 200, {
        newRank,
        product: targetProduct,
        state: fullState
      });
    }

    // 4. PUT /api/categories/:slug/products/:productId (Edit Product Details)
    const editProdMatch = pathname.match(/^\/api\/categories\/([^/]+)\/products\/([^/]+)$/);
    if (req.method === 'PUT' && editProdMatch) {
      const [, slug, prodId] = editProdMatch;
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' });
      const prod = cat.products.find((p) => p.id === prodId);
      if (!prod) return sendJson(res, 404, { error: 'Product not found' });

      if (body.name) prod.name = body.name.trim();
      if (body.companyName) prod.companyName = body.companyName.trim();
      if (body.tagline) prod.tagline = body.tagline.trim();
      if (body.website) prod.website = body.website.trim();
      if (body.pricingTag) prod.pricingTag = body.pricingTag.trim();
      if (body.highlightTag) {
        const ht = body.highlightTag.trim();
        prod.highlightTag = ht.startsWith('@') ? ht : `@${ht}`;
      }
      if (body.logoBg) prod.logoBg = body.logoBg;
      if (body.logoText) prod.logoText = body.logoText.trim().slice(0, 3).toUpperCase();

      writeDb(db);
      return sendJson(res, 200, { product: prod, state: getFullState() });
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
      writeDb(db);
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
      cat.updatedAt = new Date().toISOString();

      writeDb(db);
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
      writeDb(db);
      const fullState = getPublicState(getSession(req));
      broadcastSse('category_deleted', {
        slug,
        timestamp: new Date().toISOString()
      });
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
      const amountPaid = Number(body.amountPaid || 0);

      const newProd = {
        id: prodId,
        name,
        company: body.company || name,
        logo: body.logo || name.slice(0, 2).toUpperCase(),
        website: body.website || 'https://example.com',
        startingPrice: body.startingPrice || body.pricingTag || 'Free Trial Available',
        tagline: body.tagline || `${name} delivers next-generation performance.`,
        highlight: body.highlight || body.badge || (amountPaid > 0 ? 'Sponsored' : 'Verified'),
        badge: body.badge || body.highlight || (amountPaid > 0 ? 'Sponsored' : 'Verified'),
        amountPaid,
        isOrganic: amountPaid === 0,
        upvotes: 0,
        clicks: 0,
        specs: Array.isArray(body.specs) ? body.specs : ['Enterprise Security', 'Cloud-Native Architecture', 'REST & GraphQL APIs', '99.99% SLA Uptime'],
        pros: Array.isArray(body.pros) ? body.pros : ['Modern UX', 'Fast onboarding', 'Comprehensive documentation'],
        cons: Array.isArray(body.cons) ? body.cons : ['Advanced tiers require sales engagement'],
        addedAt: new Date().toISOString()
      };

      if (!cat.products) cat.products = [];
      cat.products.push(newProd);
      cat.products.sort((a, b) => (b.amountPaid || 0) - (a.amountPaid || 0));
      writeDb(db);
      return sendJson(res, 201, { success: true, product: newProd, state: getPublicState(getSession(req)) }, req);
    }

    // 12d. POST /api/admin/product/reset-bid (Admin only)
    if (req.method === 'POST' && pathname === '/api/admin/product/reset-bid') {
      if (!requireAdmin(req, res)) return;
      const body = await parseBody(req);
      const db = readDb();
      const { categorySlug, productId } = body;
      const cat = (db.categories || []).find((c) => c.slug === categorySlug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' }, req);
      const prod = (cat.products || []).find((p) => p.id === productId);
      if (!prod) return sendJson(res, 404, { error: 'Product not found' }, req);

      prod.amountPaid = 0;
      prod.isOrganic = true;
      prod.highlightTag = '@Unclaimed Organic';
      prod.updatedAt = new Date().toISOString();
      cat.products.sort((a, b) => (b.amountPaid || 0) - (a.amountPaid || 0));
      writeDb(db);
      return sendJson(res, 200, { product: prod, state: getPublicState(getSession(req)) }, req);
    }

    // 6. PUT /api/admin/settings (Admin updates floor bid & increment rules - Admin only)
    if (req.method === 'PUT' && pathname === '/api/admin/settings') {
      if (!requireAdmin(req, res)) return;
      const body = await parseBody(req);
      const db = readDb();
      if (body.minEntryBid !== undefined) {
        db.platformStats.minEntryBid = Math.max(1, Number(body.minEntryBid));
      }
      if (body.minOutbidIncrement !== undefined) {
        db.platformStats.minOutbidIncrement = Math.max(1, Number(body.minOutbidIncrement));
      }
      if (body.stripeKeyHint !== undefined) {
        db.platformStats.stripeKeyHint = String(body.stripeKeyHint).trim();
      }
      writeDb(db);
      return sendJson(res, 200, { state: getPublicState(getSession(req)) }, req);
    }

    // 7. POST /api/categories/:slug/comments
    const commentMatch = pathname.match(/^\/api\/categories\/([^/]+)\/comments$/);
    if (req.method === 'POST' && commentMatch) {
      const slug = commentMatch[1];
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' });

      const text = (body.text || '').trim();
      if (!text) return sendJson(res, 400, { error: 'Comment text is required' });

      const authorName = (body.authorName || 'Community Member').trim();
      const initials =
        authorName
          .split(/\s+/)
          .map((w) => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 2) || 'CM';

      const newComment = {
        id: 'cmt_' + Date.now(),
        type: body.attachments && body.attachments.length > 0 ? 'file_event' : 'comment',
        authorName,
        authorRole: body.authorRole || 'Verified Reviewer',
        avatarBg: body.avatarBg || '#111827',
        avatarText: initials,
        timeAgo: 'just now',
        likes: 0,
        text,
        mentionTag: body.mentionTag || '',
        attachments: Array.isArray(body.attachments) ? body.attachments : []
      };

      cat.comments.unshift(newComment);
      writeDb(db);
      return sendJson(res, 200, { comment: newComment, state: getFullState() });
    }

    // 8. POST /api/categories/:slug/comments/:commentId/like
    const likeCommentMatch = pathname.match(/^\/api\/categories\/([^/]+)\/comments\/([^/]+)\/like$/);
    if (req.method === 'POST' && likeCommentMatch) {
      const [, slug, cmtId] = likeCommentMatch;
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' });
      const cmt = (cat.comments || []).find((c) => c.id === cmtId);
      if (!cmt) return sendJson(res, 404, { error: 'Comment not found' });
      cmt.likes = Number(cmt.likes || 0) + 1;
      writeDb(db);
      return sendJson(res, 200, { state: getFullState() });
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
      writeDb(db);
      return sendJson(res, 200, { state: getPublicState(getSession(req)) }, req);
    }

    // 10. POST /api/categories/:slug/products/:productId/interact
    const interactMatch = pathname.match(/^\/api\/categories\/([^/]+)\/products\/([^/]+)\/interact$/);
    if (req.method === 'POST' && interactMatch) {
      const [, slug, prodId] = interactMatch;
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' }, req);
      const prod = findProductInCat(cat, prodId);
      if (!prod) return sendJson(res, 404, { error: 'Product not found' }, req);

      if (body.action === 'upvote') {
        prod.upvotes = Number(prod.upvotes || 0) + 1;
      } else {
        prod.clicks = Number(prod.clicks || 0) + 1;
      }
      writeDb(db);
      return sendJson(res, 200, { clicks: prod.clicks, upvotes: prod.upvotes, state: getPublicState(getSession(req)) }, req);
    }

    // 10b. POST /api/products/click (Convenience click tracker)
    if (req.method === 'POST' && pathname === '/api/products/click') {
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === body.categorySlug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' }, req);
      const prod = findProductInCat(cat, body.productId);
      if (!prod) return sendJson(res, 404, { error: 'Product not found' }, req);
      prod.clicks = Number(prod.clicks || 0) + 1;
      writeDb(db);
      return sendJson(res, 200, { success: true, clicks: prod.clicks, state: getPublicState(getSession(req)) }, req);
    }

    // 11. POST /api/lists/create-paid (Paywall to create a new Top 10 list + optional #1 founding product)
    if (req.method === 'POST' && pathname === '/api/lists/create-paid') {
      const body = await parseBody(req);
      const db = readDb();
      let rawTitle = (body.title || '').trim();
      if (!rawTitle) return sendJson(res, 400, { error: 'List title is required' });

      const fullTitle = rawTitle.toLowerCase().startsWith('top 10')
        ? rawTitle
        : `Top 10 ${rawTitle}`;
      const shortName = fullTitle.replace(/^Top\s+10\s+/i, '').trim() || rawTitle;
      const slug =
        (body.slug ||
          shortName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')) || 'list-' + Date.now();

      const existing = db.categories.find((c) => c.slug === slug);
      if (existing) {
        return sendJson(res, 200, { category: existing, state: getFullState() });
      }

      const paywallFee = Math.max(49, Number(body.paymentAmount || 99));
      const prodName = (body.productName || `${shortName} Leader #1`).trim();
      const prodWebsite = (body.website || 'https://example.com').trim();
      const prodTagline = (
        body.tagline || `Ranked #1 founding platform in ${fullTitle}.`
      ).trim();
      const prodPricing = (body.pricingTag || 'From $29/mo').trim();
      const rawHighlight = (body.highlightTag || `@#1 in ${shortName}`).trim();
      const highlightTag = rawHighlight.startsWith('@') ? rawHighlight : `@${rawHighlight}`;

      const foundingProduct = {
        id: `prod_${slug}_1_${Date.now()}`,
        name: prodName,
        companyName: (body.companyName || prodName).trim(),
        tagline: prodTagline,
        website: prodWebsite,
        pricingTag: prodPricing,
        highlightTag,
        logoText: prodName.slice(0, 2).toUpperCase(),
        logoBg: '#111827',
        logoColor: '#B8FF01',
        amountPaid: paywallFee,
        isOrganic: false,
        ownerEmail: (body.ownerEmail || 'founder@company.com').trim(),
        clicks: 140,
        upvotes: 24,
        updatedAt: new Date().toISOString()
      };

      const palette = [
        '#2563EB',
        '#059669',
        '#7C3AED',
        '#EA580C',
        '#0284C7',
        '#4F46E5',
        '#0D9488',
        '#DC2626',
        '#334155'
      ];
      const organicPlaceholders = [2, 3, 4, 5, 6, 7, 8, 9, 10].map((rankNum, idx) => ({
        id: `prod_${slug}_org_${rankNum}_${Date.now()}`,
        name: `${shortName} Option #${rankNum}`,
        companyName: `${shortName} Brand`,
        tagline: `Unclaimed organic slot #${rankNum} in ${fullTitle}. Any company can claim and replace this spot starting at $49.`,
        website: 'https://example.com',
        pricingTag: 'Open Slot',
        highlightTag: '@Available Slot',
        logoText: `#${rankNum}`,
        logoBg: palette[idx % palette.length],
        logoColor: '#FFFFFF',
        amountPaid: 0,
        isOrganic: true,
        ownerEmail: '',
        clicks: Math.max(80, 450 - idx * 35),
        upvotes: Math.max(10, 60 - idx * 5),
        updatedAt: new Date().toISOString()
      }));

      const iconColors = ['#B8FF01', '#38BDF8', '#A855F7', '#F97316', '#10B981', '#FACC15'];
      const newCategory = {
        id: slug,
        slug,
        title: fullTitle,
        shortName,
        subtitle: `Top 10 Directory · USD($) · Live Auction Ranking · 10 Verified Slots`,
        iconText: shortName[0] ? shortName[0].toUpperCase() : '10',
        iconBg: iconColors[db.categories.length % iconColors.length],
        iconColor: '#111827',
        updatedAgo: 'just now',
        metrics: {
          monthlyViews: '42.80k',
          buyerClicks: '12.40k',
          poolRevenue: `$${paywallFee}`,
          topBid: `$${paywallFee}`
        },
        products: [foundingProduct, ...organicPlaceholders],
        comments: [
          {
            id: 'cmt_launch_' + Date.now(),
            type: 'bid_event',
            authorName: foundingProduct.companyName,
            authorRole: 'Founding #1 Sponsor',
            avatarBg: '#111827',
            avatarText: foundingProduct.logoText,
            timeAgo: 'just now',
            likes: 1,
            text: `paid $${paywallFee} to create list & claim`,
            highlightPill: `Rank #1 · ${fullTitle}`,
            attachments: []
          }
        ]
      };

      db.categories.unshift(newCategory);
      if (!db.transactions) db.transactions = [];
      db.transactions.unshift({
        id: 'tx_list_' + Date.now(),
        categorySlug: slug,
        categoryTitle: fullTitle,
        productName: `${prodName} (Created List)`,
        companyEmail: foundingProduct.ownerEmail,
        amount: paywallFee,
        rankAchieved: 1,
        createdAt: new Date().toISOString()
      });

      writeDb(db);
      const state = getFullState();
      const formattedCat = (state.categories || []).find((c) => c.slug === slug) || newCategory;
      broadcastSse('new_directory', {
        categorySlug: slug,
        title: fullTitle,
        state
      });
      return sendJson(res, 200, { category: formattedCat, state });
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

      db.categories.push(newCategory);
      writeDb(db);
      const state = getPublicState(getSession(req));
      const formattedCat = (state.categories || []).find((c) => c.slug === slug) || newCategory;
      broadcastSse('new_directory', {
        categorySlug: slug,
        title
      });
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

      writeDb(db);
      return sendJson(res, 200, { state: getPublicState(getSession(req)) }, req);
    }

    // 12b. POST /api/user/profile (Update current user display profile)
    if (req.method === 'POST' && pathname === '/api/user/profile') {
      const body = await parseBody(req);
      const db = readDb();
      const userId = (body.id || '').trim();
      const user = (db.users || []).find((u) => u.id === userId);
      if (user) {
        if (body.name) user.name = body.name.trim();
        if (body.company) user.company = body.company.trim();
        if (body.email) user.email = body.email.trim();
        if (body.name) {
          const parts = user.name.split(/\s+/).filter(Boolean);
          user.avatarText = (parts[0]?.[0] || 'U') + (parts[1]?.[0] || parts[0]?.[1] || '');
          user.avatarText = user.avatarText.toUpperCase();
        }
        writeDb(db);
        return sendJson(res, 200, { user: sanitizeUser(user), state: getPublicState(getSession(req)) }, req);
      }
      return sendJson(res, 404, { error: 'User not found' }, req);
    }

    // 12c. POST /api/admin/product/update (Admin inline product editor - Admin only)
    if (req.method === 'POST' && pathname === '/api/admin/product/update') {
      if (!requireAdmin(req, res)) return;
      const body = await parseBody(req);
      const db = readDb();
      const { categorySlug, productId, amountPaid, pricingTag, tagline, name } = body;
      const cat = (db.categories || []).find((c) => c.slug === categorySlug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' }, req);
      const prod = (cat.products || []).find((p) => p.id === productId);
      if (!prod) return sendJson(res, 404, { error: 'Product not found' }, req);

      if (amountPaid !== undefined) {
        const amt = parseFloat(amountPaid) || 0;
        prod.amountPaid = amt;
        prod.isOrganic = amt <= 0;
        if (amt > 0 && (!prod.highlightTag || prod.highlightTag.includes('Organic'))) {
          prod.highlightTag = '@Sponsored Rank';
        }
      }
      if (pricingTag !== undefined) prod.pricingTag = pricingTag.trim();
      if (tagline !== undefined) prod.tagline = tagline.trim();
      if (name !== undefined) prod.name = name.trim();
      prod.updatedAt = new Date().toISOString();

      // Re-sort category products by amountPaid desc
      cat.products.sort((a, b) => (b.amountPaid || 0) - (a.amountPaid || 0));
      writeDb(db);
      return sendJson(res, 200, { product: prod, state: getPublicState(getSession(req)) }, req);
    }

    // 13. GET /sitemap.xml (Dynamic SEO XML Sitemap for Google, Bing & AI Indexing)
    if (req.method === 'GET' && pathname === '/sitemap.xml') {
      const db = readDb();
      const catUrls = (db.categories || [])
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
      for (const c of (db.categories || [])) {
        const prods = (c.products || []).slice(0, 3);
        if (prods.length >= 2) {
          compareUrls.push(`  <url><loc>${base}/compare/${escapeXml(c.slug)}/${escapeXml(prods[0].id)}-vs-${escapeXml(prods[1].id)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
          if (prods.length >= 3) {
            compareUrls.push(`  <url><loc>${base}/compare/${escapeXml(c.slug)}/${escapeXml(prods[0].id)}-vs-${escapeXml(prods[2].id)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
            compareUrls.push(`  <url><loc>${base}/compare/${escapeXml(c.slug)}/${escapeXml(prods[1].id)}-vs-${escapeXml(prods[2].id)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
          }
        }
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n  <url><loc>${base}/blog</loc><changefreq>daily</changefreq><priority>0.9</priority></url>\n  <url><loc>${base}/llms.txt</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n${catUrls}\n${blogUrls}\n${compareUrls.join('\n')}\n</urlset>`;
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      return res.end(xml);
    }

    // 13b. GET /llms.txt (AI & LLM Crawler Structured Markdown Guide for Perplexity, ChatGPT, Claude)
    if (req.method === 'GET' && (pathname === '/llms.txt' || pathname === '/llms-full.txt')) {
      const state = getFullState();
      const md = buildLlmsTxt(state.categories || [], base);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(md);
    }

    // 13c. GET /robots.txt (SEO & AI Bot Discovery Rules)
    if (req.method === 'GET' && pathname === '/robots.txt') {
      const robots = [
        'User-agent: *',
        'Allow: /',
        '',
        'User-agent: GPTBot',
        'Allow: /',
        '',
        'User-agent: OAI-SearchBot',
        'Allow: /',
        '',
        'User-agent: PerplexityBot',
        'Allow: /',
        '',
        'User-agent: ClaudeBot',
        'Allow: /',
        '',
        `Sitemap: ${base}/sitemap.xml`,
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
        .map((c) => {
          const top1Name = c.products && c.products[0] ? c.products[0].name : 'Top Rated Platform';
          const desc = c.description || (c.editorialGuide && c.editorialGuide.summary) || 'Verified buyer reviews and live algorithmic rankings.';
          return `    <item>
      <title>${escapeXml(c.title)} — Ranked #1: ${escapeXml(top1Name)}</title>
      <link>${base}/list/${escapeXml(c.slug)}</link>
      <guid isPermaLink="true">${base}/list/${escapeXml(c.slug)}</guid>
      <description>${escapeXml(desc)}</description>
      <pubDate>${new Date(c.updatedAt || Date.now()).toUTCString()}</pubDate>
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
      const rawCat = db.categories.find((c) => c.slug === slug);
      if (!rawCat) {
        res.writeHead(404);
        return res.end('Category not found');
      }
      const enriched = enrichCategory(rawCat, db.platformStats);
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

    // 13f. POST /api/paypal/create-order (One-Off Placement Bids & Directory Launches)
    if (req.method === 'POST' && pathname === '/api/paypal/create-order') {
      const body = await parseBody(req);
      const amount = Number(body.amount || body.bidAmount || 49);
      const orderId = 'ORDER-PP-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      return sendJson(res, 200, {
        success: true,
        orderId,
        amount,
        currency: 'USD',
        approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
        message: 'PayPal checkout order initiated'
      });
    }

    // 13g. POST /api/paypal/capture-order
    if (req.method === 'POST' && pathname === '/api/paypal/capture-order') {
      const body = await parseBody(req);
      const db = readDb();
      const orderId = body.orderId || ('ORDER-PP-' + Date.now().toString(36).toUpperCase());
      const amount = Number(body.amount || body.bidAmount || 49);
      const ownerEmail = (body.ownerEmail || body.authorEmail || 'founder@company.com').trim().toLowerCase();
      const authorName = body.authorName || 'Founder';

      if (body.action === 'launch_category' && body.details) {
        const catTitle = (body.details.title || '').trim();
        const slug = body.details.slug || catTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const newCat = {
          slug,
          title: catTitle,
          description: body.details.description || `Curated rankings of the top 10 ${catTitle.toLowerCase()}.`,
          iconBg: '#111827',
          iconColor: '#B8FF01',
          editorialGuide: {
            lastUpdatedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            verifiedLeaderBadge: 'Top Pick',
            summary: `Independent editorial review and verified buyer rankings for ${catTitle}.`,
            faqs: []
          },
          products: []
        };
        if (body.details.productName) {
          newCat.products.push({
            id: 'prod_' + Date.now(),
            name: body.details.productName,
            companyName: body.details.companyName || body.details.productName,
            website: body.details.website || 'https://example.com',
            tagline: body.details.tagline || 'Leading solution in ' + catTitle,
            pricingTag: body.details.pricingTag || 'Transparent Pricing',
            highlightTag: '@Founding Sponsor',
            amountPaid: amount,
            isClaimed: true,
            claimedBy: ownerEmail,
            updatedAt: new Date().toISOString()
          });
        }
        db.categories.push(newCat);
        db.transactions.push({
          id: 'tx_' + Date.now(),
          categorySlug: slug,
          amount,
          buyerEmail: ownerEmail,
          buyerName: authorName,
          type: 'directory_launch',
          paymentGateway: 'PayPal',
          paypalOrderId: orderId,
          timestamp: new Date().toISOString()
        });
        writeDb(db);
        return sendJson(res, 200, { success: true, categorySlug: slug, rankAchieved: 1, state: getFullState() });
      }

      const cat = db.categories.find((c) => c.slug === body.categorySlug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' });

      let targetProd = findProductInCat(cat, body.productId);
      if (targetProd) {
        targetProd.amountPaid = Number(targetProd.amountPaid || 0) + amount;
        targetProd.isOrganic = false;
        targetProd.updatedAt = new Date().toISOString();
      } else if (body.details && body.details.name) {
        targetProd = {
          id: 'prod_' + Date.now(),
          name: body.details.name,
          companyName: body.details.companyName || body.details.name,
          website: body.details.website || 'https://example.com',
          tagline: body.details.tagline || '',
          pricingTag: body.details.pricingTag || 'Free Trial',
          highlightTag: '@Sponsor',
          amountPaid: amount,
          isClaimed: true,
          claimedBy: ownerEmail,
          updatedAt: new Date().toISOString()
        };
        cat.products.push(targetProd);
      }

      if (cat.products && Array.isArray(cat.products)) {
        cat.products.sort((a, b) => Number(b.amountPaid || 0) - Number(a.amountPaid || 0));
      }
      const rankAchieved = targetProd ? (cat.products.findIndex((p) => p.id === targetProd.id) + 1) : 1;

      db.transactions.push({
        id: 'tx_' + Date.now(),
        categorySlug: cat.slug,
        productName: targetProd ? targetProd.name : 'Platform',
        amount,
        buyerEmail: ownerEmail,
        buyerName: authorName,
        type: 'rank_bid',
        paymentGateway: 'PayPal',
        paypalOrderId: orderId,
        timestamp: new Date().toISOString()
      });

      writeDb(db);
      const fullState = getFullState();
      broadcastSse('rank_boosted', {
        categorySlug: cat.slug,
        categoryTitle: cat.title,
        productId: targetProd ? targetProd.id : null,
        productName: targetProd ? targetProd.name : 'Platform',
        amount,
        rankAchieved: rankAchieved > 0 ? rankAchieved : 1,
        timestamp: new Date().toISOString(),
        state: fullState
      });
      return sendJson(res, 200, { success: true, orderId, product: targetProd, rankAchieved: rankAchieved > 0 ? rankAchieved : 1, state: fullState });
    }

    // 13h. POST /api/paypal/create-subscription (Recurring Sponsorship Retainer: Lock #1 ($299/mo) | Guaranteed Top 3 ($149/mo))
    if (req.method === 'POST' && pathname === '/api/paypal/create-subscription') {
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === body.categorySlug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' });

      const prod = findProductInCat(cat, body.productId);
      if (!prod) return sendJson(res, 404, { error: 'Product not found' });

      const tier = body.tier === 'guaranteed_top_3' ? 'guaranteed_top_3' : 'lock_rank_1';
      const monthlyAmount = tier === 'lock_rank_1' ? 299 : 149;
      const subId = 'SUB-PP-' + Date.now().toString(36).toUpperCase();
      const nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const ownerEmail = (body.ownerEmail || 'founder@company.com').trim().toLowerCase();

      prod.retainerSubscription = {
        id: subId,
        tier,
        tierName: tier === 'lock_rank_1' ? 'Lock #1 for 30 Days' : 'Guaranteed Top 3',
        monthlyAmount,
        status: 'active',
        ownerEmail,
        startedAt: new Date().toISOString(),
        nextBillingDate: nextBilling,
        paymentGateway: 'PayPal'
      };

      if (tier === 'lock_rank_1') {
        const highestOther = cat.products.reduce((max, p) => p.id !== prod.id ? Math.max(max, Number(p.amountPaid || 0)) : max, 0);
        prod.amountPaid = Math.max(Number(prod.amountPaid || 0), highestOther + 50);
      }
      prod.updatedAt = new Date().toISOString();

      db.subscriptions = db.subscriptions || [];
      db.subscriptions.push({
        id: subId,
        tier,
        categorySlug: cat.slug,
        categoryTitle: cat.title,
        productId: prod.id,
        productName: prod.name,
        monthlyAmount,
        status: 'active',
        ownerEmail,
        startedAt: new Date().toISOString(),
        nextBillingDate: nextBilling,
        paymentGateway: 'PayPal'
      });

      db.transactions.push({
        id: 'tx_' + Date.now(),
        categorySlug: cat.slug,
        productName: prod.name,
        amount: monthlyAmount,
        buyerEmail: ownerEmail,
        buyerName: body.authorName || prod.name,
        type: 'sponsorship_retainer_paypal',
        paymentGateway: 'PayPal',
        subscriptionId: subId,
        timestamp: new Date().toISOString()
      });

      writeDb(db);
      const fullState = getFullState();
      broadcastSse('retainer_locked', {
        categorySlug: cat.slug,
        categoryTitle: cat.title,
        productId: prod.id,
        productName: prod.name,
        tier,
        tierName: prod.retainerSubscription.tierName,
        monthlyAmount,
        rank: tier === 'lock_rank_1' ? 1 : 3,
        timestamp: new Date().toISOString(),
        state: fullState
      });
      return sendJson(res, 200, {
        success: true,
        subscription: prod.retainerSubscription,
        state: fullState
      });
    }

    // 13i. POST /api/paypal/cancel-subscription
    if (req.method === 'POST' && pathname === '/api/paypal/cancel-subscription') {
      const body = await parseBody(req);
      const db = readDb();
      const sub = (db.subscriptions || []).find((s) => s.id === body.subscriptionId);
      if (sub) {
        sub.status = 'cancelled';
        sub.cancelledAt = new Date().toISOString();
        for (const cat of db.categories) {
          for (const prod of cat.products) {
            if (prod.retainerSubscription && prod.retainerSubscription.id === body.subscriptionId) {
              prod.retainerSubscription.status = 'cancelled';
            }
          }
        }
        writeDb(db);
      }
      return sendJson(res, 200, { success: true, state: getFullState() });
    }

    // 13j. POST /api/webhooks/paypal (Automated PayPal Webhook Event Processing for MRR & Bids)
    if (req.method === 'POST' && pathname === '/api/webhooks/paypal') {
      const event = await parseBody(req);
      const db = readDb();
      const eventType = event.event_type || '';
      const resource = event.resource || {};
      console.log(`[PayPal Webhook] Received event: ${eventType} (ID: ${event.id || 'N/A'})`);

      let stateModified = false;

      // Event A: Recurring Monthly Retainer Renewal Payment Received
      if (eventType === 'PAYMENT.SALE.COMPLETED') {
        const subId = resource.billing_agreement_id || resource.subscription_id;
        const amount = Number(resource.amount?.total || 299);
        const payerEmail = (resource.payer?.payer_info?.email || resource.billing_agreement_id || 'subscriber@company.com').toLowerCase();

        if (subId) {
          const sub = (db.subscriptions || []).find((s) => s.id === subId);
          if (sub) {
            sub.status = 'active';
            sub.nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            sub.lastPaymentDate = new Date().toISOString();
          }

          // Log recurring revenue transaction
          db.transactions.push({
            id: 'tx_renewal_' + Date.now(),
            categorySlug: sub ? sub.categorySlug : '',
            productName: sub ? sub.productName : 'Sponsorship Retainer Renewal',
            amount,
            buyerEmail: payerEmail,
            buyerName: 'Verified Retainer Partner',
            type: 'sponsorship_retainer_renewal',
            paymentGateway: 'PayPal',
            subscriptionId: subId,
            timestamp: new Date().toISOString()
          });
          stateModified = true;
        }
      }

      // Event B: Retainer Subscription Activated by Buyer
      else if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
        const subId = resource.id;
        if (subId) {
          const sub = (db.subscriptions || []).find((s) => s.id === subId);
          if (sub) {
            sub.status = 'active';
            stateModified = true;
          }
          for (const cat of db.categories) {
            for (const prod of cat.products) {
              if (prod.retainerSubscription && prod.retainerSubscription.id === subId) {
                prod.retainerSubscription.status = 'active';
                stateModified = true;
              }
            }
          }
        }
      }

      // Event C: Retainer Subscription Cancelled or Suspended
      else if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED' || eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') {
        const subId = resource.id;
        if (subId) {
          const sub = (db.subscriptions || []).find((s) => s.id === subId);
          if (sub) {
            sub.status = 'cancelled';
            sub.cancelledAt = new Date().toISOString();
            stateModified = true;
          }
          for (const cat of db.categories) {
            for (const prod of cat.products) {
              if (prod.retainerSubscription && prod.retainerSubscription.id === subId) {
                prod.retainerSubscription.status = 'cancelled';
                stateModified = true;
              }
            }
          }
        }
      }

      // Event D: One-Off Placement Bid / Directory Launch Payment Captured
      else if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
        const orderId = resource.supplementary_data?.related_ids?.order_id || resource.id;
        const amount = Number(resource.amount?.value || 0);
        const alreadyLogged = (db.transactions || []).some((t) => t.paypalOrderId === orderId || t.id === orderId);

        if (!alreadyLogged && amount > 0) {
          db.transactions.push({
            id: 'tx_capture_' + Date.now(),
            categorySlug: resource.custom_id || '',
            productName: 'Programmatic Placement Bid',
            amount,
            buyerEmail: resource.payer?.email_address || 'buyer@company.com',
            buyerName: 'Verified Bidder',
            type: 'rank_bid',
            paymentGateway: 'PayPal',
            paypalOrderId: orderId,
            timestamp: new Date().toISOString()
          });
          stateModified = true;
        }
      }

      if (stateModified) {
        writeDb(db);
      }

      return sendJson(res, 200, {
        success: true,
        received: true,
        eventType,
        processed: stateModified,
        state: getFullState()
      });
    }

    // 13k. POST /api/categories/:slug/reviews (Community UGC Review Submission)
    const reviewPathMatch = pathname.match(/^\/api\/categories\/([^/]+)\/reviews$/);
    if (req.method === 'POST' && (reviewPathMatch || pathname === '/api/reviews')) {
      const body = await parseBody(req);
      const db = readDb();
      const slug = reviewPathMatch ? reviewPathMatch[1] : (body.categorySlug || body.slug || (db.categories[0] ? db.categories[0].slug : ''));
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' });

      const reviewerName = (body.reviewerName || body.authorName || 'Verified Buyer').trim();
      const reviewerEmail = (body.reviewerEmail || body.authorEmail || '').trim().toLowerCase();
      const text = (body.text || '').trim();
      const stars = Math.min(5, Math.max(1, parseInt(body.stars || body.rating || 5, 10)));
      const productId = body.productId || (cat.products[0] ? cat.products[0].id : '');
      const targetProd = findProductInCat(cat, productId);

      if (!text) {
        return sendJson(res, 400, { error: 'Review text is required' });
      }

      const reviewId = 'rev_' + Date.now();
      const newReview = {
        id: reviewId,
        categorySlug: slug,
        productId,
        productName: targetProd ? targetProd.name : 'Platform',
        stars,
        authorName: reviewerName,
        authorEmail: reviewerEmail,
        authorRole: body.reviewerRole || body.authorRole || 'Verified User',
        avatarText: (reviewerName[0] || 'U').toUpperCase(),
        avatarBg: '#111827',
        headline: body.headline || '',
        text,
        pros: Array.isArray(body.pros) ? body.pros : (body.pros ? [body.pros] : []),
        cons: Array.isArray(body.cons) ? body.cons : (body.cons ? [body.cons] : []),
        likes: 0,
        timeAgo: 'Just now',
        createdAt: new Date().toISOString(),
        status: 'pending', // Directly sent to moderation queue!
        type: 'comment'
      };

      db.reviews = db.reviews || [];
      db.reviews.unshift(newReview);
      cat.comments = cat.comments || [];
      cat.comments.unshift(newReview);

      writeDb(db);
      const fullState = getFullState();
      broadcastSse('new_review', {
        categorySlug: cat.slug,
        categoryTitle: cat.title,
        reviewId: newReview.id,
        productName: newReview.productName,
        authorName: newReview.authorName,
        stars: newReview.stars,
        timestamp: new Date().toISOString(),
        state: fullState
      });
      return sendJson(res, 200, {
        success: true,
        review: newReview,
        state: fullState,
        message: 'Your verified review has been submitted for moderation.'
      });
    }

    // 13l. POST /api/categories/:slug/reviews/:reviewId/reply (Official Founder Response)
    if (req.method === 'POST' && pathname.match(/^\/api\/categories\/([^/]+)\/reviews\/([^/]+)\/reply$/)) {
      const [, slug, reviewId] = pathname.match(/^\/api\/categories\/([^/]+)\/reviews\/([^/]+)\/reply$/);
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' });

      const cmt = (cat.comments || []).find((c) => c.id === reviewId);
      if (!cmt) return sendJson(res, 404, { error: 'Review not found' });

      const founderName = (body.founderName || body.authorName || 'Founder').trim();
      const founderEmail = (body.founderEmail || body.ownerEmail || '').trim().toLowerCase();
      const founderRole = (body.authorRole || body.role || 'Official Founder Response').trim();
      const replyText = (body.replyText || body.text || '').trim();
      if (!replyText) return sendJson(res, 400, { error: 'Reply text is required' });

      cmt.founderReply = {
        founderName,
        authorName: founderName,
        founderEmail,
        role: founderRole,
        authorRole: founderRole,
        text: replyText,
        timeAgo: 'Just now',
        date: new Date().toISOString()
      };

      const globalRev = (db.reviews || []).find((r) => r.id === reviewId);
      if (globalRev) {
        globalRev.founderReply = cmt.founderReply;
      }

      writeDb(db);
      return sendJson(res, 200, { success: true, review: cmt, state: getFullState() });
    }

    // 13m. GET /api/admin/reviews (Review Moderation Queue - Admin only)
    if (req.method === 'GET' && pathname === '/api/admin/reviews') {
      if (!requireAdmin(req, res)) return;
      const db = readDb();
      const allReviews = [];
      for (const cat of (db.categories || [])) {
        for (const cmt of (cat.comments || [])) {
          if (cmt.type === 'comment' || !cmt.type) {
            allReviews.push({ ...cmt, categorySlug: cat.slug, categoryTitle: cat.title });
          }
        }
      }
      const pendingCount = allReviews.filter((r) => r.status === 'pending').length;
      return sendJson(res, 200, { reviews: allReviews, pendingCount }, req);
    }

    // 13n. POST /api/admin/reviews/:reviewId/moderate (Approve, Reject, or Delete Review - Admin only)
    if (req.method === 'POST' && pathname.match(/^\/api\/admin\/reviews\/([^/]+)\/moderate$/)) {
      if (!requireAdmin(req, res)) return;
      const reviewId = pathname.match(/^\/api\/admin\/reviews\/([^/]+)\/moderate$/)[1];
      const body = await parseBody(req);
      const db = readDb();
      const action = body.action; // 'approve' | 'reject' | 'delete'

      for (const cat of (db.categories || [])) {
        const idx = (cat.comments || []).findIndex((c) => c.id === reviewId);
        if (idx !== -1) {
          if (action === 'delete') {
            cat.comments.splice(idx, 1);
          } else {
            cat.comments[idx].status = action === 'approve' ? 'approved' : 'rejected';
          }
        }
      }

      if (db.reviews) {
        const gIdx = db.reviews.findIndex((r) => r.id === reviewId);
        if (gIdx !== -1) {
          if (action === 'delete') {
            db.reviews.splice(gIdx, 1);
          } else {
            db.reviews[gIdx].status = action === 'approve' ? 'approved' : 'rejected';
          }
        }
      }

      writeDb(db);
      const fullState = getPublicState(getSession(req));
      broadcastSse('review_moderated', {
        reviewId,
        action,
        timestamp: new Date().toISOString()
      });
      return sendJson(res, 200, { success: true, state: fullState }, req);
    }

    // 13o. POST /api/claim/send-code (Founder "Claim This Listing" OTP Dispatch)
    if (req.method === 'POST' && pathname === '/api/claim/send-code') {
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === body.categorySlug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' }, req);

      const prod = findProductInCat(cat, body.productId);
      if (!prod) return sendJson(res, 404, { error: 'Product not found' }, req);

      const founderEmail = (body.founderEmail || body.workEmail || body.ownerEmail || '').trim().toLowerCase();
      if (!founderEmail || !founderEmail.includes('@')) {
        return sendJson(res, 400, { error: 'Valid company work email is required' }, req);
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      db.claims = db.claims || [];
      db.claims.push({
        id: 'claim_' + Date.now(),
        categorySlug: cat.slug,
        productId: prod.id,
        productName: prod.name,
        founderEmail,
        code,
        expiresAt: Date.now() + 15 * 60 * 1000,
        isVerified: false
      });

      writeDb(db);
      const isDev = process.env.NODE_ENV !== 'production';
      const responsePayload = {
        success: true,
        message: `Verification code sent to ${founderEmail}`
      };
      if (isDev) {
        responsePayload.devCode = code;
      }
      return sendJson(res, 200, responsePayload, req);
    }

    // 13p. POST /api/claim/verify (Verify OTP & Link Founder Ownership)
    if (req.method === 'POST' && pathname === '/api/claim/verify') {
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === body.categorySlug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' }, req);

      const prod = findProductInCat(cat, body.productId);
      if (!prod) return sendJson(res, 404, { error: 'Product not found' }, req);

      const founderEmail = (body.founderEmail || body.workEmail || body.ownerEmail || '').trim().toLowerCase();
      const code = (body.code || '').trim();

      const claimRecord = (db.claims || []).find((c) =>
        c.categorySlug === cat.slug &&
        (c.productId === prod.id || c.productId === body.productId) &&
        (!founderEmail || c.founderEmail === founderEmail) &&
        c.code === code &&
        Date.now() < c.expiresAt
      );

      const isDev = process.env.NODE_ENV !== 'production';
      if (!claimRecord && (!isDev || code !== '123456')) {
        return sendJson(res, 400, { error: 'Invalid or expired verification code' }, req);
      }

      prod.isClaimed = true;
      prod.claimed = true;
      prod.claimedBy = founderEmail || body.ownerName || 'Verified Founder';
      prod.claimedAt = new Date().toISOString();
      prod.claimedAt = new Date().toISOString();
      if (claimRecord) claimRecord.isVerified = true;

      const user = (db.users || []).find((u) => u.email && u.email.toLowerCase() === founderEmail);
      if (user) {
        user.claimedProductIds = user.claimedProductIds || [];
        if (!user.claimedProductIds.includes(prod.id)) {
          user.claimedProductIds.push(prod.id);
        }
      }

      writeDb(db);
      return sendJson(res, 200, {
        success: true,
        message: `Successfully verified and claimed ${prod.name}!`,
        product: prod,
        state: getFullState()
      });
    }

    // 14. GET /embed/:slug (Embeddable Mini Top 10 Widget for Bloggers & Partners)
    const embedMatch = pathname.match(/^\/embed\/([^/]+)$/);
    if (req.method === 'GET' && embedMatch) {
      const slug = embedMatch[1];
      const db = readDb();
      const rawCat = db.categories.find((c) => c.slug === slug);
      if (!rawCat) {
        res.writeHead(404);
        return res.end('Category not found');
      }
      const enriched = enrichCategory(rawCat, db.platformStats);
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

    // 15. POST /api/category-requests (Company pays deposit to request a new Top 10 page from Admin)
    if (req.method === 'POST' && pathname === '/api/category-requests') {
      const body = await parseBody(req);
      const db = readDb();
      if (!db.categoryRequests) db.categoryRequests = [];

      const requestedTitle = (body.requestedTitle || '').trim();
      const productName = (body.productName || '').trim();
      if (!requestedTitle || !productName) {
        return sendJson(res, 400, { error: 'Category title and product name are required' });
      }

      const newReq = {
        id: 'req_' + Date.now(),
        requestedTitle: requestedTitle.toLowerCase().startsWith('top 10')
          ? requestedTitle
          : `Top 10 ${requestedTitle}`,
        productName,
        companyName: (body.companyName || productName).trim(),
        ownerEmail: (body.ownerEmail || 'founder@company.com').trim(),
        website: (body.website || 'https://example.com').trim(),
        tagline: (body.tagline || `Rank #1 founding sponsor for ${requestedTitle}`).trim(),
        bountyAmount: Math.max(99, Number(body.bountyAmount || 299)),
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      db.categoryRequests.unshift(newReq);
      writeDb(db);
      return sendJson(res, 200, { request: newReq, state: getFullState() });
    }

    // 16. POST /api/admin/category-requests/:reqId/approve (Admin approves & launches requested page! - Admin only)
    const approveReqMatch = pathname.match(/^\/api\/admin\/category-requests\/([^/]+)\/approve$/);
    if (req.method === 'POST' && approveReqMatch) {
      if (!requireAdmin(req, res)) return;
      const reqId = approveReqMatch[1];
      const db = readDb();
      if (!db.categoryRequests) db.categoryRequests = [];
      const reqItem = db.categoryRequests.find((r) => r.id === reqId);
      if (!reqItem) return sendJson(res, 404, { error: 'Request not found' });

      const slug = reqItem.requestedTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const foundingProd = {
        id: 'prod_founding_' + Date.now(),
        name: reqItem.productName,
        companyName: reqItem.companyName,
        tagline: reqItem.tagline,
        website: reqItem.website,
        pricingTag: 'Founding #1 Sponsor',
        highlightTag: '@Founding Rank #1',
        logoText: reqItem.productName.slice(0, 2).toUpperCase(),
        logoBg: '#111827',
        logoColor: '#B8FF01',
        amountPaid: Number(reqItem.bountyAmount || 299),
        isOrganic: false,
        ownerEmail: reqItem.ownerEmail,
        clicks: 240,
        upvotes: 42,
        updatedAt: new Date().toISOString()
      };

      const defaultOrganics = [
        'Editorial Pick #2',
        'Editorial Pick #3',
        'Editorial Pick #4',
        'Editorial Pick #5',
        'Editorial Pick #6',
        'Editorial Pick #7',
        'Editorial Pick #8',
        'Editorial Pick #9',
        'Editorial Pick #10'
      ].map((name, i) => ({
        id: `prod_org_${slug}_${Date.now()}_${i}`,
        name,
        companyName: name,
        tagline: `Unclaimed $0 organic candidate in ${reqItem.requestedTitle}. Click Replace to take this spot.`,
        website: 'https://example.com',
        pricingTag: 'Organic Slot',
        highlightTag: '@Replaceable ($49)',
        logoText: `O${i + 2}`,
        logoBg: '#334155',
        logoColor: '#FFFFFF',
        amountPaid: 0,
        isOrganic: true,
        ownerEmail: '',
        clicks: 120,
        upvotes: 15,
        updatedAt: new Date().toISOString()
      }));

      const newCat = {
        id: slug,
        slug,
        title: reqItem.requestedTitle,
        shortName: reqItem.requestedTitle.replace(/^Top\s+10\s+/i, '').trim(),
        subtitle: 'Top 10 Directory · USD($) · Live Auction Ranking · 10 Verified Slots',
        iconText: reqItem.productName[0].toUpperCase(),
        iconBg: '#B8FF01',
        iconColor: '#111827',
        updatedAgo: 'just now',
        metrics: {
          monthlyViews: '82.40k',
          buyerClicks: '24.10k',
          poolRevenue: `$${reqItem.bountyAmount}`,
          topBid: `$${reqItem.bountyAmount}`
        },
        products: [foundingProd, ...defaultOrganics],
        comments: [
          {
            id: 'cmt_launch_' + Date.now(),
            type: 'bid_event',
            authorName: reqItem.companyName,
            authorRole: 'Founding #1 Sponsor',
            avatarBg: '#111827',
            avatarText: foundingProd.logoText,
            timeAgo: 'just now',
            likes: 3,
            text: `sponsored page launch ($${reqItem.bountyAmount}) and locked in`,
            highlightPill: `Rank #1 · ${reqItem.requestedTitle}`,
            attachments: []
          }
        ]
      };

      db.categories.push(newCat);
      db.categoryRequests = db.categoryRequests.filter((r) => r.id !== reqId);
      if (!db.transactions) db.transactions = [];
      db.transactions.unshift({
        id: 'tx_' + Date.now(),
        categorySlug: slug,
        categoryTitle: newCat.title,
        productName: foundingProd.name,
        companyEmail: foundingProd.ownerEmail,
        amount: foundingProd.amountPaid,
        rankAchieved: 1,
        createdAt: new Date().toISOString()
      });

      writeDb(db);
      return sendJson(res, 200, { category: newCat, state: getPublicState(getSession(req)) }, req);
    }

    // 17. POST /api/categories/:slug/products/:productId/lead (Buyer submits a Quote / Demo lead)
    const leadMatch = pathname.match(/^\/api\/categories\/([^/]+)\/products\/([^/]+)\/lead$/);
    if (req.method === 'POST' && leadMatch) {
      const [, slug, prodId] = leadMatch;
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === slug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' });
      const prod = cat.products.find((p) => p.id === prodId);
      if (!prod) return sendJson(res, 404, { error: 'Product not found' });

      if (!db.buyerLeads) db.buyerLeads = [];
      const newLead = {
        id: 'lead_' + Date.now(),
        categorySlug: cat.slug,
        categoryTitle: cat.title,
        productId: prod.id,
        productName: prod.name,
        buyerName: (body.buyerName || 'Enterprise Buyer').trim(),
        buyerEmail: (body.buyerEmail || 'buyer@company.com').trim(),
        teamSize: (body.teamSize || '10-50 employees').trim(),
        note: (body.note || `Interested in ${prod.name} pricing & onboarding.`).trim(),
        isUnlocked: Number(prod.amountPaid || 0) > 0, // Free for active paid sponsors, $49 unlock for $0 organic!
        unlockPrice: Number(db.platformStats.minEntryBid || 49),
        createdAt: new Date().toISOString()
      };
      db.buyerLeads.unshift(newLead);
      writeDb(db);
      return sendJson(res, 200, { lead: newLead, state: getFullState() });
    }

    // 18. POST /api/leads/:leadId/unlock (Organic company pays $49 to unlock buyer lead + convert to Paid Sponsor!)
    const unlockLeadMatch = pathname.match(/^\/api\/leads\/([^/]+)\/unlock$/);
    if (req.method === 'POST' && unlockLeadMatch) {
      const leadId = unlockLeadMatch[1];
      const db = readDb();
      if (!db.buyerLeads) db.buyerLeads = [];
      const lead = db.buyerLeads.find((l) => l.id === leadId);
      if (!lead) return sendJson(res, 404, { error: 'Lead not found' });

      lead.isUnlocked = true;
      const cat = db.categories.find((c) => c.slug === lead.categorySlug);
      if (cat) {
        const prod = cat.products.find((p) => p.id === lead.productId);
        if (prod) {
          prod.amountPaid = Number(prod.amountPaid || 0) + Number(lead.unlockPrice || 49);
          prod.isOrganic = false;
          prod.updatedAt = new Date().toISOString();
        }
      }
      if (!db.transactions) db.transactions = [];
      const prodName = lead.productName || (lead.selectedPlatforms && lead.selectedPlatforms[0]) || 'Platform';
      const cleanName = prodName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'company';
      db.transactions.unshift({
        id: 'tx_lead_' + Date.now(),
        categorySlug: lead.categorySlug,
        categoryTitle: lead.categoryTitle || 'Category',
        productName: `${prodName} (Lead Unlock + Bid)`,
        companyEmail: 'sales@' + cleanName + '.com',
        amount: Number(lead.unlockPrice || 49),
        rankAchieved: 5,
        createdAt: new Date().toISOString()
      });

      writeDb(db);
      return sendJson(res, 200, { lead, state: getFullState() });
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

    // 20. POST /api/subscribers (Buyer subscribes to category rank updates)
    if (req.method === 'POST' && pathname === '/api/subscribers') {
      const body = await parseBody(req);
      const email = (body.email || '').trim();
      if (!email) return sendJson(res, 400, { error: 'Email required' });
      const db = readDb();
      if (!db.subscribers) db.subscribers = [];
      db.subscribers.unshift({
        id: 'sub_' + Date.now(),
        email,
        categorySlug: body.categorySlug || 'all',
        createdAt: new Date().toISOString()
      });
      writeDb(db);
      return sendJson(res, 200, { count: db.subscribers.length, state: getFullState() });
    }

    // 21. POST /api/founder/update-product (Self-Serve Listing Editor for Claimed Founders)
    if (req.method === 'POST' && pathname === '/api/founder/update-product') {
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === body.categorySlug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' });

      const prod = findProductInCat(cat, body.productId);
      if (!prod) return sendJson(res, 404, { error: 'Product not found' });

      if (body.name) prod.name = body.name.trim();
      if (body.tagline) prod.tagline = body.tagline.trim();
      if (body.website) prod.website = body.website.trim();
      if (body.companyName) prod.companyName = body.companyName.trim();
      if (body.pricingTag) prod.pricingTag = body.pricingTag.trim();
      if (body.editorialSummary) prod.editorialSummary = body.editorialSummary.trim();

      if (!prod.specs) prod.specs = {};
      if (body.startingPrice) prod.specs.startingPrice = body.startingPrice.trim();
      if (body.freeTrial) prod.specs.freeTrial = body.freeTrial.trim();
      if (body.idealFor) prod.specs.idealFor = body.idealFor.trim();
      if (body.platforms) prod.specs.platforms = body.platforms.trim();

      if (Array.isArray(body.pros) && body.pros.length > 0) {
        prod.pros = body.pros.map((p) => String(p).trim()).filter(Boolean);
      }
      if (Array.isArray(body.cons) && body.cons.length > 0) {
        prod.cons = body.cons.map((c) => String(c).trim()).filter(Boolean);
      }

      if (body.heroImage) {
        if (!prod.media) prod.media = {};
        prod.media.heroImage = body.heroImage.trim();
        if (body.overlayTag) prod.media.overlayTag = body.overlayTag.trim();
      }

      prod.updatedAt = new Date().toISOString();
      writeDb(db);
      return sendJson(res, 200, { success: true, product: prod, state: getFullState() });
    }

    // 22. GET /api/founder/portal-data (Fetch Managed Platforms & Live Lead Feed for Founders)
    if (req.method === 'GET' && pathname === '/api/founder/portal-data') {
      const state = getFullState();
      const email = (parsedUrl.searchParams.get('email') || '').trim().toLowerCase();
      const company = (parsedUrl.searchParams.get('company') || '').trim().toLowerCase();

      const managedProducts = [];
      const relevantLeads = [];
      const db = readDb();
      const allLeads = db.buyerLeads || [];

      for (const cat of (state.categories || [])) {
        const allP = [...(cat.top10 || []), ...(cat.pushedOut || [])];
        for (const p of allP) {
          const isOwner =
            p.claimed ||
            p.isClaimed ||
            (email && (p.claimedBy === email || (p.ownerEmail || '').toLowerCase() === email)) ||
            (company && (p.companyName || '').toLowerCase().includes(company));

          if (isOwner) {
            managedProducts.push({
              ...p,
              categorySlug: cat.slug,
              categoryTitle: cat.title,
              views: p.clicks ? p.clicks * 4 : 120,
              clicks: p.clicks || 0,
              ctr: p.clicks ? ((p.clicks / (p.clicks * 4)) * 100).toFixed(1) + '%' : '3.8%'
            });
            const catLeads = allLeads.filter((l) => l.categorySlug === cat.slug);
            relevantLeads.push(...catLeads);
          }
        }
      }

      if (managedProducts.length === 0 && state.categories && state.categories[0]) {
        const demoCat = state.categories[0];
        const demoProd = demoCat.top10[0];
        if (demoProd) {
          managedProducts.push({
            ...demoProd,
            categorySlug: demoCat.slug,
            categoryTitle: demoCat.title,
            views: 480,
            clicks: 34,
            ctr: '7.1%'
          });
          const catLeads = allLeads.filter((l) => l.categorySlug === demoCat.slug);
          relevantLeads.push(...catLeads);
        }
      }

      const uniqueLeads = Array.from(new Map(relevantLeads.map((l) => [l.id, l])).values());

      return sendJson(res, 200, {
        products: managedProducts,
        leads: uniqueLeads.slice(0, 20),
        stats: {
          totalProducts: managedProducts.length,
          activeRetainers: managedProducts.filter((p) => p.retainerSubscription && p.retainerSubscription.status === 'active').length
        }
      });
    }

    // 23. POST /api/leads/submit (Comprehensive B2B Custom Quote / RFP Submission)
    if (req.method === 'POST' && pathname === '/api/leads/submit') {
      const body = await parseBody(req);
      const db = readDb();
      const cat = db.categories.find((c) => c.slug === body.categorySlug);
      if (!cat) return sendJson(res, 404, { error: 'Category not found' });

      const buyerName = (body.buyerName || 'Enterprise Buyer').trim();
      const buyerEmail = (body.buyerEmail || '').trim().toLowerCase();
      const companyName = (body.companyName || 'Enterprise Buyer').trim();
      const teamSize = (body.teamSize || '11–50 employees').trim();
      const estimatedBudget = (body.estimatedBudget || '$500–$2,000/mo').trim();
      const timeline = (body.timeline || 'Within 1 month').trim();
      const projectRequirements = (body.projectRequirements || body.note || 'Looking for pricing and feature comparison demo.').trim();
      const selectedPlatforms = Array.isArray(body.selectedPlatforms) && body.selectedPlatforms.length > 0
        ? body.selectedPlatforms
        : (cat.products || []).slice(0, 3).map((p) => p.name);

      if (!buyerEmail || !buyerEmail.includes('@')) {
        return sendJson(res, 400, { error: 'Valid business email is required' });
      }

      const newLead = {
        id: 'rfp_' + Date.now(),
        categorySlug: cat.slug,
        categoryTitle: cat.title,
        buyerName,
        buyerEmail,
        companyName,
        teamSize,
        estimatedBudget,
        timeline,
        projectRequirements,
        selectedPlatforms,
        status: 'new',
        isUnlocked: false,
        createdAt: new Date().toISOString()
      };

      if (!db.buyerLeads) db.buyerLeads = [];
      db.buyerLeads.unshift(newLead);
      writeDb(db);
      const fullState = getFullState();
      broadcastSse('new_lead', {
        categorySlug: cat.slug,
        categoryTitle: cat.title,
        companyName,
        selectedPlatforms,
        timestamp: new Date().toISOString()
      });
      return sendJson(res, 200, { success: true, lead: newLead, state: getPublicState(getSession(req)) }, req);
    }

    // 24. GET /api/admin/leads (Admin B2B RFP Leads Ledger - Admin only)
    if (req.method === 'GET' && pathname === '/api/admin/leads') {
      if (!requireAdmin(req, res)) return;
      const db = readDb();
      return sendJson(res, 200, { leads: db.buyerLeads || [] }, req);
    }

    // 25. POST /api/admin/leads/:leadId/status (Admin only)
    if (req.method === 'POST' && pathname.match(/^\/api\/admin\/leads\/([^/]+)\/status$/)) {
      if (!requireAdmin(req, res)) return;
      const leadId = pathname.match(/^\/api\/admin\/leads\/([^/]+)\/status$/)[1];
      const body = await parseBody(req);
      const db = readDb();
      const lead = (db.buyerLeads || []).find((l) => l.id === leadId);
      if (!lead) return sendJson(res, 404, { error: 'Lead not found' }, req);

      lead.status = body.status || 'contacted';
      lead.updatedAt = new Date().toISOString();
      writeDb(db);
      return sendJson(res, 200, { success: true, lead, state: getPublicState(getSession(req)) }, req);
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
    const hasStaticFile = pathname !== '/' && fs.existsSync(path.join(PUBLIC_DIR, pathname)) && !fs.statSync(path.join(PUBLIC_DIR, pathname)).isDirectory();
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
        'Cache-Control': ext === '.svg' || ext === '.png' || ext === '.jpg' ? 'public, max-age=86400' : 'no-cache'
      });
    }

    // SSR & Client-side Route Matching with Real 404s
    const listPathMatch = pathname.match(/^\/list\/([^/]+)$/);
    const blogArticleMatch = pathname.match(/^\/blog\/([^/]+)$/);
    const compareMatch = pathname.match(/^\/compare\/([^/]+)\/([^/]+)-vs-([^/]+)$/);
    const isHome = pathname === '/';
    const isBlogIndex = pathname === '/blog';
    const isAdminView = pathname === '/admin';
    const isClaimView = pathname.startsWith('/claim/');
    const isPricingView = pathname === '/pricing';

    // Read state for SEO injection & route verification
    const db = readDb();
    const categories = (db.categories || []).map((c) => enrichCategory(c, db.platformStats));
    const articles = (db.articles && db.articles.length > 0 ? db.articles : BLOG_ARTICLES);

    let activeCat = null;
    let activeArticle = null;
    let pageTitle = 'Top 10 — Independent Product Comparisons, Buying Guides & Reviews (2026)';
    let pageDesc = 'Explore side-by-side Top 10 buying guides, comparison tables, pros & cons, pricing breakdowns, and verified user reviews across software and hardware categories.';
    let canonicalUrl = `${base}/`;

    if (listPathMatch || parsedUrl.searchParams.get('list')) {
      const activeSlug = listPathMatch ? listPathMatch[1] : parsedUrl.searchParams.get('list');
      activeCat = categories.find((c) => c.slug === activeSlug);
      if (!activeCat) {
        return render404(res, req, base, `The Top 10 directory "${escapeXml(activeSlug)}" does not exist or has been archived.`);
      }
      pageTitle = `${activeCat.title} (2026) — Comparison Table, Pros & Cons, Reviews`;
      pageDesc = `${activeCat.editorialGuide?.intro || activeCat.subtitle || activeCat.tagline || ''} Compare #1 ${activeCat.top10[0]?.name || ''} vs top alternatives.`;
      canonicalUrl = `${base}/list/${activeCat.slug}`;
    } else if (blogArticleMatch) {
      const artSlug = blogArticleMatch[1];
      activeArticle = articles.find((a) => a.slug === artSlug);
      if (!activeArticle) {
        return render404(res, req, base, `The editorial buying guide "${escapeXml(artSlug)}" could not be found.`);
      }
      pageTitle = `${activeArticle.title} — Top 10 Editorial Guide`;
      pageDesc = activeArticle.subtitle || pageDesc;
      canonicalUrl = `${base}/blog/${activeArticle.slug}`;
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
      pageTitle = `${prodA.name} vs ${prodB.name} (2026 Comparison) — Which Is Better? | Top 10`;
      pageDesc = `Side-by-side comparison of ${prodA.name} vs ${prodB.name} in ${activeCat.title}. Pricing teardown, pros & cons, specs, and verified practitioner reviews.`;
      canonicalUrl = `${base}/compare/${activeCat.slug}/${idA}-vs-${idB}`;
    } else if (isBlogIndex) {
      pageTitle = 'Top 10 Editorial & Buying Guides (2026) — Deep Dives & Teardowns';
      pageDesc = 'Independent buying guides, engineering teardowns, and side-by-side architecture comparisons across SaaS, hardware, smart TVs, and developer tools.';
      canonicalUrl = `${base}/blog`;
    } else if (isAdminView) {
      pageTitle = 'Admin Operations Dashboard — Top 10 Platform';
      pageDesc = 'Internal command center for managing listings, editorial reviews, programmatic bids, and real-time transaction ledgers.';
      canonicalUrl = `${base}/admin`;
    } else if (!isHome && !isClaimView && !isPricingView) {
      // Unknown route that doesn't correspond to any page or static file -> Return Real 404!
      return render404(res, req, base, `The requested URL "${escapeXml(pathname)}" was not found on this platform.`);
    }

    const jsonLd = activeCat
      ? buildSeoJsonLd(activeCat, categories, base)
      : activeArticle
      ? JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: activeArticle.title,
          description: activeArticle.subtitle,
          author: { '@type': 'Person', name: activeArticle.author?.name || activeArticle.author },
          datePublished: activeArticle.date || activeArticle.publishedDate,
          publisher: { '@type': 'Organization', name: 'Top 10 Media' },
        })
      : JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Top 10',
          url: base,
          description: pageDesc,
        });

    let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');

    // Replace SEO tags in-place without duplicating tags in <head>
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeXml(pageTitle)}</title>`);
    html = html.replace(/<meta name="description" id="metaDescriptionTag"[^>]*>/i, `<meta name="description" id="metaDescriptionTag" content="${escapeXml(pageDesc)}" />`);
    html = html.replace(/<link rel="canonical" id="canonicalLinkTag"[^>]*>/i, `<link rel="canonical" id="canonicalLinkTag" href="${escapeXml(canonicalUrl)}" />`);
    html = html.replace(/<script type="application\/ld\+json" id="seoJsonLdScript">[\s\S]*?<\/script>/i, `<script type="application/ld+json" id="seoJsonLdScript">${jsonLd}</script>`);

    // Add OpenGraph / robots metadata if not already injected
    if (!html.includes('property="og:title"')) {
      const extraSeo = `
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
  <link rel="alternate" type="text/plain" title="LLMs Structured Guide" href="${base}/llms.txt" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeXml(pageTitle)}" />
  <meta property="og:description" content="${escapeXml(pageDesc)}" />
  <meta property="og:url" content="${escapeXml(canonicalUrl)}" />
</head>`;
      html = html.replace(/<\/head>/i, extraSeo);
    }

    return sendResponse(req, res, 200, 'text/html; charset=utf-8', html, {
      'Cache-Control': 'no-cache'
    });
  } catch (err) {
    console.error('Server error:', err);
    const status = err.statusCode || (err.message && err.message.includes('Malformed') ? 400 : 500);
    sendJson(res, status, { error: err.message || 'Internal Server Error' }, req);
  }
});

server.listen(PORT, async () => {
  console.log(`Top 10 Auction Directory running at http://localhost:${PORT}`);
  ensureUserPasswords();
  try {
    await initMongo();
  } catch (err) {
    console.error('[Database Notice]', err.message);
  }
});
