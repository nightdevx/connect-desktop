# Ayarlar Arayüzü — İnceleme ve Refactor Planı

> **Durum (2026-08-20):** Faz 0, 1, 2, 4, 5, 6 ve §3.5 (geniş panel) **uygulandı**.
> Faz 3 (kaydetme sözleşmesi — davranış değişikliği) ve Faz 7 (kamera cihaz
> seçimi, bildirim birleştirmesi) ayrı onay bekliyor. Uygulananların doğrulaması
> §7'de.

Kapsam: `src/renderer/src/features/workspace/components/settings/**` (7 sekme),
`src/renderer/src/styles/modules/features/settings.css`, ve aynı işi yapan ikinci
yüzey olan `src/renderer/src/features/admin/components/admin-settings.tsx`.
Tarih: 2026-08-19. Önceki genel çalışma: `docs/ui-refactor-plan.md` (2026-08-14).

Backend, IPC, LiveKit ve medya mantığı **dokunulmaz**. Bu plan yalnızca sunum
katmanını (JSX yapısı + CSS + etkileşim sözleşmesi) değiştirir.

---

## 1. Özet

Ayarlar, ağustos refactor'ından sonra kod hijyeni açısından temiz: settings
dosyalarında **0 inline stil**, kullanılmayan sınıf yok, container query'lerle
panel genişliğine göre yanıt veriyor. Sorun estetik değil, **sözleşme
tutarsızlığı**:

1. **Üç ayrı kaydetme modeli** aynı arayüzde yan yana duruyor. Kullanıcı bir
   ayarın kaydedilip kaydedilmediğini sayfaya bakarak anlayamıyor.
2. **Dört ayrı satır dili** var: `ct-settings-switch-item`, çıplak
   `<div><label/><Select/></div>`, `ct-field-row` (admin), antd `Card` (admin).
   Aynı bilgi (başlık + açıklama + kontrol) dört farklı hizada çiziliyor.
3. **Ölçülebilir 14 dizilim/boşluk hatası** var (bkz. §3.2). Hepsi tek tek
   doğrulandı, tahmin değil.
4. **Yönetici ayarları sayfası hiç stil almıyor**: `ct-admin-section` ve
   `ct-admin-section-header` sınıfları **hiçbir CSS dosyasında tanımlı değil**.

Hedef: iki satır primitifi, tek kaydetme sözleşmesi, doğrulanmış hataların
düzeltilmesi. Sıfırdan yeniden yazım değil — mevcut CSS'in gerekçeli kısımları
korunuyor.

---

## 2. Mevcut durum haritası

| Sekme | Dosya | Satır | Alt bölüm | Kontrol | Kayıt modeli |
|---|---|---:|---:|---:|---|
| Profil | `settings-profile.tsx` | 835 | 3 | 6 | Karma (resim anında, metin butonla) |
| Güvenlik | `settings-security.tsx` | 295 | 3 | 4 + modal | Butonla (bölüm başına) |
| Gizlilik | `settings-privacy.tsx` | 269 | 2 | 3 + liste | Butonla (tek buton, 3 alan) |
| Ses | `settings-audio.tsx` | 708 | 6 | 12 | Anında |
| Kamera | `settings-camera.tsx` | 412 | 2 | 2 | Anında |
| Yayın | `settings-stream.tsx` | 312 | 3 | 3 | Anında |
| Uygulama | `settings-application.tsx` | 541 | 5 | 8 | Anında |
| *(Yönetici)* | `admin-settings.tsx` | 163 | 2 kart | 4 | Anında |

Kabuk: `workspace-main-panel.tsx:458` → `SettingsMainPanel`;
kenar çubuğu `workspace-sidebar.tsx:364` → `SettingsSidebarTabs`.
Kaydırma kabı `.ct-main-panel-content` (`layout.css:155`, `p-5`), içerik sütunu
`.ct-settings-main-panel` (`max-width: 820px`, container query adı `settings`).

---

## 3. Tespitler

### 3.1 Yapısal — kaydetme sözleşmesi (en yüksek etki)

Aynı uygulamada üç model:

| Model | Nerede | Kullanıcının gördüğü |
|---|---|---|
| Anında kaydet | Ses, Kamera, Yayın, Uygulama, Yönetici | Onay yok; Uygulama sekmesinde her tıkta toast |
| Bölüm butonu | Güvenlik (şifre), Gizlilik (`settings-privacy.tsx:211`) | Buton hep etkin; kirli durum göstergesi yok |
| Başlık butonu | Profil (başlık sağı) | Buton avatar/afişi kapsamıyor — onlar zaten anında kaydediliyor |

Sonuç: Gizlilik sekmesinde bir seçim yapıp sekme değiştiren kullanıcı ayarını
sessizce kaybediyor. Profil'de "Profili Kaydet" butonu, sayfadaki iki kontrolü
(afiş, avatar) hiç ilgilendirmiyor; kullanıcı ikisini de kapsadığını sanıyor.

**Karar:** Tek sözleşme —

- **Ayrık değerli kontrol** (switch, select, segmented, slider) → **anında kaydet**,
  satırın sağında geçici "Kaydedildi" mikro etiketi. Toast yok.
- **Serbest metin** (ad, hakkımda, e-posta, şifre) → **açık kaydet**, kirli
  durumda başlıkta beliren "Kaydedilmemiş değişiklik" çipi + etkinleşen buton.
  Temizken buton `disabled`.
- Gizlilik'teki buton **silinir** (3 kontrolün üçü de ayrık değerli).

### 3.2 Doğrulanmış görsel / dizilim hataları

| # | Yer | Hata | Neden oluyor |
|---|---|---|---|
| B1 | `settings.css:555` `.ct-media-preview` | `aspect-ratio: 16/9` + `max-height: 360px` + `w-full` çakışıyor | 820px panelde kutu 820×360 (2.28:1) çiziliyor; `object-fit: contain` video 640×360 kalıyor → **iki yanda 90px siyah bant**. Kamera ve Yayın önizlemeleri bozuk görünüyor. |
| B2 | `settings-profile.tsx:714-724` | Etiket ile durum çipi alt alta | `.ct-field-label` `block mb-1.5` → çip kendi satırına düşüyor, e-posta alanı diğer alanlardan aşağı kayıyor. Sarmalayıcı `<div>`'in flex'i yok. |
| B3 | `settings-audio.tsx:694` | Mikrofon seviyesi kartı, üstündeki ses seviyesi kartlarıyla aynı dili konuşmuyor | `.ct-settings-audio-meter-wrap` düz blok: etiket üstte, çubuk ortada, yüzde **altta sağa yaslı**. `.ct-settings-volume-card` ise etiket+değer tek satırda, çubuk altta. Aynı sayfada iki farklı sayaç düzeni. |
| B4 | `settings-audio.tsx:508-527` | RNNoise profil seçimi, bağlı olduğu switch'in kartının **dışında** | Koşullu alt-ayar için satır dili yok; kartın altında serbest bir `<div>` olarak kalıyor, ilişki görsel olarak kopuyor. |
| B5 | `settings-security.tsx:154` | Üç şifre alanı 820px genişlikte | Tek sütunlu alan için ölçü yok; `.ct-settings-form-group` yalnızca dikey boşluk veriyor. 6 karakterlik girdi paragraf genişliğinde kutuya yazılıyor. |
| B6 | `settings-security.tsx:257` | Hesap silme modalı **uygulamanın modal temasını almıyor** | Uygulamadaki 9 modalın hepsi `rootClassName="ct-modal"` geçiyor; bu tek modal geçmiyor. Ayrıca gövdede `ct-modal-form` sarmalayıcısı yok → paragraf ve iki input **sıfır boşlukla** üst üste. |
| B7 | `settings-profile.tsx` afiş/avatar satırları | İki `ct-settings-profile-avatar-row` asimetrik | Avatar satırının solunda 80px avatar var, afiş satırının solunda **hiçbir şey yok** (önizleme ayrı bir blokta yukarıda). Aynı sınıf, iki farklı iskelet. |
| B8 | `settings-profile.tsx:808` | Tek öğelik `ct-settings-info-grid` | `repeat(auto-fit, minmax(180px,1fr))` → tek "@kullanıcıadı" değeri 820px'lik çerçeveli kutuyu tek başına dolduruyor. |
| B9 | `admin-settings.tsx:66`, `admin-moderation.tsx:77` | `.ct-admin-section` / `.ct-admin-section-header` **hiçbir CSS'te tanımlı değil** | Diğer 5 yönetici sayfası `.ct-admin-page` + `.ct-admin-page-header` + `<h1>` kullanıyor. Bu ikisinde kartlar arası boşluk yok, alt boşluk yok, ve Tailwind preflight başlık boyutunu sıfırladığı için **`<h2>` gövde metniyle aynı boyutta** çiziliyor. |
| B10 | `admin.css:286` + `admin-settings.tsx:100-160` | `.ct-admin-card { min-height: 260px }`, içindeki `.ct-field-row`'lar arasında boşluk/ayraç yok | Tek switch'li "Erişim" kartı 260px boş yer kaplıyor; "Oda Limitleri" kartında üç satır dipdibe yapışık. |
| B11 | `settings-stream.tsx:230` vs `settings-security.tsx:221` | `.ct-field-hint` bir yerde `<span>`, bir yerde `<p>`; üst boşluğu yok | Yayın sekmesinde ipucu Select'e yapışık, diğer sekmelerde farklı ritim. |
| B12 | Kamera/Yayın/Ses test butonları | Sayfanın birincil eylemi `type="text"` | "Güncellemeleri Kontrol Et" `type="primary"`, "Mikrofon Testini Başlat" `type="text"` — aynı ağırlıktaki iki eylem iki farklı görsel seviyede. |
| B13 | `ui-store.ts:201` sekme değişimi | Sekme değişince kaydırma konumu sıfırlanmıyor | Kaydırıcı `.ct-main-panel-content`; uzun Ses sayfasının dibinden kısa Kamera sayfasına geçince içerik görünürün dışında kalabiliyor. |
| B14 | `settings-audio.tsx:83` ve `:147` | Aynı `useEffect` iki kez tanımlı | Aynı `[audioPreferences]` bağımlılığı, aynı `setState`. İkincisinin gerekçesi yorumda; birincisi ölü. |

### 3.3 Erişilebilirlik

- `settings-sidebar-tabs.tsx:107-118`: `role="tablist"` + `role="tab"` var ama
  `aria-controls` / panel `id` **yok**, panelde `role="tabpanel"` **yok**, ok
  tuşu gezinmesi ve roving `tabIndex` **yok**. WAI-ARIA tab deseni yarım.
- Üç ayrı tablist (grup başına) — grup içinde ok tuşu mantıklı, gruplar arası
  geçiş `Tab` ile. Bu tercih korunabilir ama belgelenmeli.
- `HotkeyCaptureField` yakalama modundayken durumu ekran okuyucuya bildirmiyor
  (`aria-live` yok); "Tuşa basın…" yalnızca görsel.
- Kamera/Yayın önizleme `<video>`'sunun erişilebilir adı yok.

### 3.4 Bilgi mimarisi

- **Ses sekmesi 6 alt bölüm** taşıyor (Cihazlar, İşleme, Kısayollar, Lobi
  Varsayılanları, Bildirim Sesleri, Test) — panelin en uzun sayfası, iç gezinme
  yok.
- **Kamera 2 kontrol, Yayın 3 kontrol** — başlık + ikon + açıklama, içerikten
  daha çok yer kaplıyor.
- **Bildirimler ikiye bölünmüş**: OS bildirimi Uygulama'da, oda sesleri Ses'te.
  İkisi de kodda birbirini işaret eden birer cümle taşıyor
  (`settings-application.tsx`, `settings-audio.tsx`) — bir arayüz kendi
  bölümlerini metinle tarif etmek zorunda kalıyorsa bölümleme yanlıştır.
- **Kamera cihazı seçimi hiç yok**: kodda `videoinput` yalnızca "kamera var mı"
  testinde geçiyor (`settings-camera.tsx:69`). İki kameralı kullanıcı seçim
  yapamıyor. (İşlev eksiği; UI dışı iş gerektirir — §6 Faz 7.)

### 3.5 Geniş ekranda boş sağ taraf (kullanıcı bildirimi)

Panel = pencere − rail(72) − kenar çubuğu(280) − iç boşluk(40). 1920px'lik bir
ekranda bu **1518px** eder; içerik sütunu 880px'de sabit ve **sola yaslıydı** —
yani boşluğun tamamı sağda tek blok hâlinde duruyordu.

İki ayrı kusur vardı:

1. **Sola yaslama.** Kalan genişlik tek yanda toplanınca sayfa yarım kalmış
   gibi görünüyor. Ortalanınca aynı boşluk iki yana bölünür ve kenar boşluğu
   olarak okunur.
2. **Container kendi ölçüsünü taşıyordu.** `container-type: inline-size` ile
   `max-width: 880px` aynı elemandaydı. Bir container kendi `max-width`'inin
   yasakladığı genişliği **asla** raporlayamaz — bu yüzden panele dair her
   sorgu, pencere ne kadar geniş olursa olsun 880 cevabını alıyordu.

Çözüm:
- Container `.ct-settings-main-panel` (kabuğun verdiği tam genişlik), ölçü
  `.ct-settings-section` (880px) — ikisi ayrıldı.
- `.ct-settings-section` **ortalanır** (`mx-auto`).
- **Tek sütun korunur.** Pencere büyüdükçe içerik alt alta kalır; çok sütun
  denendi ve reddedildi: ayarlar sayfası tarama sırası tek dikey eksende
  olduğunda daha kolay takip ediliyor.
- `.ct-media-preview` sütununun tam genişliğini kullanır (16:9 korunur).

Ölçülen sol kenar (satırın x'i; panel 372'de başlıyor):

| Pencere | Panel | Sütun sol kenarı | Not |
|---|---:|---:|---|
| 2560×1400 | 2158 | 1012 | ortalı |
| 1920×1080 | 1518 | 692 | ortalı |
| 1440×900 | 1038 | 452 | ortalı |
| 1280×800 | 878 | 373 | panel ölçüden dar, tam genişlik |
| 720×480 | 382 | 313 | tam genişlik |

---


## 4. Hedef tasarım

### 4.1 İki satır primitifi (dördün yerine)

**A. `ct-settings-row`** — yatay: solda başlık + açıklama, sağda tek kontrol.
Bugünkü `ct-settings-switch-item`'ın devamı; adı genelleşiyor çünkü içinde
Switch, Select, Segmented ve buton da var. `ct-field-row` (admin) bu sınıfa
taşınır ve silinir.

```
┌──────────────────────────────────────────────────────────┐
│ Gelişmiş gürültü bastırma (RNNoise)              [ ●— ]  │
│ Mikrofon açıkken arka plan seslerini azaltır.            │
├──────────────────────────────────────────────────────────┤
│   ↳ Kalite profili                    [ Dengeli      ▾ ] │  ← .detail
└──────────────────────────────────────────────────────────┘
```

Yeni değiştirici: **`.ct-settings-row.detail`** — bir üst satıra bağlı koşullu
alt ayar. 16px sol iç girinti + soluk dikey bağlantı çizgisi. B4'ü çözer;
`HotkeyCaptureField`'ın "Bas-konuş tuşu" satırı da bunu kullanır.

**B. `ct-settings-field`** — dikey: etiket, kontrol, ipucu. Bugün her çağrı
yerinde çıplak `<div>` + `.ct-field-label` + kontrol + (bazen) ipucu olarak elle
yazılıyor; ipucunun üst boşluğu olmadığı için (B11) her yerde farklı duruyor.

```
Mikrofon giriş cihazı             ← .ct-field-label (12px / 600 / 6px alt boşluk)
[ Kulaklık (Realtek(R) Audio) ▾ ] ← kontrol, tek sütunda max-width: 420px
Otomatik: donanım açıkken H.264.  ← .ct-field-hint (6px üst boşluk)
```

Ek: **`.ct-settings-field-header`** — etiket ile durum çipini tek satırda tutan
flex (B2'yi çözer).

**Grup kabı:** `ct-settings-card` (bugünkü `ct-settings-switch-list`'in yeni
adı). Tek çerçeve, satırlar arası tek saç teli ayraç. Alt bölüm başlığı (`h5`)
kartın dışında kalır — bugünkü davranış korunur.

### 4.2 Ölçü ve ritim (tek tablo, tek kaynak)

| Eksen | Değer | Nereden |
|---|---|---|
| Panel ölçüsü | 820px | mevcut, korunuyor (iki sütunlu cihaz ızgarası belirliyor) |
| Form sütunu | 420px | **yeni** — tek sütunlu alanlar (şifre, ad, kod) bu ölçüyü aşmaz (B5) |
| Açıklama ölçüsü | 62ch | mevcut, korunuyor |
| Bölüm ↔ içerik | 24px | mevcut `gap-6` |
| Alt bölüm arası | 20px üst + 20px alt (kural ortada) | mevcut, korunuyor |
| Alt bölüm içi | 16px | mevcut `gap-4` |
| Satır iç boşluğu | 16px (dar panelde 12px) | mevcut |
| Etiket ↔ kontrol | 6px | mevcut `mb-1.5` |
| Kontrol ↔ ipucu | 6px | **yeni** (B11) |
| Kart köşesi | `--ct-radius-md` | mevcut |

Yeni sayı üretilmiyor; eklenen tek ölçü **420px form sütunu** ve **6px ipucu
boşluğu**.

### 4.3 Kaydetme göstergesi

Tek bileşen: `SettingsSaveState` — `"idle" | "saving" | "saved" | "error"`.

- Ayrık kontrol: kontrolün solunda ~1.6sn görünüp sönen "Kaydedildi" mikro
  etiketi (`.ct-settings-saved-flash`, `--ct-success`). Toast **kalkar** —
  Uygulama sekmesinde her tıkta toast çıkması gürültü.
- Metin alanı: bölüm başlığında `ct-status-chip warn` → "Kaydedilmemiş
  değişiklik"; buton yalnızca kirliyken etkin.
- Hata: mevcut `messageApi.error` korunur — hata sessiz kalmamalı.

---

## 5. Sayfa sayfa hedef düzen

### 5.1 Profil

```
┌ Profil Ayarları ─────────────────── [Kaydedilmemiş ●] [Kaydet] ┐
│ Hesap görünüm bilgilerini buradan yönetebilirsin.              │
├─ KİMLİK ───────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ ▓▓▓▓▓▓▓▓ afiş önizleme 344×194 ▓▓▓▓▓▓▓▓                     │ │
│ │  (◕)  Görünen Ad · @kullanıcı        [Afiş] [Avatar]        │ │ ← tek kart
│ └────────────────────────────────────────────────────────────┘ │
│ Görünen Ad     [_________________________]  (420px)            │
│ Hakkımda       [_________________________]                     │
├─ E-POSTA ──────────────────────────────────────────────────────┤
│ E-posta Adresi            [Doğrulanmış ✓]   ← tek satırda (B2) │
│ [______________________]                                       │
│ (doğrulama akışı — ct-inset-panel, mevcut)                     │
├─ HESAP ────────────────────────────────────────────────────────┤
│ Kullanıcı Adı  @nightdevx        ← ct-settings-row, kutu değil │
│                                          [Hesaptan Çık]        │
└────────────────────────────────────────────────────────────────┘
```

Değişen: afiş önizlemesi + iki yükleme satırı **tek profil kartına** birleşiyor
(B7) ve önizleme profil kartının gerçek dizilimini gösteriyor. Tek öğelik bilgi
ızgarası satıra iniyor (B8). Başlıkta kirli durum çipi.

### 5.2 Güvenlik

- Şifre alanları **420px** sütunda (B5); üçü de aynı genişlikte.
- "Şifreyi Değiştir" yalnızca üç alan da doluyken etkin.
- Silme modalı: `rootClassName="ct-modal"` + gövde `ct-modal-form` (B6). Onay
  kelimesi alanı `ct-code-input` benzeri dar alan.
- "Hesap Verileri" ve "Hesabı Sil" alt bölümleri korunuyor; tehlike bölümü
  mevcut `.danger` dilini sürdürüyor.

### 5.3 Gizlilik

- Kaydet butonu **silinir**, üç kontrol de anında kaydeder (§3.1).
- İki select `ct-settings-two-col` içinde kalır; arkadaşlık isteği switch'i aynı
  kartın üçüncü satırı olur (bugün ayrı bir kartta).
- Engellenen kullanıcılar listesi `ct-list` olarak kalır; boş durum
  `ct-list-state` (mevcut).

### 5.4 Ses (en uzun sayfa)

- 6 alt bölüm korunur, sıra değişir: **Cihazlar → Seviyeler + Test (birleşik) →
  Ses İşleme → Kısayollar → Lobi Varsayılanları → Bildirim Sesleri**.
- Mikrofon seviyesi sayacı, ses seviyesi kartlarıyla **aynı
  `ct-settings-volume-card` dilini** kullanır: etiket + yüzde tek satırda, çubuk
  altta (B3). Test butonu da bu kartın içine girer — sayaç ve onu besleyen buton
  bugün iki ayrı blokta.
- RNNoise profili `.detail` satırı olur (B4).
- Test butonları `type="default"` (B12).

### 5.5 Kamera + Yayın

- Önizleme kutusu: `max-height` yerine **`max-width: 640px`** → 16:9 korunur,
  siyah bant biter (B1). Kutu sola yaslı kalır.
- `<video>`'ya erişilebilir ad; önizleme kutusuna `aria-live` durum metni.
- Test butonu önizlemenin üstünde serbest durmak yerine kartın başlığı hizasında
  — "başlat" ile "sonuç" arasındaki mesafe kapanır.
- Kamera sayfasına **cihaz seçimi** eklenmesi Faz 7'ye bırakılıyor (UI dışı iş).

### 5.6 Uygulama

- Güncelleme bölümü: bilgi ızgarası + Alert birbirini tekrar ediyor
  ("Durum: Güncel" + "Alert: Uygulamanız güncel"). Alert yalnızca **eyleme
  dönüşebilir durumda** (bulundu / indirildi / hata) gösterilir; aksi hâlde
  ızgara yeter.
- Sürüm/durum satırı `ct-settings-info-grid` yerine iki `ct-settings-row`.
- Tema ve GIF segmented'ları korunur.

### 5.7 Yönetici ayarları

- `ct-admin-section` → **`ct-admin-page`** + `<header class="ct-admin-page-header"><h1>`
  (B9). `admin-moderation.tsx` de aynı düzeltmeyi alır.
- antd `Card` → `ct-settings-card` + `ct-settings-row` (B10); `min-height: 260px`
  bu sayfada devre dışı. `ct-field-row` sınıfı silinir, 12 kullanım yeri
  `ct-settings-row`'a taşınır.
- Böylece "ayar satırı" uygulamada **tek** görünüme iner.

---

## 6. Faz planı

Her faz kendi başına derlenir ve commit'lenebilir.

### Faz 0 — Ölçüm ve temel (risk: yok)

- CDP ile 1280×800 ve 720×480'de 7 sekmenin ekran görüntüsü + sol kenar
  hizalarının piksel ölçümü (ağustos çalışmasındaki yöntem, yeni bağımlılık yok).
- `settings-audio.tsx:83` ölü `useEffect` silinir (B14).
- **Kabul:** ölçüm çıktıları `docs/` altında referans olarak durur.

### Faz 1 — Satır primitifleri (risk: düşük, hacim yüksek)

Dosyalar: `settings.css`, `ui-elements.css`, 7 sekme, `settings-app-preferences.tsx`

- `ct-settings-switch-list` → `ct-settings-card`, `ct-settings-switch-item` →
  `ct-settings-row` (eski adlar bir faz boyunca alias kalır, sonda silinir).
- `.ct-settings-row.detail` eklenir.
- `ct-settings-field` + `ct-settings-field-header` eklenir; 14 çıplak
  `<div><label/><kontrol/></div>` bu sınıfa taşınır.
- **Kabul:** `pnpm build` geçer; sınıf denetimi temiz; görsel fark yalnızca
  ipucu boşlukları.

### Faz 2 — Doğrulanmış hataların düzeltilmesi (risk: düşük)

B1, B2, B3, B4, B5, B7, B8, B11, B12, B13.

- **Kabul:** Kamera/Yayın önizlemesinde yan bant yok; e-posta çipi etiketle aynı
  satırda; iki ses sayacı aynı dilde; şifre alanları 420px; sekme değişiminde
  kaydırma başa dönüyor.

### Faz 3 — Kaydetme sözleşmesi (risk: orta — davranış değişikliği)

Dosyalar: `settings-privacy.tsx`, `settings-profile.tsx`,
`settings-app-preferences.tsx`, yeni `settings-save-state.tsx`

- Gizlilik butonu kalkar, anında kayda geçer.
- Profil başlığında kirli durum çipi; buton temizken pasif.
- Ayrık kontrollerde toast → satır içi "Kaydedildi".
- **Kabul:** Her sekmede bir kontrol değiştirip sekme değiştirince değer
  korunuyor; kirli metin alanı bırakılırsa başlıkta uyarı görünüyor.

### Faz 4 — Modal ve tehlike bölgesi (risk: düşük)

B6 + silme akışının ölçüsü.

- **Kabul:** Uygulamadaki tüm modallar tek görünümde; silme modalında alanlar
  arası boşluk var.

### Faz 5 — Yönetici ayarları hizalaması (risk: düşük)

B9, B10 + `ct-field-row` tasfiyesi (12 kullanım).

- **Kabul:** `ct-admin-section*` sınıfları kodda kalmıyor; yönetici ayar sayfası
  başlığı diğer yönetici sayfalarıyla aynı boyutta; kartlar arasında 24px var.

### Faz 6 — Erişilebilirlik (risk: düşük)

- `aria-controls` / `role="tabpanel"` / `aria-labelledby` bağlanır.
- Grup içi ok tuşu gezinmesi + roving `tabIndex`.
- `HotkeyCaptureField` yakalama durumu `aria-live="polite"`.
- Önizleme `<video>` erişilebilir adı; odak halkası her satırda görünür.
- **Kabul:** Klavyeyle 7 sekme gezilebiliyor; ekran okuyucu aktif sekmeyi ve
  panelin hangi sekmeye ait olduğunu söylüyor.

### Faz 7 — İsteğe bağlı, UI dışı iş gerektiren (ayrı onay)

- **Kamera cihazı seçimi**: `CameraPreferences`'a `selectedVideoInputDeviceId`,
  `getUserMedia` kısıtına bağlanması, kalıcılık. Ayarlar sayfası tarafı hazır.
- **Bildirim birleştirmesi**: OS bildirimleri + oda sesleri tek "Bildirimler"
  alt bölümünde toplanır (§3.4). Yer değiştirme olduğu için ayrı karar.

---

## 7. Doğrulama

Her fazın sonunda:

```
pnpm typecheck && pnpm lint && pnpm build
node scripts/check-design-tokens.cjs
```

Ek olarak **sınıf bütünlüğü denetimi** (tanımsız `ct-*` sınıfı ve ölü selector)
— B9 tam olarak bu denetim olmadığı için kaçmıştı. `pnpm check` zincirine
`check-css-classes.cjs` olarak eklenmeli (~40 satır, mevcut token denetimiyle
aynı dosya yürüyüşü).

Son fazda uygulama gerçekten çalıştırılır: 1280×800 ve **720×480** (pencere
minimumu, `src/main/index.ts:268`) ölçülerinde 7 sekme + yönetici ayarları
gezilir, ekran görüntüsü alınır, sol kenar hizaları piksel olarak ölçülür.
Kabul: yatay taşma yok, hiçbir kontrol kesilmiyor, her sekmede içerik sütunu tek
dikey çizgide başlıyor.

---

## 8. Kapsam dışı

- Backend, IPC ve medya mantığı.
- Sohbet, lobi sahnesi, arkadaş listesi (ağustos çalışmasında ele alındı).
- Yeni bağımlılık: yok. Yeni ikon kütüphanesi: yok.
- Tema/renk paleti değişikliği: yok — tokenlar korunuyor.

---

## 9. Uygulanan değişiklikler (2026-08-20)

### 9.1 Primitifler

| Eski | Yeni |
|---|---|
| `.ct-settings-switch-list` | `.ct-settings-card` |
| `.ct-settings-switch-item` | `.ct-settings-row` |
| `.ct-settings-switch-item-content` | `.ct-settings-row-text` |
| çıplak `<div><label/><kontrol/></div>` (14 yer) | `.ct-settings-field` |
| — | `.ct-settings-row.detail` (koşullu alt ayar, girintili + bağlantı çizgisi) |
| — | `.ct-settings-field-header` (etiket + durum çipi tek satırda) |
| — | `.ct-settings-subsection-header` (başlık + tek eylem) |
| — | `.ct-settings-field.measured` / form grubu → 420px |
| `.ct-settings-switch-item.compact` | silindi (hiçbir yerde kullanılmıyordu) |
| `.ct-settings-audio-meter-wrap` | silindi → `.ct-settings-volume-card` |
| `.ct-settings-banner-preview` | silindi → `.ct-settings-profile-card-*` |
| `.ct-metric-value` | silindi (kullanılmıyordu) |

`ct-field-row` **silinmedi**: yönetici ayarları sayfasından kalktı ama iki modal
(`lobbies-sidebar-panel`, `workspace-sidebar`) hâlâ kullanıyor — ayar sayfası
işi değil, ayrı bir dokunuş.

### 9.2 Kapatılan bulgular

B1, B2, B3, B4, B5, B6, B7, B8, B9, B10, B11, B12, B13, B14 ve §3.5.
Faz 3 (kaydetme sözleşmesi) ve Faz 7 kapsam dışı bırakıldı — davranış değişikliği.

### 9.3 Süreçte bulunan ek kusurlar

Plan yazılırken görünmeyen, yeni sınıf denetimi eklenince ortaya çıkanlar:

1. **Üç ölü sınıf kancası.** `rootClassName="ct-profile-card-popover"`
   (2 yer), `rootClassName="ct-sound-emote-popover"` ve
   `className="ct-friends-home-add"` hiçbir CSS kuralına bağlanmıyordu —
   yazılmış ama hiçbir şey yapmayan öznitelikler. Silindi. (Yan bulgu: bu iki
   popover, `.ct-emoji-popover`'ın aldığı yüzey işlemini almıyor; ayrı bir iş.)
2. **Dört ölü CSS bloğu.** `.ct-chat-message-delete` (3 kural),
   `.ct-chat-send-icon` (3 kural), `.ct-call-placeholder-pulsing
   .ct-lobby-tile-avatar` (bileşik seçicinin ölü yarısı),
   `.ct-lobby-inline-volume-value`. Silindi.

### 9.4 Yeni denetim

`scripts/check-css-classes.cjs` → `pnpm check` zincirine eklendi. İki yönü iki
ayrı hassasiyette okur:

- **"Kullanılıyor ama tanımlı değil"** yalnız `className` özniteliklerini okur —
  yanlış alarm vermemesi gerekir. B9'u yakalayan yön budur.
- **"Tanımlı ama kullanılmıyor"** dosyadaki **her** dizgiyi okur — canlı bir
  kuralı yanlışlıkla ölü ilan etmemesi gerekir.

Şablon literalindeki `${}` bir sınıfın yarısı olabileceğinden (`ct-ns-mode-badge--${mode}`)
o parçalar önek olarak değerlendirilir.

### 9.5 Doğrulama sonuçları

`pnpm typecheck` · `eslint` · `vite build` · `check-design-tokens` ·
`check-css-classes`: hepsi temiz. Derlenen CSS 173.60 → 172.88 kB.

Ölçüm: derlenmiş stil sayfası, kabuğun ızgarasını taklit eden bir Electron
penceresinde temsilî ayar işaretlemesine uygulanıp piksel olarak ölçüldü
(yeni bağımlılık yok; harness depoda tutulmuyor).

| Ölçüt | Sonuç |
|---|---|
| Önizleme en-boy oranı | 1.778 (= 16/9) — eskiden 2.28:1 |
| Sol kenar hizası (7 blok) | tek dikey çizgi (panel 372 → satır 373, 1px kart kenarlığı) |
| E-posta çipi ↔ etiket | aynı satır (2px optik fark) |
| Şifre alanı genişliği | 420px |
| Etiket ↔ kontrol boşluğu | 6px |
| `detail` satır girintisi | +36px (dar panelde +16px, çizgi kapalı) |
| Yatay taşma | 720×480 dahil her ölçüde 0 |
| Sütun ortalama | her ölçüde ortalı (§3.5 tablosu) |
