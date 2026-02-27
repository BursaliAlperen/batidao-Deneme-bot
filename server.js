const express = require('express');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 3000;

let db = null;
let firebaseReady = false;

function tryInitFirebase() {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return;
    const creds = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(creds) });
    db = admin.firestore();
    firebaseReady = true;
    console.log('Firebase Admin initialized.');
  } catch (err) {
    console.error('Firebase init skipped:', err.message);
  }
}

function qv(input) {
  if (Array.isArray(input)) {
    const filtered = input.filter((v) => v && !['user', 'amount', 'clicks'].includes(String(v).toLowerCase()));
    return filtered[filtered.length - 1] || input[input.length - 1] || '';
  }
  return input || '';
}

app.use(express.static(path.join(__dirname)));

app.get('/health', (_, res) => {
  res.json({ ok: true, firebaseReady });
});

app.get('/zerads-callback', async (req, res) => {
  const user = String(qv(req.query.user)).trim();
  const amount = Number(qv(req.query.amount));
  const clicks = Number(qv(req.query.clicks) || 1);

  if (!user || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'Missing/invalid user or amount' });
  }

  const exchange = Number(process.env.PTC_EXCHANGE || 100);
  const rewardName = String(process.env.PTC_REWARD_NAME || 'JETON');
  const payout = Number((amount * exchange).toFixed(4));

  if (!firebaseReady || !db) {
    return res.json({
      ok: true,
      mode: 'dry-run',
      user,
      amount,
      clicks,
      payout,
      message: `+${payout} ${rewardName} Will Be Credited To Your Account Within 5 Minutes.`
    });
  }

  try {
    const snap = await db.collection('users').where('usernameLower', '==', user.toLowerCase()).limit(1).get();
    if (snap.empty) {
      return res.status(404).json({ ok: false, error: 'User not found', user });
    }

    const doc = snap.docs[0];
    await db.collection('users').doc(doc.id).set(
      {
        balance: admin.firestore.FieldValue.increment(payout),
        ptcClicks: admin.firestore.FieldValue.increment(clicks > 0 ? clicks : 1),
        lastPtcAt: Date.now()
      },
      { merge: true }
    );

    await db.collection('ptc_logs').add({
      user,
      amount,
      clicks,
      payout,
      rewardName,
      source: 'zerads-backend',
      ip: req.ip,
      ua: req.headers['user-agent'] || '',
      date: Date.now()
    });

    return res.json({
      ok: true,
      user,
      amount,
      clicks,
      payout,
      rewardName,
      message: `+${payout} ${rewardName} Will Be Credited To Your Account Within 5 Minutes.`
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

tryInitFirebase();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
