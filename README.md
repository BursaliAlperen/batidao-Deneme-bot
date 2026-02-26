# batidao-Deneme-bot

## ZerAds kurulum

### Banner
Uygulamadaki `dynamic-banner` alanları artık ZerAds 728 banner'ı otomatik çekiyor.

### Surf to Earn (PTC Callback)
`zeradsptc.php` callback endpoint'i eklendi.

Örnek callback URL:

`https://batidao-deneme-bot.onrender.com/zeradsptc.php?pwd=Qwerty12&user=test&amount=0.001&clicks=2`

### Güvenlik / ayarlar (env)
- `ZERADS_PTC_PASSWORD` → callback şifresi
- `ZERADS_PTC_IP` → ZerAds sunucu IP (varsayılan `162.0.208.108`)
- `ZERADS_MIN_REWARD` → surf başına minimum jeton (varsayılan `0.5`)
- `ZERADS_MAX_REWARD` → surf başına maksimum jeton (varsayılan `1.0`)

Callback sonucu kullanıcı bazlı ödüller `zerads_ptc_rewards.json` dosyasına yazılır.
