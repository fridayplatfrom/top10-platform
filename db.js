const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash, randomUUID } = require('node:crypto');
const mysql = require('mysql2/promise');

const seedPath = path.join(__dirname, 'data', 'db.json');
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'runtime.json');
const host = process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306);
const user = process.env.DB_USER || process.env.MYSQL_USER;
const password = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD;
const database = process.env.DB_NAME || process.env.MYSQL_DATABASE;
const scope = new AsyncLocalStorage();
const revisions = new WeakMap();
let pool;

function statusError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function digest(payload) {
  return createHash('sha256').update(payload).digest('hex');
}

function readSeed() {
  return fs.readFileSync(seedPath, 'utf8');
}

function readLocal() {
  try {
    return fs.readFileSync(dbPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function initMariaDb() {
  if (!user || !database) {
    if (process.env.NODE_ENV === 'production' || user || database) {
      throw new Error('MariaDB requires DB_USER and DB_NAME');
    }
    return;
  }
  pool = mysql.createPool({ host, port, user, password, database, connectionLimit: 6, queueLimit: 30, connectTimeout: 4000 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS top10_state_store (
      state_key VARCHAR(64) PRIMARY KEY,
      payload LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.execute(
    'INSERT INTO top10_state_store (state_key, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_key = state_key',
    ['full_state', readSeed()]
  );
  await withDb(() => {});
  console.log('[Database] MariaDB state ready');
}

async function readSnapshot() {
  if (!pool) return readLocal() ?? readSeed();
  try {
    const [rows] = await pool.execute('SELECT payload FROM top10_state_store WHERE state_key = ?', ['full_state']);
    if (!rows[0]) throw new Error('Missing editorial state');
    return rows[0].payload;
  } catch (err) {
    console.error('[Database] Read failed:', err.code || err.message);
    throw statusError('Editorial storage is temporarily unavailable', 503);
  }
}

async function withDb(callback) {
  const payload = await readSnapshot();
  const state = JSON.parse(payload);
  if (!Array.isArray(state?.categories)) throw new Error('Invalid editorial state');
  return scope.run({ payload, state }, callback);
}

function getDbState() {
  const { state, payload } = scope.getStore();
  const copy = structuredClone(state);
  revisions.set(copy, payload);
  return copy;
}

async function saveDbState(data) {
  const snapshot = scope.getStore();
  const previous = revisions.get(data);
  const payload = JSON.stringify(data);
  if (previous === undefined || previous !== snapshot.payload) {
    throw statusError('Content changed. Reload and try again.', 409);
  }
  if (payload === previous) return;

  if (pool) {
    let result;
    try {
      [result] = await pool.execute(
        'UPDATE top10_state_store SET payload = ? WHERE state_key = ? AND SHA2(payload, 256) = ?',
        [payload, 'full_state', digest(previous)]
      );
    } catch (err) {
      console.error('[Database] Write failed:', err.code || err.message);
      throw statusError('Editorial storage is temporarily unavailable', 503);
    }
    if (result.affectedRows !== 1) throw statusError('Content changed. Reload and try again.', 409);
  } else {
    if ((readLocal() ?? readSeed()) !== previous) throw statusError('Content changed. Reload and try again.', 409);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const temporary = dbPath + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, payload, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, dbPath);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  snapshot.payload = payload;
  snapshot.state = JSON.parse(payload);
  revisions.set(data, payload);
}

function getDbStatus() {
  const state = getDbState();
  const collections = ['categories', 'authors', 'users', 'transactions', 'subscriptions', 'reviews', 'claims', 'buyerLeads'];
  return {
    storageMode: pool ? 'mariadb' : 'local_json',
    engine: pool ? 'MariaDB / MySQL' : 'JSON',
    isConnected: Boolean(pool),
    collections: Object.fromEntries(collections.map(name => [name, state[name]?.length || 0]))
  };
}

module.exports = { initMariaDb, withDb, getDbState, saveDbState, getDbStatus };
