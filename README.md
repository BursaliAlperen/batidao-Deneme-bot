# batidao-Deneme-bot

## Run

```bash
npm install
npm start
```

## Zerads PTC Backend Callback

Endpoint:

```text
GET /zerads-callback?user=test&amount=0.01&clicks=1
```

Environment variables:

- `PTC_EXCHANGE` (default: `100`)
- `PTC_REWARD_NAME` (default: `JETON`)
- `FIREBASE_SERVICE_ACCOUNT` (JSON string, optional)

If Firebase credentials are not configured, endpoint works in `dry-run` mode and returns computed payout without database write.
