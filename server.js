const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const port = process.env.PORT || 3000;

const EXCHANGE_RATE = Number(process.env.ZERADS_EXCHANGE_RATE || 100);
const REWARD_NAME = process.env.ZERADS_REWARD_NAME || 'JETON';
const CALLBACK_PASSWORD = process.env.ZERADS_CALLBACK_PASSWORD || '';
const CALLBACK_ALLOWED_IP = process.env.ZERADS_CALLBACK_ALLOWED_IP || '';
const DEFAULT_CALLBACK_URL = 'https://batidao-deneme-bot.onrender.com/zerads-callback?user=user&amount=amount&clicks=clicks';
const CALLBACK_PUBLIC_URL = process.env.ZERADS_CALLBACK_PUBLIC_URL || DEFAULT_CALLBACK_URL;
const DEFAULT_PTC_TARGET_URL = 'https://zerads.com/ptc.php?ref=10799&user={user}';
const ZERADS_PTC_TARGET_URL = process.env.ZERADS_PTC_TARGET_URL || DEFAULT_PTC_TARGET_URL;
const KEEPALIVE_ENABLED = String(process.env.RENDER_KEEPALIVE_ENABLED || 'true').toLowerCase() !== 'false';
const KEEPALIVE_INTERVAL_MS = Number(process.env.RENDER_KEEPALIVE_INTERVAL_MS || 8 * 60 * 1000);
const KEEPALIVE_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || '';

function firstQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function getAllRawQueryValues(req, key) {
  try {
    const q = req.originalUrl.split('?')[1] || '';
    if (!q) return [];
    const params = new URLSearchParams(q);
    return params.getAll(key).map(v => String(v || '').trim());
  } catch (_err) {
    return [];
  }
}

function pickUserQueryValue(value) {
  const arr = Array.isArray(value) ? value : [value];
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const v = String(arr[i] || '').trim();
    if (v && v.toLowerCase() !== 'user') return v;
  }
  return String(arr[arr.length - 1] || '').trim();
}

function pickNumberQueryValue(value, fallback = 0) {
  const arr = Array.isArray(value) ? value : [value];
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const raw = String(arr[i] || '').trim();
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function pickUserFromRequest(req) {
  const rawArr = getAllRawQueryValues(req, 'user');
  if (rawArr.length) return pickUserQueryValue(rawArr);
  return pickUserQueryValue(req.query.user);
}

function pickNumberFromRequest(req, key, fallback = 0) {
  const rawArr = getAllRawQueryValues(req, key);
  if (rawArr.length) return pickNumberQueryValue(rawArr, fallback);
  return pickNumberQueryValue(req.query[key], fallback);
}

function normalizeSurfUser(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .toLowerCase();
}

async function findUserDoc(usersRef, surfUserRaw) {
  const variants = Array.from(new Set([
    String(surfUserRaw || '').trim(),
    normalizeSurfUser(surfUserRaw),
  ].filter(Boolean)));

  const fields = ['username', 'ptcUser', 'usernameNorm', 'ptcUserNorm'];
  for (const field of fields) {
    for (const value of variants) {
      const q = await usersRef.where(field, '==', value).limit(1).get();
      if (!q.empty) return q.docs[0];
    }
  }
  return null;
}

let admin = null;
let db = null;
try {
  admin = require('firebase-admin');
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
  }
  db = admin.firestore();
} catch (err) {
  console.warn('firebase-admin unavailable, callback storage disabled:', err.message);
}

app.use(express.static(path.join(__dirname)));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/ptc-config', (_req, res) => {
  res.json({
    targetUrl: ZERADS_PTC_TARGET_URL,
    callbackUrl: CALLBACK_PUBLIC_URL,
    exchangeRate: EXCHANGE_RATE,
    rewardName: REWARD_NAME,
  });
});

function startRenderKeepAlive() {
  if (!KEEPALIVE_ENABLED || !KEEPALIVE_URL) return;

  const ping = () => {
    try {
      const healthUrl = new URL('/health', KEEPALIVE_URL).toString();
      const client = healthUrl.startsWith('https') ? https : http;
      client
        .get(healthUrl, (res) => {
          res.resume();
        })
        .on('error', (err) => {
          console.warn('KeepAlive ping failed:', err.message);
        });
    } catch (err) {
      console.warn('KeepAlive URL error:', err.message);
    }
  };

  ping();
  setInterval(ping, KEEPALIVE_INTERVAL_MS);
}

app.get('/zerads-callback', async (req, res) => {
  const username = pickUserFromRequest(req);
  const amount = pickNumberFromRequest(req, 'amount', NaN);
  const clicks = pickNumberFromRequest(req, 'clicks', 0);
  const pwd = firstQueryValue(req.query.pwd);
  const requesterIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';

  if (!username || Number.isNaN(amount) || Number.isNaN(clicks) || amount < 0 || clicks < 0) {
    return res.status(400).json({ ok: false, error: 'Invalid query. Expected user and amount. clicks is optional.' });
  }

  if (CALLBACK_PASSWORD && pwd !== CALLBACK_PASSWORD) {
    return res.status(403).json({ ok: false, error: 'Invalid callback password.' });
  }

  if (CALLBACK_ALLOWED_IP && requesterIp !== CALLBACK_ALLOWED_IP) {
    return res.status(403).json({ ok: false, error: 'Forbidden callback source IP.' });
  }

  const reward = Number((amount * EXCHANGE_RATE).toFixed(6));

  if (!db || !admin) {
    return res.status(503).json({ ok: false, error: 'Firestore not configured on server.' });
  }

  try {
    const usersRef = db.collection('users');
    const doc = await findUserDoc(usersRef, username);

    if (!doc) {
      return res.status(404).json({
        ok: false,
        error: 'User not found by username/ptcUser.',
        parsed: { username, amount, clicks },
      });
    }

    await usersRef.doc(doc.id).set({
      balance: admin.firestore.FieldValue.increment(reward),
      ptcClicks: admin.firestore.FieldValue.increment(clicks),
      ptcEarnedZER: admin.firestore.FieldValue.increment(amount),
      lastPtcAt: Date.now(),
      lastPtcAmountZER: amount,
      lastPtcReward: reward,
      lastPtcClicks: clicks,
    }, { merge: true });

    return res.json({
      ok: true,
      user: username,
      credited: reward,
      rewardName: REWARD_NAME,
      matchedDocId: doc.id,
      amountZER: amount,
      clicks,
    });
  } catch (err) {
    console.error('Callback error:', err);
    return res.status(500).json({ ok: false, error: 'Internal error.' });
  }
});

app.get('/zerads-status', async (req, res) => {
  const username = firstQueryValue(req.query.user);
  if (!username) return res.status(400).json({ ok: false, error: 'Missing user.' });
  if (!db) return res.status(503).json({ ok: false, error: 'Firestore not configured.' });

  try {
    const usersRef = db.collection('users');
    const doc = await findUserDoc(usersRef, username);
    if (!doc) return res.status(404).json({ ok: false, error: 'User not found.' });
    const data = doc.data();
    return res.json({
      ok: true,
      user: username,
      matchedDocId: doc.id,
      balance: data.balance || 0,
      lastPtcAt: data.lastPtcAt || null,
      lastPtcReward: data.lastPtcReward || 0,
      lastPtcAmountZER: data.lastPtcAmountZER || 0,
      lastPtcClicks: data.lastPtcClicks || 0,
      ptcClicks: data.ptcClicks || 0,
      ptcEarnedZER: data.ptcEarnedZER || 0,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Internal error.' });
  }
});

app.listen(port, () => {
  console.log(`Server listening on :${port}`);
  if (KEEPALIVE_ENABLED) {
    if (KEEPALIVE_URL) console.log(`KeepAlive active: ${KEEPALIVE_URL}`);
    else console.log('KeepAlive skipped: RENDER_EXTERNAL_URL/APP_URL not set');
  }
  startRenderKeepAlive();
});
