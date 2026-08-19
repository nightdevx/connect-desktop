// Free-game offers, normalised out of four unrelated upstreams into one shape.
//
// None of the four has a contract with us: Epic's is the private backend of its
// own store page, GamerPower and CheapShark are community APIs, FreeToGame is a
// catalogue. They disagree about everything — what a price is, what a date
// looks like, what counts as "free" — so every one of them is reduced HERE, in
// one pure module, and nothing downstream ever sees an upstream shape.
//
// That is also why this file has a self-check (scripts/check-free-games.cjs)
// rather than a comment: the failure mode of a normaliser against an
// undocumented feed is not a crash, it is a page that quietly shows the wrong
// thing — a 20%-off game listed as free, or an empty list that looks like "no
// giveaways this week" when it is really "the shape changed".
//
// Lives in src/shared because both processes need it: main normalises what it
// fetched, and the renderer re-derives buckets and countdowns from the same
// definitions.

/** Where an offer is claimed. "other" keeps an unknown store visible. */
export type FreeGameStore =
  | "epic"
  | "steam"
  | "gog"
  | "ubisoft"
  | "itch"
  | "origin"
  | "other";

/**
 * What KIND of free this is — the distinction the whole page is built on.
 *
 * "free-now" and "free-soon" are keep-forever giveaways with a deadline;
 * "always-free" is a free-to-play title that will still be free next year and
 * is therefore not urgent; "deal" is a discount, not free at all.
 */
export type FreeGameOfferKind = "free-now" | "free-soon" | "always-free" | "deal";

/** Which upstream produced the record. Drives the attribution footer. */
export type FreeGameSource = "epic" | "gamerpower" | "cheapshark" | "freetogame";

export interface FreeGameOffer {
  /** `${source}:${upstream id}` — stable across polls, unique across sources. */
  id: string;
  title: string;
  /** Trimmed to a card-sized blurb; "" when the upstream has none. */
  description: string;
  store: FreeGameStore;
  /** Human label for the badge, as the upstream spells it. */
  storeLabel: string;
  kind: FreeGameOfferKind;
  /** Where the user goes to claim it. Always http(s). */
  url: string;
  imageUrl: string | null;
  /** Localised, as the upstream formatted it ("₺410,00", "$19.99"). */
  originalPrice: string | null;
  /**
   * What it costs right now, when that is neither zero nor the full price.
   *
   * Only a discount has one. A giveaway costs nothing and says so in words, and
   * printing "₺0,00" beside a struck-through price is a worse way of saying
   * "free" than the word is.
   */
  salePrice: string | null;
  /** ISO 8601, or null when the upstream does not say. */
  startsAt: string | null;
  endsAt: string | null;
  /** 100 for a giveaway, 0-99 for a discount, null when unknown. */
  discountPercent: number | null;
  source: FreeGameSource;
}

export interface FreeGamesSnapshot {
  offers: FreeGameOffer[];
  /** ISO timestamp of the fetch that produced this. */
  fetchedAt: string;
  /**
   * Upstreams that failed this round.
   *
   * Carried rather than swallowed: three sources answering and one failing is a
   * usable page, but it must not be presented as the complete picture — an
   * empty Steam column reads as "nothing free on Steam", which is a different
   * statement from "GamerPower did not answer".
   */
  failedSources: FreeGameSource[];
}

/** The buckets the sidebar offers. */
export type FreeGameFilter =
  | "free-now"
  | "free-soon"
  | "ending-soon"
  | "deals"
  | "always-free";

/** Anything ending inside this window is "son şans". */
export const ENDING_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

// --- small shared helpers --------------------------------------------------

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

// Upstream text is rendered into a card, and two of these feeds carry marketing
// copy several paragraphs long. Cut on a word boundary so the ellipsis does not
// land mid-word.
const MAX_DESCRIPTION_LENGTH = 220;

const trimDescription = (value: unknown): string => {
  const text = asString(value).replace(/\s+/g, " ");
  if (text.length <= MAX_DESCRIPTION_LENGTH) {
    return text;
  }
  const cut = text.slice(0, MAX_DESCRIPTION_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/**
 * Only http(s) URLs are allowed through.
 *
 * Every one of these strings ends up in a link the user clicks, which this app
 * hands to shell.openExternal — so a `file:` or a custom scheme coming off an
 * upstream would be asking the operating system to open something on the user's
 * behalf. The scheme check is the boundary, not a formatting nicety.
 */
export const sanitizeExternalUrl = (value: unknown): string | null => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const STORE_LABELS: Record<FreeGameStore, string> = {
  epic: "Epic Games",
  steam: "Steam",
  gog: "GOG",
  ubisoft: "Ubisoft",
  itch: "itch.io",
  origin: "EA App",
  other: "Diğer",
};

/** The badge text for a store, so no call site spells one by hand. */
export const storeLabel = (store: FreeGameStore): string => STORE_LABELS[store];

// Matched against free text from three different feeds, so it is substring
// matching on a lowercased haystack rather than an equality table.
const STORE_PATTERNS: Array<[FreeGameStore, RegExp]> = [
  ["epic", /epic/],
  ["steam", /steam/],
  ["gog", /\bgog\b|good old games/],
  ["ubisoft", /ubisoft|uplay/],
  ["itch", /itch/],
  ["origin", /origin|\bea\b|electronic arts/],
];

const detectStore = (haystack: string): FreeGameStore => {
  const text = haystack.toLowerCase();
  for (const [store, pattern] of STORE_PATTERNS) {
    if (pattern.test(text)) {
      return store;
    }
  }
  return "other";
};

/** Comparable form of a title, for matching the same game across two feeds. */
const titleKey = (title: string): string => {
  const folded = title
    .toLowerCase()
    .normalize("NFKD")
    // Roman numerals and edition suffixes are left alone on purpose: "Deponia"
    // and "Deponia Doomsday" are different games.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  // A title written entirely in a non-Latin script folds to "" — and an empty
  // key is the same key, so two unrelated games would merge into one card. Fall
  // back to the raw title, which at least only collides with itself.
  return folded || title.toLowerCase().trim();
};

// --- Epic --------------------------------------------------------------------

// Verified against the live feed on 2026-08-19. The doubly-nested
// `promotions.promotionalOffers[].promotionalOffers[]` is real, not a typo.
interface EpicPromotionalOffer {
  startDate?: unknown;
  endDate?: unknown;
  discountSetting?: { discountPercentage?: unknown };
}

// Validated on the way out, not cast. A null inside the inner array threw on
// `offer.discountSetting` and the catch above turned that into "Epic did not
// answer" — a payload that arrived perfectly intact, reported as an outage.
const epicOfferList = (group: unknown): EpicPromotionalOffer[] =>
  asArray(group).flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) {
      return [];
    }
    return asArray(record.promotionalOffers)
      .map(asRecord)
      .filter((offer): offer is Record<string, unknown> => offer !== null)
      .map((offer) => offer as EpicPromotionalOffer);
  });

const EPIC_IMAGE_PREFERENCE = [
  "OfferImageWide",
  "DieselStoreFrontWide",
  "OfferImageTall",
  "Thumbnail",
];

const epicImage = (keyImages: unknown): string | null => {
  const images = asArray(keyImages)
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => entry !== null);

  for (const preferred of EPIC_IMAGE_PREFERENCE) {
    const match = images.find((image) => asString(image.type) === preferred);
    const url = match ? sanitizeExternalUrl(match.url) : null;
    if (url) {
      return url;
    }
  }

  for (const image of images) {
    const url = sanitizeExternalUrl(image.url);
    if (url) {
      return url;
    }
  }
  return null;
};

// A bare catalogue id, not a slug. Epic puts one of these in urlSlug for
// products whose store page was never given a readable name.
const isCatalogGuid = (value: string): boolean => /^[0-9a-f]{32}$/i.test(value);

const mappingSlugs = (mappings: unknown, wantedType: string): string[] =>
  asArray(mappings)
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .filter((entry) => asString(entry.pageType) === wantedType)
    .map((entry) => asString(entry.pageSlug))
    .filter(Boolean);

/**
 * The store page for an offer.
 *
 * Epic scatters the slug across four fields and fills a different one depending
 * on how the product was set up. Read off the live feed rather than guessed:
 *
 *   productSlug    real, but null on five of eight entries, and carrying a
 *                  trailing "/home" that 404s if passed through.
 *   urlSlug        sometimes a name, sometimes a bare 32-hex catalogue id
 *                  ("70e9a8a90305449a88a38b708399e605"). It therefore CANNOT be
 *                  preferred — that was the first ordering here, and it put a
 *                  GUID in the link for the one game that was actually free.
 *   offerMappings  pageType is "productHome" for a game and "offer" for an
 *                  add-on; productHome is the page a person wants to land on.
 */
const epicStoreUrl = (element: Record<string, unknown>, locale: string): string | null => {
  const candidates: string[] = [
    asString(element.productSlug).replace(/\/home$/, ""),
    ...mappingSlugs(element.offerMappings, "productHome"),
    ...mappingSlugs(asRecord(element.catalogNs)?.mappings, "productHome"),
    ...mappingSlugs(element.offerMappings, "offer"),
    asString(element.urlSlug),
  ]
    .map((candidate) => candidate.replace(/^\/+/, ""))
    .filter(Boolean);

  const readable = candidates.find((candidate) => !isCatalogGuid(candidate));
  // A GUID link still resolves, so it beats no link at all — but only once
  // every readable candidate has been ruled out.
  const slug = readable ?? candidates[0];

  return slug ? `https://store.epicgames.com/${locale}/p/${slug}` : null;
};

/**
 * Whether Epic answered with an error envelope instead of a catalogue.
 *
 * Epic reports a bad country code as HTTP 200 with `errors: [...]` and a null
 * `data.Catalog`, which normalises to an empty list — indistinguishable from a
 * quiet week. The client tests this first so a broken request fails loudly and
 * lands in the snapshot's failedSources instead of showing the user "no free
 * games" forever.
 */
export const isEpicErrorPayload = (payload: unknown): boolean => {
  const root = asRecord(payload);
  if (!root) {
    return true;
  }
  if (root.errors !== undefined && root.errors !== null) {
    return true;
  }
  return asRecord(asRecord(asRecord(root.data)?.Catalog)?.searchStore) === null;
};

/**
 * Epic's free-games feed, which is NOT a list of free games.
 *
 * Of the 11 elements it returned when this was written, one was free now, one
 * free next week, one a free add-on, three were plain paid discounts (20-50%
 * off) and three were finished promotions still sitting in the feed with
 * `promotions: null`. Every single element carries
 * `categories[].path === "freegames"`, so the obvious filter is useless — the
 * only reliable test is the promotion block plus the price.
 *
 * `locale` only shapes the store URL; the caller decides the language and
 * currency of the payload through the request's own query string.
 */
export const normalizeEpicPromotions = (
  payload: unknown,
  locale = "tr",
): FreeGameOffer[] => {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  // Epic answers a bad country code with HTTP 200 and an error envelope whose
  // `data.Catalog` is null. Treated as "no offers" this looks exactly like a
  // quiet week, so it has to be recognised as the failure it is.
  if (root.errors !== undefined && root.errors !== null) {
    return [];
  }

  const elements = asArray(
    asRecord(asRecord(asRecord(root.data)?.Catalog)?.searchStore)?.elements,
  );

  const offers: FreeGameOffer[] = [];

  for (const entry of elements) {
    const element = asRecord(entry);
    if (!element) {
      continue;
    }

    const title = asString(element.title);
    const url = epicStoreUrl(element, locale);
    if (!title || !url) {
      continue;
    }

    const promotions = asRecord(element.promotions);
    if (!promotions) {
      // A finished promotion still listed in the feed.
      continue;
    }

    // ADD_ON is a cosmetic pack or a DLC, not a game. The GamerPower half
    // already drops its DLC rows, and letting Epic's through would make one
    // list mean two different things depending on which feed filled it.
    if (asString(element.offerType) === "ADD_ON") {
      continue;
    }

    const totalPrice = asRecord(asRecord(element.price)?.totalPrice);
    const discountPrice = asFiniteNumber(totalPrice?.discountPrice);
    // fmtPrice is the localised string and is the right thing to render, but it
    // reads "0" for a product with no list price — which renders as a
    // struck-through zero. The integer beside it decides whether there is a
    // price to show at all.
    const hasListPrice = (asFiniteNumber(totalPrice?.originalPrice) ?? 0) > 0;
    const originalPrice = hasListPrice
      ? asString(asRecord(totalPrice?.fmtPrice)?.originalPrice) || null
      : null;

    const current = epicOfferList(promotions.promotionalOffers);
    const upcoming = epicOfferList(promotions.upcomingPromotionalOffers);

    // Free NOW: a live promotion AND a price of zero. The price is what keeps a
    // 40%-off promotion out — it also has a live promotion block.
    const currentFree = current.length > 0 && discountPrice === 0;
    // Free SOON: the upcoming block does not carry a price, so the only signal
    // is the discount setting. 0 means "costs 0%", i.e. free.
    const upcomingFree =
      !currentFree &&
      upcoming.some(
        (offer) => asFiniteNumber(offer.discountSetting?.discountPercentage) === 0,
      );

    if (!currentFree && !upcomingFree) {
      continue;
    }

    const window = currentFree
      ? current[0]
      : upcoming.find(
          (offer) => asFiniteNumber(offer.discountSetting?.discountPercentage) === 0,
        );

    offers.push({
      id: `epic:${asString(element.id) || titleKey(title)}`,
      title,
      description: trimDescription(element.description),
      store: "epic",
      storeLabel: STORE_LABELS.epic,
      kind: currentFree ? "free-now" : "free-soon",
      url,
      imageUrl: epicImage(element.keyImages),
      originalPrice,
      salePrice: null,
      startsAt: toIsoOrNull(window?.startDate),
      endsAt: toIsoOrNull(window?.endDate),
      discountPercent: 100,
      source: "epic",
    });
  }

  return offers;
};

// --- GamerPower --------------------------------------------------------------

// "N/A" is GamerPower's null. It appears in worth, end_date and description.
const gamerPowerValue = (value: unknown): string => {
  const text = asString(value);
  return text.toUpperCase() === "N/A" ? "" : text;
};

/**
 * GamerPower's date format is `YYYY-MM-DD HH:mm:ss` with no zone.
 *
 * Read as UTC. The feed does not say, and guessing the machine's local zone
 * would make the same giveaway end at a different time on two computers — a
 * countdown that disagrees between users is worse than one that is a few hours
 * out, and it is the deadline's ORDER OF MAGNITUDE ("two days left") that the
 * card actually communicates.
 */
const parseGamerPowerDate = (value: unknown): string | null => {
  const text = gamerPowerValue(value);
  if (!text) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match) {
    return toIsoOrNull(text);
  }
  const [, year, month, day, hour, minute, second] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? "0"),
  );
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

/**
 * GamerPower titles are listing headlines, not game names.
 *
 * Live examples: "Deponia (Steam) Giveaway", "Caravan SandWitch (Epic Games)
 * Giveaway", "Tape 101: Liminal Descent (Playtest) Steam Key Giveaway". That
 * suffix is what stopped a giveaway merging with Epic's own record for the same
 * game, so the page showed one game as two cards.
 *
 * Only applied when the title actually ends in "Giveaway". Otherwise a real
 * name ending in a parenthetical — "Half-Life 2: Episode One (2006)" — would
 * lose part of itself.
 */
// \b before the bare words is load-bearing, not tidiness. Without it `key$`
// matched inside "Super Blood Hockey" and `free$` inside "Carefree", so the
// second pass ate the end of the real name — "Super Blood Hoc" — and the
// truncated title then failed to match the same game from another feed, which
// is the exact duplication this function exists to prevent.
const GAMERPOWER_TITLE_SUFFIX =
  /\s*(?:\([^()]*\)|\b(?:steam key|epic key|key|giveaway|free))\s*$/i;

const cleanGamerPowerTitle = (raw: string): string => {
  if (!/giveaway\s*$/i.test(raw)) {
    return raw;
  }

  let title = raw;
  // Bounded: each pass removes one trailing token, and four is past the longest
  // real chain ("(Playtest) Steam Key Giveaway").
  for (let pass = 0; pass < 4; pass += 1) {
    const next = title.replace(GAMERPOWER_TITLE_SUFFIX, "").trim();
    if (next === title || next === "") {
      break;
    }
    title = next;
  }

  return title || raw;
};

// The feed mixes games with DLC, loot and beta keys. The page is about games.
const GAMERPOWER_GAME_TYPES = new Set(["game", "early access"]);

/**
 * GamerPower giveaways.
 *
 * `platforms` is a comma-separated list whose VALUES can themselves contain a
 * pipe ("Xbox Series X|S"), so it must be split on the comma only — a naive
 * pipe split invents a platform called "S".
 */
export const normalizeGamerPowerGiveaways = (payload: unknown): FreeGameOffer[] => {
  const offers: FreeGameOffer[] = [];

  for (const entry of asArray(payload)) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }

    const title = cleanGamerPowerTitle(asString(record.title));
    const url =
      sanitizeExternalUrl(record.open_giveaway_url) ??
      sanitizeExternalUrl(record.open_giveaway) ??
      sanitizeExternalUrl(record.gamerpower_url);
    if (!title || !url) {
      continue;
    }

    if (!GAMERPOWER_GAME_TYPES.has(asString(record.type).toLowerCase())) {
      continue;
    }

    const platforms = asString(record.platforms)
      .split(",")
      .map((platform) => platform.trim())
      .filter(Boolean);

    // "PC" and "DRM-Free" say nothing about where it is claimed, so the store
    // is the first token that names one.
    const store = detectStore(platforms.join(" "));

    offers.push({
      id: `gamerpower:${asString(record.id) || titleKey(title)}`,
      title,
      description: trimDescription(gamerPowerValue(record.description)),
      store,
      storeLabel:
        platforms.find((platform) => detectStore(platform) === store && store !== "other") ??
        STORE_LABELS[store],
      kind: "free-now",
      url,
      imageUrl:
        sanitizeExternalUrl(record.image) ?? sanitizeExternalUrl(record.thumbnail),
      originalPrice: gamerPowerValue(record.worth) || null,
      salePrice: null,
      startsAt: parseGamerPowerDate(record.published_date),
      endsAt: parseGamerPowerDate(record.end_date),
      discountPercent: 100,
      source: "gamerpower",
    });
  }

  return offers;
};

// --- CheapShark ---------------------------------------------------------------

/**
 * CheapShark deals.
 *
 * Used for DISCOUNTS, deliberately not as a source of truth for "free": when
 * this was written Steam was giving Deponia away at -100% and CheapShark's
 * own `?storeID=1&upperPrice=0` returned an empty array for it. GamerPower and
 * Epic own the free lists; this owns the bargain list.
 *
 * `storeNames` comes from CheapShark's /stores endpoint, so a store added
 * upstream shows its real name instead of a number.
 */
export const normalizeCheapSharkDeals = (
  payload: unknown,
  storeNames: Record<string, string> = {},
): FreeGameOffer[] => {
  const offers: FreeGameOffer[] = [];

  for (const entry of asArray(payload)) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }

    const title = asString(record.title);
    const dealId = asString(record.dealID);
    if (!title || !dealId) {
      continue;
    }

    const savings = asFiniteNumber(record.savings);
    const salePrice = asFiniteNumber(record.salePrice);
    const normalPrice = asFiniteNumber(record.normalPrice);
    const isFree = salePrice === 0;

    const label = storeNames[asString(record.storeID)] ?? "";
    const store = detectStore(label);

    offers.push({
      // dealID is already URL-encoded by CheapShark; re-encoding it produces a
      // link that 404s.
      id: `cheapshark:${dealId}`,
      title,
      description: "",
      store,
      storeLabel: label || STORE_LABELS[store],
      kind: isFree ? "free-now" : "deal",
      url: `https://www.cheapshark.com/redirect?dealID=${dealId}`,
      imageUrl: sanitizeExternalUrl(record.thumb),
      originalPrice: normalPrice === null ? null : `$${normalPrice.toFixed(2)}`,
      // CheapShark quotes in USD and does not localise, so the currency is
      // stated rather than assumed — a bare "9.99" beside a Turkish giveaway's
      // "₺410,00" would read as lira.
      //
      // Suppressed when it is zero (the card says "Ücretsiz" instead) and when
      // it equals the full price, which happens on a deal whose discount has
      // just expired upstream.
      salePrice:
        salePrice !== null && salePrice > 0 && salePrice !== normalPrice
          ? `$${salePrice.toFixed(2)}`
          : null,
      startsAt: null,
      endsAt: null,
      discountPercent: savings === null ? null : Math.round(savings),
      source: "cheapshark",
    });
  }

  return offers;
};

// --- FreeToGame ---------------------------------------------------------------

/** Permanently free-to-play titles. No deadline, so never urgent. */
export const normalizeFreeToGame = (payload: unknown): FreeGameOffer[] => {
  const offers: FreeGameOffer[] = [];

  for (const entry of asArray(payload)) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }

    const title = asString(record.title);
    const url = sanitizeExternalUrl(record.game_url);
    if (!title || !url) {
      continue;
    }

    const store = detectStore(
      `${asString(record.platform)} ${asString(record.publisher)}`,
    );

    offers.push({
      id: `freetogame:${asString(record.id) || titleKey(title)}`,
      title,
      description: trimDescription(record.short_description),
      store,
      storeLabel: store === "other" ? asString(record.genre) || "Ücretsiz" : STORE_LABELS[store],
      kind: "always-free",
      url,
      imageUrl: sanitizeExternalUrl(record.thumbnail),
      originalPrice: null,
      salePrice: null,
      startsAt: null,
      endsAt: null,
      discountPercent: null,
      source: "freetogame",
    });
  }

  return offers;
};

// --- merge, filter, sort -------------------------------------------------------

const KIND_RANK: Record<FreeGameOfferKind, number> = {
  "free-now": 0,
  "free-soon": 1,
  deal: 2,
  "always-free": 3,
};

// Epic's own feed knows the exact end time and the localised price; GamerPower
// knows about more stores. When both describe the same game, the more specific
// record wins.
const SOURCE_RANK: Record<FreeGameSource, number> = {
  epic: 0,
  gamerpower: 1,
  cheapshark: 2,
  freetogame: 3,
};

/**
 * One list out of four, with the same game listed once.
 *
 * The duplicate is not hypothetical: an Epic giveaway appears in Epic's own
 * feed AND in GamerPower's, with different ids, different end-time precision
 * and different artwork. Keyed on store + title rather than on any id, because
 * the ids are per-source by construction.
 */
export const mergeOffers = (groups: FreeGameOffer[][]): FreeGameOffer[] => {
  const byKey = new Map<string, FreeGameOffer>();

  for (const group of groups) {
    for (const offer of group) {
      const key = `${offer.store}:${offer.kind}:${titleKey(offer.title)}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, offer);
        continue;
      }

      const incomingWins =
        SOURCE_RANK[offer.source] < SOURCE_RANK[existing.source];
      const winner = incomingWins ? offer : existing;
      const loser = incomingWins ? existing : offer;

      // Field-by-field rather than wholesale: the winning source is better
      // informed, not omniscient. GamerPower routinely carries an end date for
      // a Steam giveaway that Epic's feed knows nothing about, and losing it
      // would drop the countdown the card is built around.
      byKey.set(key, {
        ...winner,
        description: winner.description || loser.description,
        imageUrl: winner.imageUrl ?? loser.imageUrl,
        originalPrice: winner.originalPrice ?? loser.originalPrice,
        salePrice: winner.salePrice ?? loser.salePrice,
        startsAt: winner.startsAt ?? loser.startsAt,
        endsAt: winner.endsAt ?? loser.endsAt,
        discountPercent: winner.discountPercent ?? loser.discountPercent,
      });
    }
  }

  return sortOffers([...byKey.values()]);
};

/**
 * Free first, then whatever expires soonest.
 *
 * An offer with no deadline sorts after every offer that has one, inside its
 * own kind: "grab this before Thursday" outranks "this is free forever".
 */
export const sortOffers = (offers: FreeGameOffer[]): FreeGameOffer[] =>
  [...offers].sort((left, right) => {
    if (KIND_RANK[left.kind] !== KIND_RANK[right.kind]) {
      return KIND_RANK[left.kind] - KIND_RANK[right.kind];
    }

    const leftEnd = left.endsAt ? Date.parse(left.endsAt) : Number.POSITIVE_INFINITY;
    const rightEnd = right.endsAt ? Date.parse(right.endsAt) : Number.POSITIVE_INFINITY;
    if (leftEnd !== rightEnd) {
      return leftEnd - rightEnd;
    }

    return left.title.localeCompare(right.title, "tr");
  });

/** Whether an offer's deadline has passed. Undated offers never expire. */
export const isExpired = (offer: FreeGameOffer, nowMs: number): boolean => {
  if (!offer.endsAt) {
    return false;
  }
  const end = Date.parse(offer.endsAt);
  return Number.isFinite(end) && end <= nowMs;
};

/**
 * Drops what has run out.
 *
 * Both giveaway feeds keep an offer listed for a while after it ends, and a
 * card offering something that cannot be claimed any more is worse than no card
 * — the user clicks through to a store page charging full price.
 */
export const dropExpired = (offers: FreeGameOffer[], nowMs: number): FreeGameOffer[] =>
  offers.filter((offer) => !isExpired(offer, nowMs));

/** The bucket an offer belongs to, given the sidebar's filters. */
export const matchesFilter = (
  offer: FreeGameOffer,
  filter: FreeGameFilter,
  nowMs: number,
): boolean => {
  switch (filter) {
    case "free-now":
      return offer.kind === "free-now";
    case "free-soon":
      return offer.kind === "free-soon";
    case "ending-soon": {
      if (offer.kind !== "free-now" || !offer.endsAt) {
        return false;
      }
      const end = Date.parse(offer.endsAt);
      return (
        Number.isFinite(end) && end > nowMs && end - nowMs <= ENDING_SOON_WINDOW_MS
      );
    }
    case "deals":
      return offer.kind === "deal";
    case "always-free":
      return offer.kind === "always-free";
    default:
      return false;
  }
};

/** How many offers each sidebar bucket holds, for the counts beside them. */
export const countByFilter = (
  offers: FreeGameOffer[],
  nowMs: number,
): Record<FreeGameFilter, number> => {
  const counts: Record<FreeGameFilter, number> = {
    "free-now": 0,
    "free-soon": 0,
    "ending-soon": 0,
    deals: 0,
    "always-free": 0,
  };

  for (const offer of offers) {
    for (const filter of Object.keys(counts) as FreeGameFilter[]) {
      if (matchesFilter(offer, filter, nowMs)) {
        counts[filter] += 1;
      }
    }
  }

  return counts;
};

/**
 * Which offers are NEW compared with the previous poll.
 *
 * Only free-now matters: a discount appearing is not worth a notification, and
 * an offer moving from free-soon to free-now IS — it just became claimable.
 *
 * Keyed on store + title, NOT on the offer id. The id belongs to whichever feed
 * won mergeOffers that round, and the winner changes: a giveaway both Epic and
 * GamerPower carry is "gamerpower:3751" on a round where Epic timed out and
 * "epic:0e44…" on the next one. An id-keyed comparison reads that flip as a new
 * game and raises a second toast for something announced fifteen minutes
 * earlier. The merge key is the identity the rest of this module already uses.
 */
const announcementKey = (offer: FreeGameOffer): string =>
  `${offer.store}:${titleKey(offer.title)}`;

export const findNewlyFree = (
  previous: FreeGameOffer[],
  next: FreeGameOffer[],
): FreeGameOffer[] => {
  const seen = new Set(
    previous
      .filter((offer) => offer.kind === "free-now")
      .map(announcementKey),
  );

  return next.filter(
    (offer) => offer.kind === "free-now" && !seen.has(announcementKey(offer)),
  );
};

// --- dates ---------------------------------------------------------------------

function toIsoOrNull(value: unknown): string | null {
  const text = asString(value);
  if (!text) {
    return null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
