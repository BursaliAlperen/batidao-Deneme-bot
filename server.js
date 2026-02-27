const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const EXCHANGE_RATE = Number(process.env.EXCHANGE_RATE || 100);
const REWARD_NAME = process.env.REWARD_NAME || 'JETON';
const CALLBACK_PASSWORD = process.env.CALLBACK_PASSWORD || '';
const TRUSTED_IP = process.env.TRUSTED_IP || '';

const root = __dirname;

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

const server = http.createServer((req, res) => {
  const currentUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = currentUrl.pathname;

  if (pathname === '/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/zerads-callback') {
    const user = String(currentUrl.searchParams.get('user') || '').trim();
    const amount = Number(currentUrl.searchParams.get('amount') || 0);
    const clicks = Number(currentUrl.searchParams.get('clicks') || 0);
    const pwd = String(currentUrl.searchParams.get('pwd') || '');
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

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

    return sendJson(res, 200, {
      ok: true,
      user,
      amount,
      clicks,
      exchangeRate: EXCHANGE_RATE,
      rewardName: REWARD_NAME,
      reward,
      message: `+${reward.toFixed(2)} ${REWARD_NAME} Will Be Credited To Your Account Within 5 Minutes.`
    });
  }

  let requested = path.join(root, pathname);
  if (pathname === '/' || !path.extname(pathname)) {
    requested = path.join(root, 'index.html');
  }

  serveFile(res, requested);
});

server.listen(PORT, () => {
  console.log(`Batidao app listening on port ${PORT}`);
});
