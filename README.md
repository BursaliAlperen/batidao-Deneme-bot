# batidao-Deneme-bot

## Surf URL ve Callback (net)

Evet, surf için doğru link formatı bu:

`https://zerads.com/ptc.php?ref=10799&user=test`

Uygulamada kullanıcı adı sabit verilmediği için yönlendirmede şu temel hali kullanılır:

`https://zerads.com/ptc.php?ref=10799`

Bu surf akışı için ZerAds panelinde kullanılacak callback URL ise:

`https://batidao-deneme-bot.onrender.com/zeradsptc.php?pwd=Qwerty12&user={user}&amount={amount}&clicks={clicks}`

## ZerAds Surf (PTC) callback

**Doğru callback URL** (ZerAds paneline bunu gir):

`https://batidao-deneme-bot.onrender.com/zeradsptc.php?pwd=Qwerty12&user={user}&amount={amount}&clicks={clicks}`

> Senin yazdığın URL'de `clicks` parametresinde `}` eksik ve satır tekrar ediyor. Üstteki tek satır doğru formattır.

### Display Exchanged Reward Message (ZerAds panel)
- `1 ZER = 100 X coins/credits`
- Reward name: `JETON`

### Env ayarları
- `ZERADS_PTC_PASSWORD` (default: `Qwerty12`)
- `ZERADS_PTC_IP` (default: `162.0.208.108`)
- `ZERADS_EXCHANGE_RATE` (default: `100`)
- `ZERADS_REWARD_NAME` (default: `JETON`)

### Callback davranışı
- `pwd`, `user`, `amount`, `clicks` alır.
- Şifre + kaynak IP doğrular.
- `credited = amount * exchange_rate` olarak hesaplar.
- Sonucu `zerads_ptc_rewards.json` dosyasına kullanıcı bazlı yazar.

### Önemli (çifte ödül olmasın)
- Surf butonu sadece yönlendirme yapmalı.
- Ödül ekleme işi **yalnızca callback** (`zeradsptc.php`) ile yapılmalı.
- Callback yaklaşık 5 dakikada bir gelir; bu yüzden ödül hemen görünmeyebilir.

### Ödül gelmiyorsa (düzeltme)
- Callback gelince ödül önce `zerads_ptc_rewards.json` içinde `pending` alanına yazılır.
- Uygulama her 60 saniyede `zeradsptc.php?action=sync&user=<telegram_user_id>` çağırıp pending ödülü Firestore bakiyesine işler.
- Bu sayede ödül artık callback sonrası otomatik düşer.

### Ödül gelmeme için kritik kontrol
- ZerAds callback `user` değeri ile uygulamadaki **ZerAds kullanıcı adı** aynı olmalı.
- Uygulamada Earn bölümüne ZerAds kullanıcı adını girip `Ödülü Kontrol Et` butonuna basabilirsin.
- IP doğrulaması artık `REMOTE_ADDR` yanında `X-Forwarded-For` için de kontrol eder (Render/proxy uyumlu).
