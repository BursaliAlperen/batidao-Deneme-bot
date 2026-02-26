# batidao-Deneme-bot

## ZerAds Surf (PTC) callback

**Doğru callback URL** (ZerAds paneline bunu gir):

`https://batidao-deneme-bot.onrender.com/zeradsptc.php?pwd=Qwerty12&user={user}&amount={amount}&clicks={clicks}`

> Senin yazdığın URL'de `clicks` parametresinde `}` eksik ve satır tekrar ediyor. Üstteki tek satır doğru formattır.

### Display Exchanged Reward Message (ZerAds panel)
- `1 ZER = 10 X coins/credits`
- Reward name: `JETON`

### Env ayarları
- `ZERADS_PTC_PASSWORD` (default: `Qwerty12`)
- `ZERADS_PTC_IP` (default: `162.0.208.108`)
- `ZERADS_EXCHANGE_RATE` (default: `10`)
- `ZERADS_REWARD_NAME` (default: `JETON`)

### Callback davranışı
- `pwd`, `user`, `amount`, `clicks` alır.
- Şifre + kaynak IP doğrular.
- `credited = amount * exchange_rate` olarak hesaplar.
- Sonucu `zerads_ptc_rewards.json` dosyasına kullanıcı bazlı yazar.
