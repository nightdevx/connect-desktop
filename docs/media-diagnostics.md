# Yayın tanılama kayıtları — şema ve analiz rehberi

Bu belge, yönetim panelinden indirilen `.ndjson` dosyasının tam sözleşmesidir.
Dosyayı bir analize verirken bu belgeyi de ver: alan adları, birimler ve olay
sözlüğü burada tanımlı.

**Şema sürümü: 3.** Her satır kendi sürümünü taşır.

## 1. Dosya biçimi

NDJSON: her satır bağımsız bir JSON nesnesi. İki satır türü var ve `type`
alanıyla ayrılır.

Bir dosya **birden çok oturum** içerebilir. Her oturum bir `session` satırıyla
başlar, ardından o oturuma ait `entry` satırları gelir, sonra bir sonraki
oturumun `session` satırı. Aralık indirmesi böyle çalışır, tek oturum
indirmesinde tek bir blok olur.

```
{"type":"session","schemaVersion":3,"sessionId":"...", ...}
{"type":"entry","sessionId":"...","entry":{...}}
{"type":"entry","sessionId":"...","entry":{...}}
{"type":"session","schemaVersion":3,"sessionId":"...", ...}
...
```

## 2. `session` satırı

| Alan | Anlam |
|---|---|
| `sessionId` | Oturum kimliği. `entry` satırları buna bağlanır. |
| `userId`, `username` | Kaydı üreten kullanıcı. |
| `lobbyId` | Oda. `call_<id>` ise bire bir arama. |
| `startedAt`, `lastSeenAt` | RFC3339, UTC. |
| `entryCount` | Sunucuya ulaşan kayıt sayısı. |
| `closed` | `true` ise oturum düzgün kapandı; `false` ise istemci son partiyi gönderemeden gitti. |
| `problems` | Türetilmiş sorun etiketleri. Bkz. bölüm 5. |
| `client` | Makine ve ayar bağlamı. Bkz. bölüm 3. |
| `summary` | Oturumun tamamının önceden hesaplanmış özeti. Bkz. bölüm 4. |

**Analize buradan başla.** `summary` ve `problems`, tüm `entry` satırlarını
okumadan tanı koymaya yeter; `entry` satırları yalnızca "neden" sorusu için.

## 3. `client` — makine bağlamı

| Alan | Anlam |
|---|---|
| `appVersion` | Uygulama sürümü. Regresyon aramak için sürümler arası kıyasla. |
| `platform`, `osVersion` | `win32` ve çekirdek sürümü. |
| `electronVersion`, `chromeVersion` | Chromium codec ve encoder davranışı buna bağlı. |
| `cpuThreads`, `deviceMemoryGb` | `navigator.hardwareConcurrency` / `deviceMemory`. |
| `gpu.videoEncode` | Chromium'un donanım **kodlayıcı** kararı. `enabled` değilse yazılım kodlama kaçınılmazdır ve `software-encoder` etiketi makine kusuru değildir. |
| `gpu.videoDecode`, `gpu.gpuCompositing` | Aynı, çözme ve kompozit için. |
| `hardwareSvcCodec` | `probeHardwareVideoEncoder` sonucu: `av1`, `vp9` ya da `null`. `null` ise ekran paylaşımı H.264'tedir ve bu beklenen davranıştır. |
| `prefs.videoCodec` | Kullanıcının seçtiği codec. `auto` dışında bir değer, otomatik seçimi devre dışı bırakır. |
| `prefs.hardwareAcceleration` | Kapalıysa kodlama bilerek yazılımdadır. |
| `prefs.enhancedNoiseSuppression`, `prefs.noiseSuppressionPreset`, `prefs.echoCancellation` | Mikrofon zinciri ayarları. |
| `prefs.microphoneVolumePct`, `prefs.masterVolumePct` | 0-200. |

## 4. `summary` — oturum özeti

Birim her alan adında yazılı: `Ms`, `Bps`, `Pct`.

İstatistik alanları `{n, min, max, mean}` biçiminde. `n` örnek sayısıdır;
`n` küçükse (< 5) o sayıya güvenme.

| Alan | Anlam |
|---|---|
| `durationMs` | Oturum süresi. |
| `entries`, `events`, `samples` | Kayıt sayıları. |
| `truncated` | `true` ise tavana çarpıldı ve kayıt düştü. Sayımlar alt sınırdır. |
| `rttMs` | Medya yolu gidiş dönüş. Backend HTTP değil. |
| `availableOutgoingBitrateBps` | Send-side BWE'nin ölçtüğü yükleme başlık payı. |
| `outboundAudioBitrateBps` | Giden ses. Mikrofon 64k, ekran sesi 96k hedefli. |
| `outboundVideo.codecs` | codec → örnek sayısı. Birden çok anahtar varsa oturum içinde codec değişmiş demektir. |
| `outboundVideo.encoderImplementations` | Chromium'un encoder adı. `libvpx`/`libaom`/`OpenH264` yazılımdır. |
| `outboundVideo.hardwareEncoderSamples` / `softwareEncoderSamples` | Oran önemli. Yazılım örnekleri baskınsa sorun buradadır. |
| `outboundVideo.resolutions` | `"1920x1080"` → örnek sayısı. Birden çok anahtar, çözünürlük düşüşü demektir. |
| `outboundVideo.layerCounts` | Katman sayısı → örnek sayısı. `"1"` SVC, `"2"`/`"3"` simulcast. |
| `outboundVideo.fps`, `bitrateBps` | Gerçekte gönderilen. Preset tavanıyla kıyasla. |
| `outboundVideo.limitation` | `{none, cpu, bandwidth, other}` **örnek sayıları**. Süre değil; `limitationSeconds` kullan. |
| `outboundVideo.limitationSeconds` | **v2.** Kısıtın gerçek süresi (sn). `limitation` sayımları yalnızca kaç örneğin kısıt anına denk geldiğini söyler — 3 saatlik bir yayında 2417 örneğin 10'u "cpu" demek, sorunun 20 sn mi 20 dk mı sürdüğünü söylemez. Bu alan söyler. |
| `outboundVideo.sourceFps`, `sourceResolutions` | **v2.** Kodlayıcının değil, **yakalamanın** ürettiği. `fps` ile birlikte oku: ikisi de düşükse kaynak besleyemiyor, kaynak yüksek `fps` düşükse kodlayıcı yetişemiyor. Bu ikisi zıt çözüm ister ve v1'de ayırt edilemiyordu. |
| `outboundVideo.encodeMsPerFrame` | **v2.** Kare başına kodlama süresi. ~16 ms üstünde 60 fps, ~33 ms üstünde 30 fps ulaşılamaz. |
| `outboundVideo.framesDroppedPct` | **v2.** Kodlayıcıya sunulup atılan kare oranı. |
| `outboundVideo.retransmittedPct` | **v2.** NACK üzerine yeniden gönderilen paket oranı. Ağ toparlıyor mu, yoksa kaybediyor mu. |
| `outboundVideo.qp` | Örnek başına ortalama QP: kodlayıcının görüntüyü ne kadar kaba kodladığı. H.264'te 37 üstü gözle görülür bloklanma; VP9 ve AV1 başka ölçek kullanır, codec ile birlikte okunur. `keyFrames`, `pli`: oturum boyunca anahtar kare ve PLI sayısı. Bu üç alan eklenmeden önce kaydedilen oturumlarda yoktur. |
| `inboundVideo.*` | Alınan tarafın aynası. `freezeCountMax` kümülatiftir, oran değil. |
| `inboundVideo.freezeMs` | Görüntünün donuk durduğu toplam süre (ms). `freezeCountMax` saniyede bir kare gönderen durgun bir ekranı da donma sayar; asıl takılmayı bu alan ve `frameIntervalStdDevMs` ayırır. |
| `inboundVideo.frameIntervalStdDevMs` | Örnek başına kare aralığının standart sapması (ms): karelerin ne kadar düzensiz geldiği. Akıcı 30 fps'te birkaç ms'dir. |
| `inboundVideo.hardwareDecoderSamples` / `softwareDecoderSamples` | Çözücünün donanım (`powerEfficientDecoder`) olduğu ve olmadığı örnek sayıları. Bu alanlar eklenmeden önceki oturumlarda yoktur. |
| `inboundAudioConcealmentPct` | Opus'un uydurduğu örnek yüzdesi. %3 üstü duyulur. |
| `inboundAudioJitterMs` | Alınan ses jitter'ı. |
| `packetLossOutboundPct`, `packetLossInboundPct` | Yönlere göre kayıp. |
| `inboundAudioConcealmentPct` | **v2'de anlamı daraldı:** artık yalnızca *duyulur* kesinti. DTX sessizliği (`silentConcealedSamples`) çıkarılıyor. v1'de bu alan konuşmayan bir katılımcıyı bozuk hat gibi gösteriyordu. |
| `eventCounts` | `"<scope>/<name>"` → sayı. Hangi olayın kaç kez olduğunu tek bakışta verir. |
| `warnings` | Kullanıcıya gösterilen uyarı metni → sayı. |
| `problems` | Bölüm 5. |
| `episodes` | **v2.** Sorunun *ne zaman* olduğu: `{problem, startMs, endMs, samples, peak}`. Etiket "3 saatte bir yerde oldu" der, bu "18:42–18:47 arası, en kötü %33" der. En uzun 40 dilim tutulur. |
| `remotes` | **v2.** Katılımcı bazında alım: `{identity, samples, packetLossPct, concealmentPct, jitterMs, bitrateBps}`. **Tek kişi mi bozuk, herkes mi** sorusunun cevabı — biri bozuksa onun gönderme yolu, hepsi bozuksa bu makinenin indirme yolu. v1'de hepsi tek sayıya havuzlanıyordu. |
| `verdicts` | **v2.** `{code, headline, evidence[]}`. Sıralı teşhis ve dayandığı sayılar. `deriveVerdicts(summary)` saf fonksiyonu üretir; okuyucu tarafında yeniden çalıştırılabilir, yani eski oturumlar bugünün kurallarıyla yeniden yargılanır. |
| `icePathSamples` | **v3.** `{publisher, subscriber}`: her bağlantının hangi ağ yolunda kaç örnek geçirdiği; anahtar `protokol/yerel aday tipi`, ör. `udp/host`, `udp/srflx`, `tcp/host`, `udp/relay`. Sağlıklı oturumda yalnız `udp/…` ve `relay` olmayan anahtarlar görünür. `tcp/…` oturumun ICE/TCP yedeğinde, `…/relay` bir TURN aktarma sunucusu üzerinden aktığı demektir. İkisi de RTT ve kayıp sayılarında görünmez, bu alan tek tanıktır. |

## 5. `problems` — türetilmiş sorun etiketleri

İstemci bunları eşiklerden türetir. Sabit sözlük; yeni etiket eklemek şema
sürümünü artırır.

| Etiket | Tetikleyen | İlk bakılacak yer |
|---|---|---|
| `software-encoder` | Bir örnekte `hardwareEncoder === false` | `client.gpu.videoEncode`, `prefs.hardwareAcceleration`, `outboundVideo.encoderImplementations` |
| `cpu-limited` | `qualityLimitationReason === "cpu"` | `outboundVideo.resolutions` ve `fps`; yazılım kodlama var mı |
| `bandwidth-limited` | `qualityLimitationReason === "bandwidth"` | `availableOutgoingBitrateBps` ile `outboundVideo.bitrateBps` kıyası |
| `codec-fallback` | `screen-codec-fallback` olayı | Probe yanıldı: `hardwareSvcCodec` doluydu ama gerçek publish yazılıma düştü |
| `quality-step-down` | `quality-step-down` olayı | Otomatik kalite düşürme çalıştı; `from`/`to` olay verisinde |
| `receiver-freezes` | `freezeCount >= 1` | `inboundVideo`, `packetLossInboundPct`, `stream-paused` ile birlikte mi |
| `high-rtt` | `rttMs >= 200` | Coğrafya mı, ağ mı; `packetLoss` ile birlikte mi |
| `packet-loss` | Herhangi bir yönde `>= %3` | Yön önemli: giden kayıp yükleme, gelen kayıp indirme sorunudur |
| `audio-concealment` | `concealmentPct >= %3` | Ses kesiliyor. `packetLossInboundPct` ve `inboundAudioJitterMs` |
| `stream-paused` | `track-stream-paused` olayı | SFU izleyicinin katmanını duraklattı: izleyicinin indirmesi yetmiyor |
| `publish-encoding-mismatch` | Publish sonrası okuma istenen ayarı tutmadı | `stream-manager/publish-*-encodings` olayının `mismatch` alanı |
| `microphone-fallback` | RNNoise/işlemci zinciri kurulamadı | `mic-controller` olayları |
| `reconnects` | Bağlantı `reconnecting` durumuna düştü | `session/connection-state` olayları |
| `relay-path` | **v3.** Bir bağlantının seçili ICE çifti ardışık örneklerde `relay` (TURN üzerinden) | `summary.icePathSamples`, `stream-manager/ice-path-changed`; istemciye TURN sunucusu dağıtılıyor mu |
| `tcp-media` | **v3.** Bir bağlantının seçili ICE çifti ardışık örneklerde `tcp` | `summary.icePathSamples`; 7882/UDP'ye ulaşılabiliyor mu, sunucu oturumu TCP'ye çevirmiş mi (`allow_tcp_fallback`) |

Etiketler **birlikte** okunur. `cpu-limited` + `software-encoder` donanım
kodlayıcı sorunudur; `cpu-limited` tek başına gerçekten yetersiz işlemcidir.
`bandwidth-limited` + `packet-loss` (giden) gerçek tıkanıklıktır;
`bandwidth-limited` tek başına muhafazakâr bir BWE tahmini olabilir.

## 6. `entry` satırları

```json
{"type":"entry","sessionId":"...","entry":{
  "seq":42,"atMs":1757000000000,"tMs":18320,
  "kind":"event","scope":"stream-manager","name":"publish-screen","data":{...}
}}
```

| Alan | Anlam |
|---|---|
| `seq` | Oturum içinde artan. Boşluk varsa kayıt düşmüş. |
| `atMs` | Epoch ms. |
| `tMs` | Oturum başlangıcından beri geçen ms. Zaman çizelgesi için bunu kullan. |
| `kind` | `event` (ayrık olay) ya da `sample` (periyodik ölçüm). |
| `scope` | Kaynak modül. |
| `name` | Olay adı. |
| `data` | Olaya özel yük. 4 KB'yi aşarsa `{truncated:true, bytes, preview}` olur. |

### Kapsamlar

| scope | Kaynak |
|---|---|
| `session` | Oturum yaşam döngüsü, bağlantı durumu, uyarılar |
| `stats` | Periyodik WebRTC ölçümü (`kind: "sample"`) |
| `stream-manager` | Publish, abone olma, codec, duraklama |
| `mic-controller` | Mikrofon açma/kapama, cihaz, RNNoise zinciri |
| `remote-media` | Uzak ses yolu, çıkış cihazı, deafen |
| `screen-capture` | Ekran yakalama |
| `loopback-audio` | Sistem sesi yakalama |

### Tanı için en kritik olaylar

| `scope/name` | Ne söyler |
|---|---|
| `session/session-started`, `session-ended` | Oturum sınırları |
| `session/connection-state` | `data.state`: connecting/connected/reconnecting/disconnected/closed. `data.expected: true` ise kullanıcı odadan kendisi çıktı; kopma değildir |
| `session/connect-request` | Her bağlanma isteği ve ne olduğu. `trigger`: `user-join` (tıklama), `call-sync` (1:1 arama), `network-online` (ağ geri geldi / uyanma), `livekit-disconnected`, `membership-lost`. `outcome`: `new-room`, `replaced-room` (mevcut oda kapatılıp yenisi kuruldu), `noop-alive` (LiveKit oturumu zaten canlıydı ya da kendini topluyordu, dokunulmadı), `joined-in-flight` (aynı oda için süren bağlanmaya katıldı). `previousState` değiştirilen odanın durumudur |
| `stream-manager/ice-path-changed` | Bir bağlantının ağ yolu ilk kez belli oldu ya da değişti: `connection` (publisher/subscriber), `from` → `to` (ör. `udp/srflx` → `tcp/host`), `kind` (`udp`/`tcp`/`relay`) ve aday ayrıntıları (`localCandidateType`, `remoteCandidateType`, `protocol`, `relayProtocol`, `networkType`) |
| `stream-manager/ice-state` | Bir bağlantının ICE durumu değişti: `connection` (publisher/subscriber), `state` (`checking`, `connected`, `completed`, `disconnected`, `failed`, `closed`), `sinceConnectMs` (bu odaya bağlanmaya başlanalı beri). Sunucunun "short ice connection" dediği, katılımdan ~18–28 sn sonra gelen kopma burada `disconnected` olarak görünür: ardından `connected` geliyorsa ICE kendini toplamıştır, `failed` geliyorsa LiveKit yeniden bağlanır |
| `session/first-remote-audio` | Odayı duymak ne kadar sürdü: ilk uzak ses izine abone olunana kadar `sinceRequestMs` (tıklamadan, ya da yeniden bağlanma denemesinin başından; lobi katılımı ve token isteği dahil) ve `sinceConnectMs` (LiveKit bağlanmasının başından). `trigger` isteği kimin yaptığı, `audibleTracks` o an duyulabilecek iz sayısı. Yalnız odada duyulacak biri varken ölçülür; sağır modda ölçülmez. `timedOut: true`: 15 sn içinde hiç uzak ses gelmedi — insanların konuştuğu bir odada sessiz oturmak |
| `session/warning` | Kullanıcının gördüğü uyarı |
| `session/room-reconnected` | Beklenmedik kopma sonrası aynı odaya dönüldü |
| `stream-manager/hardware-svc-probe` | `data.codec`: probe'un donanımda bulduğu codec |
| `stream-manager/publish-screen` | Ekran publish planı: hedef, codec, katman, scalabilityMode |
| `stream-manager/publish-camera` | Kamera publish planı |
| `stream-manager/publish-*-encodings` | Publish sonrası **gerçek** encoder parametreleri ve `negotiatedCodec.sdpFmtpLine`. `mismatch` doluysa istenen ayar uygulanmadı |
| `stream-manager/screen-codec-fallback` | AV1/VP9 yazılıma düştü, H.264'e dönüldü |
| `stream-manager/encoder-fallback` | Donanımda başlayan ekran paylaşımının kodlayıcısı yayın ortasında yazılıma düştü ve 6 sn öyle kaldı (sürücü hatası, sürücünün reddettiği profil ya da kodlayıcı oturumlarını tutan başka bir program). Paylaşım başına bir kez; kullanıcıya uyarı gösterilir. `codec`, `implementation`, `resolution`. 360 px altına küçülen pencere sayılmaz: Chromium onu tasarım gereği yazılımda kodlar |
| `stream-manager/quality-step-down` | Otomatik kalite düşürme; `from`, `to`, `reason` |
| `stream-manager/audio-guard` | Ses bekçisi: ekran paylaşılırken mikrofonun RTT'si tabanın 80 ms üstüne iki örnek üst üste çıktı ve paylaşımın bit hızı tavanı canlı göndericide kısıldı (`action: "throttle"`), ya da ses 10 sn zamanında kaldı ve %10 geri verildi (`"restore"`). `factor` önayarın yüzde kaçında olunduğu (0.25–1), `rttMs` o anki, `baselineMs` son 2 dakikanın en düşük RTT'si. Yeniden yakalama yok, track değişmez; 8 sn'lik kalite düşürmenin önündeki hızlı katman |
| `stream-manager/downlink-loss` | Konuşan en az iki kişinin sesi aynı anda ≥ %3 kayıpla geldi (iki örnek üst üste): sorun bu makinenin indirmesi. Kullanıcıya uyarı (5 dakikada en fazla bir) ve izlenen ekran paylaşımları en düşük katmana iner, temiz geçen 30 sn sonra geri döner. `remotes` kimlik öneki ve kayıp yüzdeleri |
| `stream-manager/track-stream-paused` / `-resumed` | SFU katman duraklatma |
| `mic-controller/input-device-follow` | Yayındaki mikrofon seçili cihaza (ya da seçili cihaz yoksa yedeğe) taşındı: `from` → `to`. `muted: true` ise geçiş bir sonraki mikrofon açılışında olur (LiveKit izi o an yeniden alır). Bas-konuş kullanırken seçilen ya da çıkarılan cihaz buradan görünür |
| `stream-manager/hands-free-output` | Uzak ses bir Bluetooth kulaklığın Hands-Free (arama) ucundan çalıyor: dar bant, mono. Kullanıcı bir kez uyarılır. `picked: false` ise uç otomatik seçildi, yani mikrofon da o kulaklıkta (başka mikrofonla otomatik seçim stereo uca geçer) |
| `remote-media/switching-output-device` | Uzak sesin çıkış cihazı değişti (`deviceId`, `""` sistem varsayılanı). Bus ve onu besleyen pump elemanları birlikte taşınır |
| `remote-media/output-device-error` | Çıkış cihazı çalışırken hata verdi (çıkarıldı, sürücü sıfırlandı). Bağlam yeniden açıldı; açılamazsa sistem varsayılanına düşüldü |
| `remote-media/master-limiter` | Master limiter yola girdi/çıktı (`inPath`). Yalnız %100 üstü bir ses seviyesi ya da odada ekran sesi / müzik botu varken yoldadır; 6 ms'lik ileriye bakışı geri kalan zamanda ödenmez |
| `remote-media/voice-levelling` | "Ses seviyelerini dengele" ayarı değişti (`enabled`): kişi başı kompresör yola girdi ya da çıktı |
| `stream-manager/replace-screen` | Kesintisiz kaynak/kalite değişimi |
| `stats/media-stats` | Periyodik ölçüm; aşağıda |

### `stats/media-stats` örneğinin `data` alanı

```json
{
  "rttMs": 38,
  "availableOutgoingBitrateBps": 6800000,
  "icePaths": { "publisher":"udp/srflx", "subscriber":"udp/srflx" },
  "outbound": [{ "trackKey":"local:screen_share","codec":"AV1","hardwareEncoder":true,
                 "encoderImplementation":"...","resolution":"1920x1080","fps":60,
                 "bitrateBps":3480000,"layerCount":1,"limitation":"none" }],
  "inbound":  [{ "trackKey":"<userId>:camera","resolution":"1280x720","fps":30,
                 "bitrateBps":900000,"freezeCount":0,"jitterBufferMs":72 }],
  "outboundAudio": [{ "bitrateBps":64000,"packetLossPct":0 }],
  "inboundAudio":  [{ "trackKey":"<userId>:microphone","bitrateBps":64000,
                      "jitterMs":4,"concealmentPct":0.2,"packetLossPct":0 }]
}
```

`trackKey` biçimi: giden `local:<source>`, gelen `<userId>:<source>`.
`source` LiveKit değeridir: `microphone`, `camera`, `screen_share`,
`screen_share_audio`.

`icePaths` her örnekte yalnız kısa anahtarı taşır (`protokol/yerel aday tipi`,
henüz seçili çift yoksa `null`); adayın tam kaydı, değiştiği anda bir kez
`stream-manager/ice-path-changed` olayı olarak yazılır.

## 7. Analiz tarifleri

Önce özetler, sonra ayrıntı.

```bash
# Hangi oturumlarda ne var: tek bakışta tablo
jq -r 'select(.type=="session")
       | [.startedAt, .username, .lobbyId,
          (.summary.durationMs/1000|floor|tostring + "s"),
          (.problems|join(","))]
       | @tsv' kayit.ndjson

# Sorun etiketlerinin dağılımı: neyle uğraşıldığını söyler
jq -r 'select(.type=="session") | .problems[]' kayit.ndjson | sort | uniq -c | sort -rn

# Yazılım kodlamaya düşen oturumlar ve makineleri
jq -r 'select(.type=="session" and (.problems|index("software-encoder")))
       | [.username, .client.gpu.videoEncode, .client.prefs.hardwareAcceleration,
          (.summary.outboundVideo.encoderImplementations|keys|join("/"))]
       | @tsv' kayit.ndjson

# Sürümler arası regresyon: sürüm başına sorunlu oturum oranı
jq -r 'select(.type=="session")
       | [.client.appVersion, (if (.problems|length)>0 then "problem" else "temiz" end)]
       | @tsv' kayit.ndjson | sort | uniq -c

# Bir oturumun zaman çizelgesi (örnekler hariç)
jq -r 'select(.type=="entry" and .sessionId=="OTURUM_ID" and .entry.kind=="event")
       | [(.entry.tMs/1000|floor), .entry.scope, .entry.name] | @tsv' kayit.ndjson

# Gönderilen bitrate ile başlık payının seyri
jq -r 'select(.type=="entry" and .sessionId=="OTURUM_ID" and .entry.name=="media-stats")
       | [(.entry.tMs/1000|floor), .entry.data.availableOutgoingBitrateBps,
          (.entry.data.outbound[0].bitrateBps // 0),
          (.entry.data.outbound[0].limitation // "none")] | @tsv' kayit.ndjson

# Publish istenen ayarı tuttu mu
jq -r 'select(.type=="entry" and (.entry.name|test("-encodings$")))
       | [.sessionId, .entry.data.negotiatedCodec.sdpFmtpLine, (.entry.data.mismatch // "ok")]
       | @tsv' kayit.ndjson

# Yedek yola (TCP / TURN) düşen oturumlar ve hangi yolda kaç örnek geçtiği
jq -r 'select(.type=="session" and (.problems|index("tcp-media") or index("relay-path")))
       | [.username, .lobbyId,
          ((.summary.icePathSamples.publisher // {})|to_entries|map("\(.key)=\(.value)")|join(",")),
          ((.summary.icePathSamples.subscriber // {})|to_entries|map("\(.key)=\(.value)")|join(","))]
       | @tsv' kayit.ndjson

# Bağlanma istekleri: hangi tetikleyici neyle sonuçlandı
# (user-join dışındaki tetikleyicilerde noop-alive: LiveKit oturumu kendini toplamıştı, dokunulmadı;
#  new-room / replaced-room: ses baştan kuruldu, yani gerçekten kesilmişti)
jq -r 'select(.type=="entry" and .entry.name=="connect-request")
       | [.entry.data.trigger, .entry.data.outcome] | @tsv' kayit.ndjson | sort | uniq -c

# Tıklamadan ilk uzak sese (ms): tetikleyiciye göre örnek sayısı, medyan, p90.
# Hedef: user-join için medyan < 1000
jq -rs '[.[] | select(.type=="entry" and .entry.name=="first-remote-audio"
                      and (.entry.data.timedOut | not)) | .entry.data]
        | group_by(.trigger)[]
        | (map(.sinceRequestMs) | sort) as $v
        | [.[0].trigger, ($v | length),
           $v[(($v | length) * 0.5 | floor)], $v[(($v | length) * 0.9 | floor)]]
        | @tsv' kayit.ndjson

# Odada konuşan varken 15 sn boyunca hiçbir şey duyulmayan katılımlar
jq -r 'select(.type=="entry" and .entry.name=="first-remote-audio" and .entry.data.timedOut)
       | [.sessionId, .entry.data.lobbyId, .entry.data.trigger] | @tsv' kayit.ndjson

# Ses bekçisi: hangi oturumlarda paylaşım kısıldı, en düşük tavan
jq -r 'select(.type=="entry" and .entry.name=="audio-guard")
       | [.sessionId, .entry.data.action, .entry.data.factor, .entry.data.rttMs,
          .entry.data.baselineMs] | @tsv' kayit.ndjson

# ICE kopmaları: katılımdan kaç sn sonra, hangi bağlantıda, toparlandı mı
jq -r 'select(.type=="entry" and .entry.name=="ice-state"
              and (.entry.data.state=="disconnected" or .entry.data.state=="failed"))
       | [.sessionId, .entry.data.connection, .entry.data.state,
          ((.entry.data.sinceConnectMs / 1000) | floor)] | @tsv' kayit.ndjson
```

## 8. Toplama davranışı ve sınırlar

- **Bir oturum = bir oda.** Bir odaya bağlanınca başlar; bilerek ayrılınca ya
  da başka bir odaya geçince biter (yeni oda kendi oturumunu açar). Beklenmedik
  kopma oturumu kapatmaz: LiveKit'in kendi toparlaması aynı oturuma
  `stream-manager/room-reconnected` olarak, aynı lobi için baştan kurulan oda
  ise yine aynı oturuma `session/connect-request` (`new-room` /
  `replaced-room`) olarak düşer.
- Oturum anında kapanır, son parti ardından gönderilir. (v2'de oturum son
  gönderim dönene kadar açık kalıyordu; oda değiştirince yeni oda o kapanmakta
  olan oturuma yazıyor ve kaydının tamamı kayboluyordu.)
- Partiler 20 saniyede bir ve oturum sonunda, **sırayla** gönderilir: sunucu
  en son kaydettiği partinin özetini tuttuğu için son parti hep en son ulaşır.
  Ara gönderim başarısızsa kayıtlar kuyrukta bekler ve sonraki denemede gider;
  oturum sonundaki son parti tekrar denenmez.
- Sınırlar `MEDIA_DIAGNOSTICS_LIMITS` içinde: parti başına 400 kayıt, oturum
  başına 20.000 kayıt, kayıt başına 4 KB veri, kuyrukta en fazla 4.000 kayıt.
  Tavana çarpılırsa `summary.truncated` true olur.
- İstatistik örneği 2 saniyede bir toplanır (`MediaStatsCollector`) ve her biri
  bir `sample` kaydı üretir.

## 9. Sunucu tarafı

- Postgres: `media_diagnostic_sessions` ve `media_diagnostic_batches`. Dosya
  sistemi kullanılmaz; konteyner diski her redeploy'da silinir, Postgres'in
  volume'ü ise kalıcıdır ve zaten yedeklenir.
- `MEDIA_DIAGNOSTICS_ENABLED` (varsayılan `true`) toplamayı kapatır. Kapalıyken
  uç nokta `{"stored":false}` döner, istemci kuyruğunu boşaltır.
- `MEDIA_DIAGNOSTICS_RETENTION_DAYS` (varsayılan `30`) retention süpürmesine
  girer. `0` süresiz saklar.
- İndirme uçları yalnız admin: `GET /admin/media/diagnostics/sessions`,
  `.../sessions/{id}`, `.../sessions/{id}/export`, `.../export`. İki dışa
  aktarma da denetim kaydına yazılır.

## 10. Sürüm geçmişi

| Sürüm | Değişiklik |
|---|---|
| 1 | İlk şema. |
| 2 | Teşhis katmanı. **Yeni özet alanları:** `episodes`, `remotes`, `verdicts`; `outboundVideo.limitationSeconds` / `sourceFps` / `sourceResolutions` / `encodeMsPerFrame` / `framesDroppedPct` / `retransmittedPct`. **Yeni örnek alanları:** giden seste `trackKey` ve `retransmittedPct`, gelen seste `silentPct` / `jitterBufferTargetMs` / `packetsDiscarded`, giden videoda `sourceFps` / `sourceResolution` / `encodeMsPerFrame` / `framesDroppedPct`. **Anlamı değişen:** `concealmentPct` artık DTX sessizliğini saymıyor (bu yüzden sürüm arttı); `problems` etiketleri tek örnekle değil `problemDwellSamples` kadar ardışık örnekle tetikleniyor; `availableOutgoingBitrateBps` 1 Gbps yer tutucusunda `null`; renegotiation'ı aşan pencerelerde oran alanları `null`. **Yeni olay:** `stream-manager/quality-limitation-detected` (kararın dayandığı ölçümler), `stream-manager/room-signal-reconnecting`, `session/lobby-changed` (eskiden yanlışlıkla `room-reconnected`). |
| 3 | Bağlantı yolu. **Yeni problem etiketleri** (sürümü bu artırdı): `relay-path`, `tcp-media`. **Yeni karar:** `fallback-path` (medya TCP ya da TURN yolundan aktı). **Yeni özet alanı:** `icePathSamples`. **Yeni örnek alanı:** `icePaths`. **Yeni olaylar:** `session/connect-request` (yeniden bağlanma isteğinin sonucu: `noop-alive` / `joined-in-flight` / `new-room` / `replaced-room`), `stream-manager/ice-path-changed`, `stream-manager/ice-state` (ICE durum geçişleri), `session/first-remote-audio` (tıklamadan ilk uzak sese), `stream-manager/audio-guard` (ses bekçisi), `stream-manager/downlink-loss` (indirme kaybı teşhisi). **Yeni alan:** `session/connection-state` içinde `expected` (kullanıcının kendi ayrılışı ya da oda değişimi). **Anlamı değişen:** bir oturum artık bir oda: başka odaya geçiş yeni oturum açar, `session/lobby-changed` yazılmaz (v2'de bu olaydan sonra yeni odanın kaydı kayboluyordu). **Sonradan, sürüm artırmadan eklenen olaylar:** `mic-controller/input-device-follow`, `stream-manager/hands-free-output`, `remote-media/output-device-error`, `remote-media/master-limiter`, `remote-media/voice-levelling`, `stream-manager/encoder-fallback`. **Sonradan, sürüm artırmadan eklenen alanlar:** özette `outboundVideo.qp` / `keyFrames` / `pli` ve `inboundVideo.freezeMs` / `frameIntervalStdDevMs` / `hardwareDecoderSamples` / `softwareDecoderSamples`; örnekte giden videoda `qp` / `keyFrames` / `pli` / `nack`, gelen videoda `freezeMs` / `frameIntervalStdDevMs` / `framesDropped` / `hardwareDecoder`. |

Şemayı değiştirirken: alan silmek ya da anlamını değiştirmek sürüm artışı
gerektirir; alan eklemek gerektirmez. `MEDIA_DIAGNOSTICS_SCHEMA_VERSION` ve
`mediadiag.SchemaVersion` birlikte artar, `check-media-diagnostics.cjs` ikisinin
eşitliğini doğrular.
