# batidao-Deneme-bot

Modern beyaz/mavi arayüz ve ZERADS PTC callback entegrasyonu.

## Çalıştırma

```bash
npm start
```

## Endpoint'ler

- `GET /health`
- `GET /zerads-callback?user=test&amount=0.01&clicks=1`

### Ortam Değişkenleri

- `PORT` (varsayılan: `3000`)
- `EXCHANGE_RATE` (varsayılan: `100`)
- `REWARD_NAME` (varsayılan: `JETON`)
- `CALLBACK_PASSWORD` (opsiyonel, `pwd` query ile doğrular)
- `TRUSTED_IP` (opsiyonel, callback çağrısını IP ile sınırlar)
