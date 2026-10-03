import { compareVersions } from "@shared/update-contracts";

/**
 * What changed, per version, and the bookkeeping that decides when to say so.
 *
 * The list below is the changelog the "Yenilikler" dialog reads. Newest FIRST —
 * `notesSince` returns them in this order and the dialog renders them in it, so
 * a person who skipped three releases reads the newest one at the top.
 *
 * Adding a release means adding an entry here and nothing else. The version
 * string has to match package.json's, because what the dialog compares against
 * is `app.getVersion()`.
 */

export type ReleaseHighlightKind = "new" | "improved" | "fixed";

export interface ReleaseHighlight {
  kind: ReleaseHighlightKind;
  text: string;
}

export interface ReleaseNote {
  version: string;
  /** ISO date, rendered as a plain Turkish date in the dialog. */
  date: string;
  /** One line under the version heading. Optional: most releases need none. */
  summary?: string;
  highlights: ReleaseHighlight[];
}

export const RELEASE_HIGHLIGHT_LABELS: Record<ReleaseHighlightKind, string> = {
  new: "Yeni",
  improved: "İyileştirme",
  fixed: "Düzeltme",
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "0.2.9",
    date: "2026-10-04",
    highlights: [
      {
        kind: "new",
        text: "Birebir aramalar artık uçtan uca şifreli: konuşmanı sunucu dahil kimse dinleyemez. Aramadaki kilidin üzerine gelince güvenlik kodunu görürsün; karşı taraftaki kodla aynıysa arada kimse yok.",
      },
      {
        kind: "new",
        text: "Hesabını iki adımlı doğrulamayla koruyabilirsin: Ayarlar > Güvenlik. Açınca girişte telefonundaki doğrulama uygulamasının kodu da sorulur.",
      },
      {
        kind: "new",
        text: "Bir yayını izlemeden önce ne paylaşıldığını görebilirsin: CANLI etiketinin üzerine gelince küçük bir önizleme çıkıyor.",
      },
      {
        kind: "improved",
        text: "Oyun oynarken yayın açtığında oyun daha az yavaşlıyor. Yayını başlatırken bir oyun açıksa, oyunu en az etkileyen kalite de gösteriliyor.",
      },
      {
        kind: "fixed",
        text: "\"Devam eden bir aramanız var\" uyarısı, arama bittiğinde artık kendiliğinden kayboluyor.",
      },
    ],
  },
  {
    version: "0.2.8",
    date: "2026-10-03",
    highlights: [
      {
        kind: "new",
        text: "Arkadaşlarının oynadığı oyunlar artık oyunun kendi simgesiyle görünüyor: Arkadaşlar sayfasının üstünde, profil kartında ve sohbet başlığında.",
      },
    ],
  },
  {
    version: "0.2.7",
    date: "2026-10-03",
    highlights: [
      {
        kind: "improved",
        text: "Arkadaşlarının oynadığı oyunlar daha iyi tanınıyor. Marvel Rivals, Battlefield 6, Among Us, Zula, Metin2 ve Knight Online dahil 40'a yakın oyun eklendi.",
      },
      {
        kind: "fixed",
        text: "Bilgisayarda Minecraft dışında bir Java programı açıkken artık yanlışlıkla \"Minecraft oynuyor\" görünmüyor.",
      },
    ],
  },
  {
    version: "0.2.6",
    date: "2026-10-03",
    highlights: [
      {
        kind: "fixed",
        text: "Yönetim panelindeki sunucu ayarları (bakım modu, davetle kayıt, mesaj saklama süresi ve diğerleri) artık gerçekten kaydediliyor.",
      },
    ],
  },
  {
    version: "0.2.5",
    date: "2026-10-03",
    highlights: [
      {
        kind: "new",
        text: "Arkadaşlarının hangi oyunu oynadığı artık profil kartında, Arkadaşlar sayfasında ve sohbet başlığında görünüyor.",
      },
      {
        kind: "fixed",
        text: "\"Şifremi unuttum\" ve e-posta doğrulama kodları artık herkese ulaşıyor.",
      },
      {
        kind: "new",
        text: "Önemli bir güncelleme çıktığında uygulama bunu açıkça söylüyor ve \"Tamam\"a basınca kendini güncelliyor. Güncelleme bitene kadar uygulama kullanılamıyor.",
      },
    ],
  },
  {
    version: "0.2.4",
    date: "2026-10-03",
    highlights: [
      {
        kind: "improved",
        text: "Ekran paylaşımı çok daha akıcı. Ekran sabitken de izleyenlerde takılma olmuyor.",
      },
      {
        kind: "fixed",
        text: "Lobideyken bağlantı kısa bir süre koptuğunda lobi görünümü kaybolmuyor. Uygulama kendiliğinden yeniden deniyor ve hata mesajları sadeleşti.",
      },
      {
        kind: "improved",
        text: "Yönetim panelinde aktif oturumlar her cihaz için tek satır olarak görünüyor.",
      },
    ],
  },
  {
    version: "0.2.3",
    date: "2026-10-03",
    highlights: [
      {
        kind: "fixed",
        text: "Geniş ekranlardan yapılan yayınlar, küçük pencereden izleyenlere de net gidiyor ve bilgisayarı daha az yoruyor.",
      },
    ],
  },
  {
    version: "0.2.2",
    date: "2026-10-03",
    summary: "Ekran paylaşımı daha net ve daha akıcı; profil resimleri her yerde görünüyor.",
    highlights: [
      {
        kind: "improved",
        text: "Ekran paylaşımı daha net görünüyor, özellikle oyun ve video gibi hareketli görüntülerde.",
      },
      {
        kind: "fixed",
        text: "İnternetin bir anlığına yavaşladığında yayının kalitesi artık kalıcı olarak düşmüyor; bağlantı düzelince kendiliğinden eski haline dönüyor.",
      },
      {
        kind: "improved",
        text: "Yayın başlatırken \"Otomatik\" seçeneği artık akıcılığı öne alıyor. Yazı ya da kod paylaşıyorsan \"Metin\"i seçersen yazılar net kalır.",
      },
      {
        kind: "improved",
        text: "İzlediğin yayınlar daha az takılıyor.",
      },
      {
        kind: "new",
        text: "Yayın sırasında bilgisayarın görüntüyü işlemekte zorlanırsa sana haber veriyoruz ve ne yapabileceğini söylüyoruz.",
      },
      {
        kind: "fixed",
        text: "Ayarlar'daki \"Donanım hızlandırma\" seçeneği kapatıldığında artık gerçekten kapanıyor.",
      },
      {
        kind: "fixed",
        text: "Profil resimleri artık her yerde görünüyor: kendi mesajlarında, oda sohbetinde ve liderlik tablosunda. Resimlerin kenarındaki renkli halka da kaldırıldı.",
      },
    ],
  },
  {
    version: "0.2.1",
    date: "2026-10-03",
    summary: "Ses daha erken geliyor, bağlantı kopmalara daha dayanıklı; Ayarlar, Yönetim, Oyunlar ve Kampanya sayfaları yenilendi.",
    highlights: [
      {
        kind: "improved",
        text: "Bir odaya girdiğinde diğerlerinin sesi daha erken geliyor: bağlantı kurulurken ses de hazırlanıyor.",
      },
      {
        kind: "improved",
        text: "Uygulama sunucuya artık tek bağlantıyla bağlanıyor. Kısa internet kopmalarında kendiliğinden ve daha hızlı toparlanıyor; arkadaşların seni bir anlığına çevrimdışı görmüyor.",
      },
      {
        kind: "fixed",
        text: "İnternet geri geldiğinde ya da bilgisayar uykudan uyandığında, sağlam olan bağlantılar gereksiz yere yeniden kurulmuyor.",
      },
      {
        kind: "fixed",
        text: "Birebir görüşme sırasında sol alttaki bağlantı kartı \"Lobiye bağlı değil\" yazıyordu.",
      },
      {
        kind: "fixed",
        text: "Müzik botu: şarkıların son saniyesi artık kesilmiyor, ses sunucusu yeniden başlarsa müzik kaldığı yerden devam ediyor.",
      },
      {
        kind: "improved",
        text: "Ayarlar sayfaları tek düzende: her bölüm başlıklı kartlarda, simgeli satırlarla.",
      },
      {
        kind: "improved",
        text: "Yönetim paneli gruplanmış yan menüyle yenilendi; tablolar dizüstü ekranlarda da taşmıyor.",
      },
      {
        kind: "improved",
        text: "Oyunlar ve Kampanya sayfaları uygulamanın geri kalanıyla aynı görünümde. Rekorlar, masa doluluğu ve kategori sayıları menü satırlarının sonunda.",
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-10-02",
    summary: "Uygulamanın tamamı yeni tasarımda; aramalar artık sohbet geçmişinde.",
    highlights: [
      {
        kind: "new",
        text: "Aramalar sohbette görünüyor: biten aramalar süresiyle, cevapsız ve reddedilen aramalar kırmızıyla. Cevapsız bir aramanın yanındaki \"Geri ara\" ile tek tıkla geri arayabilirsin.",
      },
      {
        kind: "improved",
        text: "Lobi araç çubuğu yenilendi: düğmeler yuvarlak, kapalı mikrofon ve kulaklık kırmızı görünüyor. Sol alttaki kontroller de aynı kuralla çalışıyor.",
      },
      {
        kind: "new",
        text: "Oda başlığında odada ne kadar süredir olduğun görünüyor. Görüşmede de süre ve bağlantı kalitesi sahnenin köşesinde.",
      },
      {
        kind: "improved",
        text: "Başka bir sayfadayken çalan ya da süren arama sol alttaki kontrol alanında duruyor; tıklayınca görüşmeye dönersin. Gelen arama kartından o kişinin aramalarını tek tıkla sessize alabilirsin.",
      },
      {
        kind: "new",
        text: "Sohbet listesinde her sohbetin son mesajı görünüyor. Bekleyen arkadaşlık istekleri Arkadaşlar satırında sayılıyor; sohbet başlığında kişinin hangi odada ya da oyunda olduğu yazıyor.",
      },
      {
        kind: "new",
        text: "Arkadaşlar sayfasındaki menüden bir arkadaşının profilini açabilirsin.",
      },
      {
        kind: "improved",
        text: "Ayarlar ve Yönetim sayfaları yeni tasarıma geçti; tüm sayfalar aynı başlık ve seçim görünümünü kullanıyor. Tema artık iki kartla seçiliyor.",
      },
      {
        kind: "fixed",
        text: "Büyük pencerede sohbet açıkken kutucuklar bazen tek sütuna düşüp oda başlığının altına giriyordu.",
      },
      {
        kind: "fixed",
        text: "Bir aramadan iki taraf da ayrıldığında, önce ayrılanda \"devam eden bir aramanız var\" bandı kalıyordu.",
      },
      {
        kind: "fixed",
        text: "Sohbetteki profil çekmecesi açık temada da koyu görünüyordu.",
      },
    ],
  },
  {
    version: "0.1.107",
    date: "2026-10-02",
    highlights: [
      {
        kind: "fixed",
        text: "Ekran paylaşırken dar pencerede (sohbet açıkken) araç çubuğu iki satıra taşıyor, \"Lobiden Ayrıl\" düğmesi alta düşüyordu. Artık \"Yayında\" düğmesi küçülüyor ve araç çubuğu tek satırda kalıyor.",
      },
    ],
  },
  {
    version: "0.1.106",
    date: "2026-10-02",
    summary: "Sesli görüşmeler daha sağlam ve daha hızlı; arayüz baştan yenilendi.",
    highlights: [
      {
        kind: "improved",
        text: "Kısa bir internet kesintisinde görüşme baştan kurulmuyor: bağlantı birkaç saniyede kendini topluyor ve mikrofonun yeniden açılmıyor. Hızla oda değiştirirken de yersiz \"bağlantı koptu\" uyarısı çıkmıyor.",
      },
      {
        kind: "improved",
        text: "Odaya girince sesler daha çabuk geliyor: sunucuyla iki yerine tek bağlantı kuruluyor.",
      },
      {
        kind: "improved",
        text: "Ekran paylaşırken ses öncelikli. İnternetinin yükleme tarafı darsa görüntü biraz yumuşuyor, konuşman gecikmiyor ve kesilmiyor.",
      },
      {
        kind: "new",
        text: "Konuşan herkesin sesi aynı anda kayıplı geliyorsa, sorunun senin internet bağlantında olduğunu söyleyen bir uyarı çıkıyor.",
      },
      {
        kind: "fixed",
        text: "Bas-konuş tuşuna her basışta sesin ilk anı filtresiz gidebiliyordu. Artık mikrofon ilk andan itibaren gürültü engellemeden geçerek gidiyor.",
      },
      {
        kind: "fixed",
        text: "Kullandığın mikrofon ya da kulaklık çıkarılınca ses varsayılan cihazdan devam ediyor. Mikrofon susturulmuşken çıkarılsa bile artık çalışmaz hale gelmiyor; odadan çıkıp girmen gerekmiyor.",
      },
      {
        kind: "improved",
        text: "Bluetooth kulaklık, kendi mikrofonunu kullanmadığın sürece stereo ve temiz çalıyor. Kulaklığın mikrofonunu seçersen ses kalitesinin düşeceğini söyleyen bir uyarı çıkıyor.",
      },
      {
        kind: "new",
        text: "Ayarlar → Ses → Ses İşleme altına \"Ses seviyelerini dengele\" anahtarı eklendi. Açıkken yüksek ve alçak sesle konuşanlar birbirine daha yakın duyuluyor.",
      },
      {
        kind: "new",
        text: "Ayarlar → Bağlantı → Ağ Testi: bağlantını sunucuyla adım adım dener ve sorunun ağında mı sunucuda mı olduğunu gösterir.",
      },
      {
        kind: "new",
        text: "Bağlantı panelinde \"Tahmini Gecikme\": konuşulan sesin karşı tarafa yaklaşık kaç milisaniyede ulaştığını gösterir.",
      },
      {
        kind: "improved",
        text: "Arayüz yenilendi: giriş ekranı, bildirimler, pencereler, sağ tık menüleri ve lobi seçimi. Hata mesajları kısa ve teknik terim içermiyor.",
      },
      {
        kind: "new",
        text: "Arkadaşlar sayfasında odada ya da oyunda olan arkadaşların en üstte; tek tıkla odalarına katılabilirsin. 1:1 aramada yeni gelen arama kartı, çalan kutucuk ve görüşme süresi var.",
      },
      {
        kind: "fixed",
        text: "Arkadaşlar sayfasında sağ tık menüsü açılmıyordu, sohbet listesinde isimler küçük ve gri görünüyordu; ikisi de düzeltildi.",
      },
    ],
  },
  {
    version: "0.1.99",
    date: "2026-08-31",
    summary: "Ses yolu baştan sona elden geçti; bağlantı sorunları için relay eklendi.",
    highlights: [
      {
        kind: "fixed",
        text: "Kulaklıkta birkaç saniyede bir gelen tık sesi giderildi. Sistem varsayılanı dışında bir çıkış cihazı seçtiğinde ses iki farklı saate göre çalışıyordu; artık tek yoldan çıkıyor ve gecikme de bir miktar azaldı.",
      },
      {
        kind: "improved",
        text: "Herkesin sesi artık ayrı ayrı dengeleniyor. Eskiden mikrofonu yüksek olan tek bir kişi ya da yüksek sesli bir yayın, odadaki diğer herkesin sesini birlikte kısıyordu.",
      },
      {
        kind: "improved",
        text: "Mikrofon kalitesi 48'den 64 kbps'e çıkarıldı. Özellikle gürültü engelleme açıkken ses daha dolgun duyuluyor.",
      },
      {
        kind: "new",
        text: "Ayarlar → Ses altına yankı iptali anahtarı eklendi. Kulaklık kullanıyorsan kapatmak sesini daha doğal yapar; hoparlör kullananlar açık bırakmalı.",
      },
      {
        kind: "new",
        text: "Bağlantısı zayıflayan kişinin yanında uyarı simgesi çıkıyor, böylece sorunun kimde olduğu belli oluyor. Bağlantı panelinde ses kaybı oranı da görünüyor.",
      },
      {
        kind: "fixed",
        text: "Bas-konuş tuşuna her basışta odadaki tüm ses bağlantıları gereksiz yere yenileniyordu. Kaldırıldı; konuşma sırasında kopmalar azaldı.",
      },
      {
        kind: "improved",
        text: "Konuşan kişi göstergesi artık uygulamanın tamamını yeniden çizdirmiyor. Sohbet sırasında ekran paylaşımı gözle görülür şekilde daha akıcı.",
      },
      {
        kind: "improved",
        text: "İşlemci ekran paylaşımına yetişemediğinde yayın kendini otomatik olarak hafifletiyor: önce katman sayısını düşürüyor, gerekirse kodeği değiştiriyor.",
      },
      {
        kind: "fixed",
        text: "Kısıtlı ağlardan bağlanamayan kullanıcılar için relay sunucusu desteği eklendi. Kurumsal ağ ya da bazı mobil bağlantılarda görüntü ve ses artık kopmadan çalışıyor.",
      },
      {
        kind: "fixed",
        text: "Çıkış cihazı test sesi yanlış cihazdan çalıyordu; artık seçtiğin cihazdan çalıyor.",
      },
    ],
  },
  {
    version: "0.1.92",
    date: "2026-08-29",
    summary: "Müzik yeni bir pencereye taşındı, emote susturma artık kalıcı.",
    highlights: [
      {
        kind: "fixed",
        text: "Birinin sesli emotelerini susturduğunda bu ayar artık kalıcı. Eskiden uygulamayı kapatınca susturma sessizce siliniyordu, bir sonraki açılışta o kişinin emoteleri yeniden duyuluyordu.",
      },
      {
        kind: "new",
        text: "Müzik artık lobi altındaki müzik butonundan açılan bir pencerede. Bağlantıyı kutuya yapıştırıp Sıraya Ekle demen yeterli; duraklat, geç, kuyruğu temizle ve durdur için butonlar var. Komut yazmaya gerek yok.",
      },
      {
        kind: "fixed",
        text: "Müzik sesi düzeltildi. Parçalar konuşma sesinden çok daha yüksek geliyordu, bu yüzden ses ayarını kısmak da işe yaramıyordu. Artık her parça aynı ve konuşmanın altında bir seviyede çalıyor.",
      },
      {
        kind: "new",
        text: "Müzik çalarken bot da odada bir katılımcı gibi görünüyor, böylece sesin nereden geldiği belli oluyor.",
      },
      {
        kind: "fixed",
        text: "Sesli ve görüntülü ekranda kişi sayısı sıraya tam bölünmediğinde son sıradaki kareler sola yapışıyordu. Artık her sıra ortalanıyor.",
      },
      {
        kind: "fixed",
        text: "Ana lobiye sağ tıklayınca ayarlar açılıyor. Ana lobi yine silinemiyor, ama adı, kişi sınırı, şifresi ve özellikleri artık değiştirilebiliyor ve bu ayarlar kalıcı.",
      },
      {
        kind: "new",
        text: "Sağ tık menüsündeki oda ayarlarının tamamı yönetim panelinden de yapılabiliyor: oda şifresi ve kapatılan özellikler dahil.",
      },
      {
        kind: "new",
        text: "Yönetim panelinde bir kişiyi seçip IP'sini doğrudan yasaklayabilirsin; adres son girişinden alınır ve açık oturumları da kapatılır.",
      },
      {
        kind: "new",
        text: "Yönetici, bir hesabın görünen adını, profil resmini, afişini, hakkında yazısını veya e-postasını değiştirmesini tek tek kapatabiliyor. Kapatılan alan kullanıcının ayarlarında gerekçesiyle birlikte soluk görünür.",
      },
      {
        kind: "fixed",
        text: "Yönetim panelinde Sohbet bölümündeki Ekler sekmesi açılmıyordu, düzeltildi.",
      },
    ],
  },
  {
    version: "0.1.91",
    date: "2026-08-29",
    summary: "Şifre sıfırlama düzeldi, sesli emote basan artık belli oluyor.",
    highlights: [
      {
        kind: "fixed",
        text: "“Şifremi unuttum” ve e-posta doğrulama artık çalışıyor. E-postaya gelen kod 8 haneliydi ama kutucuk 6 haneden fazlasını kabul etmiyordu — yani kodu yazmanın imkânı yoktu. Kutucuk düzeltildi; kopyalarken araya karışan boşluklar da otomatik temizleniyor.",
      },
      {
        kind: "improved",
        text: "Şifre sıfırlama ve doğrulama ekranlarındaki hatalar artık Türkçe ve ne yapman gerektiğini söylüyor: kodun süresi mi dolmuş, yanlış mı yazılmış, yoksa yeni bir kod mu istemelisin.",
      },
      {
        kind: "new",
        text: "Sesli emote basan kişi belli oluyor. Bastığı sesin adı, o kişinin karesinin üstünde birkaç saniye beliriyor ve karesi bir kez vurgulanıyor. Birinin soundboard'ını susturmuş olsan bile rozeti görürsün.",
      },
      {
        kind: "improved",
        text: "Sesli emote'lara bekleme süresi eklendi, böylece kimse arka arkaya basarak odayı sese boğamıyor. Çok hızlı bastığında kaç saniye beklemen gerektiği yazıyor.",
      },
      {
        kind: "new",
        text: "Oda ayarlarından, o odada nelerin kullanılabileceğini tek tek açıp kapatabilirsin: sesli emote, yüklenen emoteler, oda sohbeti, dosya eki, kamera, ekran paylaşımı ve müzik. Kapattığın özellik yalnızca o odada kapanır, diğer odalar etkilenmez.",
      },
      {
        kind: "new",
        text: "Bir hesap yasaklandığında artık gerekçeyi ve varsa bitiş tarihini görüyor. Süreli yasaklar, süresi dolduğunda kendiliğinden kalkıyor.",
      },
      {
        kind: "new",
        text: "Yönetim paneline yeni bölümler eklendi: sohbet moderasyonu (mesaj arama, şikâyet kuyruğu, dosya ekleri), yönetici işlem geçmişi, o an yayında olanların listesi ve erişim denetimi.",
      },
      {
        kind: "new",
        text: "Bu pencereyi istediğin zaman tekrar açabilirsin: sağ üstte sürüm numarasının yanındaki soru işaretine bas.",
      },
    ],
  },
  {
    version: "0.1.75",
    date: "2026-08-20",
    summary: "Yan panel yenilendi, lobiler kategorilere ayrıldı.",
    highlights: [
      {
        kind: "new",
        text: "Lobiler artık “Sesli Odalar” ve “Mesaj Odaları” başlıkları altında toplanıyor. Başlığa tıklayarak kategoriyi katlayabilirsin; tercihin bir sonraki açılışta hatırlanır.",
      },
      {
        kind: "new",
        text: "Katlanmış bir kategori, o an bağlı olduğun odayı gizlemez ve okunmamış mesaj sayısını başlıkta gösterir.",
      },
      {
        kind: "improved",
        text: "Yan panelin görünümü elden geçirildi: yeni başlık düzeni, daha ince kaydırma çubuğu ve seçili odayı belirginleştiren yeni vurgu.",
      },
      {
        kind: "fixed",
        text: "Kampanyalar sayfasında kartlar ekrana sığdırılmaya çalışıldığı için eziliyor ve yalnızca kapak görselinin ince bir şeridi görünüyordu. Kartlar artık her zaman tam boyunda; sayfa başlığı ve sayfalama sabit kalırken yalnızca kart alanı kayıyor.",
      },
      {
        kind: "new",
        text: "Bu pencere: her güncellemeden sonraki ilk açılışta neyin değiştiğini gösterir.",
      },
    ],
  },
];

// The compare lives with the update contracts: the updater in the main process
// needs the same one to decide whether a release is mandatory for this build.
export { compareVersions };

/**
 * The notes to show somebody who last saw `lastSeenVersion` and is now running
 * `currentVersion`.
 *
 * Skipping releases is the normal case, not the exception — the updater is
 * silent and somebody who has not opened the app for a month arrives several
 * versions later — so this returns every note in between rather than only the
 * newest one.
 *
 * `lastSeenVersion` of null is a profile that has never stored one: a fresh
 * install, or the first launch after this dialog shipped. Both get the notes
 * for the version they are actually running and nothing older, which is why
 * this is not simply "everything".
 */
export const notesSince = (
  currentVersion: string | null | undefined,
  lastSeenVersion: string | null,
): ReleaseNote[] => {
  if (!currentVersion) {
    return [];
  }

  return RELEASE_NOTES.filter((note) => {
    // A note for a version this build has not reached yet is not news, it is a
    // spoiler — and it happens whenever the changelog is written before the
    // release goes out.
    if (compareVersions(note.version, currentVersion) > 0) {
      return false;
    }

    if (lastSeenVersion === null) {
      return compareVersions(note.version, currentVersion) === 0;
    }

    return compareVersions(note.version, lastSeenVersion) > 0;
  });
};

/**
 * Every note this build is allowed to show, newest first.
 *
 * What the question-mark button next to the version opens. It is not
 * `RELEASE_NOTES` verbatim for the same reason `notesSince` filters: a note
 * written before its release goes out must not be readable from a build that
 * has not reached it.
 */
export const notesUpTo = (
  currentVersion: string | null | undefined,
): ReleaseNote[] => {
  if (!currentVersion) {
    return [];
  }

  return RELEASE_NOTES.filter(
    (note) => compareVersions(note.version, currentVersion) <= 0,
  );
};

/* -------------------------------------------------------------------------
   Which version this profile has already been shown
   ------------------------------------------------------------------------- */

const LAST_SEEN_VERSION_STORAGE_KEY = "ct.settings.lastSeenVersion";

export const readLastSeenVersion = (): string | null => {
  try {
    const raw = localStorage.getItem(LAST_SEEN_VERSION_STORAGE_KEY);
    return raw && raw.trim() !== "" ? raw : null;
  } catch {
    // A locked-down profile means the dialog opens once per launch rather than
    // once per update. Annoying, never fatal.
    return null;
  }
};

export const saveLastSeenVersion = (version: string): void => {
  try {
    localStorage.setItem(LAST_SEEN_VERSION_STORAGE_KEY, version);
  } catch {
    // Same trade as above.
  }
};
