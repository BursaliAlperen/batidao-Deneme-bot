const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const EXCHANGE_RATE = Number(process.env.ZERADS_EXCHANGE_RATE || 100);
const REWARD_NAME = process.env.ZERADS_REWARD_NAME || 'JETON';
const ZERADS_PTC_TARGET_URL = process.env.ZERADS_PTC_TARGET_URL || '';

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
  const callbackUrl = process.env.ZERADS_CALLBACK_PUBLIC_URL || '';
  res.json({
    targetUrl: ZERADS_PTC_TARGET_URL,
    callbackUrl,
    exchangeRate: EXCHANGE_RATE,
    rewardName: REWARD_NAME,
  });
});

app.get('/zerads-callback', async (req, res) => {
  const username = String(req.query.user || '').trim();
  const amount = Number(req.query.amount || 0);
  const clicks = Number(req.query.clicks || 0);

  if (!username || Number.isNaN(amount) || Number.isNaN(clicks)) {
    return res.status(400).json({ ok: false, error: 'Invalid query. Expected user and amount. clicks is optional.' });
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
});
