# Yayın kalitesi — inceleme, düzeltmeler ve sunucu adımları

Kapsam: yakalama (WGC / getUserMedia) → kodlama (codec, simulcast, bitrate) →
SFU (LiveKit) → abone olma (adaptive stream, dynacast) → çizim (video elementi).

## 1. Zaten doğru olanlar

Bunları değiştirmedim; incelemede sağlam çıktılar:

- **Yakalama**: Windows'ta `AllowWgcScreenCapturer` / `AllowWgcWindowCapturer` /
  `AllowWgcZeroHz` açık. DXGI destekli yol, tam ekran oyunları da temiz
  yakalayan tek yol; ZeroHz durağan ekranda kare üretmeyi durdurup boştaki
  paylaşımı ~%0 CPU'ya indiriyor.
- **Kısıtlar** yalnız tavan (`maxWidth/maxHeight/maxFrameRate`), `min*` yok —
  hedefi tutturamayan kaynak başarısız olmuyor, Chromium durağan ekranı
  istenen hıza çıkarmak için kare çoğaltmıyor.
- **Codec**: `auto` → donanım hızlandırma açıksa H.264 (Windows'ta NVENC /
  QuickSync / AMF kapsaması geniş, herkes çözebiliyor), kapalıysa VP8.
- **`contentHint`**: yayın modu `motion` ise framerate, `detail` ise çözünürlük
  öncelikli; `degradationPreference` de aynı yönde ayarlanıyor.
- **Ekran paylaşımı abonelikleri opt-in**: kimse izlemeye basmadan bayt akmıyor.
  `dynacast` de kimsenin almadığı katmanları sunucuda duraklatıyor.
- **SFU config** (`deploy/docker-compose.coolify.yml`): tek UDP portu (7882),
  TCP yedeği (7881), `use_external_ip: true`, send-side BWE açık.

## 2. Bulunan sorunlar ve yapılan düzeltmeler

### Y1 — Preset bitrate'i gerçek çözünürlüğe uymuyordu

Kalite preset'leri (çözünürlük, bitrate) çifti; yakalama kısıtları ise tavan.
`resolveVideoTarget` genişlik/yüksekliği **gerçek track'ten** alıyordu ama
bitrate'i **preset'ten** alıyordu. Sonuç:

| Preset | Paylaşılan | Gönderilen çözünürlük | Eski bitrate tavanı |
|---|---|---|---|
| Ultra 2160p | 1080p monitör | 1920×1080 | **14 Mbps** |
| Ultra 2160p | 800×600 pencere | 800×600 | **14 Mbps** |
| Net 1440p | 1080p monitör | 1920×1080 | **9 Mbps** |

Kodlayıcı bu tavanı kullanır, send-side BWE onu bulmak için yukarı yoklar ve
gerçekten taşıyamayan bir uplink'te sonuç paket kaybı ve donmadır. Bitrate artık
gerçek piksel sayısına ölçekleniyor — katman merdiveninin kullandığı 0.75
üsteliyle, yani düşürülmüş bir yayın, olacağı katmanla aynı eğriye oturuyor:

```
2160p preset (14 Mbps) gerçek yakalama:
  3840x2160 -> 14.00 Mbps
  2560x1440 ->  7.62 Mbps
  1920x1080 ->  4.95 Mbps
  1280x720  ->  2.69 Mbps
  800x600   ->  1.65 Mbps
```

Doğrulama: 2160p preset 1080p'ye düşünce 4.95 Mbps veriyor — uygulamanın 1080p60
için zaten seçtiği 5 Mbps'in pratikte aynısı.

### Y2 — 1440p ve üstünde üç donanım kodlayıcı oturumu

Her simulcast katmanı ayrı bir kodlayıcı örneği. 1440p60'ta merdiven
2560+1280+640 = **üç eşzamanlı H.264 oturumu** açıyordu. Tüketici NVENC'te
eşzamanlı oturum limiti tarihsel olarak 2-3 ve OBS gibi başka bir şey de
kullanıyorsa dolabiliyor; dolunca Chromium yazılım kodlayıcıya (openh264)
düşüyor ve CPU'yu doyuruyor — takılmanın klasik nedeni.

1440p ve üstünde çeyrek katman kaldırıldı: merdiven **iki kodlama**. Yarım
katman zaten 1280×720, zayıf aboneye fazlasıyla yeter. 1080p ve altında üç
kodlama olduğu gibi duruyor.

### Y3 — Ekran paylaşımı döşemede kırpılıyordu

`.ct-lobby-tile-video` `object-fit: cover`. Kamera için doğru, ekran için değil:
döşeme 16:9, monitörler değil. Her 16:10, ultra geniş veya pencere paylaşımının
kenarları kesiliyordu — genelde tam da izleyicinin görmesi gereken yer.
Ekran döşemeleri artık `contain`.

### Y4 — "İzle" abone oluyor ama sahneye almıyordu

En büyük görünür kalite kaybı buydu. Adaptive stream, teslim edilecek katmanı
videonun çizildiği **elementin boyutuna** göre seçiyor. "Yayını izle"ye basmak
yalnızca abone oluyordu; yayın ~380 px'lik ızgara döşemesinde kalıyordu, yani
1080p bir paylaşımın **480×270 katmanı** geliyordu. O çözünürlükte hiçbir yazı
okunmuyor — "kalite kötü" şikâyeti birebir bu.

İzlemek artık aynı zamanda odaklıyor. Element sahne boyutuna çıkıyor, SFU üst
katmanı göndermeye başlıyor. İzlemeyenler için hiçbir bant genişliği maliyeti
yok. (Bir kullanıcı hem kamera hem ekran paylaşıyorsa slot sırası ekranı önce
koyuyor, dolayısıyla odak ekrana gidiyor.)

### Y5 — Video istatistikleri ölçülüyor, hiçbir yerde gösterilmiyordu

`MediaStatsCollector` saniyede bir kare boyutu, framerate, codec, kodlayıcı
implementasyonu, aktif katman sayısı, `qualityLimitationReason`, `freezeCount`
ve `jitterBufferDelay` topluyordu. Ağaçta bunları okuyan **hiçbir şey yoktu** —
yalnızca ses yarısı çiziliyordu. Yani "yayın kötü" ifadesinin uygulamada
sayısal karşılığı yoktu: CPU'ya takılan yazılım kodlayıcıyı, yetmeyen uplink'i
ve kare düşüren alıcıyı birbirinden ayırmanın yolu yoktu.

Ses bağlantı panelinde artık bir **Yayın Kalitesi** bölümü var:

- Gönderilen: çözünürlük · fps · Mbps
- Kodlayıcı: codec · donanım/yazılım · katman sayısı
- Yükleme başlık payı (`availableOutgoingBitrate`)
- Alınan: çözünürlük · fps · Mbps
- Donma sayısı ve jitter tamponu
- Bir sorun varsa tek cümlelik teşhis (CPU / bant genişliği / yazılım kodlayıcı)

Bir sorun bildirildiğinde bakılacak ilk yer burası.

### Y6 — 1:1 aramada ekran paylaşımı karşı tarafa hiç görünmüyordu

İki istemciyle test ederken çıktı ve iki ayrı kusurun üst üste binmesiymiş.
Lobide roster sunucudan geldiği için görünmüyordu; aramada üyeler istemcide
sentezlendiği için yalnızca orada patlıyordu.

1. `WorkspaceShell.callMembers`, karşı tarafın `screenSharing` bayrağını
   `screenEnabled`'dan okuyordu. `screenEnabled` "abone olundu" demek; ekran
   paylaşımları ise opt-in. Yani izlemeye basmadan bayrak açılmıyor, bayrak
   açılmadan ekran slotu üretilmiyor, slot olmadan "Yayını izle" düğmesi
   çizilmiyordu: **izlemediğiniz için izleyemiyordunuz.** Artık `screenAvailable`
   (yayınlandı) okunuyor.
2. `isSameParticipantMediaState` dokuz alanı karşılaştırıyor ama
   **`screenAvailable`'ı karşılaştırmıyordu**. Opt-in olduğu için biri yayına
   başladığında izleyici açısından başka hiçbir alan değişmiyor
   (`screenEnabled` false kalıyor, `screen`/`screenStream` null kalıyor), bu
   yüzden karşılaştırıcı "değişmedi" diyor, `updateMediaMap` geri çağrıyı
   atlıyor ve izleyicinin React durumu birinin yayına başladığını hiç
   öğrenmiyordu.

İkisi de düzeltilmeden ekran paylaşımı aramada görünmüyor.

### Y7 — Seçilen kalite kodlayıcıya hiç ulaşmıyordu (15 fps kilidi)

Y1–Y6'dan sonra da panel şunu gösteriyordu:

```
Gönderilen: 1920x1080 · 15 fps · 3.11 Mbps
Kodlayıcı:  H264 · donanım · 2 katman
```

"1080p • 60 FPS" preset'i seçiliyken. Sebep uygulamanın aritmetiği değil,
LiveKit'in seçenek adlandırması. `computeVideoEncodings`:

```js
let videoEncoding = options?.videoEncoding;
if (isScreenShare) videoEncoding = options?.screenShareEncoding;
```

Simulcast merdiveni de aynı şekilde `screenShareSimulcastLayers`'tan okunuyor.
`Track.Source.ScreenShare` ile publish edilen bir track'te
`videoEncoding`/`videoSimulcastLayers` **sessizce düşüyor** ve `Room`'un
birleştirdiği kütüphane varsayılanı devreye giriyor:
`ScreenSharePresets.h1080fps15` — 1920×1080, 2.5 Mbps, **15 fps**. Varsayılan
merdiven de tek bir yarım katman üretiyor (960×540, 625 kbps).

Gözlenen dört sayının tamamı buradan geliyor: 2.5 + 0.625 = **3.125 Mbps**,
**2 katman**, **15 fps**. Preset'ten bağımsız: 720p60, 1080p60, 1440p60 ve
2160p30 hepsi 15 fps yayınlanıyordu — 1440p seçmek aynı 2.5 Mbps'i 1.8 kat
piksele yaydığı için kaliteyi *düşürüyordu*.

Sonuç olarak `SCREEN_SHARE_QUALITY_OPTIONS` bitrate'leri,
`scaleBitrateToResolution` ve `buildSimulcastLayerSpecs` ekran paylaşımı yolunda
ölü koddu. Kamera etkilenmemişti (`isScreenShare` false).

`buildVideoPublishPlan` artık aynı değerleri iki anahtar çiftine de yazıyor.
LiveKit'in gerçek `computeVideoEncodings`'i node'da çalıştırılarak ölçüldü:

```
ÖNCE:  rid=q  960x540 @15fps 0.625 Mbps
       rid=h 1920x1080 @15fps 2.500 Mbps   toplam 3.125 Mbps
SONRA: rid=q  960x540 @30fps 1.768 Mbps
       rid=h 1920x1080 @60fps 5.000 Mbps   toplam 6.768 Mbps
```

### Y8 — Ekran paylaşımında merdiven bütçeyi bölüyordu

Uplink merdivenin **toplamına** gider, üst katmana değil. 1080p60 üç kodlamayla
5 + 1.77 + 0.63 = 7.4 Mbps ister; preset'in hedeflediği ~7 Mbps'lik uplink'e
sığmaz. Ekran videosunda en alt katman zaten işe yaramaz — 480×270 bir masaüstü
okunmaz, kimse onu duraklamış yayına tercih etmez.

Ekran paylaşımı artık **iki kodlama** (`SCREEN_SHARE_MAX_ENCODINGS`), kamera üç
(`CAMERA_MAX_ENCODINGS`) — kamera kareleri küçük ve ızgara döşemesinde 320×180
bir yüz gayet kullanılabilir. 1080p60 böylece 7.4 yerine 6.77 Mbps istiyor.

### Y9 — Kalite seçicisi uplink'i hiç hesaba katmıyordu

`availableOutgoingBitrate` ölçülüyor ama yalnız panelde yazıyordu. Yayın
modalinde her preset artık **tüm merdivenin** toplam maliyetini gösteriyor ve
ölçülen başlık payının %85'ini aşan preset'ler işaretleniyor. Engellemiyor:
send-side BWE yalnızca gönderdiğinin üstünü yokladığı için bu tahmin bir taban,
tavan değil — 3.1 Mbps'te kilitliyken 6.79 Mbps okunması gerçek uplink'in o
kadar olduğu anlamına gelmez.

### Y10 — Publish'in encoder'a ulaştığını hiçbir şey doğrulamıyordu

Y7 bu boşlukta yaşadı: `check-video-layers.cjs` uygulamanın aritmetiğini test
ediyordu, LiveKit'in onu *kullandığını* değil. İki yeni koruma:

- `verifyPublishedEncodings` — publish sonrası `sender.getParameters()` okunuyor,
  istenen ile karşılaştırılıyor, sapma varsa debug log + konsol uyarısı.
- `scripts/check-publish-plan.cjs` — `buildVideoPublishPlan` çıktısının
  `screenShareEncoding`/`screenShareSimulcastLayers` taşıdığını doğrular
  (modül livekit-client'a bağlı olduğu için vite ile bundle edilip çalıştırılır).

## 3. Doğrulama

`pnpm typecheck`, `pnpm build`, `eslint src` (0 hata), `pnpm check`
(`check-media-stats`, `check-video-layers`, `check-publish-plan`,
`check-loopback-worklet`) geçiyor. Bitrate ölçekleme, merdiven bütçesi ve
encoder geri-okuması için self-check'e vaka eklendi.

Y7 ayrıca LiveKit'in kendi `computeVideoEncodings`'i node'da çalıştırılarak
ölçüldü — düzeltme öncesi çıktı, panelin gösterdiği dört sayının (1920x1080 /
15 fps / 3.11 Mbps / 2 katman) birebir aynısı.

Sonradan iki gerçek istemciyle test edildi (yerel Postgres + yerel LiveKit,
iki ayrı Electron profili, iki hesap). Ölçülenler:

```
aramayı kabul et -> ilk uzak ses track'i:  arayan 1628 ms, kabul eden 1407 ms
ses bağlantısı:                            "iyi (39 ms)" / "iyi (29 ms)"
paylaşan (Ultra preset, 2560x1080 monitör): H264 · donanım · 2 katman
ekran döşemesi object-fit:                  contain   (kamera döşemesi: cover)
izleyen: izlemeye basınca odaklandı,        "Donma: 0 kez · 72 ms tampon"
```

Y2 (1440p+ iki kodlama), Y3 (kırpma yok), Y4 (izle → odakla), Y5 (panel gerçek
sayıları gösteriyor) ve Y6 çalışan uygulamada doğrulandı. Y1 aritmetiği
self-check'le sınandı.

Bant genişliği sayıları (0.5 Mbps) test ortamının kendisi: iki Electron ve SFU
aynı makinede, LiveKit "UDP receive buffer is too small (425 KB / 5 MB)" uyarısı
veriyor. İşlevsel sonuçlar geçerli, throughput sayıları üretimi temsil etmiyor.

## 4. Sunucu tarafında yapılması gerekenler

Ayrıntılı adımlar için sohbetteki açıklamaya bakın. Özet:

1. **7882/UDP gerçekten açık mı** — sunucu güvenlik duvarı *ve* sağlayıcının
   ağ güvenlik grubu. Kapalıysa herkes 7881/TCP'ye düşer ve görüntü gözle
   görülür şekilde bozulur. Bu, kalite için tek en önemli madde.
2. **`node_ip`** — LiveKit log'unda `nodeIP=172.x` görünüyorsa public IP
   otomatik bulunamıyor demektir; config'de elle verin.
3. **Uplink** — 10 kişilik bir odada aynı anda yayın yapılıyorsa sunucunun
   çıkış bant genişliği tavanı. `max_participants: 10` ve preset tavanlarıyla
   hesaplayın.
4. **TURN** — hâlâ bağlanamayan kullanıcı varsa (kurumsal ağ, katı NAT) 443/TCP
   üzerinden TURN gerekir.
