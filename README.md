# batidao-Deneme-bot

## ZerAds PTC Callback Entegrasyonu (Detaylı)

Aşağıdaki ayarlar ile ZerAds PTC surfing ve otomatik ödül kredileme çalışır.

### 1) ZerAds tarafına girilecek callback URL

Önerilen callback (detaylı):

```text
https://batidao-deneme-bot.onrender.com/zerads-callback?user=user&amount=amount&clicks=clicks
```

Sade callback (minimum):

```text
https://batidao-deneme-bot.onrender.com/zerads-callback?user=user&amount=amount
```

- `user`: PTC surf yapan kullanıcı adı
- `amount`: son 5 dakikada kazanılan ZER miktarı
- `clicks`: son 5 dakikadaki yeni tıklama sayısı (opsiyonel)

> Not: Kod her iki formatı da destekler. `clicks` gelmezse `0` kabul edilir.

---

### 2) ZerAds "Display Exchanged Reward Message" ayarı

Bu projede varsayılan dönüşüm:

- `1 ZER = 100 JETON`

ZerAds panelinde örnek giriş:

- **1 ZER =** `100`
- **Reward name:** `JETON`

---

### 3) Sunucu ortam değişkenleri (Render)

Render service env vars:

- `ZERADS_PTC_TARGET_URL` = ZerAds PTC hedef linkin (boşsa `https://zerads.com/ptc?ref=10799` kullanılır)
- `ZERADS_CALLBACK_PUBLIC_URL` = callback URL (boşsa otomatik şu kullanılır: `https://batidao-deneme-bot.onrender.com/zerads-callback?user=user&amount=amount&clicks=clicks`)
- `ZERADS_EXCHANGE_RATE` = `100`
- `ZERADS_REWARD_NAME` = `JETON`
- `FIREBASE_SERVICE_ACCOUNT_JSON` = Firebase service account JSON (string)

Güvenlik için opsiyonel:

- `ZERADS_CALLBACK_PASSWORD` = örn `Qwerty12`
- `ZERADS_CALLBACK_ALLOWED_IP` = örn `162.0.208.108`

Eğer `ZERADS_CALLBACK_PASSWORD` tanımlarsan callback URL’i şu şekilde ver:

```text
https://batidao-deneme-bot.onrender.com/zerads-callback?pwd=Qwerty12&user=user&amount=amount&clicks=clicks
```

### 3.1) Render uyku/idle için keep-alive

Render free plan zaman zaman servisi uyutabilir. Uyanık kalma denemesi için uygulamada self-ping mekanizması eklendi.

Opsiyonel env:

- `RENDER_EXTERNAL_URL` = Render servis URL'in (örn: `https://batidao-deneme-bot.onrender.com`)
- `RENDER_KEEPALIVE_ENABLED` = `true` / `false` (default: `true`)
- `RENDER_KEEPALIVE_INTERVAL_MS` = ping aralığı (default: `480000` = 8 dk)

> Not: Bu yöntem Render'ın platform politikalarını garanti bypass etmez, sadece düzenli `/health` isteği atar.

---

### 4) Veritabanı mantığı (Firestore)

`/zerads-callback` endpoint’i kullanıcıyı `users` koleksiyonunda `username` alanına göre bulur ve şunları günceller:

- `balance += amount * exchange_rate`
- `ptcClicks += clicks`
- `ptcEarnedZER += amount`
- `lastPtcAt`
- `lastPtcAmountZER`
- `lastPtcReward`
- `lastPtcClicks`

Bu nedenle kullanıcı dokümanında `username` alanı bulunmalıdır.

---

### 5) Endpoints

- `GET /health`
- `GET /ptc-config`
- `GET /zerads-callback`
- `GET /zerads-status?user=<username>`

### 5.1) Banner kodu (arayüzde aktif)

Projede banner alanlarında şu iframe kodu kullanılır:

```html
<iframe src="https://zerads.com/ad/ad.php?width=728&ref=10799" marginwidth="0" marginheight="0" width="728" height="90" scrolling="no" border="0" frameborder="0"></iframe>
```

Bu kod, `dynamic-banner` sınıfı olan tüm banner alanlarına otomatik basılır.

### 5.2) Önemli: PTC Target URL callback olmamalı

`ZERADS_PTC_TARGET_URL` alanına **callback URL** (`/zerads-callback?...`) yazmayın.

- Doğru: ZerAds PTC sayfası/offer linki
- Yanlış: `https://.../zerads-callback?...`

Eğer yanlışlıkla callback URL girilirse sistem bunu otomatik olarak `https://zerads.com/ptc?ref=10799` fallback'ine çeker.

---

### 6) PHP örneğindeki mantığın Node karşılığı

Gönderdiğin PHP örneğindeki şu mantık uygulanmıştır:

- Callback query’den `user`, `amount`, `clicks` al
- Şifre/IP doğrulaması (opsiyonel env ile)
- `topay = amount * exchange`
- Kullanıcı bakiyesine ekle
- Tıklama sayaçlarını artır

Bu projede SQL yerine Firestore kullanılır.
