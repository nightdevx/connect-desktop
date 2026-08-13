# Connect Desktop — Arayüz Refactor Planı

Kapsam: `src/renderer/**` (Electron renderer). Backend, IPC, LiveKit mantığı **dokunulmaz**.
Tarih: 2026-08-14

---

## 1. Özet

Uygulama görsel olarak "dağınık" görünüyor çünkü tek bir tasarım kaynağı yok. Aynı butonu
**dört ayrı katman** birden boyuyor:

| Katman | Nerede | Hacim |
|---|---|---|
| CSS modülleri (`@apply` + ham CSS) | `src/renderer/src/styles/modules/**` | 3.752 satır |
| Tailwind utility class'ları | JSX içinde | dağınık |
| Inline `style={{}}` | 35 dosya | **≥733 obje** |
| Ant Design (ConfigProvider + prop + `modalRender`) | `main.tsx` + bileşenler | 28 dosya |

Sonuç: 297 adet `!important`, 6 adet birebir çakışan CSS kuralı, ve aynı sütunda 4 farklı
sol kenar hizası. "Hizalama bozuk" şikâyeti bunun semptomu — tek tek piksel düzeltmek
sorunu çözmez, kaynak katmanı birleştirmek çözer.

---

## 2. Tespitler

### 2.1 Tasarım token katmanı yok

`tailwind.config.cjs` neredeyse boş:

```js
theme: { extend: { fontFamily: { sans: ["Inter", ...] } } }
```

- `Inter` hiçbir yerde yüklenmiyor. `base.css:3` `Space Grotesk` diyor, `main.tsx:40`
  antd token'ında yine `Space Grotesk` var. **Üç ayrı font kaynağı, biri ölü.**
- Spacing / radius / font-size / color ölçeği tanımlı değil → her bileşen kendi sayısını uyduruyor.

Kod tabanında fiilen kullanılan ölçekler:

| Eksen | Bulunan değerler |
|---|---|
| Radius | 4, 6, 7, 8, 10, 12, 14, 16, 18, 20, 24px + `rounded-lg/xl/2xl/3xl/full` |
| Font-size | 10, 10.5, 11, 12, 13, 14, 15, 16, 17, 20, 24, 44px |
| Padding | 2, 4, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24px |
| Beyaz alfa | 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.14, 0.15, 0.16, 0.18, 0.2, 0.24, 0.25, 0.3, 0.32, 0.35, 0.4, 0.45, 0.5, 0.55, 0.65, 0.75 |

`base.css` içinde `--ct-*` değişkenleri **var** ama TSX'te kullanılmıyor: sabit hex sayımı
`#ffffff` ×132, `#f5f5f5` ×32, `#ef4444` ×22, `#a855f7` ×19, `#8f8f8f` ×10 …

### 2.2 Birebir çakışan CSS kuralları

Aynı base selector iki ayrı dosyada tanımlı — hangisinin kazandığı `global.css` import
sırasına bağlı (`theme.css` en sonda, o yüzden hep o kazanıyor):

| Selector | Dosya A | Dosya B | Fark |
|---|---|---|---|
| `.ct-rail` | `workspace.css:6` (`gap-2 p-2`) | `theme.css:6` (`gap-4 py-4 px-2`) | boşluk |
| `.ct-btn-primary` | `ui-elements.css:52` (düz beyaz) | `theme.css:266` (gradient) | görünüm |
| `.ct-main-panel` | `layout.css:105` | `lobby.css` altındaki override'lar | grid |
| `.ct-sidebar` | `workspace.css:35` | `responsive.css:36` | konum |
| `.ct-rejoin-banner` | `chat.css:240` | `chat.css:261` | aynı dosyada 2× |
| `.ct-banner-rejoin-btn` | `chat.css:290` | `chat.css:321` | aynı dosyada 2× |
| `.ct-list-item.clickable` | `ui-elements.css:151` | `theme.css:154` (`!important`) | hover |

### 2.3 Ölü CSS

Doğrulandı — TSX'te **hiç** kullanılmıyor:

- `.ct-rail-button` + `:hover` + `.active` (yerine `.ct-rail-button-premium` geçmiş)
- `.ct-quick-controls`, `.compact`, `.expanded` (yerine `.ct-quick-idle`)
- `.ct-chat-user-header` base (yalnız `-premium/-left/-main` kullanılıyor)
- `.ct-lobby-room-grid` (yerine `-v2`)
- `.ct-orb`, `.ct-icon-button`, `.ct-btn-warn`, `.ct-list-action`, `.ct-audio-device-item`
- `responsive.css` içindeki `.ct-lobby-inline-audio-controls`, `.ct-settings-readonly-grid`,
  `.ct-audio-connection-metrics` media kuralları — hedef sınıflar yok, ölü

Ayrıca depoda duran yedekler: `global.bak.css` (166 KB), `styles/global_backup.css` (80 KB).

### 2.4 Hizalama kusurları (asıl şikâyet)

**a) Sol kenar — tek sütunda 4 farklı hiza**

`.ct-sidebar-body` `p-3` = 12px iç boşluk veriyor, sonra her çocuk kendi padding'ini ekliyor:

| Öğe | Kaynak | Efektif sol kenar |
|---|---|---|
| Presence seçici | `users-sidebar-panel.tsx:72` inline `12px 16px` | 12 + 16 = **28px** |
| Arama kutusu | `users-sidebar-panel.tsx:99` inline `12px 16px` | **28px** |
| Filtre segmenti | `users-sidebar-panel.tsx:116` `px-4` | **28px** |
| Kullanıcı satırı | `users-sidebar-panel.tsx:175` inline `margin 2px 8px` + `padding 10px 16px` | 12 + 8 + 16 = **36px** |
| Lobi satırı | `lobbies-sidebar-panel.tsx:242` inline `margin 4px 8px` + `padding 12px 16px` | **36px**, üstelik dikey margin 2 yerine 4 |

Yani avatar sütunu, üstündeki arama kutusuyla **8px kayık**. Kullanıcı listesi ile lobi
listesi ise birbirine göre **2px dikey ritim farkı** taşıyor.

**b) Üst krom iki kat, marka üç kez**

`.ct-window-titlebar` (40px) + `.ct-app-header` (`min-h-16` = 64px) = içerikten önce **104px**.
İkisi de "Connect" yazıyor, ikisi de "Topluluk Ses Alanı" kicker'ı taşıyor
(`App.tsx:106`, `App.tsx:110`, `App.tsx:160-161`), ve rail üçüncü kez "CT" logosu gösteriyor
(`workspace-rail.tsx:28`).

**c) Rail optik olarak merkezde değil**

Sütun 76px (`workspace.css:2`), buton 54px (`theme.css:64`) → yatay boşluk 11px.
Aktif göstergesi `left: -8px` (`theme.css:43`) ile wrapper'ın dışına taşıyor ama wrapper
`w-full` olduğu için gösterge panel kenarına değmiyor, havada duruyor.

**d) Kontrol boyutları tek ölçekte değil**

| Sınıf | Boyut | İçindeki ikon |
|---|---|---|
| `.ct-window-control` | 24px | lucide 14 |
| `.ct-pap-close` | 28px | — |
| `.ct-sidebar-header-action` | 32px | lucide 14 |
| `.ct-user-popup-close` | 32px | — |
| `.ct-lobby-stage-icon-action` | 36px | — |
| `.ct-quick-icon-button` | 40px | lucide 14 |
| `.ct-lobby-action-btn` | 48px | antd (varsayılan 16) |
| `.ct-rail-button-premium` | 54px | antd 20 |

7 farklı buton boyutu, ikon/kutu oranı her birinde başka → aynı satırdaki ikonlar
farklı optik ağırlıkta görünüyor.

**e) İki ikon kütüphanesi karışık**

`lucide-react` (5 dosya, stroke tabanlı, 24px viewBox) + `@ant-design/icons` (28 dosya,
filled, 1024 viewBox). `workspace-sidebar.tsx` ikisini **aynı dosyada** kullanıyor.
Baseline ve çizgi kalınlığı uyuşmuyor.

**f) Avatar ölçeği yok**

`.ct-user-avatar` 36px, `.lg` 44px, `.sm` 24px, lobi tile avatarı 80px
(`lobby.css:428`), ayarlar avatarı 96px (`settings.css:155`), DM header'ı kendi inline
boyutunu veriyor. Ayrıca `users-sidebar-panel.tsx:213` sınıfın verdiği 36px'i inline
36px ile tekrar yazıyor.

**g) Liste durum geçişinde zıplama**

`.ct-list-state` `py-12 px-6` (`ui-elements.css:166`), liste öğesi ise `py-2.5 px-4`.
"Yükleniyor" → "liste" geçişinde panel yüksekliği sıçrıyor.

**h) Sohbet balonu**

`.ct-chat-bubble` `width: min(78%, 620px)` + `min-width: min(220px, 100%)`
(`chat.css:159-165`) → "ok" gibi kısa bir cevap 220px genişliğinde boş kutu olarak çiziliyor.

### 2.5 Bileşen düzeyi sorunlar

- **Runtime `<style>` enjeksiyonu** — 3 bileşen `<style>{`@keyframes ...`}</style>` basıyor:
  `admin-dashboard.tsx:524`, `CallOverlay.tsx:37`, `users-sidebar-panel.tsx:56`.
  Her mount'ta DOM'a yeniden giriyor; `animations.css` zaten var.
- **4 farklı modal görünümü** — antd `Modal` + `modalRender` (`workspace-sidebar.tsx:607`),
  `.ct-user-popup`, `.ct-screen-share-modal`, `.ct-participant-context-menu`.
- **2 farklı switch** — el yapımı `.ct-settings-switch` (`settings.css:241`, 45 satır)
  *ve* antd `Switch` (6 yerde inline `style={{background}}` ile).
- **Sınıfın yaptığını inline tekrar etme** — `.ct-settings-switch-item` zaten
  `flex items-center justify-between` yapıyor; her çağrı yerinde bu üçü inline yazılmış
  (`settings-application.tsx:456` ve devamı).
- **App.tsx offline kartı** — her Tailwind class'ının yanına birebir eşdeğeri inline
  yazılmış (`App.tsx:236-345`): ~110 satır, ~25 satır olabilir. Ayrıca hover efekti
  `onMouseEnter`/`onMouseLeave` ile elle yapılmış (`App.tsx:335-342`) — `:hover` var.
- **Admin KPI kartları** — grid yerine `flex: 1 1 0px; min-width: 180px`
  (`admin-dashboard.tsx:164`) → son satırdaki kartlar farklı genişlikte kalıyor.
- **Erişilebilirlik** — kullanıcı/lobi listeleri tıklanabilir `<li>` ama `role`, `tabIndex`
  veya klavye işleyicisi yok (`users-sidebar-panel.tsx:201`, `lobbies-sidebar-panel.tsx:239`).
  Inline stil verilen input'lar `.ct-input:focus` odak halkasını kaybediyor.

### 2.6 Responsive

Pencere min boyutu 720×480 (`src/main/index.ts:268`). `responsive.css` 980/900/760
kırılımlarını hedefliyor ama içindeki 3 kural artık var olmayan sınıflara bakıyor (bkz. 2.3).
760px altı için kural var, 720px min genişlikte devreye giriyor — test edilmemiş görünüyor.

---

## 3. Hedef mimari

Tek kaynak: **Tailwind theme + CSS değişkenleri**. Sıra:

```
tailwind.config.cjs  ──► tasarım token'ları (spacing, radius, renk, tipografi, gölge)
        │
        ├─► base.css      ──► aynı token'ları :root CSS değişkeni olarak yayınlar
        ├─► antd ConfigProvider ──► aynı token'ları antd'ye besler (main.tsx)
        └─► modules/*.css ──► sadece kompozisyon; ham sayı yok, hep token
```

Kural: **JSX'te inline `style` yalnızca gerçekten dinamik değer için**
(ör. ses seviyesi yüzdesi, canlı video boyutu). Statik görünüm asla inline değil.

### 3.1 Token ölçeği (öneri)

```
spacing   : 4 / 8 / 12 / 16 / 24 / 32 / 48        (4px tabanlı, 6 adım)
radius    : sm 6 · md 10 · lg 14 · xl 20 · full
font-size : xs 11 · sm 12 · base 13 · md 15 · lg 18 · xl 22
control   : xs 24 · sm 32 · md 40 · lg 48         (4 boy, hepsi 8'in katı)
icon      : xs 14 · sm 16 · md 18 · lg 20         (kontrol boyuna bağlı)
avatar    : xs 24 · sm 32 · md 40 · lg 64 · xl 96
surface   : 0 #040404 · 1 #090909 · 2 #101010 · 3 #181818   (mevcut, korunur)
alpha     : 02 / 04 / 08 / 12 / 20 / 32 / 50 / 70   (8 adım, 26 yerine)
```

Sidebar ritmi: **tek gutter = 12px**. Panel `p-3`, çocuklar padding **eklemez**,
liste öğesi `margin-inline: 0` + `padding: 8px 12px`. Böylece arama kutusu, filtre ve
avatar sütunu tek dikey çizgide.

---

## 4. Faz planı

Her faz kendi başına derlenip çalışır; ara commit atılabilir.

### Faz 0 — Temizlik (risk: yok)

- `global.bak.css`, `styles/global_backup.css` sil (246 KB ölü dosya).
- 2.3'teki ölü selector'ları sil.
- 2.2'deki 6 çakışan kuralı tek tanıma indir (kazanan sürümü koru, diğerini sil).
- `responsive.css` içindeki ölü media kurallarını sil.

**Kabul:** `pnpm build` geçer, görsel fark yok (silinenler zaten uygulanmıyordu).

### Faz 1 — Token katmanı (risk: düşük)

- `tailwind.config.cjs` → 3.1'deki ölçek `theme.extend` içine.
- `base.css` → aynı değerleri `--ct-*` olarak yayınla; mevcut değişken adları korunur.
- `main.tsx` antd `ConfigProvider` → sabitler yerine token'lardan besle,
  `borderRadius: 12` → `radius.md`, font tek kaynağa (`Space Grotesk`) bağlansın.
- `tailwind.config.cjs` içindeki ölü `Inter` referansını kaldır.

**Kabul:** Hiçbir bileşen değişmedi, uygulama aynı görünüyor; token'lar kullanılabilir.

### Faz 2 — Kabuk & hizalama (risk: orta — görsel değişim burada)

Dosyalar: `App.tsx`, `layout.css`, `workspace.css`, `workspace-rail.tsx`, `theme.css`

- Titlebar + app-header **birleştir**: tek 48px başlık çubuğu. Marka bir kez; sürüm ve
  güncelleme rozetleri sağda. Kazanç: **56px dikey alan**.
- Rail: sütun 76 → **72px**, buton 54 → **48px** (control.lg), ikon 20 → 18px.
  Aktif göstergesi wrapper'ın sol kenarına yapışsın (`left: 0`, wrapper `relative`).
- `.ct-workspace-shell` grid: `72px 280px minmax(0,1fr)`.
- `.ct-rail` çift tanımını `workspace.css`'te tek yerde topla.

**Kabul:** Üst krom 104 → 48px; rail göstergesi panel kenarına değiyor; 3 marka → 1.

### Faz 3 — Sidebar ritmi (risk: orta — asıl hizalama düzeltmesi)

Dosyalar: `users-sidebar-panel.tsx`, `lobbies-sidebar-panel.tsx`, `settings-sidebar-tabs.tsx`,
`workspace.css`, `ui-elements.css`

- Tüm inline padding/margin'leri kaldır; `.ct-sidebar-body` tek gutter (12px) versin.
- `.ct-list-item`: `margin-inline: 0`, `padding: 8px 12px`, `border-radius: radius.sm`.
- Kullanıcı ve lobi satırları **aynı** dikey ritme (`gap: 2px`) otursun.
- `.ct-list-state` padding'i liste ritmine yaklaştır (`py-8`), durum geçişindeki zıplama bitsin.
- Okunmamış vurgusu: `borderLeft: 3px` yerine iç `box-shadow: inset 3px 0` → satır genişliği kaymaz.
- `<li>` → `role="option"` + `tabIndex={0}` + `onKeyDown` (Enter/Space).

**Kabul:** Sidebar'da arama kutusu, filtre ve avatar sütunu tek dikey çizgide;
liste ↔ boş durum geçişinde panel zıplamıyor; klavye ile gezilebiliyor.

### Faz 4 — Kontrol & ikon standardizasyonu (risk: orta)

Dosyalar: `ui-elements.css`, `workspace.css`, `lobby.css`, `quick-controls.tsx`,
`LobbyActionToolbar.tsx`, `workspace-rail.tsx`

- 7 buton boyutu → **4 boy** (`control.xs/sm/md/lg`). Eşleme:
  window-control → xs · sidebar-action, popup-close, pap-close → sm ·
  quick-icon, stage-icon → md · rail, lobby-action → lg.
- Her boyda ikon boyutu sabit (3.1 tablosu). `size={14}` gibi tek tek sayılar gider.
- **Tek ikon kütüphanesi**: `lucide-react` yalnız 5 dosyada → `@ant-design/icons`'a taşı
  (antd zaten Button/Tooltip/Modal için zorunlu bağımlılık, ikinci kütüphane gereksiz).
  Alternatif: tersi de olur, ama antd bileşenleri kendi ikonlarını zaten getiriyor.
- Avatar: 5 keyfi boyut → `avatar.xs..xl`; `.ct-user-avatar` inline tekrarları silinir.

**Kabul:** Aynı satırdaki tüm ikonlar aynı optik ağırlıkta; `size={` sayıları JSX'ten kalkar.

### Faz 5 — Inline stil tasfiyesi (risk: düşük ama hacimli)

Öncelik sırası (inline obje sayısına göre):

| Dosya | Adet | Yapılacak |
|---|---|---|
| `admin-dashboard.tsx` | 108 | KPI kartları grid'e; kart stilleri `.ct-stat-card` sınıfına; SVG grafik renkleri token'a |
| `users-direct-messages-panel.tsx` | 62 | header/composer/banner stilleri `chat.css`'e |
| `workspace-sidebar.tsx` | 55 | ses popover'ı ve lobi modalı sınıfa; `.ct-audio-popover` zaten var, inline override'ı sil |
| `settings-application.tsx` | 50 | `.ct-settings-switch-item`'ın zaten yaptığı flex'i tekrar etme |
| `lobbies-sidebar-panel.tsx` | 44 | Faz 3'te kısmen halloldu; kalan modal stilleri |
| `settings-profile.tsx` | 43 | avatar satırı + form |
| `settings-audio.tsx` / `admin-users.tsx` | 35+35 | tablo/metre stilleri |
| kalan 27 dosya | ~280 | mekanik |

Yanında:
- 3 runtime `<style>` bloğunu `animations.css`'e taşı.
- `App.tsx` offline kartı: Tailwind class'ı + inline ikizini tekle (~110 → ~25 satır),
  elle hover yerine `:hover`.
- El yapımı `.ct-settings-switch` **sil**, antd `Switch` tek switch olsun
  (ConfigProvider'da zaten temalı).
- `!important` sayısını 297 → ~20'ye indir (özgüllük çakışması bittiği için gereksizleşiyor).

**Kabul:** `grep -c "style={{"` toplamı ≥733 → <80 (kalanlar gerçek dinamik değerler).

### Faz 6 — Sohbet & lobi sahnesi ince ayar (risk: düşük)

- `.ct-chat-bubble` `min-width` kaldır → kısa mesaj kısa balon.
- `.ct-chat-composer` padding'i tek yerde (16px), inline override'lar silinsin.
- Lobi sahnesi padding'leri (`66px 18px 92px`) token'a; toolbar yüksekliğinden türet.
- Modal görünümünü **tekleştir**: antd `Modal` + ConfigProvider teması; `.ct-user-popup`
  ve `.ct-screen-share-modal` aynı yüzey token'larını kullansın.

**Kabul:** 4 modal görünümü → 1; sohbet balonu içeriğe göre daralıyor.

### Faz 7 — Responsive & doğrulama

- 720px min genişlikte tüm bölümleri gez (rail / sidebar / lobi sahnesi / ayarlar / admin).
- Kırılım noktalarını 3.1 ölçeğine göre sadeleştir: 1024 / 768 (980/900/760 yerine).
- Odak halkası her interaktif öğede görünür.

**Kabul:** 720×480'de yatay taşma yok, hiçbir kontrol kesilmiyor.

---

## 5. Etki tahmini

| Metrik | Şimdi | Sonra |
|---|---|---|
| Inline stil objesi | ≥733 | <80 |
| `!important` | 297 | ~20 |
| Ölü CSS dosyası | 246 KB | 0 |
| Çakışan CSS kuralı | 6 | 0 |
| Buton boyutu | 7 | 4 |
| Radius değeri | 11 | 5 |
| Font-size değeri | 12 | 6 |
| İkon kütüphanesi | 2 | 1 |
| Üst krom yüksekliği | 104px | 48px |
| Sidebar sol hizası | 4 farklı | 1 |

---

## 6. Risk ve doğrulama

- **Görsel regresyon riski Faz 2-3'te toplanıyor.** Bu iki faz ayrı commit'lerde gitmeli.
- `connect-desktop` bir git deposu → her faz sonunda commit, geri alınabilir.
- Mantık dosyalarına (`hooks/`, `services/`, `features/livekit`, `features/rnnoise`)
  **dokunulmayacak**; refactor yalnız sunum katmanı.
- Doğrulama: her faz sonunda `pnpm build` + uygulamayı açıp 5 bölümü gezmek
  (auth · arkadaşlar/DM · lobiler · ayarlar · yönetim).
