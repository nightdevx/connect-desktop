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

/* -------------------------------------------------------------------------
   Version comparison

   Plain numeric compare over the dot-separated parts, with any `-beta.1` style
   suffix dropped first. No semver dependency: these strings come from
   package.json via app.getVersion(), so they are already well-formed, and the
   one thing that must not happen is a string compare — "0.1.9" > "0.1.75" is
   true alphabetically and false in every other sense, which would have hidden
   every note after the tenth patch release.
   ------------------------------------------------------------------------- */

const parseVersion = (version: string): number[] =>
  version
    .trim()
    .split("-")[0]
    .split(".")
    .map((part) => {
      const parsed = Number.parseInt(part, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });

/** Negative if a < b, positive if a > b, 0 if they are the same release. */
export const compareVersions = (a: string, b: string): number => {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

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
