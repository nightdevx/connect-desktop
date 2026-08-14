# 1:1 arama sistemi — inceleme ve plan

Kapsam: `backend-go/internal/media/livekit` (token, çağrı kaydı, webhook, reconciler)
ve masaüstündeki tüm çağrı yolu (sinyalleşme, oda geçişleri, LiveKit bağlantısı,
arayüz).

## 1. Sistemin bugünkü hali

Bir 1:1 arama, adı `call_<callId>` olan bir LiveKit odasıdır. Lobi makinesi
yeniden kullanılır: `activeLobbyId` bu oda adına set edilir ve aynı bağlantı,
yeniden bağlanma ve medya kodu çalışır.

```
arayan                                    aranan
------                                    ------
POST /livekit/call/initiate
  -> callId, kayıt: caller+callee
  -> sinyal "incoming-call" ------------> callState = incoming, zil sesi
setActiveLobbyId("call_X")
  -> token + LiveKit connect                (henüz odada değil)
  -> mikrofon yayınlanır
                                          POST /livekit/call/accept
     <---------------------------------- sinyal "call-accepted"
callState = active                        setActiveLobbyId("call_X")
                                            -> token + LiveKit connect
```

Backend tarafı sağlam: `callRegistry` iki tarafı kaydeder, token uçları
`MayJoin` ile yetkilendirir (çalarken 2 dk, cevaplandıktan sonra 6 saat),
webhook `call_` odaları için erken döner (lobi state'i yok), reconciler onları
atlar. **Backend'de arama akışını bozan bir kusur bulamadım.** Tespit edilen
dört sorun da istemci tarafında.

## 2. Bulunan sorunlar

### S1 — Her çalışta tüm ekranı kaplayan modal

`CallOverlay` kabuk kökünde `position: fixed; inset: 0; z-index: 999999` ve
`aria-modal="true"` ile çiziliyor. Hem gelen hem giden aramada tüm uygulamayı
kilitliyor: çalarken başka bir sohbete, lobiye veya ayarlara geçilemiyor.

### S2 — Sohbet ekranındaki "aranıyor" sahnesi zaten var ama görünmüyor

`users-direct-messages-panel` giden aramada lobi sahnesini açıyor ve
`enhancedStageParticipantSlots` aranan kişi için soluk, kesikli çerçeveli,
nabız gibi atan bir yer tutucu döşeme (`ct-call-placeholder-pulsing`,
`filter: grayscale(80%) brightness(60%)`) enjekte ediyor. Yani istenen görünüm
kodda mevcut — S1'deki modal onu örtüyor.

### S3 — Lobiler bölümü arama odasını lobi sanıyor

`LobbiesMainPanel` aktif oda katmanını yalnızca `activeLobbyId !== null`
koşuluna bakarak açıyor. Arama sırasında bu değer `call_<id>` olduğu için
Lobiler bölümüne geçildiğinde lobi listesi gizleniyor ve yerine boş bir lobi
odası çiziliyor (`lobbyStateQuery` bu oda için anlamsız).

### S4 — Aramanın başında uzun sessizlik

`stream-manager.connectInternal` içinde sıra şöyle:

```ts
await room.connect(url, token, { autoSubscribe: false });
this.microphoneController.prepareParticipantAudioContext(...);
await this.applyMicrophoneState();   // <-- uzun sürüyor
this.statsCollector?.start();
this.subscribeToExistingTracks();    // <-- bunun arkasında bekliyor
```

`applyMicrophoneState()` cihaz numaralandırması, `getUserMedia`, **iki
`audioWorklet.addModule()`** ve bir **WebAssembly derlemesi** (RNNoise) yapıyor.
`autoSubscribe: false` olduğu için odadaki mevcut ses track'lerine abone olan
tek şey `subscribeToExistingTracks()` ve o, bu işin arkasında `await`
ediliyor. Aranan taraf odaya ikinci giren olduğundan arayanın ses track'i çoktan
oradadır — ama aranan kişi kendi mikrofon zinciri kurulana kadar onu duymaz.
Abone olmak ile yayınlamak birbirinden bağımsız; bu sıralama gereksiz.

### S5 — Arama, karşı tarafın sohbeti dışında hiçbir yerde görünmüyor

`isCallActive` koşulu `callState.peerUser?.userId === selectedUser?.userId`
içeriyor. Görüşme sırasında başka bir kullanıcıya veya bölüme geçildiğinde
arama arayüzü tamamen kayboluyor ve geri dönmenin bir yolu yok — `ongoingCall`
(yeniden katılma bilgisi) hiçbir yerde gösterilmiyor. S1 kaldırılınca bu daha
da göze batar hale gelir.

### S6 — Aramayı kabul etmek karşı tarafın sohbetine götürmüyor

Aranan kişi aramayı nerede olursa olsun kabul edebiliyor, ama sahne yalnızca o
kişinin sohbet ekranında çiziliyor. Kabul sonrası hiçbir yönlendirme yok.

## 3. Plan

| # | Değişiklik | Dosya |
|---|---|---|
| F1 | Modal `CallOverlay` yerine engellemeyen, köşede duran `CallDock` | `parts/CallDock.tsx`, `common.css` |
| F2 | Yer tutucu döşemeye "Aranıyor…" etiketi | `lobby-participant-tile.tsx`, `lobby.css` |
| F3 | Lobiler bölümüne `call_` odalarını `null` olarak geçir | `WorkspaceShell.tsx`, `workspace-main-panel.tsx` |
| F4 | Abone olmayı mikrofon yayınından önce çalıştır | `stream-manager.ts` |
| F5 | Görüşme sürerken kalıcı, tıklanınca sohbete dönen çağrı göstergesi | `CallDock.tsx` |
| F6 | Kabul edince karşı tarafın sohbetine geç | `WorkspaceShell.tsx` |
| F7 | `disconnect()` yarışını kapat (aşağıda S7) | `stream-manager.ts`, `use-workspace-lobby-actions.ts` |

### S7 — Uygulama sırasında bulunan asıl sessizlik nedeni

S4'ü uygularken daha büyük bir kusur çıktı. `leaveActiveLobby` LiveKit
oturumunu `void liveKitSessionRef.current?.disconnect()` ile, **beklemeden**
kapatıyordu. `disconnect()` ise `this.room`'u birkaç `await`in ardından tekrar
tekrar okuyor ve koşulsuz olarak sıfırlıyor.

Sonuç: bir lobideyken gelen aramayı kabul etmek şu sıralamayı üretiyordu.

```
leaveActiveLobby  -> disconnect() başlar (oda A), beklenmez, fonksiyon döner
acceptCall        -> activeLobbyId = call_X
efekt             -> connect() oda B'yi kurar, this.room = B
disconnect() devam -> this.room (artık B) okunur
                   -> B disconnect edilir, this.room = null,
                      remoteMediaHandler dispose, "disconnected" yayılır
```

Yani arama kuruluyor, hemen ardından sessizce yıkılıyordu. Kullanıcı bağlı
görünüyor ama kimseyi duymuyordu; toparlanma yalnızca
`scheduleActiveLobbyReconnect("livekit-disconnected")` zincirinin bir sonraki
denemesiyle, saniyeler sonra geliyordu — ve yarış tekrarlanabiliyordu.
`connectInternal` bu tuzağı zaten biliyor ("Hold the room in a local"); aynı
korumanın `disconnect()` tarafında karşılığı yoktu.

İki yönlü düzeltildi: `disconnect()` kapatacağı odayı girişte sabitliyor, o
odayı her hâlükârda kapatıyor (soket sızmasın), ama paylaşılan durumu
(`this.room`, mikrofon denetleyicisi, yerel ses grafiği, medya haritası)
yalnızca hâlâ o odaya aitse temizliyor. Ayrıca `leaveActiveLobby` artık
`disconnect()`'i bekliyor.

## 4. Ölçüm

S4'ün gerekçesi: `connect()` içinde abone olmayı bekleten mikrofon zincirinin
maliyeti, uygulamanın kendi içinde ölçüldü (sıcak önbellek, bu makine):

```
AudioContext resume                0ms
enumerateDevices                 375ms   10 cihaz
getUserMedia(audio)               73ms
worklet modülü                    14ms
worklet modülü                     2ms
rnnoise.wasm indir + derle        24ms   149 KB
```

Bu makinede ~0,5 sn; soğuk önbellekte, daha çok cihazda veya açılması yavaş bir
Bluetooth/USB mikrofonda belirgin biçimde büyür. Artık odadaki mevcut ses
track'lerine abone olmak bu işin arkasında beklemiyor.

`CallDock`'un geometrisi çalışan uygulamada ölçüldü: 1280×800 penceresinde
320×66 px, görünür alanın **%2**'si, başlık çubuğunun 12 px altında sağ üstte;
ekranın ortasındaki nokta artık dock'a değil uygulamaya ait. Eskisi %100'dü.

## 5. Durum

`pnpm typecheck` + `pnpm build` temiz, `eslint src/renderer` 0 hata,
`go build ./...` ve `go test ./internal/media/livekit/...` geçiyor.

Doğrulanamayan kısım: iki taraflı gerçek bir arama denenemedi — bu makinedeki
her iki geliştirme profilinin de oturumu düşmüş durumda ve elimde giriş bilgisi
yok. Arayüz ölçümleri ve S7'nin sıralama analizi kodun kendisinden; "artık
hemen duyuluyor" iddiası iki istemciyle sınanmalı.
