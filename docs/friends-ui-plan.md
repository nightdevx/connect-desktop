# Arkadaşlar Arayüzü — İnceleme ve Refactor Planı

> **Durum (2026-08-20):** Faz 0–5 **uygulandı**. Doğrulama §7'de.
> Kapsam dışı bırakılanlar §8'de.

Kapsam: `src/renderer/src/features/workspace/components/user/friends-home-panel.tsx`
(arkadaş sayfasının tamamı), onu taşıyan kabuk
(`users-direct-messages-panel.tsx`'in seçili kullanıcı olmayan dalı),
`styles/modules/features/chat.css`'in `.ct-friends-home*` bloğu ve sayfanın
paylaştığı satır primitifleri (`.ct-list*`, `.ct-user-avatar*` —
`ui-elements.css` + `workspace.css`).

Tarih: 2026-08-20. Önceki çalışmalar: `docs/ui-refactor-plan.md` (2026-08-14),
`docs/settings-ui-plan.md` (2026-08-19), `docs/lobby-ui-plan.md`.

Backend, IPC, WS ve arkadaşlık mantığı **dokunulmadı**. Tek istisna:
`use-friends.ts`'e hata durumundaki "Tekrar dene" düğmesi için `refresh` +
`isRefreshing` eklendi (§5 Faz 4) — mevcut `invalidateQueries` çağrılarının
aynısı, yeni ağ yolu yok.

---

## 1. Özet

Sayfa çalışıyordu ama **iki dil konuşuyordu**: aynı uygulamanın öteki ana ekranı
olan Lobiler kendi başlığını 20px'te, çerçeveli ve nefes alan bir düzende
çiziyor; Arkadaşlar 15px'lik bir `<h3>` ile başlayıp altına iki tam genişlik
kontrol satırı yığıyordu.

Ölçülen sorunlar (hepsi kodda tek tek doğrulandı, tahmin değil):

1. **Tek bir dikey çizgi yoktu.** Panel `p-3/p-4` veriyor, satırlar bunun içine
   ayrıca `px-3` ekliyordu: başlık/sekme/arama kutusu 12–16px'te, avatarlar
   24–28px'te başlıyordu. Aradaki 12px, sayfanın her yerinde görünen bir kayma.
2. **Başlık düğmesi hizasızdı.** `items-start` + iki satırlık metin bloğu →
   "Arkadaş Ekle" düğmesi metin bloğunun optik merkezinin ~10px üstünde duruyordu.
3. **Kroma boşa gidiyordu.** Sekme şeridi (34px) + arama kutusu (32px) iki ayrı
   tam genişlik satırıydı; boşluklarla birlikte ~150px. Pencere minimumu
   480px yüksekliğinde (`src/main/index.ts`) bu, listenin üçte biri.
4. **Sekmeler soruyu cevaplamıyordu.** "Çevrimiçi kimse var mı?" sorusunun tek
   cevabı sekmeye tıklayıp boş liste görmekti; sayı yalnızca İstekler'de vardı.
5. **Her satır bir trafik ışığıydı.** Yeşil telefon + kırmızı çöp kutusu her
   satırda sürekli boyalı; üçüncü satırdan sonra renk anlam taşımıyor.
6. **ARIA yanlıştı.** `<ul role="listbox">` içinde `role="option"` olmayan
   `<li class="ct-list-state">` çocukları vardı; satırlar seçim kontrolü değil,
   sohbet açan düğmelerdi ama `aria-selected={false}` bildiriyorlardı.
7. **Hata durumu çıkmaz sokaktı.** "Arkadaş listesi yüklenemedi" diyor, tekrar
   deneme yolu sunmuyordu; sorgular 30sn stale ve WS yalnız yeniden bağlanınca
   tazeliyor.
8. **İstekler sekmesi iki kez "burada bir şey yok" diyordu.** İki başlık + iki
   boş liste durumu, sekmenin dörtte üçü.
9. **Liste uzunluğu değişince sayfa yana kayıyordu.** Kaydırma çubuğu yer
   ayırmıyordu; Çevrimdışı (uzun) → Çevrimiçi (kısa) geçişinde her satır 10px
   sağa gidiyordu.
10. **Seçili sekmedeki sayaç görünmezdi** (yan bulgu, ekran paylaşımı modalını da
    etkiliyordu): sayaç hapı `--ct-alpha-12` zemin + `--ct-text-secondary` metin;
    seçili segment ise `--ct-accent` = koyu temada saf **beyaz**. Beyaz üstüne
    beyaz.

Hedef: tek dikey çizgi, tek kontrol satırı, sayılı sekmeler, sessiz satır
eylemleri, doğru semantik. Sıfırdan yazım değil — paylaşılan satır primitifleri
(`.ct-list-item`, `.ct-user-avatar`, `.ct-list-state`) aynen korundu.

---

## 2. Mevcut durum haritası (refactor öncesi)

| Katman | Dosya | Not |
|---|---|---|
| Kabuk | `workspace-main-panel.tsx:318` | `workspaceSection === "users"` → `UsersDirectMessagesPanel` |
| Taşıyıcı | `users-direct-messages-panel.tsx:814` | `<article class="ct-chat-panel ct-chat-panel-plain">`, `p-3/p-4` |
| Sayfa | `friends-home-panel.tsx` | 499 satır; header + Segmented + Input + body |
| Stil | `chat.css:865-892` | 5 kural, 28 satır |
| Satır | `ui-elements.css:237-346` | `.ct-list`, `.ct-list-item`, `.ct-list-state`, `.ct-user-avatar` |
| Satır meta | `workspace.css:216-256, 445-460` | `.ct-list-user*`, `.ct-list-group-title`, `.ct-list-item-actions` |
| Veri | `use-friends.ts:109` | `FriendsController` |
| Kardeş ekran | `lobby.css:281-380` | Karşılaştırma referansı: 20px başlık, `gap-5`, sayaç hapı |

---

## 3. Tespitler

### 3.1 Hizalama — tek dikey çizgi yok (en yüksek etki)

| Öğe | Panel kenarından | Kaynak |
|---|---:|---|
| Başlık `<h3>` | 12px (dar) / 16px (geniş) | `.ct-chat-panel-plain` `p-3 md:p-4` |
| Sekme şeridi | 12/16px | aynı |
| Arama kutusu (kutu) | 12/16px | aynı |
| Arama ikonu | 23/27px | + antd 11px iç dolgu |
| **Avatar** | **24/28px** | + `.ct-list-item` `px-3` |
| Grup başlığı | 24/28px | `.ct-list-group-title` `padding-inline: 12px` |

Sayfada iki farklı sol kenar var ve ikisi de panel genişliğine göre kayıyor.
Ayrıca hiçbir ayırıcı çizgi panel kenarına ulaşamıyor — üst blok ile liste
arasında görsel sınır kurulamıyor.

### 3.2 Başlık bloğu

- `items-start`: düğme iki satırlık metnin üstüne asılı (B2).
- `<h3>` 15px: Lobiler ekranı aynı konumda `<h2>` 20px kullanıyor. Aynı seviyede
  iki ekran, iki farklı başlık ölçüsü.
- Açıklama metni kenar çubuğundaki sağ tık davranışını anlatıyordu — bu sayfanın
  değil, kenar çubuğunun sözleşmesi.

### 3.3 Kontrol şeridi

- `Segmented block` 4 eşit sütuna böler: "Arkadaşlar" ile "Çevrimdışı" farklı
  genişlikte olduğundan sekme içi dolgular eşitsiz görünüyor.
- Sekme yüksekliği 34px, arama kutusu 32px; alt alta oldukları için fark
  görünmüyordu ama yan yana getirildiklerinde ilk sorun bu olurdu.
- "İsim veya kullanıcı adı ara..." placeholder'ı dar kutuda kırpılıyor
  (placeholder ellipsis almaz).

### 3.4 Satırlar

- Eylem düğmeleri `size="small"` = 24px; tasarım sisteminin kontrol merdiveni
  (`--ct-control-xs/sm/md/lg`) 24/32/40/48 diyor, satırın 52px yüksekliğinde 24px
  optik olarak hafif kalıyor.
- `ct-icon-success` (yeşil) + `danger` (kırmızı) her satırda sabit.
- Satırın tamamı `tabIndex=0` + `role="option"`: Enter satırın kendi eylemini
  tetikliyor ama eylem düğmeleri de aynı satırın içinde, bu yüzden kodda
  `event.target !== event.currentTarget` koruması ve her düğmede
  `stopPropagation` gerekiyordu.
- Satırın 12px iç dolgusu ölü alan: avatarın hemen solunu tıklamak hiçbir şey
  yapmıyor.

### 3.5 İstekler sekmesi

İki başlık + iki liste her zaman çiziliyor. Hiç istek yokken ekran:
"Gelen istekler (0) / Bekleyen istek yok. / Gönderilen istekler (0) / Bekleyen
isteğiniz yok." Dört satırda iki kez aynı bilgi.

Gruplar arası boşluk `.ct-list + .ct-list-group-title { mt-3 }` bitişik kardeş
seçicisine bağlı — yapı değişince sessizce bozulan cinsten.

### 3.6 Durum ekranları

- Hata: kod + statü gösteriliyor (iyi), çıkış yolu yok.
- "Henüz arkadaşınız yok": tek yol olan Arkadaş Ekle düğmesi ekranın öbür
  ucunda; boş durumun kendi eylemi yok.

### 3.7 Kaydırma

`.ct-friends-home-body` `overflow-y-auto`, `scrollbar-gutter` yok. Sekme
değiştikçe çubuk gelip gidiyor, içerik 10px oynuyor.

### 3.8 Yan bulgu — seçili segmentte görünmez sayaç

`main.tsx:91` `Segmented.itemSelectedBg = accent`. Koyu temada `--ct-accent`
`#ffffff`. `.ct-share-kind-count` hapı beyaz %12 zemin + `#d4d4d8` metin →
seçili sekmede tamamen kayboluyor. Ekran paylaşımı modalındaki
"Monitör 2 / Pencere 11" sayaçları da bu kuralı kullanıyordu.

---

## 4. Karar: yeniden yazım değil, yeniden bantlama

Sayfanın mantığı (arkadaş kesişimi, tr-sıralama, WS yamaları, pending-by-id)
doğru ve yorumlanmış; ona dokunulmadı. Değişen tek şey **sunum sözleşmesi**:

```
  ┌ ct-chat-panel-plain.friends-mode  (p-0)
  │ ┌ header   px-5  pt-4 pb-3   başlık + açıklama + Arkadaş Ekle
  │ ├ toolbar  px-5  pb-3        sekmeler + arama          ── border-b
  │ └ body     pl-2  py-3        tek kaydırıcı; satırlar +12px
```

20px = 8 (body `pl-2`) + 12 (`.ct-list-item px-3`) → avatarlar başlıkla aynı
çizgide. Sağ kenar dolgu değil, **kaydırma oluğu** (§5 Faz 5).

---

## 5. Uygulanan fazlar

### Faz 0 — Paylaşılan primitif: sayaç hapı (risk: düşük)

`.ct-share-kind-option` / `.ct-share-kind-count` (common.css, ekran paylaşımı
bölümü) → `.ct-segmented-option` / `.ct-segmented-count` olarak `theme.css`'e,
`.ct-segmented-premium`'un yanına taşındı. İki çağrı yeri güncellendi.

Yeni kural, §3.8'i kapatıyor:

```css
.ant-segmented-item-selected .ct-segmented-count {
  color: var(--ct-text-inverse);
  background: color-mix(in srgb, var(--ct-text-inverse) 16%, transparent);
}
```

`.alert` varyantı (`--ct-danger`) her iki durumda da aynı — bekleyen istek
sekmeye tıklanmadan okunabilsin diye.

### Faz 1 — Sayfa bantları ve tek dikey çizgi

- `users-direct-messages-panel.tsx`: seçili kullanıcı yokken `friends-mode`
  sınıfı → `.ct-chat-panel-plain.friends-mode { p-0 }`. Sohbet görünümü kendi
  oluğunu koruyor.
- `.ct-friends-home-header`: `items-center`, `px-5 pt-4 pb-3`, `<h2>` 20px
  (Lobiler ile aynı), açıklama `text-sm` / `max-w-[52ch]`.
- `.ct-friends-home-toolbar`: `px-5 pb-3` + `border-b`. Üst blok ile liste
  arasındaki tek ayırıcı, panel kenarına ulaşıyor.
- `.ct-friends-home-body`: `pl-2 py-3`, `flex-col gap-4` (bitişik kardeş hack'i
  silindi).
- Kısa pencere (`max-height: 620px`, `responsive.css`): açıklama gizlenir,
  başlık dolgusu daralır. Sekmeler ve arama kalır.

### Faz 2 — Kontrol şeridi tek satır

- `Segmented block` kaldırıldı; doğal genişlik + `min-w-0 max-w-full`.
- Arama kutusu `ml-auto`, `flex: 1 1 200px`, `max-width: 280px`.
- `align-items: stretch`: iki kontrol birbirinin yüksekliğine uyuyor, hiçbirine
  sabit sayı verilmiyor.
- Panel < 560px → `@container friends-home`: başlık bloğu dikey, sekme ve arama
  ayrı satırlarda ve tam genişlik. (Kabuk `--ct-rail-width` ve
  `--ct-sidebar-width`'i kendi kırılımlarında değiştirdiği için ölçüt pencere
  değil **panel** genişliği; `chat-thread` ve `free-games` aynı deyimi kullanıyor.)
- Placeholder "Arkadaş ara..." — dar kutuda kırpılmıyor.

### Faz 3 — Sekmelerde sayaçlar

Dört sekme de `<TabLabel label count>`: Arkadaşlar (toplam), Çevrimiçi,
Çevrimdışı, İstekler (yalnız **gelen**, `alert` varyantıyla). Sayaçlar
filtrelenmemiş listelerden — arama kutusu bir bekleyen isteği gizleyemez.

### Faz 4 — Satır sözleşmesi

- **İki yarı:** `.ct-row-open` (kimlik, `role="button"`, `tabIndex=0`) ve
  `.ct-list-item-actions` (kardeş). Enter artık hiçbir koşulda "arkadaşlıktan
  çıkar" anlamına gelemez; `stopPropagation` çağrıları ve
  `event.target !== currentTarget` koruması silindi.
- `.ct-row-open::after { inset: 0 }` → satırın 12px iç dolgusu da tıklanabilir;
  eylemler DOM'da sonra geldiği için üstte kalıyor.
- Odak halkası satırın tamamında: `.ct-list-item:has(.ct-row-open:focus-visible)`
  (Chromium 140 / Electron 39).
- `.ct-row-action`: tek kontrol ölçüsü (32px) + eşleşen 16px ikon. Dinlenirken
  `--ct-text-muted`, renk **hover/focus'ta** geliyor (yeşil ara / kırmızı çıkar).
  Yükleme durumunda sabit görünür.
- `<ul role="listbox">` → düz `<ul aria-label>`; `role="option"` ve
  `aria-selected` kaldırıldı. `.ct-list-state` artık geçerli bir `<li>`.

### Faz 5 — Durumlar ve kaydırma

- Hata: **Tekrar dene** düğmesi (`friends.refresh`, `friends.isRefreshing`).
  `use-friends.ts` iki alan ekledi; `isFetching` kullanıldı çünkü başarısız
  yükleme de `data` (ok:false zarfı) tutuyor, `isPending` false kalıyor.
- "Henüz arkadaşınız yok" → boş durumun içinde **Arkadaş Ekle** düğmesi.
- İstekler: iki liste de boşsa **tek** boş durum; aramayla boşalmışsa ayrı metin.
  Dolu grup kendi sayaç hapıyla başlık alıyor, boş grup hiç çizilmiyor.
- `.ct-friends-home-body { scrollbar-gutter: stable; padding-right: 0 }` —
  oluk sağ kenar boşluğunun kendisi; sekme değişiminde yatay kayma yok.
- `.ct-list-group-title` `flex items-center gap-2` oldu (sayaç hapını taşımak
  için). Yalnız metin içeren kullanımları — Ayarlar sekme başlıkları —
  etkilenmiyor.

---

## 6. Dosya dökümü

| Dosya | Değişiklik |
|---|---|
| `components/user/friends-home-panel.tsx` | Yeniden yapılandırıldı: `TabLabel`, `RowAction`, iki yarılı `PersonRow`, `renderRequests`, `renderFriendEmpty` |
| `components/user/users-direct-messages-panel.tsx` | `friends-mode` sınıfı (1 satır) |
| `hooks/user/use-friends.ts` | `refresh` + `isRefreshing` |
| `styles/modules/features/chat.css` | `.ct-friends-home*` bloğu yeniden yazıldı (+ satır kuralları, container query) |
| `styles/modules/theme.css` | `.ct-segmented-option` / `.ct-segmented-count` + seçili/alert varyantları |
| `styles/modules/common.css` | Taşınan iki kural silindi |
| `styles/modules/features/workspace.css` | `.ct-list-group-title` → flex |
| `styles/modules/responsive.css` | `max-height: 620px` dalı |
| `features/screen-share/components/screen-share-modal.tsx` | Sınıf adı güncellemesi (4 yer) |

---

## 7. Doğrulama

```
tsc -p tsconfig.json --noEmit     ✓
eslint src                        ✓
vite build                        ✓
node scripts/check-design-tokens.cjs   ✓ (114 token, hepsi referanslı)
node scripts/check-css-classes.cjs     ✓ (633 tanım / 621 kullanım, iki yön temiz)
```

Derlenen CSS'te yeni kuralların çözüldüğü tek tek doğrulandı
(`.ct-friends-home-toolbar`, `.ct-row-action.ant-btn`, `.ct-segmented-count` ve
seçili varyantı).

**Piksel ölçümü yapılamadı.** Ayarlar planındaki (§9.5) Electron harness'ı bu
oturumda çalıştırılamadı: GUI Electron süreci bu ortamda başlatılamıyor
(`exit 127`, ana betik hiç yürütülmüyor; `ELECTRON_RUN_AS_NODE=1` ortamda sabit).
Harness dosyaları geri alındı, depoda kalmadı. Yukarıdaki hizalar CSS aritmetiği
ve derlenmiş çıktı üzerinden doğrulandı, ekranda ölçülmedi — uygulama bir sonraki
çalıştırmada 1280×800 ve 720×480'de gözle kontrol edilmeli:

- [ ] Başlık, sekme şeridi, arama kutusu ve avatarlar tek dikey çizgide (20px).
- [ ] Sekme ↔ arama yükseklikleri eşit; panel < 560px'te ikisi de tam genişlik.
- [ ] Sekmeler arası geçişte satırlar yana kaymıyor.
- [ ] Seçili sekmenin sayaç hapı okunuyor (koyu **ve** açık tema).
- [ ] Klavye: Tab satıra girer, halka satırın tamamını çevreler, Enter sohbeti
      açar; eylem düğmelerine ayrı Tab ile ulaşılır.

---

## 8. Kapsam dışı

- Backend, IPC, WS ve arkadaşlık mantığı.
- Kenar çubuğu (`users-sidebar-panel.tsx`) — sohbet listesi, ayrı yüzey. Satır
  primitifleri paylaşıldığı için oradaki görünüm değişmedi, yalnız
  `.ct-list-group-title` flex oldu (metin-only kullanımı etkilenmiyor).
- "Arkadaş Ekle" modalı (`workspace-sidebar.tsx:489`) — form dili ayrı iş.
- Profil kartı (`user-profile-card.tsx`).
- Yeni bağımlılık: yok. Tema/token değişikliği: yok.

### Bilinçli olarak yapılmayanlar

- **Satır eylemlerini hover'da gizlemek.** Kenar çubuğu bunu yapıyor
  (`.ct-list-item-close`), burada yapılmadı: bu sayfada eylem satırın asıl
  amacı, gizlenirse keşfedilemez. Sessizleştirmek yeterli oldu.
- **Yapışkan grup başlıkları.** İstek listeleri doğası gereği kısa; yapışkan
  başlık `--ct-panel` yarı saydam zemin üstünde opak bir zemin gerektirirdi.
- **"Arkadaşlar" sekmesinde çevrimiçi olanı üste almak.** Alfabetik sıra sabit;
  varlık durumu değiştikçe satırların yer değiştirmesi okumayı bozar.

---

## 10. Ek: sohbet ve profil dokunuşları (aynı oturum)

Arkadaş sayfasının ardından istenen dört yüzey. Aynı gün, aynı kurallarla.

### 10.1 Kök neden: `.ct-chat-composer` iki kez tanımlıydı

`chat.css` içinde aynı sınıf iki kez bildirilmişti:

| Satır | Kural | Sonuç |
|---|---|---|
| 163 | `flex-col gap-1.5 border-t px-3 py-2.5`, `background: transparent` | Belgelenmiş, doğru olan |
| 689 | `flex items-center gap-2 border-t p-3`, `background: panel-soft` | **Kazanan** (aynı özgüllük, sonra geliyor) |

Besteci bu yüzden dikey değil **yatay** bir şeritti: "Yanıtla"ya basınca çıkan
alıntı ve bekleyen dosya rozeti, yazma kutusunun *üstünde* değil **yanında**
duruyor ve alanı sıkıştırıyordu. Yanındaki `.ct-chat-composer .ct-input` kuralı
da hiçbir şeyle eşleşmiyordu (alan `.ct-chat-input`). İkisi de silindi.

Dosya genelinde tekrar taraması yapıldı: kalan "çift" bildirimler
(`.ct-chat-bubble` container query'de, `.ct-rejoin-banner` grup + tekil,
`.ct-chat-system-call-label` çoklu seçicide) kasıtlı.

### 10.2 Tepki (reaction) rozetleri

Asıl kusur özgüllükteydi: `.ct-chat-bubble span` — `display:block`, **11px**,
`--ct-text-muted` — rozetin iki `<span>`'ini de yakalıyordu. Yani tepki emojisi,
bağlı olduğu mesajdan **küçük ve soluk** çiziliyordu; rozet yüksekliği ~17px,
WCAG 2.2'nin 24px hedef alt sınırının altında.

- İki span artık sınıflı (`ct-chat-reaction-emoji` / `-count`) ve kural
  `.ct-chat-reaction .ct-chat-reaction-emoji` (0,2,0) ile bubble kuralını
  özgüllükle yeniyor — sıraya bağlı değil.
- Rozet `h-control-xs` (24px), emoji 16px, sayı 11px bold `tabular-nums`.
- Hover durumu eklendi (önce hiç yoktu), `mine` durumunda sayı da `--ct-info`.
- `aria-label` sayıyı ve "sen dahil"i söylüyor; `title` ne olacağını.

### 10.3 Yanıt alıntısı (`ChatReplyQuote`)

Tek bileşen, iki yer: baloncuğun içi ve besteci şeridi.

- İki satırdan (blok `<strong>` + gövde) **tek satıra**: ok + isim + metin,
  ikisi de kırpılıyor. İsim `max-w-[45%]`, gövde `flex-1 truncate nowrap`.
- `opacity: 0.75` kaldırıldı — bütün bloğu soldurmak ismi de götürüyordu ve
  soluk `--ct-text-muted` baloncuk üstünde 4.5:1'in altına düşüyordu. İki yarı
  artık kendi rengini taşıyor.
- Ok, satırın "Yanıtla" düğmesiyle **aynı** glif (`EnterOutlined`).

### 10.4 Besteci şeridi

- Yanıt ve dosya rozetleri artık ayırt edilebiliyor: her biri ne olduğunu
  söyleyen bir etiketle açılıyor (`Yanıt` / `Dosya`), yanıt rozeti baloncuk
  içindeki alıntının aynı vurgu çubuğunu taşıyor.
- Kapatma düğmeleri `--ct-control-xs` (24px) ve tooltip'li.
- **Esc** yanıtı iptal ediyor (iki yüzeyde de). `mentionPicker.handleKeyDown`
  tuşu tükettiyse dokunulmuyor — Esc önce @ listesini kapatır.

### 10.5 Profil kartı

- **Sıçrama:** iskelet yalnız banner/baş/istatistikleri ayırıyordu; etiket satırı
  ve iki eylem yuvası (arkadaş ekle + hızlı mesaj) yoktu, sorgu inince kart
  ~100px büyüyüp kendi çapasını ekranda sürüklüyordu. Üçü de ayrıldı
  (`.tag`, `.bar` iskelet varyantları); `isSelf` sorgudan önce bilindiği için
  yalnız başkalarının kartında.
- **Hata dalında avatar 88px**, yüklenmişte 96px. 96'ya çekildi.
- **Etiketler** antd'nin `color="gold"` / `color="success"` hazır paletini
  kullanıyordu — uygulamanın tokenlarını değil. `.ct-profile-card-tag` +
  `.admin` / `.friend` varyantları `--ct-warning` / `--ct-success` üzerinden
  kuruldu; nötr olan varsayılan.

### 10.6 Dokunulan dosyalar (ek)

| Dosya | Değişiklik |
|---|---|
| `components/common/chat-message-parts.tsx` | `ChatReplyQuote` tek satır + ok; tepki rozetine sınıflar, `aria-label`, `title` |
| `components/user/users-direct-messages-panel.tsx` | Rozet etiketleri, tooltip'ler, Esc ile yanıt iptali |
| `components/lobby/lobby-chat-panel.tsx` | Aynısı (iki yüzey aynı sözleşme) |
| `components/user/user-profile-card.tsx` | İskelet pariteliği, avatar 96px, etiket sınıfları |
| `styles/modules/features/chat.css` | Çift `.ct-chat-composer` silindi; tepki, alıntı ve rozet blokları yeniden yazıldı |
| `styles/modules/features/workspace.css` | `.ct-profile-card-tag*`, iskelet varyantları |

### 10.7 Doğrulama (ek)

`tsc` · `eslint src` · `vite build` · `check-design-tokens` · `check-css-classes`:
temiz. Derlenmiş CSS'te tek `.ct-chat-composer` kuralı kaldığı ve `flex-direction:
column` verdiği, `.ct-chat-reply-quote>span`'in `.ct-chat-bubble span`'den sonra
geldiği (bayt konumu 121951 > 117303) doğrulandı.

Gözle bakılacaklar (§7'deki aynı sebeple ölçülemedi):

- [ ] Yanıt ve dosya rozetleri yazma kutusunun **üstünde**, tam genişlikte.
- [ ] Tepki rozeti mesaj metninden büyük; hover ve `mine` durumları ayrışıyor.
- [ ] Profil kartı açılırken zıplamıyor (yavaş bağlantıda kontrol).
