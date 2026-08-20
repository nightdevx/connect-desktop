# Lobiler Arayüzü — İnceleme ve Refactor Planı

> **Durum (2026-08-20): tüm fazlar uygulandı.** Uygulama sırasında gelen dört ek
> istek de bu plana dahil edildi — bkz. §8. Doğrulama çıktıları §7'de.

Kapsam: `src/renderer/src/features/workspace/components/lobby/**`,
`src/renderer/src/styles/modules/features/lobby.css`, ve lobi yüzeyine dokunan
paylaşılan kurallar (`workspace.css` aktif satır override'ları, `chat.css` çağrı
sahnesi, `responsive.css` lobi blokları).
Tarih: 2026-08-20. Önceki çalışmalar: `docs/ui-refactor-plan.md` (2026-08-14),
`docs/settings-ui-plan.md` (2026-08-19).

Backend, IPC, LiveKit ve medya mantığı **dokunulmaz**. Bu plan yalnızca sunum
katmanını (JSX yapısı + CSS + ölçüm sözleşmesi) değiştirir.

Yedek: `backup/lobby-ui-2026-08-20/` (değişen 16 dosyanın uygulama öncesi hali).

---

## 1. Özet

Lobiler bölümü işlevsel olarak zengin ama **üç ayrı yerde aynı boşluğu ayrı ayrı
hesaplıyor** ve **oda kimliğini hiçbir yerde göstermiyor**. Şikâyet edilen
"hizalama/boşluk bozukluğu" tek tek piksel hatası değil, üç yapısal sebebin
semptomu:

1. **Sahne ölçüsünün iki kaynağı var.** `lobby-stage-layout.ts` sabit sayılarla
   (28/28/76/96 px) boşluk varsayıyor, `lobby.css` aynı boşluğu farklı
   değerlerle (18/18/66/94 px) çiziyor. İkisi hiçbir kırılma noktasında
   uyuşmuyor → karo boyutu her zaman yanlış hesaplanıyor (§3.1).
2. **Araç çubuğu ve sohbet düğmesi sahnenin üstünde yüzüyor**, bu yüzden sahne
   grid'i onlara `padding` ile yer açmak zorunda. Bu "clearance" matematiği
   duyarlı kırılmalarda güncellenmiyor ve odak modunda kontrolün araç
   çubuğunun altında kalmasına yol açan hataların kaynağı (§3.2).
3. **Aktif odanın adı ekranda hiç yazmıyor.** Ana panelde oda başlığı yok;
   kullanıcı hangi odada olduğunu yalnızca kenar çubuğundaki vurgudan anlıyor.
   Mesaj odasında (metin odası) sahne hiç çizilmediği için tek bir kimlik
   göstergesi bile kalmıyor (§3.3).

Buna ek olarak ölçülmüş **18 hizalama/boşluk/erişilebilirlik hatası** var
(§3). Hepsi kod üzerinden doğrulandı, tahmin değil.

Hedef: tek ölçüm kaynağı, akışa alınmış (yüzmeyen) sahne iskeleti, oda kimlik
çubuğu, kenar çubuğunda gerçek hiyerarşi, ve token'a oturan bir boşluk ritmi.

---

## 2. Mevcut durum haritası

| Yüzey | Dosya | Satır | Notlar |
|---|---|---:|---|
| Kenar çubuğu listesi | `lobbies-sidebar-panel.tsx` | 982 | Lobi satırı + üye listesi + ayar/silme modalleri |
| Ana panel kabuğu | `lobbies-main-panel.tsx` | 768 | İki katman (seçim / oda), sahne + sohbet grid'i |
| Oda seçim ekranı | `parts/LobbySelectionScreen.tsx` | 68 | Hero + oda listesi |
| Sahne | `parts/LobbyStageView.tsx` | 208 | Grid / odak düzeni / şerit |
| Araç çubuğu | `parts/LobbyActionToolbar.tsx` | 162 | 6 kontrol, yüzen hap |
| Katılımcı karosu | `lobby-participant-tile.tsx` | 587 | Video, rozetler, bayraklar |
| Sohbet | `lobby-chat-panel.tsx` | 752 | Arama + akış + besteci |
| Sahne ölçüsü | `lobby-stage-layout.ts` | 315 | ResizeObserver + kolon/karo hesabı |
| Sağ tık menüleri | `parts/ParticipantContextMenu.tsx`, `parts/LobbyMemberContextMenu.tsx` | 372 + 288 | antd Dropdown |
| Ses emote | `parts/SoundEmoteMenu.tsx` | 360 | Popover + yükleme modali |
| Stil | `styles/modules/features/lobby.css` | 1348 | Tek lobi stil dosyası |

Aynı sahne bileşenleri **birebir çağrı ekranında da** kullanılıyor
(`users-direct-messages-panel.tsx:823`), bu yüzden sahne iskeletindeki her
değişiklik iki yüzeyi birden ilgilendiriyor.

---

## 3. Tespitler (doğrulanmış)

### 3.1 Sahne ölçüsünün iki kaynağı — karolar her zaman yanlış boyutlanıyor

`lobby-stage-layout.ts`:

```ts
const STAGE_HORIZONTAL_PADDING_PX = 28;
const STAGE_INNER_HORIZONTAL_PADDING_PX = 28;   // toplam 56px varsayılıyor
const STAGE_VERTICAL_PADDING_TOP_PX = 76;
const STAGE_VERTICAL_PADDING_BOTTOM_PX = 96;    // toplam 172px varsayılıyor
```

`lobby.css`:

```css
--ct-stage-clear-top: calc(16px + 36px + 14px);              /* 66px */
--ct-stage-clear-bottom: calc(24px + var(--ct-control-lg) + 20px + 2px); /* 94px */
padding: var(--ct-stage-clear-top) 18px var(--ct-stage-clear-bottom);   /* yatay 36px */
```

- Yatay: hook 56px düşüyor, CSS 36px harcıyor. **20px fark.**
- Dikey: hook 172px düşüyor, CSS 160px harcıyor. **12px fark.**
- Üstelik `box-sizing: border-box` olduğu için hook'un yazdığı
  `--ct-stage-max-width` (= karo genişliği × kolon + boşluklar) grid'in `width`
  değerine gidiyor ve **padding bu genişliğin içinden yeniden düşülüyor**:
  parçalar hesaplanan boyuta hiçbir zaman ulaşamıyor.
- `@media (max-width: 900px)` yatay padding'i 10px'e indiriyor, hook hâlâ 56px
  varsayıyor → dar pencerede karolar olabileceğinden **36px dar**.

### 3.2 Yüzen araç çubuğu → uydurma "clearance" matematiği

- `.ct-lobby-stage-actions` `position: absolute; bottom: 24px; z-index: 50`,
  `.ct-lobby-chat-toggle.in-stage` `absolute right-4 top-4 z-30`. Sahne grid'i
  ikisine `padding` ile yer açıyor.
- `@media (max-width: 760px)` araç çubuğunu `bottom: 8px`'e, butonları
  `control-md`'ye (40px) indiriyor ama `--ct-stage-clear-bottom` güncellenmiyor:
  gerçek üst kenar 70px, ayrılan yer 94px → **24px ölü boşluk.**
- `.ct-lobby-stage-grid.focused-layout.full-stage-mode` kuralı, "göster/gizle"
  hapının araç çubuğunun altında kalmasını engellemek için var olan bir
  telafi — akışa alınmış bir araç çubuğunda bu kurala hiç gerek yok.
- Araç çubuğu boşta `opacity: 0.72`; tam opaklığa yalnızca `.ct-lobby-room-card`
  hover'ında çıkıyor. İmleç kenar çubuğundayken mikrofon durumu sönük.

### 3.3 Odanın kimliği ekranda yok

- `workspace-main-panel.tsx:290` — `hideWorkspaceIntro` aktif lobi varken genel
  başlığı gizliyor, yerine **hiçbir şey koymuyor**. Oda adı, kilit durumu,
  kişi sayısı, bağlantı durumu ana panelde yazmıyor.
- Aktif lobi yokken ise ters durum: generic "Lobiler / Hoş geldin…" başlığı
  (≈70px) **ve** seçim ekranının "Lobi Odası Seç" hero'su alt alta duruyor —
  aynı şeyi iki kez söyleyen iki başlık.
- Metin odasında sahne `<section>`'ı hiç render edilmiyor, dolayısıyla oda adına
  dair tek bir piksel bile kalmıyor.

### 3.4 Odak düzeni gereksiz yere dar

`.ct-lobby-focused-slot { width: min(100%, 1180px) }` ama ebeveyni
`width: min(100%, var(--ct-stage-max-width))`, ve o değişken **grid düzeni için**
hesaplanıyor. 6 katılımcı / 816px kullanılabilir genişlikte hesap 2 kolon ×
301px = 612px veriyor → odaklanan video 816px yerine **612px** ile sınırlanıyor
(%25 kayıp). Şerit (`.ct-lobby-participant-rail`) de aynı tavana takılıyor.

### 3.5 Kenar çubuğu: hiyerarşi yok, ağırlık fazla

- Lobi satırı `.ct-list-item.clickable.active` ile **tamamen ters çevriliyor**
  (koyu temada bütün blok beyaz olur). İçindeki üye satırlarının okunur kalması
  için `workspace.css` + `lobby.css` içinde **6 ayrı telafi kuralı** yazılmış
  (`color-mix(--ct-text-inverse …)`). Bir satırın seçili olduğunu söylemek için
  ödenen bedel bu.
- Her üye satırı kendi kenarlığı ve zemini olan bir kart (`border` +
  `background: var(--ct-alpha-02)`), yüksekliği 38px. 280px'lik bir sütunda 10
  üyeli oda = 380px kutu yığını.
- Girinti kazara: gövde 12px + satır 12px = lobi adı panel kenarından 24px'te,
  üye avatarı 8px + 1px kenarlık ile 33px'te. **9px'lik girinti** tasarım
  ölçeğinde (4/8/12/16) olmayan bir sayı.
- "Lobide kimse yok." her boş sesli oda için yazılıyor; 10 odalı bir sunucuda
  10 satır gürültü. "Sohbet kanalı" metni ise yanındaki mesaj ikonunun
  tekrarı.
- Erişilebilirlik: `<li role="option">` içinde `<button>`'lar ve iç içe bir
  `<ul>` var. `role="option"` etkileşimli çocuk barındıramaz; ekran okuyucu
  için liste kutusu bozuk.
- `.ct-list-item` `justify-between gap-3` uyguluyor ama tek çocuğu `w-full` —
  iki kural da ölü.

### 3.6 Seçim ekranı ritmi

- Hero `py-10` (40px) + kap `gap-6` (24px) + oda bloğu `pt-6` (24px) = paragraf
  ile "AKTİF ODALAR" başlığı arasında **88px** boşluk; hemen altındaki oda
  kartları ise `.ct-list`'in `gap-0.5`'i ile **2px** aralıklı. Aynı kartın
  içinde 88px ve 2px.
- Oda listesi tek sütun; 1200px genişlikteki panelde her kart kilometrelerce
  uzayıp sağda boş alan bırakıyor.
- Hero ikonu `.ct-list-state-icon` (liste durum ikonu) sınıfını ödünç alıyor.

### 3.7 Katılımcı karosu

- **Çakışma:** `.ct-lobby-tile-watchers` (top/right 12px, z-20) ile
  `.ct-lobby-tile-fullscreen-btn` (top 12px, right 12px, z-30) aynı noktada.
  Ekran paylaşımı karosuna hover yapıldığında tam ekran düğmesi izleyici
  rozetinin **üstüne** çiziliyor.
- Kaçış değerleri dağınık: rozetler 12px, düğmeler 12px, PiP `20px + control-sm`,
  tam ekran çıkış düğmesi 24px/44px.
- Token dışı değerler: `rounded-[20px]` (token: `--ct-radius-xl` = 20px),
  `font-size: 10.5px` ×2 (ölçek: 10 / 11), `text-[44px]`.
- `.ct-lobby-tile-userline span` CSS'te tanımlı, JSX'te hiç render edilmiyor.

### 3.8 Sohbet sütunu üç ayrı iç boşluk

`.ct-chat-search` `px-4` (16px), `.ct-chat-messages` `p-4` (16px),
`.ct-chat-composer` `px-3` (12px) — tek bir dikey sütunda üç farklı sol kenar.
Ayrıca hata `Alert`'leri `.ct-chat-search` sınıfını yalnızca padding için
kullanıyor (anlamsal yanlış kullanım).

### 3.9 CSS tekrarları

- `.ct-lobby-stage-hint` ve `.ct-lobby-chat-toggle` birebir aynı hap stilini iki
  ayrı blokta tanımlıyor.
- `.ct-lobby-participant-rail` iki ayrı blokta tanımlı (biri düzen, biri
  scrollbar değişkenleri).
- `.ct-lobby-room-grid-v2` `border-radius: 18px` — token değil.

### 3.10 Şifre modali diğer modallerden farklı

`lobby-password-prompt-modal.tsx` uygulamadaki tek modal ki `rootClassName="ct-modal"`
kullanmıyor; bunun yerine `okButtonProps.style`, `cancelButtonProps.style` ve
`styles.mask` ile aynı işi inline tekrar ediyor.

---

## 4. Tasarım kararları

### 4.1 Sahne iskeleti akışa alınıyor

```
.ct-lobby-room-grid-v2            grid: "head head" / "stage chat"
├── .ct-lobby-room-header         (yeni) oda kimliği — iki sütunu da kapsar
├── .ct-lobby-stage-panel         flex column
│   ├── .ct-lobby-stage-area      flex:1, min-h:0, padding burada  ← ÖLÇÜM NOKTASI
│   │   └── .ct-lobby-stage-grid  karolar (padding yok, width yok)
│   └── .ct-lobby-stage-actions   akışta, ortalanmış hap
└── .ct-lobby-chat-slot           sohbet
```

Kazanç: `--ct-stage-clear-top/bottom`, `.full-stage-mode` padding telafisi,
araç çubuğu z-index yarışı ve `opacity: .72` numarası **tamamen siliniyor**.

### 4.2 Ölçümün tek kaynağı CSS olur

`useLobbyStageLayout` artık **padding'i olmayan** `.ct-lobby-stage-area`'yı
gözlüyor ve `ResizeObserver`'ın `contentRect`'ini doğrudan kullanılabilir alan
kabul ediyor. Sabit 28/28/76/96 kaldırılıyor. `--ct-stage-max-width` ve
`resolveMaxWidth()` siliniyor (geri besleme döngüsünün ve §3.1'deki çifte
düşmenin kaynağı). Hook yalnızca üç değişken yazıyor:
`--ct-stage-columns`, `--ct-stage-gap`, `--ct-stage-tile-width`.

Sonuç: karo boyutu hesaplandığı gibi çiziliyor; odak düzeni sahnenin tamamını
alıyor (§3.4 çözülür).

### 4.3 Oda kimlik çubuğu (yeni bileşen)

`parts/LobbyRoomHeader.tsx` — sesli ve metin odası için tek başlık:

```
#  Genel Sohbet   🔒 Kilitli   • 4 kişi   ● Bağlı        [Sohbet ▸ 3]
```

- Sol: `#` künye, oda adı (truncate), kilit/metin rozetleri, kişi sayısı,
  bağlantı noktası (yalnız sesli odada).
- Sağ: sohbeti aç/kapat düğmesi + okunmamış sayacı (yüzen hap kaldırılıyor).
- Yükseklik 52px, alt kenarlık, `padding-inline: 16px`.

Ayrıca `workspace-main-panel.tsx`'te `hideWorkspaceIntro` lobiler bölümünün
tamamı için açılıyor: seçim ekranı da kendi başlığını taşıyacak.

### 4.4 Kenar çubuğu yeniden yazılıyor

`.ct-list-item` paylaşımlı sınıfından çıkılıp lobiye ait sınıflar kullanılıyor
(`.ct-lobby-row`, `.ct-lobby-group`, `.ct-lobby-member`). Böylece:

- Aktif satır **ters çevrilmiyor**; sol kenarda 3px vurgu çubuğu + hafif zemin.
  §3.5'teki 6 telafi kuralı siliniyor.
- İki durum ayrılıyor: **bağlı olduğun oda** (yeşil nokta) ve **açık olan oda**
  (seçili zemin). Bugün ikisi de aynı vurguyu alıyor.
- Üye satırı kartlıktan çıkıyor: kenarlıksız, 28px yüksekliğinde, hover'da
  yıkama. Üye listesi 10px girinti + 1px kılavuz çizgisiyle gruplanıyor.
- Boş oda metni yalnızca **açık olan** odada gösteriliyor; "Sohbet kanalı"
  satırı kaldırılıyor (ikon + tooltip zaten söylüyor).
- İşaretleme düzeltiliyor: lobi satırı gerçek `<button>`, üyeler ayrı `<ul>`.
  `role="option"` içinde etkileşimli çocuk kalmıyor.

### 4.5 Seçim ekranı

Ortalanmış hero yerine sol hizalı başlık + **otomatik dolan kart ızgarası**
(`repeat(auto-fill, minmax(240px, 1fr))`, 12px boşluk). Hero yalnızca hiç oda
yokken çıkıyor. Kart: künye + ad + tür rozeti + kişi sayısı + eylem düğmesi.
Seçim katmanı ile oda katmanı **aynı dış geometriyi** (kenarlık + `radius-xl` +
aynı zemin) paylaşıyor, böylece iki katman arasındaki geçiş yerinde duruyor.

### 4.6 Araç çubuğu gruplanıyor

`[mikrofon][kulaklık] │ [ekran][kamera] │ [emote] │ [ayrıl]` — ayırıcılar
`.ct-lobby-action-divider`. "Ayrıl" artık kameranın hemen yanında değil.

### 4.7 Boşluk ritmi tek yerde

lobby.css başında lobi kapsamlı token'lar:

```css
--ct-lobby-bar-h: 52px;     /* oda başlığı */
--ct-lobby-pad: 16px;       /* sahne / başlık iç boşluğu */
--ct-lobby-tile-inset: 10px;/* karo üstü kroma kaçışı */
--ct-lobby-row-gap: 2px;    /* kenar çubuğu satır aralığı */
```

Tüm sabitler bunlara veya mevcut `--ct-*` token'larına bağlanıyor; `18px`,
`10.5px`, `rounded-[20px]` gibi serbest değerler kaldırılıyor.

---

## 5. Faz planı

Hepsi uygulandı.

| Faz | İçerik | Dosyalar |
|---|---|---|
| 0 | Yedek | `backup/lobby-ui-2026-08-20/` |
| 1 | Sahne iskeleti akışa alınır, `stage-area` eklenir | `lobbies-main-panel.tsx`, `users-direct-messages-panel.tsx`, `lobby.css`, `responsive.css` |
| 2 | Ölçüm tek kaynağa iner | `lobby-stage-layout.ts`, `lobby.css` |
| 3 | Oda kimlik çubuğu | `parts/LobbyRoomHeader.tsx` (yeni), `lobbies-main-panel.tsx`, `workspace-main-panel.tsx`, `lobby.css` |
| 4 | Kenar çubuğu yeniden yazımı | `lobbies-sidebar-panel.tsx`, `lobby.css`, `workspace.css` |
| 5 | Seçim ekranı | `parts/LobbySelectionScreen.tsx`, `lobby.css` |
| 6 | Araç çubuğu gruplama | `parts/LobbyActionToolbar.tsx`, `lobby.css` |
| 7 | Karo rozet/düğme çakışması ve kaçışlar | `lobby-participant-tile.tsx`, `lobby.css` |
| 8 | Sohbet sütunu hizası | `lobby-chat-panel.tsx`, `lobby.css` |
| 9 | Modal tutarlılığı, ölü CSS, duyarlı kurallar | `lobby-password-prompt-modal.tsx`, `lobby.css`, `responsive.css` |

---

## 6. Riskler

- **Paylaşılan sahne:** Faz 1–2 birebir çağrı ekranını da değiştiriyor. Aynı
  iskelet oraya da uygulanıyor; `.ct-call-stage` zaten `flex-col`, çakışma yok.
- **`.ct-list-item` bırakılıyor:** lobi satırı artık bu sınıfı kullanmadığı için
  `workspace.css`'teki `.ct-list-item.clickable.active .ct-lobby-*` kuralları
  ölüyor ve siliniyor. Arkadaşlar listesi bu sınıfı kullanmaya devam ediyor,
  etkilenmiyor.
- **Davranış değişmiyor:** katılma/ayrılma, moderasyon, sürükle-bırak, sesli
  emote, ekran izleme akışlarının hiçbirinin mantığı değiştirilmiyor.

---

## 7. Doğrulama

Uygulama sonrası çalıştırıldı, hepsi temiz:

| Kontrol | Sonuç |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | hatasız |
| `npx eslint src` | hatasız |
| `npx vite build` | başarılı (tüm `@apply` sınıfları geçerli) |
| `node scripts/check-css-classes.cjs` | 620 tanım / 607 kullanım, iki yön de temiz |
| `node scripts/check-design-tokens.cjs` | 114 token, hepsi referanslı |
| `node scripts/check-architecture.cjs` | 256 modül, 7 kural |
| `node scripts/check-view-preferences.cjs` | 3 anahtar |
| `check-member-move`, `check-screen-watchers`, `check-speaking-state`, `check-screen-subscription` | geçti |

Ayrıca yeni düzen, derlenmiş CSS ile birebir aynı işaretleme üzerinde Electron'da
offscreen render edilip görsel olarak kontrol edildi: oda görünümü (koyu/açık),
seçim ekranı, 880px dar pencere ve yayın modali.

Elle denenmesi gerekenler: 1 / 4 / 12 katılımcı, ekran paylaşımı + kamera aynı
anda, odak modu, şerit gizli/görünür, metin odası, mikrofon/kulaklığa sağ tık
(cihaz menüsü), 760px altı genişlik.

---

## 8. Uygulama sırasında gelen ek istekler

| İstek | Yapılan |
|---|---|
| "`#` yerine sesli lobide ses ikonu, mesaj odasında sohbet ikonu" | Üç yüzeyde de künye ikonu oda TÜRÜNÜ gösteriyor (`SoundOutlined` / `MessageOutlined`): kenar çubuğu satırı, oda başlığı, seçim kartı. Ayrıca ayrı duran "mesaj odası" rozeti kaldırıldı — aynı şeyi iki kez söylüyordu. |
| "Mikrofon/kulaklığa sağ tıklayınca menü sol en altta açılıyor" | `AudioDeviceDropdown` CSS anchor positioning'i bırakıp menüyü imlecin olduğu yere açıyor. Kök neden: `anchor-name` her tür için sabitti ve aynı anda ekranda 6 kopya vardı; birden fazla element aynı adı taşıyınca çapa hiçbirine bağlanmıyor, popover da top-layer olduğu için pencerenin sol alt köşesine düşüyordu. Menü artık kenarlara göre kırpılıyor ve alta yer yoksa yukarı açılıyor. |
| "Kamera/yayın modallerini de düzenle" | İkisi de `rootClassName="ct-modal"` alıyor (kendi inline maskeleri ve başlık stilleri silindi). Kamera önizlemesi 16:9 sabit orana geçti (akış gelince kutu zıplamıyor). |
| "Kamera açma modalını da düzenle" | Yayın modaliyle aynı iki adımlı dile getirildi. 1) Önizleme — büyük 16:9 kutu, yanında yenile düğmesi; `<video>` artık her durumda **monte kalıyor**, boş/hata durumu üstüne çiziliyor (öğeyi söküp takmak, akışı ref ile alan kancanın elindeki elemanı yok ediyordu). 2) Nasıl gönderilsin — **çözünürlük (720p/1080p) ve kare hızı (24/30) artık modalin içinde**; eskiden Ayarlar → Kamera'daydı, yani ayarın etkisini görebildiğin tek an, ayara ulaşamadığın andı. Seçim aynı kalıcı tercihi yazıyor ve önizleme yeni kısıtlarla yeniden başlıyor (`use-camera-controls` içinde, uygulanmış tercihi tutan ref ile korumalı). Alt barda "Kamera hazır • 1080p • 30 FPS" özeti + İptal/Paylaş. |
| "Yayın modalini tamamen refactor et" | Yeniden yazıldı: iki sütun yerine iki adım. 1) Ne paylaşılacak — Monitör/Pencere segmenti + sayaç + yenile düğmesi, ve 16:9 büyük önizleme kartlarından oluşan ızgara (seçili kartta çerçeve + tik). 2) Nasıl gönderilsin — 5 kalite kartı yan yana (her biri ~Mbps maliyetiyle, bütçeyi aşan uyarı renginde), içerik türü ve yayın sesi kutuları. Alt barda "ne başlatılacak" özeti + İptal/Başlat. "Kaynakları Yenile" listenin yanına taşındı. |
| "Ekran/pencere önizlemeleri daha büyük olsun" | Kart ızgarası `minmax(292px, 1fr)`, modal genişliği 1000px, liste yüksekliği 420px. |
| "Katılımcı kartlarındaki profil resimleri büyük olsun" | Karo avatarı 64→96→**120px** (kompakt 40→64px), karo daraldıkça 104 / 88 / 68 / 52px'e inen dört kademeli container query ile. Avatar artık alt bilgi şeridinin üstünde kalan alana ortalanıyor. |
| "Lobideyken konuşan kullanıcıların profil resimleri yeşil yansın (kenar çubuğu)" | Yeni `speaking-store` (screen-watchers deseninin aynısı): oturum kancası, ölçülen sesi ve sunucunun konuşmacı listesini sahnenin kullandığı kuralla birleştirip yayınlıyor. Kenar çubuğunda yalnızca `LobbyMemberAvatar` abone oluyor — konuşma saniyede birkaç kez değiştiği için tüm listeyi değil, sadece 22px'lik daireyi yeniden çiziyor. Halka `box-shadow` ile çiziliyor, böylece avatar boyutu titremiyor. |
| "Profil kartlarını tamamen refactor et — daha detaylı, hoş, güzel" | Popover'ın iç dolgusu sıfırlandı, kapak görseli karta kenardan kenara oturuyor (altında okunabilirlik için gradyan perde). Avatar 88→96px, köşesinde **durum noktası** (dizinde kayıtlı kişiler için). İsim artık avatarın **yanında**; altında kopyalanabilir `@kullanıcı` düğmesi. Rozetler (Yönetici/Üye/Arkadaş/İstek gönderildi) ve tek satır "Katılım" yerine **istatistik kutuları**: Katılım tarihi, üyelik süresi ("2 yıl 5 ay"), durum. Yükleme durumu artık spinner değil, bitmiş düzenin iskeleti — popover açılırken zıplamıyor. Boş kapak gradyanı yüzeye karıştırıldı; eskiden koyu temada kartın üçte birini kaplayan beyaza yakın bir bant çiziyordu. |
| "Sol alttaki kullanıcı adına basınca kendi profil kartı açılsın" | Hızlı kontrol dokundaki kimlik bloğu artık `<button>` ve `UserProfileCardPopover` ile sarılı (`userId = currentUserId`). Kart zaten "kendin" durumunu biliyordu — "Sen" rozeti var, Arkadaş Ekle ve hızlı mesaj kutusu gizli — yeni bir varyant gerekmedi. Popover'a `placement` desteği eklendi ve burada `topLeft` kullanılıyor: dok pencerenin en altına sabit, kartın altta yeri yok. |
| "Susturma kalıcı olsun, ses 0 da susturma sayılsın, ikonlar turuncu olsun" | Kalıcılık zaten vardı (`ct.settings.participant-audio`, kullanıcı kimliğine göre, lobiden bağımsız, oturum kurulurken yeniden uygulanıyor) — eksik olan üç şeydi. 1) Tek doğru kaynak `isRemoteParticipantMuted(preference)` = `muted \|\| volumePercent === 0`; ses grafiği zaten 0'ı sessizlik olarak işliyordu, sadece arayüz `muted` bayrağına bakıyordu. Karo, kenar çubuğu satırı ve iki sağ tık menüsü artık bunu okuyor. 2) `setMuted(false)` %0'daki birini açarken sesi de 100'e alıyor; yoksa "Sesi Aç" hiçbir şey duyurmuyordu ve menü yine "Sesi Aç" diyordu. 3) Susturulmuş kişinin mikrofon ikonu **turuncu** (`--ct-warning`) — yöneticinin susturmasının kırmızısından ve kişinin kendi kapattığı mikrofonun grisinden ayrı. Kenar çubuğu menüsündeki ses bloğundaki `lobby.id === activeLobbyId` koşulu da kaldırıldı: tercih kişiye bağlı ve kalıcı olduğu için başka lobideki turuncu satırın geri açma yolu da olmalı. |
