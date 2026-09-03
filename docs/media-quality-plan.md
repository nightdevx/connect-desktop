# Yayın ve ses hattı — kapsamlı denetim ve plan

Kapsam: LiveKit sunucu config'i (`backend-go/deploy/docker-compose.coolify.yml`),
backend token/ICE/müzik botu, Electron main (GPU/WebRTC bayrakları, güç
yönetimi), renderer (yakalama → işleme → publish → subscribe → çizim).
Önceki iki inceleme (`stream-quality.md` Y1–Y10, `call-system-review.md`
S1–S7) tekrar edilmedi; bu belge onların üstüne bakar.

## 0. Uygulama durumu

P1-B dışında planın tamamı uygulandı.

| # | Durum | Not |
|---|---|---|
| B-1 | ✅ | `probeHardwareVideoEncoder` + L1T3 + AV1 ×0.7 / VP9 ×0.85, istatistik korkuluğuyla |
| P1-A | ✅ | VP9 relief silindi, yerine kesintisiz preset step-down |
| P1-B | ⛔ | Atlandı (kullanıcı kararı) |
| P1-C | ✅ | coturn servisi, firewall satırları ve TURN kurulum bölümü kaldırıldı |
| P2-A | ✅ | 96 kbps, tek `SCREEN_AUDIO_PUBLISH_OPTIONS` sabiti |
| P2-B | ✅ | `-fec 1 -packet_loss 5`, testi ile |
| P2-C | ✅ | Windows'ta yalnız encode kapanıyor, decode donanımda kalıyor |
| P2-D | ✅ | `TrackStreamStateChanged` → store → tile overlay |
| P3-A | ✅ | Yerel analyser mikrofon context'ine taşındı |
| P3-B | ✅ | `ActiveSpeakersChanged`'daki boş `updateMediaMap` silindi |
| P3-C | ✅ | Giriş ve çıkışta `communications` cihazı |
| B-2 | 🔶 | Adım 1 (ölçüm) uygulandı: `publish-*-encodings` logu artık `negotiatedCodec.sdpFmtpLine` taşıyor. Adım 2-3 bu ölçüme bağlı, planın kendi kapısı. |
| B-3 | ✅ | Ekran sesinde `red: false` |

Doğrulama: `pnpm typecheck`, `pnpm lint` (0 hata), `pnpm build`, `pnpm check`
(38 self-check), `go build ./...`, `go vet`, `go test ./internal/music/...
./internal/media/...`, `docker compose config` — hepsi geçiyor.

**B-2 için sıradaki adım:** bir ekran paylaşımı başlatıp debug logunda
`publish-screen-encodings` kaydına bakın. `negotiatedCodec.sdpFmtpLine`
`profile-level-id=42…` gösteriyorsa Baseline müzakere ediliyor demektir ve
adım 2 (sunucu `enabled_codecs`) denenebilir. `64…` görüyorsanız iş bitmiş,
adım 2-3 gereksiz.

## 1. Zaten doğru olanlar

Denetlendi, değiştirilmemeli:

**LiveKit sunucu** — ICE mux tek UDP port (7882) + TCP yedeği, `use_external_ip`,
send-side BWE + `allow_pause`, `dynacast_pause_delay: 5s`, Redis ile oda
kalıcılığı, `empty_timeout: 60` / `departure_timeout: 20` (livekit-client'ın
resume denemeleriyle uyumlu), `max_participants: 11`, sabit sürüm pin'i,
webhook imzası. `deploy/verify.sh` zaten `net.core.rmem_max/wmem_max ≥ 16 MB`,
7882/UDP bağlılığı ve `nodeIP`'yi kontrol ediyor.

**Backend** — Token: `canPublishSources` ile kaynak bazlı yetki, 12 saat TTL
(istemci her join'de taze token alıyor, expiry sorun değil). Müzik botu:
48 kHz stereo, libopus 96 kbps VBR, `application audio`, 20 ms frame,
`Stereo: true` publish, `dynaudnorm` ile seviye eşitleme.

**Electron main** — WGC + ZeroHz yakalama, donanım encode/decode açık,
`backgroundThrottling: false`, GPU durumu `gpu-info-update` sonrası loglanıyor,
`powerMonitor.resume` reconnect tetikliyor.

**Renderer / publish** — H.264 (auto) + simulcast, `contentHint` +
`degradationPreference` içerik moduna göre, bitrate gerçek çözünürlüğe
ölçekleniyor, `screenShareEncoding` anahtarları doğru, `getParameters()` ile
publish doğrulaması, kamera ekran paylaşırken 2 katmana iniyor, canlı kalite
değişimi `replaceTrack` ile (kesintisiz). Mikrofon: 48 kHz AudioContext, RNNoise
zinciri önceden ısıtılıyor, tam olarak bir denoiser çalışıyor (tarayıcı ya da
RNNoise), 64 kbps mono + DTX + RED, `stopMicTrackOnMute: false` (PTT gecikmesiz).

**Renderer / subscribe** — `autoSubscribe: false`, ekran paylaşımı opt-in,
`adaptiveStream` + `dynacast`, tile'lar `track.attach()` kullanıyor (adaptive
stream element boyutunu görüyor), PiP elementi 1280×720 boyutunda (180p katmanı
almıyor), deafen abonelikten çıkıyor, WebAudio bus + limiter (200 % güvenli),
`setSinkId` AudioContext üzerinde, istatistikler 2 s'de bir, konuşma tespiti
10 Hz.

**Sonuç:** LiveKit ve backend tarafı büyük ölçüde yerinde. Fark yaratacak
işlerin çoğu istemci tarafında ve altyapıdaki bir gereksiz parçada.

## 2. Bulgular ve plan

Öncelik: **P1** doğrudan kalite/stabilite, **P2** belirgin iyileştirme, **P3**
küçük temizlik. Efor: S (< 1 saat), M (yarım gün), L (1 gün+).

### P1-A — Encoder yetersizliğinde "VP9'a geç" yanlış çare; preset düşür

`stream-manager.ts` `relieveScreenEncoder`: CPU-limited ve yazılım encoder
görülünce 1. adım katman sayısını 2'ye indiriyor, 2. adım codec'i **VP9**'a
çeviriyor. İki sorun:

1. Yazılım VP9 (libvpx), yazılım H.264'ten (OpenH264) piksel başına **daha
   ağır**. CPU zaten yetişmiyorsa VP9 durumu kötüleştirir. Yalnızca Intel
   iGPU'larda (VP9 donanım encode) işe yarayabilir; NVIDIA/AMD'de yoktur.
2. Her adım `unpublish → publish` yapıyor: izleyen herkes yeni SID için
   yeniden abone oluyor, görüntü kararıyor.

Bu arada donanım encoder'lı ama CPU-limited durum ve `bandwidth` durumu
yalnızca uyarı veriyor; otomatik hiçbir şey yapılmıyor.

**Değişiklik:** Relief mekanizmasını sil, yerine tek callback:
`onEncoderOverloaded(reason: "cpu" | "bandwidth")`. `use-screen-share-controls`
zaten kesintisiz canlı kalite değişimi yapıyor (`applyLiveScreenShareChange`,
re-capture + `replaceTrack`); callback bir alt preset'e geçirir:

```
ultra (2160p30) → sharp (1440p60) → high (1080p60) → balanced (1080p30) → smooth (720p60) → dur
```

Bir adım sonrası `limitedTicks` sıfırlanır; sonraki adım için yeniden ~8 s
sürekli limitasyon gerekir. Toast: "İşlemci yetişemedi, yayın kalitesi
Dengeli'ye düşürüldü." / "Yükleme hızı yetmedi, …". Kullanıcının seçtiği
preset güncellenir (`liveShareRef`, `selectedScreenShareQuality`), yani menü
gerçeği gösterir.

Silinecek: `screenEncoderRelief`, `reliefInFlight`, `SCREEN_ENCODER_RELIEF_*`,
`resolveScreenCodec`, `unpublishScreenTracks`, `maxEncodingsOverride` yolu.

Dosyalar: `stream-manager.ts`, `types.ts` (callback), `use-livekit-session.ts`
(callback'i store/event'e bağla), `use-screen-share-controls.ts`
(`stepDownQuality`), `screen-share/constants.ts` (`nextLowerQuality`).
Efor: **M**. Self-check: `check-video-layers.cjs`'e `nextLowerQuality` vakası.

### P1-B — Sesli oturumda güç yönetimi yok

`powerSaveBlocker` hiç kullanılmıyor. Windows modern standby / uyku bir laptopu
sesli sohbetin ortasında askıya alır; soket ölür, reconnect zinciri döner,
karşı taraf kişiyi düşmüş görür. Uzun bir izleme oturumunda ekran uyur.

**Değişiklik:** Renderer'dan main'e tek IPC: `desktop:media-activity`
`{ voice: boolean; video: boolean }`.

- `voice` (LiveKit `connected | reconnecting`) → `powerSaveBlocker.start("prevent-app-suspension")`
- `video` (ekran/kamera yayınlıyor **ya da** birinin ekranını izliyor) →
  `powerSaveBlocker.start("prevent-display-sleep")`

Main iki blocker id'si tutar, durum değişince `stop`. Renderer tarafı
`use-livekit-session` (voice) ve shell'de mevcut `screenEnabled` /
`cameraEnabled` / `watchedScreen` (video) üzerinden tek effect.

Dosyalar: `main/ipc/*.ts` (yeni handler), `preload/index.ts`,
`shared/desktop-api-types.ts`, `use-livekit-session.ts`. Efor: **S**.

### P1-C — coturn sıfır katma değer sağlıyor; kaldır

Production `.env`'de `TURN_URLS`, `TURN_SHARED_SECRET`, `STUN_URLS` **yok**
(anahtarlar hiç tanımlı değil). coturn container'ı ve 3478 + 49160–49200/udp
portları boşa açık. Daha önemlisi, ayarlansa bile faydası yok:

- LiveKit ICE-lite çalışır; istemci sunucunun public adresine doğrudan
  gönderir. Simetrik NAT dahil her NAT tipinde çalışır. STUN gereksiz (sunucu
  zaten JoinResponse'ta kendi STUN listesini gönderiyor).
- UDP tamamen kapalıysa `turn:…?transport=tcp` de TCP'dir; 7881/TCP yedeğiyle
  **aynı** head-of-line davranışı. Kazanç yok.
- Kurumsal ağ senaryosu TURNS 443/TCP ister; Coolify proxy 443'ü tutuyor,
  `--no-tls` coturn bunu zaten sunmuyor.

**Değişiklik:** `docker-compose.coolify.yml`'den `coturn` servisini ve
firewall/README'deki TURN bölümlerini kaldır. Backend ICE kodu
(`ice_servers.go` + test) zararsız, env boşken hiçbir şey üretmiyor; dursun.
İstenirse ayrı bir temizlik.

Dosyalar: `deploy/docker-compose.coolify.yml`, `deploy/README.md`,
`deploy/verify.sh` (TURN kontrolü). Efor: **S**.

### P2-A — Ekran paylaşımı sesi 64 kbps; müzik/oyun için düşük

`AudioPresets.musicStereo` = 64 kbps stereo. 128 kbps'lik `musicHighQualityStereo`
ile fark duyulur; ekran videosunun 5 Mbps'i yanında 0.06 Mbps fark (RED ile
0.13). Yorumdaki "sabit maliyet" gerekçesi 64 ile 96–128 arasında anlamlı
değil.

**Değişiklik:** İki call site'taki (`applyScreenStateInternal`,
`setScreenAudioTrackInternal`) kopya publish seçeneklerini tek sabite çek:

```ts
const SCREEN_AUDIO_PUBLISH_OPTIONS: TrackPublishOptions = {
  dtx: false,
  red: false,
  forceStereo: true,
  audioPreset: { maxBitrate: 96_000 },
};
```

96 kbps müzik botuyla aynı bütçe. `red: false` gerekçesi B-3'te. Efor: **S**.

### P2-B — Müzik botunda Opus in-band FEC kapalı

`pipeline.go` libopus argümanlarında `-fec` yok. SFU paketleri olduğu gibi
iletir; abone tarafı Chromium `useinbandfec=1` ile abone olduğu için FEC
verisini kayıpta otomatik kullanır. Kayıplı Wi-Fi'da müzik çıtırtısını
belirgin azaltır, maliyet ~%10–15 bitrate.

**Değişiklik:** `encodeArgs()` içinde `-application audio` sonrasına
`-fec 1 -packet_loss 5` (iki yol da aynı yardımcıdan geçiyor, tek yer).
Efor: **S**. `pipeline_test.go`'ya `encodeArgs` çıktısının `-fec` içerdiğini
doğrulayan tek bir vaka eklenir.

### P2-C — Donanım hızlandırma kapalıyken decode da kapanıyor

`media-engine-flags.ts` `applySoftwareMediaSwitches` Windows'ta
`disable-webrtc-hw-decoding` de ekliyor. Kullanıcı bozuk encoder sürücüsü
yüzünden anahtarı kapatınca 4K bir yayını **izlemek** de yazılım decode'a
düşüyor. Encode ve decode ayrı MediaFoundation yolları; biri bozukken diğeri
neredeyse hiç bozulmaz.

**Değişiklik:** Windows dalında yalnızca `disable-webrtc-hw-encoding` +
gpu-memory-buffer anahtarları; decode açık kalsın. Linux dalı olduğu gibi
(orada workaround). Efor: **S**. Ayar etiketini "donanım kodlama" olarak
netleştir.

### P2-D — SFU bir katmanı duraklattığında izleyici neden donduğunu bilmiyor

`allow_pause: true` ile SFU, izleyicinin indirme bandı yetmeyince video
katmanını duraklatıyor. livekit-client bunu `RoomEvent.TrackStreamStateChanged`
ile bildiriyor; uygulama dinlemiyor. İzleyici donmuş kareye bakıyor, "yayın
kötü" diye publisher'a şikâyet ediyor; oysa sorun kendi indirme bandı.

**Değişiklik:** `room-event-manager.ts`'e event, `screen-watchers-store`
benzeri küçük bir store (`${identity}:${source} → paused`), tile'da tek satır
overlay: "İndirme hızın yetmedi, yayın duraklatıldı". Efor: **S**.

### P3-A — Dört ayrı AudioContext; yerel analyser gereksiz üçüncüsü

`stream-manager.ts` `updateLocalAudioSource` sırf AnalyserNode için
`new AudioContext()` (sampleRate belirtilmemiş) açıyor. Mikrofon zinciri
(`AudioContextManager`, 48 kHz) zaten var. Her context ayrı render thread +
OS çıkış stream'i.

**Değişiklik:** `this.microphoneController.getOrCreateAudioContext()` kullan;
`this.audioContext` alanı ve `cleanupLocalAudioMonitoring`'deki `close`
gider (source disconnect kalır). Efor: **S**.

### P3-B — `ActiveSpeakersChanged` her tetikte media map'i yeniden kuruyor

`handleActiveSpeakersChanged` → `updateMediaMap()`. Map'te konuşma alanı yok;
karşılaştırma her seferinde "değişmedi" diyor. Konuşma sürerken ~300 ms'de bir
boş yürüyüş. `updateMediaMap()` çağrısını sil. Efor: **S**.

### P3-C — Windows'ta cihaz seçilmemişse "communications" cihazını tercih et (deneysel)

Windows'ta "varsayılan" ve "varsayılan iletişim" cihazı ayrıdır; hoparlörlü
monitör + kulaklık kombinasyonunda uygulama sesi monitöre basar, mikrofon
yanlış cihazdan açılır. Chromium `enumerateDevices` listesinde
`deviceId: "communications"` pseudo-cihazını verir.

**Değişiklik:** `DeviceResolver` null tercihte `"communications"` varsa onu
döndürsün; `RemoteMediaHandler.setAudioOutputDevice(null)` aynı mantık.
`AudioContext.setSinkId("communications")` Windows'ta doğrulanmalı; çalışmazsa
yalnızca giriş tarafı uygulanır. Efor: **S**, önce test.

## 3. Daha az bant genişliğiyle daha iyi kalite

Soru: aynı ya da daha iyi görüntüyü daha az bitle taşımak mümkün mü? Evet,
ama tek bir kaldıraçla: **codec**. Preset bitrate'lerini düşürmek kaliteyi
düşürür; simulcast'i kaldırmak zayıf izleyiciyi durdurur; `pixelDensity`'yi
kısmak netliği alır. Bunlar tasarruf değil, takas. Gerçek tasarruf,
piksel başına daha az bit harcayan bir kodlayıcıya geçmek; ve bugün uygulama
bunu iki yerde kaçırıyor.

### Bugünkü durum

1. `auto` her zaman H.264 seçiyor ve LiveKit sunucusuyla **Constrained
   Baseline** (`42e01f`) müzakere ediliyor. Baseline, H.264'ün en verimsiz
   profili (CABAC yok, 8×8 dönüşüm yok). Aynı kalite için High profile'dan
   %10–15 fazla bit ister; metin içerikte fark daha büyük.
2. VP9/AV1 seçilirse `resolveScalabilityMode` `L3T3_KEY` (3 uzamsal katman)
   istiyor. Chromium'un Windows'taki donanım encoder'ları (MediaFoundation:
   NVENC, QuickSync, AMF) **uzamsal SVC desteklemez**, yalnız zamansal (`L1Tx`).
   Uzamsal mod istenince Chromium sessizce yazılım encoder'a (libaom/libvpx)
   düşer; bu, video-profiles.ts'in "VP9/AV1 yazılımda kodlanır" gözleminin
   asıl nedeni. Donanım AV1/VP9 encoder'ı olan makinelerde bile kullanılmıyor.
   (Not: livekit-client ekran paylaşımı için bunu zaten `L1T3`'e zorluyor ve
   `contentHint`'i `motion`'a çeviriyor; kamera için `L3T3_KEY` kalıyor.)
3. Uygulama açık `videoEncoding` verdiği için livekit-client'ın SVC codec'ler
   için uyguladığı bitrate çarpanı (AV1 ×0.7, VP9 ×0.85) **uygulanmıyor**;
   AV1 seçilse bile H.264 tavanıyla yayınlanıyor, yani tasarruf sıfır.

### B-1 — `auto`: donanım doğrulamalı AV1 → VP9 → H.264, yalnız zamansal SVC — P1, M

Ekran paylaşımı için codec, oturum başında `mediaCapabilities` ile
**donanım doğrulanarak** seçilir:

```ts
const probeHardwareEncoder = async (codec: "av1" | "vp9"): Promise<boolean> => {
  const info = await navigator.mediaCapabilities.encodingInfo({
    type: "webrtc",
    video: {
      contentType: codec === "av1" ? "video/AV1" : "video/VP9",
      width: 1920,
      height: 1080,
      bitrate: 5_000_000,
      framerate: 60,
      scalabilityMode: "L1T3",
    },
  });
  return info.supported && info.powerEfficient;
};
```

`powerEfficient` Chromium'un "bu formatı ve bu SVC modunu donanımda
kodlarım" cevabı; tahmin değil. Sıra: AV1 → VP9 → mevcut mantık (H.264 /
VP8). Sonuç oturum boyunca önbellekte (`warmUp` içinde, mikrofon ısıtmasıyla
birlikte).

`buildVideoPublishPlan` değişiklikleri:

- SVC codec'te `scalabilityMode: "L1T3"` sabit; `resolveScalabilityMode`
  silinir (uzamsal katman = Windows'ta yazılım).
- Tavan çarpanı uygulamada: AV1 `maxBitrate × 0.7`, VP9 `× 0.85`
  (`describeEncodingMismatch`'in 0.6 toleransı bunu zaten öngörüyor).
- `backupCodec: true` kalır (decode edemeyen abone için VP8 yedeği; tüm filo
  Electron olduğundan pratikte hiç tetiklenmez).
- **Kamera H.264 simulcast'te kalır.** L1T3'te uzamsal merdiven yok; 10 kişilik
  odada her izleyici her kamerayı tam çözünürlükte çekerdi (10 × ~0.5 Mbps).
  Kamera küçük ve ucuz; ladder orada değerli.

İstatistik korkuluğu: ekran `outbound.codec` AV1/VP9 iken iki tik üst üste
`hardwareEncoder === false` görülürse bir kez H.264'e republish + toast,
oturum boyunca bir daha denenmez. Probe yanılırsa (sürücü, Chromium sürümü)
yazılım encoder'da takılı kalınmaz.

**Beklenen sayılar (1080p60 ekran paylaşımı, eşit kalite):**

| Codec | Publisher uplink | Tam boy izleyici | Grid tile izleyici |
|---|---|---|---|
| H.264 simulcast (bugün) | 5.0 + 1.77 = **6.77 Mbps** | 5.0 Mbps | 1.77 Mbps (yarım katman) |
| VP9 L1T3 (Intel Xe/Arc) | **4.25 Mbps** (tek katman) | 4.25 Mbps | ~1.7 Mbps (T0, 15 fps) |
| AV1 L1T3 (RTX 40/50, Arc, RX 7000) | **3.5 Mbps** | 3.5 Mbps | ~1.4 Mbps (T0) |

Uplink'te %37–48, tam boy izleyicide %15–30 azalma. Aynı tavanla kalınırsa
fark kalite olarak geri gelir.

**Akıcılık kazancı (bitrate'ten bağımsız):** H.264 simulcast'te zamansal katman
yok; SFU, indirme bandı yetmeyen izleyici için ya alt çözünürlüğe iner ya da
`allow_pause` ile videoyu **duraklatır**. L1T3'te SFU 60 → 30 → 15 fps
kademeleriyle bant genişliğine uyar; görüntü donmak yerine yavaşlar.

**Riskler:** (a) İzleyici tarafında AV1 decode: RTX 30+/Intel 11. nesil+/RX
6000+ donanımda, diğerlerinde dav1d yazılımda — 1080p60 modern 4 çekirdekte
rahat, 2160p30 eski dizüstülerde ağır. Codec menüsü H.264'e sabitlemeye
zaten izin veriyor; `ultra` preset'i için H.264'te kalmak bir seçenek.
(b) SVC ekran paylaşımında livekit-client `contentHint`'i `motion`'a
zorluyor; `degradationPreference` uygulamadan geldiği için slayt modu
çözünürlüğü korumaya devam eder, yalnız encoder'ın içerik ipucu kaybolur.
Donanım encoder'ları bu ipucunu zaten kullanmıyor.

Dosyalar: `video-profiles.ts` (probe, plan), `stream-manager.ts` (`warmUp`,
`resolvedScreenCodec`, korkuluk), `check-publish-plan.cjs` (L1T3 + çarpan
vakası). Efor **M**.

### B-2 — H.264 High profile — P2, S (önce ölç)

Donanım AV1/VP9'u olmayan çoğunluk (GTX / RTX 20-30, eski Intel, AMD RX
5000/6000) H.264'te kalır; onların tek kazancı profil. Adımlar:

1. **Ölç:** `verifyPublishedEncodings` içinde
   `sender.getParameters().codecs[0].sdpFmtpLine` logla. `profile-level-id=42…`
   çıkarsa devam.
2. Sunucu: `room.enabled_codecs` içinde H.264 için High fmtp girişi
   (`profile-level-id=640032` benzeri; LiveKit'in varsayılan listesine ekleme
   mi, yerine mi geçtiği doğrulanmalı).
3. İstemci: livekit-client transceiver'ı `addTransceiver` ile kuruyor ve codec
   sırasını Chromium'a bırakıyor; Chromium'un sırası Baseline önce. Küçük bir
   shim: `RTCPeerConnection.prototype.addTransceiver` sarılır, video
   transceiver'da `setCodecPreferences` ile `profile-level-id=64…` +
   `packetization-mode=1` girişleri öne alınır. Yalnız `auto`/`h264` seçiliyken.

Kazanç %10–15 aynı kalitede; metin içerikte biraz daha fazla. Tüm izleyiciler
Electron olduğundan decode riski yok. Adım 2 doğrulanamazsa vazgeç; shim tek
başına işe yaramaz.

### B-3 — Ekran paylaşımı sesinde RED kapalı — P3, S

RED her paketi bir önceki paketle birlikte taşır: sabit stereo akışta bant
genişliği **2×** (96 kbps → ~192). Chromium'un Opus encoder'ı bildirilen
kayba göre in-band FEC'i zaten uyarlamalı açıyor; müzik için RED'in ek
katkısı çok küçük. P2-A'daki sabitte `red: false`. Publisher ve her izleyici
için −96 kbps sabit.

### Fayda vermeyecek şeyler

- **Preset bitrate'lerini indirmek.** Tavanlar zaten BWE ile aşağı çekiliyor;
  tavanı düşürmek yalnız iyi uplink'te kaliteyi kısar.
- **Grid tile için çeyrek katman eklemek (1080p'de).** İzleyici indirmesi
  1.77 → 0.63 Mbps olur ama publisher'a üçüncü encoder + 0.63 Mbps uplink.
  Y8'de bilinçli verilmiş karar; B-1 sonrası (uzamsal katman yok) konu kapanır.
- **H.264'e zamansal katman (`L1T2`).** Chromium destekler ama LiveKit
  sunucusunun H.264 için zamansal katman seçimi yaptığı doğrulanamadı;
  belirsiz kazanç için kodlayıcı değişikliği yapılmaz.
- **Mikrofonu 64 → 32 kbps.** Konuşmacı başına ~30 kbps; DTX zaten sessizde
  sıfıra yakın. Kayıplı ağda 64 + RED'in direnci daha değerli.

## 4. Özet tablo

| # | Konu | Katman | Öncelik | Efor | Ana dosyalar |
|---|---|---|---|---|---|
| P1-A | VP9 relief → preset step-down (kesintisiz) | renderer | P1 | M | `stream-manager.ts`, `use-screen-share-controls.ts` |
| P1-B | powerSaveBlocker (uyku / ekran) | main | P1 | S | `main/ipc`, `preload`, `use-livekit-session.ts` |
| P1-C | coturn kaldır | deploy | P1 | S | `docker-compose.coolify.yml`, `README.md`, `verify.sh` |
| B-1 | Donanım doğrulamalı AV1/VP9 + L1T3 + bitrate çarpanı | renderer | P1 | M | `video-profiles.ts`, `stream-manager.ts`, `check-publish-plan.cjs` |
| B-2 | H.264 High profile (önce ölç) | renderer + deploy | P2 | S | `stream-manager.ts`, `docker-compose.coolify.yml` |
| B-3 | Ekran sesinde RED kapalı | renderer | P3 | S | `stream-manager.ts` |
| P2-A | Ekran sesi 96 kbps + tek sabit | renderer | P2 | S | `stream-manager.ts` |
| P2-B | Müzik botu Opus FEC | backend | P2 | S | `music/pipeline.go` |
| P2-C | HW kapalıyken decode açık kalsın | main | P2 | S | `media-engine-flags.ts` |
| P2-D | Duraklatılan katman overlay'i | renderer | P2 | S | `room-event-manager.ts`, tile |
| P3-A | Yerel analyser context'i birleştir | renderer | P3 | S | `stream-manager.ts` |
| P3-B | Speaker event'inde map yürüyüşü | renderer | P3 | S | `stream-manager.ts` |
| P3-C | Windows "communications" cihazı | renderer | P3 | S | `device-resolver.ts`, `remote-media-handler.ts` |

Toplam: P1+P2 ≈ 2 gün (B-1 dahil), P3 ≈ 2 saat.

Sıra önerisi: B-1 → P1-A (ikisi de `stream-manager.ts` publish yolunu
değiştiriyor, üst üste değil arka arkaya) → P1-B → P1-C → P2'ler → P3'ler.

## 5. Bilerek değiştirilmeyenler

- **H.264 Constrained Baseline.** Chromium/LiveKit SDP'de ilk payload
  `42e01f`; High profile seçilemiyor. 1080p60 metin için kalite tavanı bu.
  Tek alternatif VP9/AV1 donanım encode (Intel Arc, RTX 40 AV1) — `auto`
  zaten donanım varsa H.264 seçiyor; kullanıcı isterse codec menüsünden
  değiştirebiliyor. Kod değişikliği yok.
- **LiveKit `network_mode: host`.** Docker bridge NAT'ı UDP için ek maliyet
  ama ~20 Mbps toplam trafikte ölçülmez; Coolify proxy'nin 7880'e erişimini
  bozar. Değmez.
- **`departure_timeout` 20 → 30 s.** Resume penceresini uzatır (roster'da
  düşüp gelme azalır) ama gerçekten kopan kişi roster'da 10 s daha kalır.
  Mevcut değer dengeli.
- **`adaptiveStream.pauseVideoInBackground`.** Pencere gizlenince SFU videoyu
  duraklatıyor; bant genişliği tasarrufu doğru davranış. Geri gelince ~0.5 s
  keyframe beklemesi kabul edilebilir.
- **`rtc.packet_buffer_size`.** 500 paket, 14 Mbps'te ~340 ms NACK penceresi;
  40 ms RTT için fazlasıyla yeter.
- **Mikrofon 64 kbps + RED.** Konuşma için bol; `red` kayıp direncini
  ikiye katlıyor, VDS'te maliyeti önemsiz.

## 6. Doğrulama

Her madde için:

- **B-1:** RTX 40 / Intel Arc makinede 1080p60 paylaş; panelde
  `codec: AV1 · donanım · 1 katman`, `bitrateBps` ≤ 3.5 Mbps; izleyende
  `chrome://webrtc-internals` `inbound-rtp` `decoderImplementation` ve fps.
  GTX / RTX 20-30 makinede probe `false` dönmeli, H.264 kalmalı
  (`[Media] video_encode` logu + panel). İzleyicide clumsy ile bant kısıldığında
  fps 60 → 30 → 15 inmeli, görüntü **duraklamamalı**. Korkuluk: sürücüde
  AV1 MFT devre dışı bırakılıp probe'un yalan söylediği simüle edilir
  (`--disable-features=MediaFoundationAV1Encoding` benzeri), iki tik sonra
  H.264'e döndüğü ve toast'un çıktığı görülür.
- **B-2:** Adım 1 logu `profile-level-id=64…` gösterene kadar shim/sunucu
  değişikliği "uygulandı" sayılmaz. Aynı preset ve içerikle
  `bytesSent` oranı Baseline'a göre %10+ düşmeli ya da aynı bitrate'te
  `qpSum/framesEncoded` düşmeli.
- **B-3:** İzleyende ekran sesi `inbound-rtp` `bytesReceived` oranı ~96 kbps
  (RED'liyken ~190); %5 kayıpta çıtırtı belirgin artmamalı (FEC devrede).

- `pnpm typecheck && pnpm lint && pnpm check` (P1-A için `check-video-layers`
  vakası eklenir), `go build ./... && go test ./internal/music/...` (P2-B).
- **P1-A:** Ayarlar → Uygulama'dan donanım hızlandırmayı kapat, 1440p60 preset ile
  paylaş; ~8 s sonra toast + panelde çözünürlük/fps bir alt preset'e inmeli,
  izleyen tarafta **kararma olmamalı** (SID değişmiyor). Menüde yeni preset
  görünmeli.
- **P1-B:** Sesli odadayken `powercfg /requests` çıktısında Electron süreci
  `SYSTEM` (ve yayın/izleme sırasında `DISPLAY`) altında listelenmeli; odadan
  çıkınca kaybolmalı.
- **P1-C:** Deploy sonrası `sudo bash deploy/verify.sh` — 3478 kapalı, 7882/udp
  bağlı, `nodeIP` public; iki istemciyle görüşme `chrome://webrtc-internals`'ta
  `selected candidate pair` = `host/prflx` UDP.
- **P2-A/B:** İzleyen tarafta `inbound-rtp` audio `bytesReceived` oranı ~96 kbps;
  Wi-Fi'da paket kaybı simülasyonuyla (`netsh`/clumsy %5) müzik botu
  çıtırtısı FEC öncesine göre azalmalı.
- **P2-C:** HW kapalıyken 4K yayın izlerken `inbound-rtp`
  `decoderImplementation` MediaFoundation kalmalı.
- **P2-D:** İzleyicide bant genişliğini kıs (clumsy), tile'da overlay çıkmalı,
  bant açılınca kalkmalı.
