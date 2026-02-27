const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const EXCHANGE_RATE = Number(process.env.EXCHANGE_RATE || 100);
const REWARD_NAME = process.env.REWARD_NAME || 'JETON';
const CALLBACK_PASSWORD = process.env.CALLBACK_PASSWORD || '';
const TRUSTED_IP = process.env.TRUSTED_IP || '';
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';

const root = __dirname;

let firebaseServiceAccount = null;
let firebaseProjectId = '';
let cachedToken = { value: '', exp: 0 };

function parseServiceAccount() {
  if (!FIREBASE_SERVICE_ACCOUNT_JSON) return null;

  const candidates = [
    FIREBASE_SERVICE_ACCOUNT_JSON,
    Buffer.from(FIREBASE_SERVICE_ACCOUNT_JSON, 'base64').toString('utf8')
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed.private_key && parsed.client_email && parsed.project_id) {
        parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
        return parsed;
      }
    } catch (_) {
      // try next format
    }
  }

  return null;
}

firebaseServiceAccount = parseServiceAccount();
firebaseProjectId = firebaseServiceAccount?.project_id || '';

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8'
    };

    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createJwt(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const headerPart = base64Url(JSON.stringify(header));
  const payloadPart = base64Url(JSON.stringify(payload));
  const toSign = `${headerPart}.${payloadPart}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(toSign);
  signer.end();

  const signature = signer
    .sign(serviceAccount.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${toSign}.${signature}`;
}

async function getAccessToken() {
  if (!firebaseServiceAccount) throw new Error('firebase service account missing');

  const nowMs = Date.now();
  if (cachedToken.value && cachedToken.exp > nowMs + 60_000) {
    return cachedToken.value;
  }

  const assertion = createJwt(firebaseServiceAccount);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`oauth token failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  cachedToken = {
    value: data.access_token,
    exp: nowMs + Number(data.expires_in || 3600) * 1000
  };

  return cachedToken.value;
}

function fsString(value) {
  return { stringValue: String(value) };
}
function fsDouble(value) {
  return { doubleValue: Number(value) };
}
function fsInt(value) {
  return { integerValue: String(Math.trunc(value)) };
}

async function firestoreCommit(writes) {
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents:commit`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ writes })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`firestore commit failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function firestoreGetUser(username) {
  const token = await getAccessToken();
  const docName = `users/${encodeURIComponent(username)}`;
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/${docName}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`firestore get user failed: ${response.status} ${text}`);
  }

  return response.json();
}

function parseFirestoreNumber(field) {
  if (!field) return 0;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return Number(field.doubleValue);
  return 0;
}

async function persistPtcEvent({ user, amount, clicks, reward, ip }) {
  if (!firebaseServiceAccount) {
    return { persisted: false, reason: 'FIREBASE_SERVICE_ACCOUNT_JSON not configured' };
  }

  const safeUser = user.replace(/[^a-zA-Z0-9_-]/g, '_');
  const eventId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userDocName = `projects/${firebaseProjectId}/databases/(default)/documents/users/${safeUser}`;
  const eventDocName = `projects/${firebaseProjectId}/databases/(default)/documents/ptc_callbacks/${eventId}`;

  await firestoreCommit([
    {
      update: {
        name: userDocName,
        fields: {
          username: fsString(user),
          rewardName: fsString(REWARD_NAME),
          updatedBy: fsString('zerads-callback'),
          updatedAt: { timestampValue: new Date().toISOString() }
        }
      },
      updateMask: {
        fieldPaths: ['username', 'rewardName', 'updatedBy', 'updatedAt']
      }
    },
    {
      transform: {
        document: userDocName,
        fieldTransforms: [
          { fieldPath: 'balance', increment: fsDouble(reward) },
          { fieldPath: 'zerTotal', increment: fsDouble(amount) },
          { fieldPath: 'clicksTotal', increment: fsInt(clicks) },
          { fieldPath: 'callbackCount', increment: fsInt(1) }
        ]
      }
    },
    {
      update: {
        name: eventDocName,
        fields: {
          user: fsString(user),
          amount: fsDouble(amount),
          clicks: fsInt(clicks),
          reward: fsDouble(reward),
          rewardName: fsString(REWARD_NAME),
          exchangeRate: fsDouble(EXCHANGE_RATE),
          sourceIp: fsString(ip || ''),
          createdAt: { timestampValue: new Date().toISOString() }
        }
      }
    }
  ]);

  return { persisted: true };
}

function getRequestIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
}

const server = http.createServer(async (req, res) => {
  try {
    const currentUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = currentUrl.pathname;

    if (pathname === '/health') {
      return sendJson(res, 200, {
        ok: true,
        firebaseConfigured: Boolean(firebaseServiceAccount),
        projectId: firebaseProjectId || null
      });
    }

    if (pathname === '/api/config') {
      return sendJson(res, 200, {
        exchangeRate: EXCHANGE_RATE,
        rewardName: REWARD_NAME,
        firebaseConfigured: Boolean(firebaseServiceAccount)
      });
    }

    if (pathname.startsWith('/api/user/')) {
      const username = decodeURIComponent(pathname.replace('/api/user/', '')).trim();
      if (!username) return sendJson(res, 400, { ok: false, error: 'username required' });
      if (!firebaseServiceAccount) return sendJson(res, 503, { ok: false, error: 'firebase not configured' });

      const doc = await firestoreGetUser(username.replace(/[^a-zA-Z0-9_-]/g, '_'));
      if (!doc) return sendJson(res, 404, { ok: false, error: 'user not found' });

      const fields = doc.fields || {};
      return sendJson(res, 200, {
        ok: true,
        user: fields.username?.stringValue || username,
        balance: parseFirestoreNumber(fields.balance),
        zerTotal: parseFirestoreNumber(fields.zerTotal),
        clicksTotal: parseFirestoreNumber(fields.clicksTotal),
        callbackCount: parseFirestoreNumber(fields.callbackCount),
        rewardName: fields.rewardName?.stringValue || REWARD_NAME
      });
    }

    if (pathname === '/zerads-callback') {
      const user = String(currentUrl.searchParams.get('user') || '').trim();
      const amount = Number(currentUrl.searchParams.get('amount') || 0);
      const clicksRaw = Number(currentUrl.searchParams.get('clicks') || 0);
      const clicks = Number.isFinite(clicksRaw) && clicksRaw > 0 ? Math.trunc(clicksRaw) : 1;
      const pwd = String(currentUrl.searchParams.get('pwd') || '');
      const ip = getRequestIp(req);

      if (CALLBACK_PASSWORD && pwd !== CALLBACK_PASSWORD) {
        return sendJson(res, 401, { ok: false, error: 'invalid password' });
      }
      if (TRUSTED_IP && ip !== TRUSTED_IP) {
        return sendJson(res, 403, { ok: false, error: 'ip not allowed', ip });
      }
      if (!user || Number.isNaN(amount) || amount <= 0) {
        return sendJson(res, 400, { ok: false, error: 'missing/invalid user or amount' });
      }

      const reward = amount * EXCHANGE_RATE;
      const persistResult = await persistPtcEvent({ user, amount, clicks, reward, ip });

      return sendJson(res, 200, {
        ok: true,
        user,
        amount,
        clicks,
        exchangeRate: EXCHANGE_RATE,
        rewardName: REWARD_NAME,
        reward,
        persisted: persistResult.persisted,
        persistReason: persistResult.reason || null,
        message: `+${reward.toFixed(2)} ${REWARD_NAME} Will Be Credited To Your Account Within 5 Minutes.`
      });
    }

    let requested = path.join(root, pathname);
    if (pathname === '/' || !path.extname(pathname)) {
      requested = path.join(root, 'index.html');
    }

    return serveFile(res, requested);
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: 'server_error',
      detail: error.message
    });
  }
});

server.listen(PORT, () => {
  console.log(`Batidao app listening on port ${PORT}`);
});
