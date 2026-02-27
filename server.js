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
  const username = String(req.query.user || '').trim();
  const amount = Number(req.query.amount || 0);
  const clicks = Number(req.query.clicks || 0);
  const pwd = String(req.query.pwd || '').trim();
  const requesterIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';

  if (!username || Number.isNaN(amount) || Number.isNaN(clicks)) {
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
    const q = await usersRef.where('username', '==', username).limit(1).get();

    if (q.empty) {
      return res.status(404).json({ ok: false, error: 'User not found by username.' });
    }

    const doc = q.docs[0];
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
      amountZER: amount,
      clicks,
    });
  } catch (err) {
    console.error('Callback error:', err);
    return res.status(500).json({ ok: false, error: 'Internal error.' });
  }
});

app.get('/zerads-status', async (req, res) => {
  const username = String(req.query.user || '').trim();
  if (!username) return res.status(400).json({ ok: false, error: 'Missing user.' });
  if (!db) return res.status(503).json({ ok: false, error: 'Firestore not configured.' });

  try {
    const q = await db.collection('users').where('username', '==', username).limit(1).get();
    if (q.empty) return res.status(404).json({ ok: false, error: 'User not found.' });
    const data = q.docs[0].data();
    return res.json({
      ok: true,
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
