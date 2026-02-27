# batidao-Deneme-bot

Batidao için beyaz/mavi arayüz + ZERADS PTC API backend/frontend entegrasyonu.

## Çalıştırma

```bash
npm start
```

## Endpoint'ler

- `GET /health` → servis + firebase durumunu döner
- `GET /api/config` → exchange ayarlarını döner
- `GET /api/user/:username` → Firestore kullanıcı özetini döner
- `GET /zerads-callback?user=test&amount=0.01&clicks=1` → PTC callback, bakiye günceller

## Render Environment Variables

- `PORT` (varsayılan: `3000`)
- `EXCHANGE_RATE` (varsayılan: `100`)
- `REWARD_NAME` (varsayılan: `JETON`)
- `CALLBACK_PASSWORD` (opsiyonel)
- `TRUSTED_IP` (opsiyonel)
- `FIREBASE_SERVICE_ACCOUNT_JSON` (**zorunlu**, service account JSON string veya base64)

## Firestore Yapısı

- `users/{username}`
  - `balance`
  - `zerTotal`
  - `clicksTotal`
  - `callbackCount`
- `ptc_callbacks/{eventId}`
  - callback log kayıtları
