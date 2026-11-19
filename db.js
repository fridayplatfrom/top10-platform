const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'db.json');

// Hostinger MariaDB / MySQL Configuration (Always use 127.0.0.1 on Hostinger to avoid IPv6 ::1 grant errors)
const DB_HOST = process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306);
const DB_USER = process.env.DB_USER || process.env.MYSQL_USER || '';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || process.env.MYSQL_DATABASE || '';

let pool = null;
let isConnected = false;

async function initMariaDb() {
  if (!DB_USER || !DB_NAME) {
    isConnected = false;
    console.log('[Database] MariaDB credentials (DB_USER / DB_NAME) not set. Using persistent local data/db.json.');
    return;
  }

  let conn;
  try {
    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 4000
    });

    conn = await pool.getConnection();
    await conn.ping();

    // Create MariaDB tables for durable state persistence + relational entity indexing
    await conn.query(`
      CREATE TABLE IF NOT EXISTS top10_state_store (
        state_key VARCHAR(64) PRIMARY KEY,
        payload LONGTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS top10_categories (
        slug VARCHAR(160) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        products_count INT DEFAULT 0,
        payload LONGTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS top10_transactions (
        id VARCHAR(120) PRIMARY KEY,
        category_slug VARCHAR(160),
        amount DECIMAL(12,2) DEFAULT 0,
        payload LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS top10_reviews (
        id VARCHAR(120) PRIMARY KEY,
        category_slug VARCHAR(160),
        product_id VARCHAR(160),
        status VARCHAR(40) DEFAULT 'pending',
        payload LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS top10_buyer_leads (
        id VARCHAR(120) PRIMARY KEY,
        category_slug VARCHAR(160),
        company_name VARCHAR(255),
        status VARCHAR(40) DEFAULT 'new',
        payload LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Hydrate from MariaDB if state already exists across deployments; otherwise seed MariaDB from data/db.json
    const [rows] = await conn.query('SELECT payload FROM top10_state_store WHERE state_key = ?', ['full_state']);
    if (rows && rows.length > 0 && rows[0].payload) {
      const remoteState = JSON.parse(rows[0].payload);
      if (!remoteState || !Array.isArray(remoteState.categories)) {
        throw new Error('Invalid stored MariaDB snapshot; refusing to replace it with local seed data');
      }
      writeLocalDb(remoteState);
      console.log(`[Database] Hydrated ${remoteState.categories.length} categories from MariaDB (${DB_NAME}).`);
    } else {
      const localData = readLocalDb();
      await conn.query(
        'INSERT INTO top10_state_store (state_key, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)',
        ['full_state', JSON.stringify(localData)]
      );
      console.log(`[Database] Seeded Hostinger MariaDB (${DB_NAME}) with initial state from data/db.json.`);
    }

    conn.release();
    conn = null;
    isConnected = true;
    console.log(`[Database] Connected to Hostinger MariaDB at ${DB_HOST}:${DB_PORT}/${DB_NAME}`);

    // Sync initial relational rows in background
    syncTablesToMariaDb(readLocalDb());
  } catch (err) {
    isConnected = false;
    if (conn) conn.release();
    if (pool) await pool.end().catch(() => {});
    pool = null;
    console.log(`[Database] MariaDB offline or unreachable (${err.message}). Seamlessly using persistent local data/db.json.`);
  }
}

function syncTablesToMariaDb(data) {
  if (!isConnected || !pool || !data) return;
  (async () => {
    try {
      await pool.query(
        'INSERT INTO top10_state_store (state_key, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)',
        ['full_state', JSON.stringify(data)]
      );

      if (Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          if (!cat || !cat.slug) continue;
          const prodsCount = Array.isArray(cat.products) ? cat.products.length : 0;
          await pool.query(
            'INSERT INTO top10_categories (slug, title, products_count, payload) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), products_count = VALUES(products_count), payload = VALUES(payload)',
            [cat.slug, cat.title || cat.slug, prodsCount, JSON.stringify(cat)]
          );
        }
      }

      if (Array.isArray(data.transactions)) {
        for (const tx of data.transactions.slice(0, 100)) {
          if (!tx || !tx.id) continue;
          await pool.query(
            'INSERT INTO top10_transactions (id, category_slug, amount, payload) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)',
            [tx.id, tx.categorySlug || '', Number(tx.amount || 0), JSON.stringify(tx)]
          );
        }
      }

      if (Array.isArray(data.reviews)) {
        for (const rev of data.reviews.slice(0, 100)) {
          if (!rev || !rev.id) continue;
          await pool.query(
            'INSERT INTO top10_reviews (id, category_slug, product_id, status, payload) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), payload = VALUES(payload)',
            [rev.id, rev.categorySlug || '', rev.productId || '', rev.status || 'approved', JSON.stringify(rev)]
          );
        }
      }

      if (Array.isArray(data.buyerLeads)) {
        for (const lead of data.buyerLeads.slice(0, 100)) {
          if (!lead || !lead.id) continue;
          await pool.query(
            'INSERT INTO top10_buyer_leads (id, category_slug, company_name, status, payload) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), payload = VALUES(payload)',
            [lead.id, lead.categorySlug || '', lead.companyName || '', lead.status || 'new', JSON.stringify(lead)]
          );
        }
      }
    } catch (err) {
      console.error('[Database] MariaDB background sync error:', err.message);
    }
  })();
}

function readLocalDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return {
        platformStats: { totalVolume: 0, activeSponsors: 0, pendingReviews: 0, minEntryBid: 49 },
        users: [],
        transactions: [],
        categories: [],
        articles: [],
        outbidAlerts: [],
        subscriptions: [],
        reviews: [],
        claims: [],
        buyerLeads: []
      };
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.categories) parsed.categories = [];
    if (!parsed.users) parsed.users = [];
    if (!parsed.transactions) parsed.transactions = [];
    if (!parsed.subscriptions) parsed.subscriptions = [];
    if (!parsed.reviews) parsed.reviews = [];
    if (!parsed.claims) parsed.claims = [];
    if (!parsed.buyerLeads) parsed.buyerLeads = [];
    if (!parsed.outbidAlerts) parsed.outbidAlerts = [];
    parsed.articles = [];
    if (!parsed.platformStats) parsed.platformStats = { totalVolume: 0, activeSponsors: 0, pendingReviews: 0, minEntryBid: 49 };
    return parsed;
  } catch (err) {
    console.error('[Database] Error reading local db:', err.message);
    throw err; // Never turn corrupt/unreadable persisted data into an empty writable database.
  }
}

function writeLocalDb(data) {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${DB_PATH}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    console.error('[Database] Error writing local db:', err.message);
    throw err; // Callers must not report a successful save after a filesystem failure.
  }
}

function getDbState() {
  return readLocalDb();
}

function saveDbState(data) {
  writeLocalDb(data);
  if (isConnected && pool) {
    syncTablesToMariaDb(data);
  }
}

function isMongoConnected() {
  return isConnected;
}

function getDbStatus() {
  const local = readLocalDb();
  return {
    storageMode: isConnected ? 'mariadb' : 'local_json',
    engine: 'MariaDB / MySQL (mysql2)',
    isConnected,
    host: DB_HOST,
    port: DB_PORT,
    dbName: DB_NAME || 'local_json',
    localDbPath: DB_PATH,
    collections: {
      categories: local.categories.length,
      articles: 0,
      users: local.users.length,
      transactions: local.transactions.length,
      subscriptions: local.subscriptions.length,
      reviews: local.reviews.length,
      claims: local.claims.length,
      buyerLeads: local.buyerLeads.length
    }
  };
}

module.exports = {
  initMongo: initMariaDb,
  initMariaDb,
  getDbState,
  saveDbState,
  isMongoConnected,
  getDbStatus
};
