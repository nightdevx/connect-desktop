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
