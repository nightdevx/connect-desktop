import type { MinigameId } from "@/store/minigame-scores";

export const MINIGAME_RULES: Record<MinigameId, readonly string[]> = {
  "2048": [
    "Ok tuşlarıyla tüm taşları aynı anda bir yöne kaydır.",
    "Çarpışan iki eşit sayı birleşip toplamlarına dönüşür.",
    "Her hamleden sonra boş bir kareye yeni bir 2 ya da 4 düşer.",
    "Hiçbir yön hiçbir şeyi değiştirmiyorsa oyun biter. Puanın birleşmelerden gelir.",
  ],
  minesweeper: [
    "Bir kareyi aç: üzerindeki sayı, komşu 8 karedeki mayın adedidir.",
    "İlk tıklaman her zaman güvenlidir — tarla ondan sonra kurulur.",
    "Mayın olduğundan emin olduğun kareyi sağ tıkla bayrakla.",
    "Mayınsız tüm kareleri açınca kazanırsın. Süren kısaldıkça rekorun iyileşir.",
  ],
  snake: [
    "Ok tuşlarıyla yılanı yönlendir, yemi topla.",
    "Her yem yılanı bir birim uzatır.",
    "Duvara ya da kendi gövdene çarparsan oyun biter.",
    "Kuyruğun aynı tikte boşalttığı kareye girmek serbesttir.",
  ],
  memory: [
    "İki kart aç. Aynıysa açık kalır, değilse kapanır.",
    "Tüm çiftleri bulunca biter.",
    "Rekor hamle sayısıyla tutulur — az hamle iyi hamledir.",
  ],
  sudoku: [
    "Her satır, her sütun ve her 3x3 kutu 1-9 rakamlarını birer kez içerir.",
    "Verilen rakamlar sabittir, silinemez.",
    "Bir hücreye birden fazla aday not düşebilirsin.",
    "Tahtanın tek bir çözümü vardır; tahmin gerekmez.",
  ],
  puzzle15: [
    "Boş kareye komşu olan taşı tıklayarak kaydır.",
    "Sayıları soldan sağa, yukarıdan aşağıya sıraya diz.",
    "Rekor hamle sayısıyla tutulur.",
  ],
  lightsout: [
    "Bir kareye bastığında kendisi ve dört komşusu durum değiştirir.",
    "Amaç tüm ışıkları söndürmek.",
    "Her tahta çözülebilir şekilde kurulur.",
  ],
  tetris: [
    "Düşen blokları sol/sağ ok ile kaydır, yukarı ok ile döndür.",
    "Aşağı ok hızlandırır.",
    "Bir satırı baştan sona doldurunca satır temizlenir ve puan gelir.",
    "Bloklar tavana ulaşırsa oyun biter.",
  ],
  simon: [
    "Ekran bir renk dizisi gösterir, sen aynısını tekrarlarsın.",
    "Her turda diziye bir renk eklenir.",
    "Bir yanlış renk oyunu bitirir. Rekor ulaştığın tur sayısıdır.",
  ],
  floodit: [
    "Sol üst köşeden başlayan renk lekesini büyütürsün.",
    "Seçtiğin renk, lekeye komşu aynı renkteki tüm kareleri lekeye katar.",
    "Tahtanın tamamını tek renge indirmen gerekir.",
    "Rekor kullandığın hamle sayısıdır.",
  ],
  nonogram: [
    "Satır ve sütun başındaki sayılar, o hat üzerindeki dolu blok uzunluklarıdır.",
    "Bloklar verilen sırayla gelir ve aralarında en az bir boşluk vardır.",
    "Kesin boş olduğunu bildiğin kareyi işaretle, kafan karışmasın.",
    "Tüm dolu kareler doğru işaretlenince resim çıkar.",
  ],
  typing: [
    "Ekrandaki metni olabildiğince hızlı ve hatasız yaz.",
    "Süre dolduğunda dakikadaki kelime sayın hesaplanır.",
    "Yanlış karakterler doğruluk oranını düşürür.",
  ],
  mathsprint: [
    "Süre bitene kadar art arda işlem çöz.",
    "Doğru cevap puan, yanlış cevap süre kaybettirir.",
    "Zorluk arttıkça sayılar büyür.",
  ],

  gunline: [
    "Müfreze hep ön hatta durur; fareyle sağa sola kaydırırsın, ateş kendiliğinden.",
    "Kapılara ateş ettikçe üzerlerindeki sayı büyür. İçinden geçtiğin kapı birliğine uygulanır.",
    "Alt çizgiyi geçen düşman bir askerini götürür; asker biterse oyun biter.",
    "Her dalga sonunda üç yükseltmeden birini seçersin. Beşinci dalgalarda boss gelir.",
  ],
  xox: [
    "Sırayla 3x3 tahtaya işaret koyarsınız.",
    "Yatay, dikey ya da çapraz üçü tutturan kazanır.",
    "Tahta dolar ve kimse tutturamazsa berabere.",
  ],
  connect4: [
    "Bir sütun seç; taşın en alttaki boş sıraya düşer.",
    "Yatay, dikey ya da çapraz dördü yan yana getiren kazanır.",
    "7 sütun, 6 sıra.",
  ],
  gomoku: [
    "15x15 tahtada sırayla taş koyarsınız.",
    "Beş taşı yan yana dizen kazanır.",
    "Taşlar konduğu yerde kalır, alınmaz.",
  ],
  connect5: [
    "4'lü Sıra'nın büyüğü: 9 sütun, 7 sıra.",
    "Taş seçilen sütunun dibine düşer.",
    "Beşi yan yana getiren kazanır.",
  ],
  connect4trio: [
    "Üç kişilik sıra oyunu, 11x9 tahtada.",
    "Sıra üç oyuncu arasında döner.",
    "Dördü yan yana getiren ilk kişi kazanır.",
  ],
  chess: [
    "Tam satranç kuralları: rok, geçerken alma, piyon terfisi dahil.",
    "Bir taşa tıkla; oynanabilir kareler işaretlenir.",
    "Şah mat kazandırır; pat, üç tekrar ve 50 hamle beraberedir.",
    "0 numaralı koltuk beyaz oynar.",
  ],
  reversi: [
    "Taşını, rakip taşlarını kendi taşlarınla arana alacak şekilde koyarsın.",
    "Arada kalan tüm rakip taşları senin rengine döner.",
    "Oynayacak yerin yoksa pas geçersin.",
    "Tahta dolduğunda taşı çok olan kazanır.",
  ],
  boxes: [
    "Sırayla iki nokta arasına çizgi çekersiniz.",
    "Bir kutunun dördüncü kenarını çeken o kutuyu alır.",
    "Kutu kapatan oyuncu tekrar oynar.",
    "Tüm kutular kapandığında çoğunluğu alan kazanır.",
  ],
  blokus: [
    "Herkesin 21 farklı şekilli taşı var.",
    "İlk taşın kendi köşenden başlar.",
    "Sonraki her taşın kendi taşlarından birine yalnızca KÖŞEDEN değmeli, kenardan değmemeli.",
    "Rakip taşlarla kenardan komşuluk serbesttir. Yerleştiremeyen pas geçer, en az kare artıranı kazanır.",
  ],
  backgammon: [
    "İki zar at, pullarını kendi evine doğru ilerlet.",
    "Çift atarsan dört hamle hakkın olur.",
    "Tek başına duran rakip pulunu kırarsın; kırılan pul baştan girer.",
    "Tüm pullarını evine toplayıp önce dışarı çıkaran kazanır.",
  ],
  yahtzee: [
    "Beş zar, tur başına üç atış hakkın var.",
    "Atışlar arasında tutmak istediğin zarları seçebilirsin.",
    "Sonucu on üç kutudan birine yazarsın; her kutu bir kez kullanılır.",
    "On üç tur sonunda toplamı yüksek olan kazanır.",
  ],
  ludo: [
    "Zar at, pullarını bazadan çıkarıp tur attır.",
    "Bazadan çıkmak için 6 atman gerekir.",
    "Rakibin pulunun üstüne gelirsen onu başa gönderirsin.",
    "Tüm pullarını eve ilk sokan kazanır.",
  ],
  quiz: [
    "Sekiz tur boyunca sırayla dört şıklı soru gelir.",
    "Doğru cevap puan kazandırır.",
    "Turlar bitince puanı en yüksek olan kazanır.",
  ],
  uno: [
    "Elindeki kartı, açık kartla aynı RENK ya da aynı SAYI ise oynayabilirsin.",
    "Oynayacak kartın yoksa desteden bir kart çekersin; onu da oynayamazsan pas geçersin.",
    "Joker her zaman oynanır ve rengi sen seçersin. +2 ve +4 sonraki oyuncuya kart çektirir.",
    "Yön kartı sırayı ters çevirir, engel kartı sıradakini atlatır.",
    "Tek kartın kaldığında herkes görür. Elini ilk bitiren kazanır.",
  ],
  battleship: [
    "Önce filonu kendi ızgarana dizersin — beş gemi, ikiniz aynı anda.",
    "İkiniz de Hazır deyince atışlar başlar ve sıra dönüşümlü ilerler.",
    "İsabet ekstra atış kazandırmaz.",
    "Bir gemi tamamen vurulunca batar ve rakibin ızgarasında görünür.",
    "Rakibin tüm filosunu batıran kazanır.",
  ],
  okey: [
    "106 taş; herkes ıstakasına 14 taş alır, başlayan 15 alır.",
    "Gösterge taşının bir üstü okeydir; sahte okey onun yerine geçer.",
    "Sıran gelince desteden ya da solundaki oyuncunun ıskartasından bir taş alır, bir taş atarsın.",
    "Elinde aynı renkten sıralı üçlü/dörtlü ya da aynı sayıdan farklı renkli üçlü/dörtlü gruplar kurarsın.",
    "Istakadaki sıralamayı sürükleyerek değiştirebilirsin; bu sıra sadece sende durur.",
    "On dört taşı grup yapıp on beşinciyi atan eli açar ve kazanır.",
  ],
  rummy1: [
    "106 taş; herkes 21 taş alır, oyuna başlayan 22 alır.",
    "Gösterge taşının bir üstü okeydir; sahte okey taşları o taşın kopyası olarak oynanır.",
    "Sıran gelince desteden ya da solundaki oyuncunun ıskartasından bir taş alırsın.",
    "El açmak için masaya en az 101 PUANLIK per/seri koymalısın. Puan taşların üzerindeki sayıdır; okey, yerine geçtiği taşın değerini alır.",
    "Per: aynı sayı, farklı renkler (3-4 taş). Seri: aynı renk, ardışık sayılar. 101'de 13'ten sonra 1 GELMEZ — 12-13-1 seri değildir.",
    "Çiftten açmak istersen en az 5 çift ve yine 101 puan gerekir. Çiftten açan yerden taş alamaz, sadece desteden çeker.",
    "Açtıktan sonra taşlarını masadaki kendi ve rakip perlerine işleyebilirsin.",
    "Elinde tek taş kalınca onu atarak bitirirsin.",
    "Puanlama: bitiren −101, açmış olan ıstakasındaki taşların toplamı, açmamış olan 202.",
    "Okey atarak bitirmek puanları 2 katına çıkarır; çiftten açan her zaman 2 kat ceza yer.",
    "Cezası 101'e ulaşan elenir, son kalan oyuncu kazanır.",
  ],
  poker: [
    "Texas Hold'em, oyun çipiyle oynanır.",
    "Herkese kapalı iki kart dağıtılır, ortaya sırayla beş kart açılır.",
    "Her turda pas, görme, artırma ya da çekilme hakkın var.",
    "İki kapalı kartın ile ortadaki beş karttan en iyi beşli eli kurarsın.",
    "Yan potlar hesaplanır; eli en iyi olan potu alır.",
  ],
};

export function rulesOf(game: MinigameId): readonly string[] {
  return MINIGAME_RULES[game] ?? [];
}
