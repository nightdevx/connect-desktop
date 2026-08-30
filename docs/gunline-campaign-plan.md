# Cephe Hattı — Nişan Hattı'nın kampanya oyununa dönüşümü

Mevcut `gunline` mini oyunu (sonsuz dalga + 3 yükseltme kartı) referans
ekran görüntülerindeki hyper-casual "lane runner + gate" iskeletine
oturtulur, tema ortaçağdan **modern askeri**ye çevrilir, ve oyun
**bölüm tabanlı bir kampanyaya** genişletilir.

Bu dosya ne yapılacağını, hangi dosyaya dokunulacağını ve her fazın
"bitti" ölçütünü yazar. Sıra bağlayıcıdır: her faz kendinden öncekinin
üstüne oturur ve her faz sonunda oyun oynanabilir durumda kalır.

---

## 0. Bugün elde ne var

| Katman | Dosya | Durum |
|---|---|---|
| Mantık | `src/renderer/src/features/minigames/gunline-logic.ts` | 740 satır, saf (React/DOM yok), `check-minigames.cjs` standalone bundle ediyor |
| Sahne | `features/minigames/gunline-3d/scene.ts` | Three.js, InstancedMesh mermi/gölge/kıvılcım, particle havuzu, kamera sarsıntısı |
| Modeller | `features/minigames/gunline-3d/models.ts` | Kenney Blocky Characters (tek GLB + 6 renk varyantı), Blaster Kit (4 silah) |
| Ekran | `features/minigames/components/games/gunline.tsx` | 279 satır, `GameShell` içinde canvas + yükseltme overlay'i |
| Kayıt | `difficulty.ts` (`RULES_GUNLINE`), `minigames-catalog.tsx`, `minigame-rules.ts`, `store/minigame-scores.ts` | 3 zorluk, tek skor anahtarı `gunline:<difficulty>` |
| Stil | `styles/modules/features/minigame-boards.css` (`.ct-gunline-*`) | 8 sınıf |
| Sunucu | `backend-go/internal/minigame/score.go` | `gunline:{easy,normal,hard}` → max 5.000.000 |
| Guard | `scripts/check-minigames.cjs` (835–980. satırlar) | Dalga eğrisi monotonluğu, formasyon merkezi, 60 sn'lik gerçek koşu, skor tavanı |

Eldeki iskelet doğru: kapı (gate) mekaniği, dalga eğrisi, yükseltme
havuzu, birim formasyonu ve efekt kuyruğu zaten var. Kampanya bunların
**üstüne** kurulur, yerine değil.

---

## 1. Hedef oyun

**Ad:** Cephe Hattı (id `gunline` kalır — skor anahtarları ve sunucu
tavanı kırılmasın).

**Döngü:** Bölüm seç → teçhizat kur → hattı tut → yıldız/ganimet kazan →
kışlada kalıcı yükselt → bir sonraki bölüm.

**Bir koşunun anatomisi:**

1. **Brifing** — hedef, düşman kompozisyonu, arazi, modifiye kartları.
2. **Koridor** — ekran görüntüsündeki `+1` merdiveni. Müfreze koridorda
   ilerlerken kapılara ateş eder, sayıyı büyütür, içinden geçer.
3. **Hat** — koridor bitince kamera sabitlenir, dalga gelir, "HATTI TUT".
4. **Ara** — dalga arası 3 kart (mevcut `rollOffer`), destek yeteneği
   şarjı, mühimmat ikmali.
5. **Sonuç** — yıldız (1–3), ganimet, rütbe XP, rekor.

---

## 2. Dosya mimarisi

`gunline-logic.ts` 740 satırda zaten sınırda; kampanya onu 3000+ satıra
çıkarır. Faz 0'da klasöre bölünür. **Saf kalması şart** —
`check-minigames.cjs` onu Vite ile standalone bundle ediyor, içine React
veya DOM girerse check kırılır.

```
features/minigames/gunline/
  index.ts            barrel (dışarıya tek yüz)
  types.ts            tüm interface/union
  tuning.ts           sayısal sabitler (denge buradan çevrilir)
  rng.ts              mevcut seeded rng + pick
  weapons.ts          arsenal tablosu + ataşman
  enemies.ts          düşman specleri + spawn tabloları
  squad.ts            formasyon, uzmanlık sınıfları, birim istatistiği
  gates.ts            kapı türleri, şarj, uygulama
  abilities.ts        destek yetenekleri (hava desteği, havan, sis…)
  upgrades.ts         koşu içi kart havuzu
  levels.ts           kampanya tablosu (bölüm + wave script)
  objectives.ts       hedef değerlendirme + yıldız eşikleri
  economy.ts          ganimet, XP, rütbe eğrisi
  progression.ts      kalıcı yükseltme ağacı (saf; depolama ayrı)
  state.ts            createRun / stepRun / faz makinesi
```

Sahne katmanı:

```
features/minigames/gunline-3d/
  scene.ts            orkestrasyon (şu an her şey burada, incelir)
  environment.ts      arazi teması, sis, gökyüzü, yol dokusu, prop'lar
  squad-view.ts       müfreze render + poz
  enemy-view.ts       düşman render + havuz
  gate-view.ts        kapı slab + canvas etiketi (mevcut kod taşınır)
  vfx.ts              particle, tracer, decal, shell casing
  floaters.ts         3D hasar/sayı baloncukları
  camera.ts           dolly, shake katmanları, boss zoom
  models.ts           asset yükleyici (mevcut + askeri set)
```

Ekran katmanı:

```
features/minigames/components/games/gunline/
  index.tsx           mod yönlendirici (kampanya | sonsuz)
  campaign-map.tsx    bölüm seçim haritası
  briefing.tsx        bölüm brifingi
  loadout.tsx         teçhizat kurulumu
  board.tsx           mevcut gunline.tsx'in koşu kısmı
  run-hud.tsx         üst HUD (para, birim, dalga, yetenek soğumaları)
  upgrade-offer.tsx   mevcut kart overlay'i
  result.tsx          yıldız/ganimet ekranı
  barracks.tsx        kalıcı yükseltme ekranı
```

Depolama: `store/gunline-progress.ts` — `minigame-seen.ts` ile aynı
desen (try/catch'li localStorage, bozuk veri = sıfırdan başla).

**Zincir kırılmaması gereken yerler:** `check-minigames.cjs` içindeki
`"src/renderer/src/features/minigames/gunline-logic.ts"` yolu →
`gunline/index.ts` olarak güncellenir; `check-architecture.cjs` döngü
kuralı (store bir feature'ı import edemez) korunur; `check-css-classes`
her yeni `ct-gunline-*` sınıfının hem JSX'te hem CSS'te olmasını ister;
`check-design-tokens` her `var(--ct-*)`'ın tanımlı olmasını ister.

---

## 3. Fazlar

### Faz 0 — Yeniden bölme ve emniyet ağı

Oynanışta **sıfır** değişiklik. Amaç: sonraki 5 fazın üzerine
yazılabileceği bir zemin.

- `gunline-logic.ts` → yukarıdaki `gunline/` klasörüne bölünür,
  export yüzeyi `index.ts`'ten aynen dışarı verilir.
- `scene.ts` → `environment.ts` + `vfx.ts` + `gate-view.ts` ayrıştırılır.
- `check-minigames.cjs` yolu güncellenir; mevcut 8 assert korunur.
- `tuning.ts` çıkarılır: dalga eğrisi, kapı tavanları, hasar çarpanları
  tek dosyada toplanır (denge fazında tek yerden çevrilecek).
- Kalıcı depolama iskeleti: `store/gunline-progress.ts` + şema sürümü
  (`version: 1`) ve ileri uyumlu migrasyon kancası.

**Bitti ölçütü:** `pnpm typecheck && pnpm lint && node scripts/check-minigames.cjs && node scripts/check-architecture.cjs` yeşil, oyun bire bir eskisi gibi oynanıyor.

---

### Faz 1 — Muharebe derinliği

Kampanyadan önce **koşunun kendisi** zenginleşir; boş bir kampanya
iskeleti kurup içine sonra oyun koymak yanlış sıra.

#### 1.1 Müfreze sınıfları

Bugün her birim aynı. Sınıflar eklenir; formasyon içinde konum ve rol
alırlar:

| Sınıf | Rol | Kazanım yolu |
|---|---|---|
| Piyade | Temel, mevcut davranış | Başlangıç + kapı |
| Keskin nişancı | Yavaş, yüksek hasar, tek hedef, uzun menzil | Uzmanlık kapısı |
| Makineli | Yüksek atış hızı, düşük hasar, ısınma | Uzmanlık kapısı |
| Bombacı | Alan hasarı, mermi yayı | Kart |
| Sıhhiyeci | Dalga arası birim iade eder | Kart |
| İstihkam | Öne bariyer kurar, sızmayı geciktirir | Kart |

`unitOffsets` genişler: sınıflar sıraya göre değil **role göre**
dizilir (istihkam en önde, keskin nişancı en arkada). Formasyonun
merkezde kalması `check-minigames.cjs`'in mevcut assert'i — korunur.

#### 1.2 Arsenal

Mevcut 4 silah (`pistol/smg/shotgun/rifle`) 8'e çıkar: `+ lmg, dmr,
grenade, rail`. Her silaha 3 ataşman yuvası (namlu / şarjör / dürbün),
her yuva 2–3 seçenek. Ataşman koşu içi kart olarak da, kışlada kalıcı
olarak da gelebilir.

Silah verisi saf tablo (`weapons.ts`), model eşlemesi `models.ts`'te —
yeni GLB gelene kadar mevcut 4 blaster tekrar kullanılır (bkz. §5).

#### 1.3 Düşman kadrosu

Mevcut 6 tür (`runner/grunt/tank/shooter/splitter/boss`) korunur,
askeri isimlere geçer ve şunlar eklenir:

| Tür | Davranış | İlk göründüğü bölüm |
|---|---|---|
| Milis (runner) | Hızlı, zayıf | 1 |
| Piyade (grunt) | Zikzak | 1 |
| Ağır zırhlı (tank) | Yavaş, çok can | 3 |
| Nişancı (shooter) | Durur, ateş eder | 4 |
| İntihar bombacısı (splitter) | Ölünce alan hasarı | 6 |
| **Drone** | Havada, yerdeki bariyeri yok sayar, sadece belirli silahlar vurur | 8 |
| **Zırhlı araç (APC)** | Menzilli, birim döker | 12 |
| **Havan ekibi** | Ekranın dibinden alan atışı, telegraf halkası | 15 |
| **Sıhhiyeci** | Etrafındakini iyileştirir, öncelikli hedef | 18 |
| **Kalkanlı** | Önden mermi durdurur, yandan vurulur | 20 |
| **Parazit (jammer)** | Kapıları geçici devre dışı bırakır | 24 |
| **Komutan (boss)** | Çok fazlı, zayıf nokta, telegraf | her 5. bölüm |

Yeni davranışların hepsi `enemies.ts` içinde veri + `state.ts` içinde
tek `stepEnemies` dalı; ayrı sistem yazılmaz.

#### 1.4 Destek yetenekleri

Soğuma bazlı, koşu içinde 1–4 tuşu / HUD düğmesi:

- **Hava desteği** — imleçle seçilen şeritte hat hasarı.
- **Havan barajı** — 3 saniye gecikmeli alan, telegraf çemberi.
- **Sis perdesi** — düşman ateşi 4 saniye isabetsiz.
- **Takviye** — anında +N birim.
- **Adrenalin** — 6 saniye ×2 atış hızı.

Teçhizatta 2 yuva. Şarj: dalga temizleme + belirli kapılar.

#### 1.5 Kapı sistemi genişlemesi

Ekran görüntüsündeki uzun `+1` merdiveni **koridor modu** olarak gelir:
dalga başlamadan önce müfreze 6–12 kapılık bir koridordan geçer, hangi
şeridi seçtiği ("PICK YOUR LANE") sonuca girer.

Yeni kapı türleri (`gates.ts`):

| Tür | Etki |
|---|---|
| `add` / `mul` | Mevcut |
| `class` | Belirli sınıfa dönüştürür (keskin nişancı, makineli) |
| `weapon` | Silah yükseltir |
| `ammo` | Yetenek şarjı doldurur |
| `armor` | Müfrezeye N vuruşluk kalkan |
| `mine` (kötü) | Geçince birim patlatır |
| `toll` (nötr) | Erzak öder, birim alır — ekonomik seçim |

Kapı şarjı (ateşle büyütme) mevcut `GATE_ADD_HITS` / `GATE_MUL_HITS`
mantığıyla aynı; tavanlar `tuning.ts`'e taşınır.

**Bitti ölçütü:** sonsuz modda 20 dalga oynanabiliyor, her yeni düşman
türü en az bir kez sahneye çıkıyor, yetenekler soğuma ile çalışıyor,
`check-minigames.cjs` yeni assert'lerle (sınıf formasyonu merkezde,
yetenek soğuması pozitif, kapı tavanı aşılmıyor) yeşil.

---

### Faz 2 — Kampanya ve bölümler

#### 2.1 Bölüm veri modeli

```ts
interface GunlineLevel {
  id: number;
  chapter: ChapterId;
  name: string;
  terrain: TerrainId;
  objective: Objective;
  waves: WaveScript[];
  corridor: CorridorScript;
  modifiers: readonly ModifierId[];
  stars: { two: number; three: number };
  reward: { supplies: number; ammo: number; credits: number; xp: number };
}
```

Dalgalar artık formülle **üretilmez**, elle yazılır — ama formül
(`waveSizeOf`, `waveHealth`) varsayılan üretici olarak kalır, böylece
60 bölümün tamamı elle doldurulmadan da oynanabilir:
`levels.ts` bir jeneratör + bölüm başına elle override tablosudur.

#### 2.2 Hedef türleri (`objectives.ts`)

| Hedef | Bitiş koşulu | Yıldız ölçütü |
|---|---|---|
| Hattı tut | N dalga temizlendi | Kalan birim |
| Sızdırma | Tek düşman geçmeden | Sızma sayısı |
| Zamana karşı | Boss X saniyede | Kalan süre |
| Konvoy koru | Araç hattı geçene kadar | Konvoy canı |
| Bölge tut | X saniye alanda kal | Alan dışı süre |
| Tahliye | Sayaç dolana kadar dayan | Kalan birim |

#### 2.3 Bölüm modifiyeleri

Gece görüşü (görüş mesafesi kısa), kum fırtınası (isabet düşer),
mühimmat kıtlığı (atış hızı düşük, hasar yüksek), yoğun sis, yağmur
(kapı şarjı yavaş), düşman takviyesi (ikinci dalga üst üste).

#### 2.4 Bölüm haritası

`campaign-map.tsx`: bölümler zincir halinde, kilitli/açık/yıldızlı
durumlar, bölüm bazında rekor ve yıldız rozetleri. `GameShell` dışında
kendi düzenini kurar; oyun içi ekran `GameShell` içinde kalır.

**Bölüm dağılımı (ilk sürüm 60 bölüm, 6 bölüm/chapter × 10):**

| Chapter | Arazi | Bölüm | Getirdiği |
|---|---|---|---|
| 1 Eğitim Sahası | Talim alanı | 1–10 | Temel, kapı, kart |
| 2 Çöl Hattı | Çöl | 11–20 | Zırhlı araç, kum fırtınası |
| 3 Şehir Harabesi | Kent | 21–30 | Kalkanlı, dar şerit, siper |
| 4 Orman Sınırı | Orman | 31–40 | Drone, sis, pusular |
| 5 Kar Cephesi | Kar | 41–50 | Havan, kayma, gece |
| 6 Sanayi Bölgesi | Fabrika | 51–60 | Jammer, çok fazlı boss |

**Bitti ölçütü:** 60 bölüm oynanabilir, yıldız eşikleri erişilebilir
(check ile doğrulanır), kilit zinciri boşluk bırakmıyor, ilerleme
localStorage'da kalıcı.

---

### Faz 3 — Meta ilerleme ve ekonomi

#### 3.1 Para birimleri

Ekran görüntüsündeki üçlü HUD karşılığı:

| Birim | Kaynak | Harcama |
|---|---|---|
| **Erzak** | Bölüm ödülü, toll kapısı | Birim/sınıf yükseltmesi |
| **Mühimmat** | Dalga temizleme | Silah ve ataşman |
| **Künye (kredi)** | Yıldız, ilk geçiş, günlük görev | Yetenek yuvası, nadir yükseltme |

Enflasyon guard'ı: her bölümün ödülü `economy.ts`'te formülle üretilir,
ve `check-minigames.cjs` "60. bölümün ödülü 1. bölümünkinin K katından
fazla olamaz" assert'i ile sınırlanır.

#### 3.2 Rütbe ve XP

Er → Onbaşı → Çavuş → … → Albay. Her rütbe: bir yuva, bir kalıcı bonus
veya bir kozmetik kamuflaj açar. Eğri `economy.ts`, tek fonksiyon.

#### 3.3 Kışla (kalıcı yükseltme ağacı)

4 dal, dal başına 5 kademe:

- **Ateş gücü** — hasar, kritik, delme
- **İnsan gücü** — başlangıç birimi, sıhhiyeci iadesi, canlanma
- **Teçhizat** — yetenek yuvası, soğuma, ataşman yuvası
- **Lojistik** — ganimet çarpanı, kapı şarj hızı, mühimmat üretimi

Ağaç saf veri (`progression.ts`), uygulama `state.ts` içinde koşu
başlangıcında tek noktadan (`applyMeta(state, profile)`).

#### 3.4 Teçhizat ekranı

Bölüme girmeden: birincil silah + 2 yetenek + 1 pasif kart seçimi.
Brifing ekranında düşman kompozisyonu gösterilir ki seçim anlamlı olsun.

**Bitti ölçütü:** kışlada harcanan her puan koşuda ölçülebilir fark
yaratıyor; profil sıfırlama düğmesi var; bozuk localStorage profili
uygulamayı düşürmüyor.

---

### Faz 4 — Askeri tema ve görsel cila

Referans görüntülerin **kompozisyonu** hedef: geniş şerit, arkada
devasa düşman kütlesi, üstte para HUD'ı, ortada dev sayaç, altta
büyük harf yönlendirme yazısı.

#### 4.1 Model ve doku

Sıra ucuzdan pahalıya, ilki yeterse orada durulur:

1. **Kamuflaj dokusu üretimi** — mevcut Kenney karakteri, `models.ts`
   içinde canvas'ta üretilen kamuflaj atlas'ı ile yeniden boyanır
   (çöl/orman/kar/kent 4 desen, düşman için kırmızı-gri şema). Yeni
   dosya indirmeye gerek yok; UV düzeni zaten paylaşımlı.
2. Kenney **Blaster Kit** dışında CC0 askeri silah/araç seti (Kenney
   *Weapon Pack*, Quaternius *Modular Soldiers* / *Military Vehicles*)
   — sadece 1. adım yetmezse.
3. Prop kiti: kum torbası, dikenli tel, beton bariyer, varil, konteyner,
   yol tabelası — araziyi taşıyan asıl şey karakter değil bunlar.

Lisans dosyası (`assets/gunline/LICENSE.md`) her yeni pakette güncellenir.

#### 4.2 Arazi temaları (`environment.ts`)

Tema başına: yol dokusu (mevcut `laneTexture` genelleşir), sis rengi ve
menzili, ışık renk/şiddeti, kenar prop dizisi, gökyüzü rengi. Tema
değişimi tek `applyTerrain(id)` çağrısı; sahne yeniden kurulmaz.

#### 4.3 Kamera

- Koridor fazında hafif takip + yükseklik
- Hat fazında sabit, mevcut `cameraHome`
- Boss girişinde 1.2 sn dolly + FOV daralması
- Sarsıntı katmanlara ayrılır (atış / patlama / hasar), toplanır

#### 4.4 Juice listesi

Hasar sayıları (3D floater), kritik pop, kill streak bandı, sızma
kırmızı vinyet, ağır çekim boss ölümü, tracer çizgileri, namlu ışığı
(kısa ömürlü PointLight, bütçeli), boş kovan parçacıkları, isabet
decal'ı, dalga başında büyük harf yönlendirme yazısı ("HATTI TUT",
"MÜFREZENİ BÜYÜT", "ŞERİDİNİ SEÇ"), dev düşman sayacı.

Hepsi mevcut `effects` kuyruğu üzerinden — `EffectKind` union'ı büyür,
sahne tarafı yeni dallar alır. Mantık tarafı render bilmez, bu korunur.

#### 4.5 Ses

`sound-effects/manager.ts` içindeki `MINIGAME_PATTERNS`'e eklenir
(sentezlenmiş, dosya yok — mevcut ilke):
`rifleCrack`, `gateDing`, `gateBad`, `abilityCall`, `bossRoar`,
`levelUp`, `leakAlarm`. Not: bunlar `cues.ts` paletine değil minigame
paletine girer (pentatonik kuralı burada geçerli değil).

**Bitti ölçütü:** 6 arazi görsel olarak ayırt edilebiliyor, 60 fps
korunuyor (bkz. §4 bütçe), ses cue'ları `check-sound-cues.cjs`'i
kırmıyor.

---

### Faz 5 — Modlar, görevler, sıralama

- **Sonsuz mod** korunur (bugünkü oyun), rekor `gunline:<difficulty>`
  anahtarında kalır → sunucu tavanı ve mevcut kayıtlar bozulmaz.
- **Kampanya rekoru** ayrı anahtar: `gunline:campaign` (Go tarafında
  `score.go` bound tablosuna eklenir).
- **Günlük görev** — 3 görev, gün başında seed'le üretilir, künye verir.
- **Madalya/başarım** — 30 kadar, tamamı türetilebilir (profil
  sayaçlarından hesaplanır, ayrı olay kaydı tutulmaz).
- **Liderlik tablosu** — mevcut `minigame-leaderboard.tsx` yeniden
  kullanılır, mod seçici eklenir.
- **Zorluk** — kampanyada bölüm zaten zorluğu taşır; `RULES_GUNLINE`
  sonsuz mod için kalır ve kampanyada global çarpan olarak devreye girer.

---

### Faz 6 — Denge, performans, erişilebilirlik, testler

#### Performans bütçesi

| Kalem | Tavan |
|---|---|
| Ekrandaki asker (müfreze + düşman) | 120 iskelet |
| Kalabalık arka plan kütlesi | InstancedMesh, animasyonsuz, 2000 |
| Mermi | 700 (mevcut `MAX_BULLETS`) |
| Parçacık | 400 (mevcut 220'den) |
| Draw call | < 60 |
| Kare | 60 fps hedef, 45 altına inince otomatik düşürme |

Kalabalık (`585` sayacındaki kütle) **animasyonlu asker değil**;
tek InstancedMesh + vertex shader'da faz kaydırmalı salınım. Referans
görüntüdeki yüzlerce figür ancak böyle kaldırılır.

Otomatik düşürme sırası: parçacık → gölge → kalabalık yoğunluğu →
pixelRatio.

#### Erişilebilirlik

Tam klavye kontrolü (mevcut ok/A-D korunur, yetenekler 1–4, kart seçimi
rakam), `prefers-reduced-motion` ile sarsıntı/ağır çekim kapanır, kapı
iyi/kötü ayrımı **sadece renkle değil** ikonla da (✚ / ✖), durum satırı
`aria-live` (mevcut `GameShell` zaten sağlıyor).

#### Test / guard genişlemesi (`check-minigames.cjs`)

Yeni assert'ler:

1. Her bölüm ulaşılabilir — kilit zincirinde kopukluk yok.
2. Her bölümün 3 yıldız eşiği, o bölümün teorik maksimumunun altında.
3. Ödül eğrisi monoton ve tavanlı (enflasyon guard'ı).
4. Kalıcı yükseltme ağacında döngü yok, her düğümün önkoşulu mevcut.
5. Her yetenek soğuması > 0 ve süresi soğumadan küçük.
6. Her düşman türü en az bir bölümde spawn tablosunda geçiyor.
7. Kapı değeri tavanı aşmıyor, `mul` kapısı 0'a düşüremiyor.
8. Otomatik oynatılan 3 bölüm (kolay/orta/zor) sonlanıyor — sonsuz
   döngü yok — ve skor `score.go` tavanının altında.
9. Mevcut 8 assert aynen korunuyor.

Ek: `check-css-classes` ve `check-design-tokens` yeni `.ct-gunline-*`
sınıfları ve token'ları için otomatik geçer — yeni token gerekiyorsa
`base.css`'te tanımlanır, uydurma `var()` bırakılmaz.

---

## 4. Sunucu tarafı

**Uygulamada sunucuya hiç dokunulmadı, ve bu bilinçli bir karar.**

Kampanya rekoru ayrı bir skor anahtarı (`gunline:campaign`) olarak
planlanmıştı. Ama `splitScoreKey` her anahtarı `oyun:zorluk` diye
ayrıştırıyor ve `isScoredKey` `MINIGAME_IDS` içinde olmayan bir oyunu
eliyor — yani böyle bir anahtar sunucuya hiç ulaşmaz, sadece ölü kod
bırakırdı. Bunun yerine:

- **Sonsuz mod** eski `gunline:<zorluk>` anahtarında kalır. Rekor tablosu
  ve `score.go` tavanı (5.000.000) aynen geçerli, eski kayıtlar bozulmaz.
  Sonsuz mod teçhizat ve kışla bonusu tanımaz, böylece rekorlar
  karşılaştırılabilir kalır.
- **Kampanya bölüm rekorları** profilde (localStorage) tutulur.

Profil senkronu **erteleme adayı**: localStorage tek makinede yeter,
çok cihaz talebi gelmeden sunucuya profil şeması eklemek erken.
Eklenirse `check-ipc-channels.cjs` ve preload feature-detection deseni
(bkz. `score-service.ts`) aynen izlenir.

---

## 5. Riskler ve kararlar

| Risk | Karar |
|---|---|
| Askeri model seti bulunamaz / lisans sorunlu | Faz 4.1 adım 1: mevcut Kenney karakterini prosedürel kamuflaj dokusuyla yeniden boya. Yeni GLB indirmeye gerek yok, en ucuz yol bu. |
| Referanstaki yüzlerce figür FPS'i düşürür | Kalabalık animasyonsuz InstancedMesh; sadece ön saf iskeletli. |
| 60 bölümün elle dengesi | Jeneratör + override tablosu; elle yazılan sadece dönüm noktası bölümleri. |
| `gunline-logic` saflığını kaybetmek | `check-minigames.cjs` zaten standalone bundle ediyor — React/DOM girerse build patlar. Guard yerinde. |
| Skor tavanı (5M) kampanyada aşılır | Kampanya ayrı anahtar + ayrı tavan; sonsuz mod tavanına dokunulmaz. |
| Kapsam şişmesi | Faz 1 ve 2 tek başına oynanabilir bir oyun verir. Faz 3–5 opsiyonel katman; sırayla kesilebilir. |

**Şimdilik yapılmayacaklar (bilinçli):** çok oyunculu cephe modu, bulut
profil senkronu, kozmetik mağaza, ses dosyası ile müzik, mobil dokunmatik
düzen, oynanış kaydı/tekrar izleme. Talep gelirse eklenir.

---

## 6. Sıra ve kabul

| Faz | Çıktı | Ölçüt |
|---|---|---|
| 0 | Bölünmüş dosyalar | Tüm check'ler yeşil, oynanış birebir aynı |
| 1 | Derin muharebe | 20 dalga oynanabilir, 12 düşman türü, 5 yetenek, 7 kapı türü |
| 2 | 60 bölümlük kampanya | Harita, hedefler, yıldız, kalıcı ilerleme |
| 3 | Ekonomi + kışla | 3 para, 4 dallı ağaç, rütbe, teçhizat ekranı |
| 4 | Askeri tema | 6 arazi, kamuflaj seti, juice listesi, 7 ses cue |
| 5 | Modlar | Sonsuz + kampanya, görev, madalya, sıralama |
| 6 | Cila | 60 fps, a11y, 9 yeni guard assert |

Her fazın sonunda çalıştırılacak: `pnpm typecheck && pnpm lint && pnpm check`.

---

## 7. Durum — uygulandı

Altı fazın tamamı uygulandı. Ortaya çıkan dosya yapısı:

```
features/minigames/gunline/            saf mantık (React/DOM yok)
  types tuning rng weapons enemies squad gates abilities
  upgrades economy levels objectives progression profile state index

features/minigames/gunline-3d/         sahne
  models environment vfx floaters gate-view
  squad-view enemy-view soldier-pool camera scene

features/minigames/components/games/gunline/   ekran
  index board hud-model run-hud upgrade-offer result
  campaign-map briefing loadout barracks use-gunline-profile

store/gunline-progress.ts              localStorage
styles/modules/features/gunline.css    kendi stil dosyası
```

Eski `gunline-logic.ts` ve `components/games/gunline.tsx` kaldırıldı;
katalog kaydı (`./components/games/gunline`) klasör index'ine çözülüyor,
yani dış dünyada import yolu değişmedi.

**Sayılarla:** 60 bölüm / 6 bölge, 12 düşman türü, 6 müfreze sınıfı,
8 silah + 9 ataşman, 5 destek yeteneği, 8 kapı türü, 6 hedef türü,
6 saha modifiyesi, 10 kalıcı yükseltme düğümü (4 dal), 12 rütbe,
12 madalya, 3 günlük görev, 6 arazi teması.

**Doğrulama:** `check-minigames.cjs` gunline bölümü, eski 8 assert'i
koruyarak kampanya iskeleti, ödül eğrisi, yıldız eşikleri, yetenek
soğumaları, yükseltme ağacı, profil kurtarma ve otomatik oynanan üç
kampanya bölümü için genişletildi. Tam takım (`pnpm check`, 33 kontrol),
`tsc --noEmit`, `eslint src` ve `vite build` temiz.

**Denge notu:** komutanın havan desteği ve ağır zırhlının zırh oranı,
otomatik test koşusu beşinci dalgayı geçemediği için düşürüldü
(`gunline/enemies.ts`). Denge sayıları `gunline/tuning.ts` ve
`gunline/enemies.ts` içinde; başka yerde sabit yok.

---

## 8. Mobil oyun arayüzü — ikinci geçiş

Referans ekran görüntülerindeki hyper-casual dikey oyun görünümü hedef
alınarak arayüz ve sahne baştan kuruldu.

### Kabuk

`GameShell` gunline için tamamen bırakıldı. Yerine `shell.tsx`:

- **`PhoneFrame`** — dikey telefon çerçevesi (9 : 19.5), yüksekliği
  `100cqh`'den türetilir (`.ct-minigames-page` zaten `container-type: size`),
  genişlik orandan hesaplanır. Grid'in `auto` sütununun ölçebilmesi için
  genişlik **kesin** bir değer; `aspect-ratio` ile bırakılsa sütun ölçümü
  döngüye girerdi.
- **`TopBar` + `Wallet`** — referanstaki para satırı: avatar karesi ve üç
  yuvarlak jeton (erzak / mühimmat / künye), 1000+ değerler `K`/`M` kısaltmalı.
- **`TabBar`** — alt sekme çubuğu: Harita · Teçhizat · Kışla · Görev.
- **`GameButton`, `Stars`** — antd yerine kalın, gölgeli, basınca çöken
  mobil oyun düğmeleri ve yıldız rozeti.

Antd `Button` gunline'dan tamamen çıktı; her ekran tam ekran, kaydırmalı,
büyük dokunma hedefli.

### Koşu ekranı

Tam kaplayan canvas + üstünde `pointer-events: none` HUD katmanı:
üstte cüzdan ve çıkış, altında hedef çubuğu, sağda dev beyaz konturlu
düşman sayacı, ortada büyük harf yönlendirme yazısı ("ŞERİDİNİ SEÇ",
"HATTI TUT"), altta müfreze rozetleri ve yuvarlak yetenek düğmeleri.
Kontrol dokunmatik: `setPointerCapture` ile parmağı sürükle, müfreze o
şeride kayar. Klavye (A/D, 1-4) yedek olarak duruyor.

### Sahne

| Değişiklik | Neden |
|---|---|
| Şerit → **su üstünde köprü**: güverte, iki korkuluk + kapak taşı, ayaklar, geniş su düzlemi | Referansın kompozisyonu bu |
| Kapılar → **merdiven**: bölümün bütün kapı sıraları başta tek seferde, `LEAK_Z - 2.8 * n` konumlarında | Referanstaki uzun `+1` dizisi ancak hepsi aynı anda sahnedeyse görünür |
| Kapı görünümü → geniş mavi levha, koyu çerçeve, dev beyaz konturlu rakam | Referans |
| Kalabalık → 240 örnekli koni bloğu, güvertenin dibinde, kalan spawn ile küçülür | Yüzlerce animasyonlu asker kare bütçesini yer |
| Kamera → dikey kadraj: `(0, 5.8, 9.6)` → `(0, 1, -9)`, fov 50 | İlk deneme fov 44 idi; müfreze kadrajın 1.5° dışında kalıyordu — açı hesaplandı, düzeltildi |
| Arka plan → `setClearColor` tema sisiyle, `alpha: false` | Ufuk çizgisi sisle birleşsin |

### Stil

`gunline.css` tamamen yeniden yazıldı, `ct-gunline-*` sınıflarının tamamı
kaldırıldı, yerine `ct-gl-*` seti geldi. Oyunun kendi sanat yönü olduğu
için renkler burada sabit (mavi `#4a94ff`, altın `#f0b429`, kırmızı
`#e8443a`); paylaşılan token'lar sadece gölge, yazı tipi ve süre için.

---

## 9. Görsel doğrulama — üçüncü geçiş

İlk iki geçiş "kod derleniyor, check'ler yeşil" ile bitmişti; ekranda
nasıl durduğunu kimse görmemişti. Bu geçişte önce **bakma yolu** kuruldu,
sonra görülenler düzeltildi.

### Önizleme koşum takımı

- `src/renderer/preview.html` + `preview.tsx` — oyunu tek başına, panelin
  grid bağlamı taklit edilerek mount eder ve `localStorage`'a temsili bir
  profil yazar. Feature'a `@/features/minigames` barrel'ından
  `findMinigame("gunline")` ile ulaşır (derin import'u
  `check-architecture.cjs` reddediyor), ve arama render anında yapılır —
  modül seviyesinde yapılınca dairesel init yüzünden `undefined` geliyordu.
- `npx vite --port 5174` ile dev sunucu, ardından Electron'un kendi
  binary'siyle koşan küçük bir ekran görüntüsü uygulaması: pencereyi açar,
  DOM'a tıklayarak sekmeler/bölüm/koşu arasında gezinir ve her adımı
  `capturePage()` ile PNG'ye yazar.
- İki tuzak: Electron'u bu ortamda çalıştırmak için `ELECTRON_RUN_AS_NODE`
  temizlenmeli (aksi halde `require("electron")` bulunamıyor), ve pencere
  `show: false` iken rAF kısıtlanıyor — oyun ağır çekim akıyor, bu yüzden
  pencere görünür açılıyor.

### Bakınca çıkanlar

| Görülen | Düzeltme |
|---|---|
| Kamera çok yakındı, köprü bir noktaya çöküyordu | `(0, 9.4, 15)` → `(0, 1.2, -12)`, fov 46 |
| Kapı levhaları ekranı kaplıyordu, üst üste biniyordu | Levha 2.1 × 1.2'ye küçüldü, sıra aralığı 2.8 → 4.6 |
| Askerler kapkara çıkıyordu | Kamuflaj `multiply` yerine `source-atop` + %45 alfa, açık tonlar |
| Dost/düşman ayırt edilemiyordu | Düşman dokuları da aynı fonksiyondan kırmızı tonla geçiyor |
| Gök ile deniz aynı renkti, ufuk yoktu | Temaya ayrı `sky` alanı; sis ve arka plan gökten, deniz kendi renginde |
| "HATTI TUT" yazısı müfrezenin üstüne biniyordu | Banner hedef çubuğunun altına taşındı, yetenek sırası `mt-auto` ile dibe |
| Kalabalık kırmızı dikenlere benziyordu | Koni → kutu, hafif yükseklik salınımı |
| Brifingde bölüm rozeti kırpılıyordu | Gövdeye üst boşluk, kahramana `mt-5` |
| Satın alınabilir silahlar kilitli gibi soluktu | Yeni `buy` durumu: mavi çerçeve, tam opaklık |

### Bakınca çıkan iki gerçek oyun hatası

1. **Kapı şeridi seçilemiyordu.** Uygulama yarıçapı müfreze genişliğinden
   türetiliyordu (`0.95 + half * 0.5` ≈ 1.85), kapılar ise `x = ±1.5`'te.
   Ortada duran oyuncuya **her iki kapı da** uygulanıyordu — yani "şeridini
   seç" diye bir şey yoktu ve kötü kapıdan kaçmak imkânsızdı. Sabit
   `GATE_HALF_WIDTH = 1.05` ile şeritler gerçekten ayrıldı.
2. **Koridor oyunu bitirebiliyordu.** Arka arkaya kötü kapı müfrezeyi sıfıra
   indirip daha ilk dalga başlamadan görevi düşürüyordu (test koşusu 3
   saniyede kaybediyordu). İki kural eklendi: bir kapı müfrezeyi asla 1'in
   altına indiremez, ve koridor bittiğinde mevcut başlangıç mevcuduna
   tamamlanır. Kötü `add`/`mine` kapılarının büyüklüğü de o anki mevcudun
   yarısıyla sınırlandı.

Bu ikisi sadece koda bakarak değil, oyunu oynayıp ekranı görerek çıktı.
