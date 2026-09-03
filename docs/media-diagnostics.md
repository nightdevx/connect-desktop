# Yayın tanılama kayıtları — şema ve analiz rehberi

Bu belge, yönetim panelinden indirilen `.ndjson` dosyasının tam sözleşmesidir.
Dosyayı bir analize verirken bu belgeyi de ver: alan adları, birimler ve olay
sözlüğü burada tanımlı.

**Şema sürümü: 1.** Her satır kendi sürümünü taşır.

## 1. Dosya biçimi

NDJSON: her satır bağımsız bir JSON nesnesi. İki satır türü var ve `type`
alanıyla ayrılır.

Bir dosya **birden çok oturum** içerebilir. Her oturum bir `session` satırıyla
başlar, ardından o oturuma ait `entry` satırları gelir, sonra bir sonraki
oturumun `session` satırı. Aralık indirmesi böyle çalışır, tek oturum
indirmesinde tek bir blok olur.

```
{"type":"session","schemaVersion":1,"sessionId":"...", ...}
{"type":"entry","sessionId":"...","entry":{...}}
{"type":"entry","sessionId":"...","entry":{...}}
{"type":"session","schemaVersion":1,"sessionId":"...", ...}
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
| `outboundVideo.limitation` | `{none, cpu, bandwidth, other}` örnek sayıları. Tanının merkezi. |
| `inboundVideo.*` | Alınan tarafın aynası. `freezeCountMax` kümülatiftir, oran değil. |
| `inboundAudioConcealmentPct` | Opus'un uydurduğu örnek yüzdesi. %3 üstü duyulur. |
| `inboundAudioJitterMs` | Alınan ses jitter'ı. |
| `packetLossOutboundPct`, `packetLossInboundPct` | Yönlere göre kayıp. |
| `eventCounts` | `"<scope>/<name>"` → sayı. Hangi olayın kaç kez olduğunu tek bakışta verir. |
| `warnings` | Kullanıcıya gösterilen uyarı metni → sayı. |
| `problems` | Bölüm 5. |

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
| `session/connection-state` | `data.state`: connecting/connected/reconnecting/disconnected/closed |
| `session/warning` | Kullanıcının gördüğü uyarı |
| `session/room-reconnected` | Beklenmedik kopma sonrası aynı odaya dönüldü |
| `stream-manager/hardware-svc-probe` | `data.codec`: probe'un donanımda bulduğu codec |
| `stream-manager/publish-screen` | Ekran publish planı: hedef, codec, katman, scalabilityMode |
| `stream-manager/publish-camera` | Kamera publish planı |
| `stream-manager/publish-*-encodings` | Publish sonrası **gerçek** encoder parametreleri ve `negotiatedCodec.sdpFmtpLine`. `mismatch` doluysa istenen ayar uygulanmadı |
| `stream-manager/screen-codec-fallback` | AV1/VP9 yazılıma düştü, H.264'e dönüldü |
| `stream-manager/quality-step-down` | Otomatik kalite düşürme; `from`, `to`, `reason` |
| `stream-manager/track-stream-paused` / `-resumed` | SFU katman duraklatma |
| `stream-manager/replace-screen` | Kesintisiz kaynak/kalite değişimi |
| `stats/media-stats` | Periyodik ölçüm; aşağıda |

### `stats/media-stats` örneğinin `data` alanı

```json
{
  "rttMs": 38,
  "availableOutgoingBitrateBps": 6800000,
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
```

## 8. Toplama davranışı ve sınırlar

- Oturum, bir odaya bağlanınca başlar ve **bilerek** ayrılınca biter. Beklenmedik
  kopma oturumu kapatmaz; yeniden bağlanma aynı oturuma `room-reconnected`
  olarak düşer. Yani bir oturum = bir kesintisiz üyelik.
- Partiler 20 saniyede bir ve oturum sonunda gönderilir. Gönderim başarısızsa
  kayıtlar kuyrukta bekler ve sonraki denemede gider.
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

Şemayı değiştirirken: alan silmek ya da anlamını değiştirmek sürüm artışı
gerektirir; alan eklemek gerektirmez. `MEDIA_DIAGNOSTICS_SCHEMA_VERSION` ve
`mediadiag.SchemaVersion` birlikte artar, `check-media-diagnostics.cjs` ikisinin
eşitliğini doğrular.
