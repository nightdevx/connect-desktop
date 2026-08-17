# Yönetim Paneli — Analiz ve Yol Haritası

Son güncelleme: 2026-08-17

Bu belge yönetim panelinin bugün ne yapabildiğini, nerede kör kaldığını ve
sırayla ne eklenmesi gerektiğini kaydeder. Sıralama "yöneticinin şu anda
yapamadığı için başka birine yazmak zorunda kaldığı iş" ölçüsüne göre.

---

## 1. Bugün ne var

| Alan | Yapılabiliyor | Yapılamıyor |
|---|---|---|
| **Kullanıcı** | listeleme/arama/filtre, profil düzenleme, rol değiştirme, şifre sıfırlama, yasaklama, silme, **oturumları kapatma** | e-posta doğrulamasını elle işaretleme, hesap birleştirme, toplu işlem |
| **Oda** | canlı liste, katılımcı görme, susturma, odadan atma, ad/kilit/izin listesi düzenleme, silme | oda başına kalıcı ban listesini görme/yönetme, oda taşıma, kapasite değiştirme |
| **Aktivite** | giriş/çıkış/oluşturma/silme/güncelleme logları, oda+kullanıcı+tip+metin filtresi | dışa aktarma, saklama süresi, mesaj/moderasyon olayları |
| **Ses (yeni)** | tüm yüklenen sesleri görme, silme, genel hak, kullanıcıya özel hak | otomatik içerik denetimi |
| **Sistem** | DB/LiveKit durumu, API adresi, çalışma modu, 12 saatlik olay grafiği | ayarları panelden değiştirme, duyuru yayınlama, bakım modu |

Yetki modeli tek kademeli: `admin` ya da `member`. Ara kademe yok.

## 2. Bu turda eklenenler

1. **Oturumları Kapat** (`POST /admin/users/{id}/force-logout`)
   Yasaklamadan, hedefe görünmeden, tüm refresh token'ları iptal eder, o ana
   kadar üretilmiş access token'ları geçersiz kılar ve kullanıcıyı her sesli
   odadan düşürür. Öncesinde tek çare "yasakla-sonra-kaldır"dı; LiveKit token'ı
   12 saat geçerli olduğu için sadece oturumu bitirmek yetmiyordu.

2. **Sesler sayfası** — yüklenen tüm emote sesleri, sahibi, boyutu, silme;
   genel yükleme hakkı ve kullanıcıya özel hak (`PUT /admin/emote-quota`).

3. **Sayım uçları** — `/admin/stats` artık yönetici/üye/doğrulanmış/yasaklı
   sayılarını da döndürüyor; pano bunları saymak için tüm kullanıcı tablosunu
   çekmeyi bıraktı.

## 3. Sıradaki işler

Her madde: **ne**, **neden**, **maliyet** (backend + client).

### Öncelik 1 — moderasyonun eksik yarısı

- **Oda ban listesi ekranı.** Backend'de `BanFromLobby`/`UnbanFromLobby`/
  `ListLobbyBans` zaten var ve kalıcı; panelde hiçbir yerde görünmüyor. Yani
  bir yönetici kimin hangi odadan banlı olduğunu göremiyor, kaldıramıyor.
  *Maliyet:* 2 uç + genişletilmiş oda satırına bir sekme. ~120 satır.

- **Mesaj moderasyonu.** Sohbet mesajı silme yalnızca sahibinde ve lobi
  sahibinde. Yönetici bir odadaki mesajı panelden silemiyor, arayamıyor.
  *Maliyet:* mevcut `chat` arama ucuna admin kapsamı + yeni sayfa. ~250 satır.

- **Denetim kaydına moderasyon olayları.** `audit_lobby_events` yalnızca
  giriş/çıkış/oda CRUD tutuyor. Kim kimi susturdu/attı/yasakladı, kim kimin
  şifresini sıfırladı — hiçbiri kayıtlı değil, yani panelden yapılan işlerin
  kendisi denetlenemiyor. *Maliyet:* olay tipi sabitleri + 6 çağrı noktası.
  ~80 satır, en yüksek fayda/maliyet oranı bu.

### Öncelik 2 — operatör kontrolü

- **Sunucu ayarları sayfası.** `app_settings` tablosu bu turda açıldı; şu an
  yalnızca ses kotası kullanıyor. Aynı yere taşınabilecekler: oda kapasitesi
  (bugün env), kayıt açık/kapalı, davet kodu zorunluluğu, dosya eki boyutu,
  avatar boyutu. *Maliyet:* uç başına ~20 satır + tek sayfa.

- **Duyuru yayını.** Tüm bağlı istemcilere bir sistem mesajı. Lobi websocket'i
  ve kullanıcı dizini soketi zaten fan-out yapıyor, taşıyacak kanal var.
  *Maliyet:* 1 uç + 1 frame tipi + istemcide bir bildirim. ~90 satır.

- **Bakım modu.** Yeni girişleri reddeden, bağlı olanlara sebep gösteren bir
  bayrak. Dağıtım sırasında kullanıcıyı sessiz hatalarla baş başa bırakmamak
  için. *Maliyet:* middleware + ayar. ~60 satır.

### Öncelik 3 — ölçek ve görünürlük

- **Sunucu tarafı sayfalama.** `/admin/users` bütün tabloyu belleğe alıp
  filtreleyip dilimliyor; `/admin/lobbies` de öyle. Birkaç yüz kullanıcıya
  kadar sorun değil, sonrası her istekte tam tarama.
  *Maliyet:* SQL'e taşımak, ~150 satır.

- **Avatarsız liste projeksiyonu.** `AdminUserDetail` avatarı base64 data URL
  olarak taşıyor. Tablo için gerekli, ama açılır listeler ve sayımlar için
  değil. `?fields=lite` benzeri bir projeksiyon, aktivite ve oda sayfalarının
  açılışını megabaytlardan kilobaytlara indirir.

- **Log dışa aktarma + saklama.** CSV/JSON indirme ve N günden eski kayıtları
  temizleyen bir iş. Şu an tablo sonsuza kadar büyüyor.

- **Kademeli yetki (moderatör).** Susturma/atma yapabilen ama kullanıcı silip
  rol değiştiremeyen bir ara rol. Tek yönetici rolü, günlük moderasyonu
  yapacak kişiye hesap silme yetkisi de vermek zorunda bırakıyor.

## 4. Bilinçli olarak yapılmayanlar

- **Otomatik ses/görsel denetimi.** Yüklenen sesler için içerik analizi yok;
  kontrol kota + görünür sahiplik + tek tıkla silme üzerinden. Bir sunucu
  topluluğu için bu yeterli, model çalıştırmak değil.
- **Kullanıcı adına giriş (impersonation).** Hata ayıklamada işe yarar, ama
  denetlenebilir bir iz bırakmadan yapılırsa panelin kendisi bir arka kapıya
  dönüşür. Moderasyon olayları denetim kaydına girmeden bu maddeye
  girilmemeli.
