const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const DB_PATH = path.join(__dirname, 'data', 'db.json');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/top10';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'top10';

let mongoClient = null;
let mongoDb = null;
let isConnected = false;

// Initialize MongoDB connection asynchronously
async function initMongo() {
  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 1500,
      connectTimeoutMS: 2000
    });
    await mongoClient.connect();
    mongoDb = mongoClient.db(MONGODB_DB_NAME);
    isConnected = true;
    console.log(`[Database] Successfully connected to MongoDB at ${MONGODB_URI}`);

    // If MongoDB collection is empty, seed initial data from db.json
    const catCol = mongoDb.collection('categories');
    const count = await catCol.countDocuments();
    if (count === 0 && fs.existsSync(DB_PATH)) {
      console.log('[Database] MongoDB is empty. Seeding initial data from data/db.json...');
      const localData = readLocalDb();
      if (localData.categories && localData.categories.length > 0) {
        await catCol.insertMany(localData.categories);
      }
      if (localData.users && localData.users.length > 0) {
        await mongoDb.collection('users').insertMany(localData.users);
      }
      if (localData.transactions && localData.transactions.length > 0) {
        await mongoDb.collection('transactions').insertMany(localData.transactions);
      }
      if (localData.subscriptions && localData.subscriptions.length > 0) {
        await mongoDb.collection('subscriptions').insertMany(localData.subscriptions);
      }
      if (localData.reviews && localData.reviews.length > 0) {
        await mongoDb.collection('reviews').insertMany(localData.reviews);
      }
      if (localData.claims && localData.claims.length > 0) {
        await mongoDb.collection('claims').insertMany(localData.claims);
      }
      if (localData.buyerLeads && localData.buyerLeads.length > 0) {
        await mongoDb.collection('buyerLeads').insertMany(localData.buyerLeads);
      }
      if (localData.platformStats) {
        await mongoDb.collection('settings').updateOne(
          { _id: 'platformStats' },
          { $set: localData.platformStats },
          { upsert: true }
        );
      }
      console.log('[Database] MongoDB seeded successfully.');
    }
  } catch (err) {
    isConnected = false;
    mongoClient = null;
    mongoDb = null;
    console.log(`[Database] MongoDB offline or not reachable (${MONGODB_URI}). Seamlessly using persistent local data/db.json.`);
  }
}

function readLocalDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return {
        platformStats: { totalVolume: 0, activeSponsors: 0, pendingReviews: 0, minEntryBid: 49 },
        users: [],
        transactions: [],
        categories: [],
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
    if (!parsed.articles || !Array.isArray(parsed.articles) || parsed.articles.length === 0) {
      try {
        const { BLOG_ARTICLES } = require('./blog-data');
        parsed.articles = JSON.parse(JSON.stringify(BLOG_ARTICLES || []));
      } catch (e) {
        parsed.articles = [];
      }
    }
    if (!parsed.platformStats) parsed.platformStats = { totalVolume: 0, activeSponsors: 0, pendingReviews: 0, minEntryBid: 49 };
    return parsed;
  } catch (err) {
    console.error('[Database] Error reading local db:', err.message);
    let fallbackArticles = [];
    try {
      const { BLOG_ARTICLES } = require('./blog-data');
      fallbackArticles = JSON.parse(JSON.stringify(BLOG_ARTICLES || []));
    } catch (e) {}
    return {
      platformStats: { totalVolume: 0, activeSponsors: 0, pendingReviews: 0, minEntryBid: 49 },
      users: [],
      transactions: [],
      categories: [],
      articles: fallbackArticles,
      outbidAlerts: [],
      subscriptions: [],
      reviews: [],
      claims: [],
      buyerLeads: []
    };
  }
}

function writeLocalDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Database] Error writing local db:', err.message);
  }
}

// Unified Get DB State
function getDbState() {
  return readLocalDb();
}

// Unified Save DB State (saves to local JSON and syncs asynchronously to MongoDB if online)
function saveDbState(data) {
  writeLocalDb(data);
  if (isConnected && mongoDb) {
    // Asynchronously update MongoDB without blocking request
    (async () => {
      try {
        if (data.categories) {
          const catCol = mongoDb.collection('categories');
          for (const cat of data.categories) {
            await catCol.updateOne({ slug: cat.slug }, { $set: cat }, { upsert: true });
          }
        }
        if (data.articles) {
          const artCol = mongoDb.collection('articles');
          for (const art of data.articles) {
            await artCol.updateOne({ slug: art.slug }, { $set: art }, { upsert: true });
          }
        }
        if (data.transactions) {
          const txCol = mongoDb.collection('transactions');
          for (const tx of data.transactions) {
            await txCol.updateOne({ id: tx.id }, { $set: tx }, { upsert: true });
          }
        }
        if (data.subscriptions) {
          const subCol = mongoDb.collection('subscriptions');
          for (const sub of data.subscriptions) {
            await subCol.updateOne({ id: sub.id }, { $set: sub }, { upsert: true });
          }
        }
        if (data.reviews) {
          const revCol = mongoDb.collection('reviews');
          for (const rev of data.reviews) {
            await revCol.updateOne({ id: rev.id }, { $set: rev }, { upsert: true });
          }
        }
        if (data.claims) {
          const claimCol = mongoDb.collection('claims');
          for (const claim of data.claims) {
            await claimCol.updateOne({ id: claim.id }, { $set: claim }, { upsert: true });
          }
        }
        if (data.buyerLeads) {
          const leadCol = mongoDb.collection('buyerLeads');
          for (const lead of data.buyerLeads) {
            await leadCol.updateOne({ id: lead.id }, { $set: lead }, { upsert: true });
          }
        }
        if (data.users) {
          const userCol = mongoDb.collection('users');
          for (const user of data.users) {
            await userCol.updateOne({ id: user.id }, { $set: user }, { upsert: true });
          }
        }
        if (data.platformStats) {
          await mongoDb.collection('settings').updateOne(
            { _id: 'platformStats' },
            { $set: data.platformStats },
            { upsert: true }
          );
        }
      } catch (e) {
        console.error('[Database] MongoDB background sync error:', e.message);
      }
    })();
  }
}

function isMongoConnected() {
  return isConnected;
}

function getDbStatus() {
  return {
    storageMode: isConnected ? 'mongodb' : 'local_json',
    isConnected,
    uri: MONGODB_URI,
    dbName: MONGODB_DB_NAME,
    localDbPath: DB_PATH,
    collections: {
      categories: readLocalDb().categories.length,
      articles: (readLocalDb().articles || []).length,
      users: readLocalDb().users.length,
      transactions: readLocalDb().transactions.length,
      subscriptions: readLocalDb().subscriptions.length,
      reviews: readLocalDb().reviews.length,
      claims: readLocalDb().claims.length,
      buyerLeads: readLocalDb().buyerLeads.length
    }
  };
}

module.exports = {
  initMongo,
  getDbState,
  saveDbState,
  isMongoConnected,
  getDbStatus
};
