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

## 3. Doğrulama

`pnpm typecheck`, `pnpm build`, `eslint src/renderer` (0 hata),
`scripts/check-video-layers.cjs` ve `scripts/check-media-stats.cjs` geçiyor.
Bitrate ölçekleme ve yeni merdiven için self-check'e vaka eklendi.

İki istemcili gerçek bir yayın denenemedi (bu makinedeki geliştirme
profillerinin oturumu düşmüş). Y1/Y2 saf aritmetik ve self-check'le sınandı;
Y3/Y4/Y5 kod ve CSS düzeyinde. Gerçek ölçüm için Y5'teki panel var.

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
