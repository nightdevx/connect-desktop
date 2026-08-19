#!/usr/bin/env node
// Self-check for the free-game normaliser in src/shared/free-games.ts.
//
// Four undocumented upstreams feed one page. None of them has a contract with
// us, none of them versions its payload, and every failure mode here is SILENT:
// the page does not crash, it shows the wrong thing. The three that actually
// happened during development are the three asserted hardest:
//
//   NOT FREE   Epic's "free games" feed is mostly not free games. Of the 11
//              elements it returned the day this was written, 3 were plain paid
//              discounts with a LIVE promotion block, and every single element
//              carried categories[].path === "freegames". Listing a 40%-off
//              game as free sends the user to a checkout page.
//   NOT EMPTY  Epic answers a bad country code with HTTP 200 and an error
//              envelope. Normalised, that is an empty list — which reads as
//              "no giveaways this week" and would sit there for weeks.
//   NOT TWICE  An Epic giveaway appears in Epic's own feed AND in GamerPower's,
//              with different ids, so id-based dedup cannot see it. It must
//              merge into one card that keeps the best field from each.
//
// Payloads below are trimmed from real responses captured on 2026-08-19. They
// are fixtures, not live calls: this check must pass on a plane, and an upstream
// being down must not fail the build.
//
// The module is pure -- no React, no DOM, no electron -- so it bundles
// standalone. Output goes under node_modules/.cache for the same reason the
// other checks do: bare specifiers cannot resolve from a system temp directory.
//
//   node scripts/check-free-games.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

// --- fixtures ---------------------------------------------------------------

// Epic. Five elements covering every branch the feed actually produces:
// currently free, upcoming free, a paid discount WITH a live promotion, a
// finished promotion (promotions: null), and an add-on.
const EPIC_PAYLOAD = {
  data: {
    Catalog: {
      searchStore: {
        elements: [
          {
            // Exactly the live shape: no productSlug, a urlSlug that is a bare
            // catalogue GUID, and the only readable name in offerMappings.
            title: "Caravan SandWitch",
            id: "0e44600a079e419abbb291ccf5af9ee7",
            offerType: "BASE_GAME",
            description: "Bir kum gezegeninde kayıp kardeşini ara.",
            keyImages: [
              { type: "Thumbnail", url: "https://cdn1.epicgames.com/spt-assets/tall.jpg" },
              { type: "OfferImageWide", url: "https://cdn1.epicgames.com/spt-assets/wide.jpg" },
            ],
            productSlug: null,
            urlSlug: "70e9a8a90305449a88a38b708399e605",
            offerMappings: [
              { pageSlug: "caravan-sandwitch-05ff58", pageType: "productHome" },
            ],
            catalogNs: {
              mappings: [
                { pageSlug: "caravan-sandwitch-05ff58", pageType: "productHome" },
              ],
            },
            price: {
              totalPrice: {
                discountPrice: 0,
                originalPrice: 41000,
                currencyCode: "TRY",
                fmtPrice: { originalPrice: "₺410,00" },
              },
            },
            promotions: {
              promotionalOffers: [
                {
                  promotionalOffers: [
                    {
                      startDate: "2026-08-13T15:00:00.000Z",
                      endDate: "2026-08-20T15:00:00.000Z",
                      discountSetting: { discountPercentage: 0 },
                    },
                  ],
                },
              ],
              upcomingPromotionalOffers: [],
            },
          },
          {
            title: "Next Week Freebie",
            id: "upcoming-1",
            offerType: "BASE_GAME",
            description: "Gelecek hafta ücretsiz.",
            keyImages: [{ type: "OfferImageTall", url: "https://cdn1.epicgames.com/next.jpg" }],
            // The "/home" suffix is real and 404s if it survives.
            productSlug: "next-week-freebie/home",
            price: {
              totalPrice: {
                discountPrice: 29900,
                originalPrice: 29900,
                currencyCode: "TRY",
                fmtPrice: { originalPrice: "₺299,00" },
              },
            },
            promotions: {
              promotionalOffers: [],
              upcomingPromotionalOffers: [
                {
                  promotionalOffers: [
                    {
                      startDate: "2026-08-20T15:00:00.000Z",
                      endDate: "2026-08-27T15:00:00.000Z",
                      discountSetting: { discountPercentage: 0 },
                    },
                  ],
                },
              ],
            },
          },
          {
            // THE TRAP: a live promotion block, in the free-games feed, that is
            // a 40% discount. Nothing but the price separates it from the first
            // element.
            title: "Castlevania Dominus Collection",
            id: "discounted-1",
            description: "İndirimde.",
            keyImages: [{ type: "OfferImageWide", url: "https://cdn1.epicgames.com/castle.jpg" }],
            productSlug: "castlevania-dominus-collection",
            price: {
              totalPrice: {
                discountPrice: 15000,
                originalPrice: 25000,
                currencyCode: "TRY",
                fmtPrice: { originalPrice: "₺250,00" },
              },
            },
            promotions: {
              promotionalOffers: [
                {
                  promotionalOffers: [
                    {
                      startDate: "2026-08-13T15:00:00.000Z",
                      endDate: "2026-08-27T15:00:00.000Z",
                      discountSetting: { discountPercentage: 60 },
                    },
                  ],
                },
              ],
              upcomingPromotionalOffers: [],
            },
          },
          {
            title: "Last Month Freebie",
            id: "finished-1",
            description: "Bitmiş kampanya.",
            keyImages: [],
            productSlug: "last-month-freebie",
            price: { totalPrice: { discountPrice: 19900, fmtPrice: { originalPrice: "₺199,00" } } },
            promotions: null,
          },
          {
            // Free, and genuinely in the feed — but a cosmetic pack, and its
            // fmtPrice reads the string "0", which renders as a struck-through
            // zero if it is trusted.
            title: "Destansı Büyücü Paketi",
            id: "addon-1",
            offerType: "ADD_ON",
            description: "Ek paket.",
            keyImages: [{ type: "Thumbnail", url: "https://cdn1.epicgames.com/addon.jpg" }],
            urlSlug: "epic-mage-bundle",
            offerMappings: [
              { pageSlug: "albion-online-epic-mage-bundle-2ceb19", pageType: "offer" },
            ],
            price: {
              totalPrice: {
                discountPrice: 0,
                originalPrice: 0,
                fmtPrice: { originalPrice: "0" },
              },
            },
            promotions: {
              promotionalOffers: [
                {
                  promotionalOffers: [
                    {
                      startDate: "2026-08-13T15:00:00.000Z",
                      endDate: "2026-08-20T15:00:00.000Z",
                      discountSetting: { discountPercentage: 0 },
                    },
                  ],
                },
              ],
            },
          },
          {
            // Nothing readable anywhere. A GUID link still resolves, so the card
            // must keep its button rather than being dropped.
            title: "Nameless Freebie",
            id: "guid-only-1",
            offerType: "BASE_GAME",
            description: "",
            keyImages: [],
            productSlug: null,
            urlSlug: "32b3e0adbe0c4399be1874958194f97f",
            price: {
              totalPrice: {
                discountPrice: 0,
                originalPrice: 12000,
                fmtPrice: { originalPrice: "₺120,00" },
              },
            },
            promotions: {
              promotionalOffers: [
                {
                  promotionalOffers: [
                    {
                      startDate: "2026-08-13T15:00:00.000Z",
                      endDate: "2026-08-20T15:00:00.000Z",
                      discountSetting: { discountPercentage: 0 },
                    },
                  ],
                },
              ],
            },
          },
        ],
        paging: { count: 40, total: 6 },
      },
    },
  },
};

// Epic's answer to ?country=ZZ. HTTP 200, and data.Catalog is null.
const EPIC_ERROR_PAYLOAD = {
  errors: [
    {
      message: "Sorry the value you entered: ZZ, does not appear to be a valid ISO country code",
      correlationId: "cb2c...",
      serviceResponse:
        '{"errorCode":"errors.com.epicgames.catalog.invalid_country_code","numericErrorCode":5222}',
    },
  ],
  data: { Catalog: null },
};

// GamerPower. All 16 real keys, including the pipe inside a platform NAME and
// the "N/A" that stands in for null.
const GAMERPOWER_PAYLOAD = [
  {
    id: 3749,
    title: "Deponia (Steam) Giveaway",
    worth: "$19.99",
    thumbnail: "https://www.gamerpower.com/offers/1/deponia-thumb.jpg",
    image: "https://www.gamerpower.com/offers/1b/deponia.jpg",
    description: "Grab Deponia for free on Steam!",
    instructions: "1. Log in. 2. Click add to account.",
    open_giveaway_url: "https://www.gamerpower.com/open/deponia-steam-giveaway",
    published_date: "2026-08-18 10:00:00",
    type: "Game",
    platforms: "PC, Steam, Xbox Series X|S",
    end_date: "2026-08-20 23:59:00",
    users: 12000,
    status: "Active",
    gamerpower_url: "https://www.gamerpower.com/deponia-steam-giveaway",
    open_giveaway: "https://www.gamerpower.com/open/deponia-steam-giveaway",
  },
  {
    // Same game as the first Epic element, from the other feed: different id,
    // no end time of its own, poorer artwork.
    id: 3751,
    title: "Caravan SandWitch (Epic Games) Giveaway",
    worth: "N/A",
    thumbnail: "https://www.gamerpower.com/offers/1/caravan-thumb.jpg",
    image: "",
    description: "Free on the Epic Games Store.",
    instructions: "Claim it.",
    open_giveaway_url: "https://www.gamerpower.com/open/caravan-sandwitch",
    published_date: "2026-08-13 15:00:00",
    type: "Game",
    platforms: "PC, Epic Games Store",
    end_date: "N/A",
    users: 900,
    status: "Active",
    gamerpower_url: "https://www.gamerpower.com/caravan-sandwitch",
    open_giveaway: "https://www.gamerpower.com/open/caravan-sandwitch",
  },
  {
    // 78 of the 105 live records were DLC. The page is about games.
    id: 3752,
    title: "Warframe: Free Loot Pack Giveaway",
    worth: "$5.00",
    thumbnail: "https://www.gamerpower.com/offers/1/warframe-thumb.jpg",
    image: "https://www.gamerpower.com/offers/1b/warframe.jpg",
    description: "Loot.",
    instructions: "Redeem.",
    open_giveaway_url: "https://www.gamerpower.com/open/warframe-loot",
    published_date: "2026-08-17 09:00:00",
    type: "DLC",
    platforms: "PC",
    end_date: "N/A",
    users: 400,
    status: "Active",
    gamerpower_url: "https://www.gamerpower.com/warframe-loot",
    open_giveaway: "https://www.gamerpower.com/open/warframe-loot",
  },
];

const CHEAPSHARK_STORES = { 1: "Steam", 25: "Epic Games Store", 7: "GOG" };

const CHEAPSHARK_PAYLOAD = [
  {
    internalName: "SOMEFREEGAME",
    title: "Some Free Game",
    dealID: "X1%2FfB3nJ0hE%3D",
    storeID: "25",
    gameID: "612",
    salePrice: "0.00",
    normalPrice: "14.99",
    isOnSale: "1",
    savings: "100.000000",
    steamAppID: null,
    thumb: "https://cheapshark.com/thumb/free.jpg",
  },
  {
    internalName: "HALFOFFGAME",
    title: "Half Off Game",
    dealID: "abc123",
    storeID: "1",
    gameID: "700",
    salePrice: "9.99",
    normalPrice: "19.99",
    isOnSale: "1",
    savings: "50.025012",
    steamAppID: "12345",
    thumb: "https://cheapshark.com/thumb/half.jpg",
  },
];

const FREETOGAME_PAYLOAD = [
  {
    id: 540,
    title: "Overwatch 2",
    thumbnail: "https://www.freetogame.com/g/540/thumbnail.jpg",
    short_description: "A hero-focused first-person team shooter from Blizzard.",
    game_url: "https://www.freetogame.com/open/overwatch-2",
    genre: "Shooter",
    platform: "PC (Windows)",
    publisher: "Blizzard Entertainment",
    developer: "Blizzard Entertainment",
    release_date: "2022-10-04",
    freetogame_profile_url: "https://www.freetogame.com/overwatch-2",
  },
];

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-free-games-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Not vite.config.ts: it carries the Sentry plugin, which would upload a
    // source map for this throwaway bundle on every check run.
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/shared/free-games.ts"),
        formats: ["es"],
        fileName: () => "free-games.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const {
    normalizeEpicPromotions,
    normalizeGamerPowerGiveaways,
    normalizeCheapSharkDeals,
    normalizeFreeToGame,
    isEpicErrorPayload,
    mergeOffers,
    sortOffers,
    dropExpired,
    matchesFilter,
    countByFilter,
    findNewlyFree,
    sanitizeExternalUrl,
    ENDING_SOON_WINDOW_MS,
  } = await import(pathToFileURL(path.join(outDir, "free-games.mjs")).href);

  // --- NOT FREE: the discount must not be listed as a giveaway --------------
  const epic = normalizeEpicPromotions(EPIC_PAYLOAD, "tr");
  const epicTitles = epic.map((offer) => offer.title);

  assert.ok(
    !epicTitles.includes("Castlevania Dominus Collection"),
    "a 60%-off offer with a LIVE promotion block was listed as free — this is the exact " +
      "trap the feed sets, and categories[].path === 'freegames' is true for it",
  );
  assert.ok(
    !epicTitles.includes("Last Month Freebie"),
    "a finished promotion (promotions: null) must not be listed",
  );
  assert.ok(
    !epicTitles.includes("Destansı Büyücü Paketi"),
    "an ADD_ON is a cosmetic pack, not a game — and the GamerPower half already " +
      "drops its DLC rows, so letting this through would make one list mean two things",
  );
  assert.deepEqual(
    epicTitles.sort(),
    ["Caravan SandWitch", "Nameless Freebie", "Next Week Freebie"].sort(),
    "exactly the genuinely-free games survive",
  );

  const caravan = epic.find((offer) => offer.title === "Caravan SandWitch");
  assert.equal(caravan.kind, "free-now");
  assert.equal(caravan.store, "epic");
  assert.equal(caravan.discountPercent, 100);
  assert.equal(caravan.originalPrice, "₺410,00", "localised price is kept verbatim");
  assert.equal(caravan.endsAt, "2026-08-20T15:00:00.000Z");
  assert.equal(
    caravan.url,
    "https://store.epicgames.com/tr/p/caravan-sandwitch-05ff58",
    "urlSlug is a bare catalogue GUID here — preferring it put an unreadable id " +
      "in the link for the one game that was actually free",
  );
  assert.equal(
    caravan.imageUrl,
    "https://cdn1.epicgames.com/spt-assets/wide.jpg",
    "the wide art is preferred over the thumbnail even when listed second",
  );

  const upcoming = epic.find((offer) => offer.title === "Next Week Freebie");
  assert.equal(upcoming.kind, "free-soon");
  assert.equal(upcoming.startsAt, "2026-08-20T15:00:00.000Z");
  assert.equal(
    upcoming.url,
    "https://store.epicgames.com/tr/p/next-week-freebie",
    "productSlug's trailing /home must be stripped or the link 404s",
  );

  const nameless = epic.find((offer) => offer.title === "Nameless Freebie");
  assert.equal(
    nameless.url,
    "https://store.epicgames.com/tr/p/32b3e0adbe0c4399be1874958194f97f",
    "with nothing readable anywhere a GUID link still resolves, and a card with " +
      "no way to claim it is worse than an ugly URL",
  );

  // --- NOT EMPTY: an error envelope is a failure, not a quiet week ----------
  assert.equal(isEpicErrorPayload(EPIC_ERROR_PAYLOAD), true);
  assert.equal(isEpicErrorPayload(EPIC_PAYLOAD), false);
  assert.equal(isEpicErrorPayload(null), true);
  assert.equal(isEpicErrorPayload("nope"), true);
  assert.deepEqual(
    normalizeEpicPromotions(EPIC_ERROR_PAYLOAD),
    [],
    "the error envelope still normalises to nothing — which is why the client must " +
      "call isEpicErrorPayload FIRST",
  );

  // --- GamerPower -----------------------------------------------------------
  const giveaways = normalizeGamerPowerGiveaways(GAMERPOWER_PAYLOAD);
  assert.equal(giveaways.length, 2, "the DLC row is dropped; games and early access stay");

  assert.deepEqual(
    giveaways.map((offer) => offer.title).sort(),
    ["Caravan SandWitch", "Deponia"].sort(),
    'GamerPower titles are listing headlines — "Deponia (Steam) Giveaway" — and ' +
      "that suffix is what stopped the same game merging with Epic's record for it",
  );

  const deponia = giveaways.find((offer) => offer.title.startsWith("Deponia"));
  assert.equal(deponia.store, "steam");
  assert.equal(
    deponia.endsAt,
    "2026-08-20T23:59:00.000Z",
    "'YYYY-MM-DD HH:mm:ss' with no zone is read as UTC, deliberately and consistently",
  );
  assert.equal(deponia.originalPrice, "$19.99");
  assert.ok(
    !deponia.storeLabel.includes("|"),
    "'Xbox Series X|S' is ONE platform: splitting on the pipe invents a platform called S",
  );

  const fromGamerPower = giveaways.find((offer) => offer.title === "Caravan SandWitch");
  assert.equal(fromGamerPower.store, "epic");
  assert.equal(fromGamerPower.originalPrice, null, "'N/A' is GamerPower's null");
  assert.equal(fromGamerPower.endsAt, null);
  assert.equal(
    fromGamerPower.imageUrl,
    "https://www.gamerpower.com/offers/1/caravan-thumb.jpg",
    "an empty image field falls back to the thumbnail rather than rendering a broken box",
  );

  // --- CheapShark -----------------------------------------------------------
  const deals = normalizeCheapSharkDeals(CHEAPSHARK_PAYLOAD, CHEAPSHARK_STORES);
  assert.equal(deals.length, 2);

  const freeDeal = deals.find((offer) => offer.title === "Some Free Game");
  assert.equal(freeDeal.kind, "free-now");
  assert.equal(freeDeal.store, "epic");
  assert.equal(freeDeal.discountPercent, 100);
  assert.equal(
    freeDeal.url,
    "https://www.cheapshark.com/redirect?dealID=X1%2FfB3nJ0hE%3D",
    "dealID arrives URL-encoded; re-encoding it produces a link that 404s",
  );

  const halfOff = deals.find((offer) => offer.title === "Half Off Game");
  assert.equal(halfOff.kind, "deal");
  assert.equal(halfOff.discountPercent, 50, "50.025012 rounds to 50");
  assert.equal(halfOff.store, "steam");
  assert.equal(
    halfOff.salePrice,
    "$9.99",
    "a bargain card must lead with what it costs now, not with the old price",
  );
  assert.equal(halfOff.originalPrice, "$19.99");
  assert.equal(
    freeDeal.salePrice,
    null,
    "a zero sale price is the word \"free\", not \"$0.00\" beside a struck-out number",
  );

  // --- FreeToGame -----------------------------------------------------------
  const alwaysFree = normalizeFreeToGame(FREETOGAME_PAYLOAD);
  assert.equal(alwaysFree.length, 1);
  assert.equal(alwaysFree[0].kind, "always-free");
  assert.equal(alwaysFree[0].endsAt, null, "a free-to-play title has no deadline");

  // --- NOT TWICE: the same game from two feeds is one card ------------------
  const merged = mergeOffers([epic, giveaways, deals, alwaysFree]);
  const caravanCards = merged.filter((offer) => offer.title === "Caravan SandWitch");
  assert.equal(
    caravanCards.length,
    1,
    "Epic's feed and GamerPower both carry this giveaway under different ids",
  );
  assert.equal(
    caravanCards[0].source,
    "epic",
    "Epic's own record wins: it knows the exact end time and the localised price",
  );
  assert.equal(
    caravanCards[0].endsAt,
    "2026-08-20T15:00:00.000Z",
    "and the winner's better end time is the one kept",
  );

  // The merge must not be wholesale: the loser's non-null fields fill the
  // winner's gaps. Constructed here rather than hoped for in live data.
  const sparseWinner = {
    ...caravan,
    endsAt: null,
    originalPrice: null,
    imageUrl: null,
    description: "",
  };
  const filled = mergeOffers([[sparseWinner], [fromGamerPower]])[0];
  assert.equal(filled.source, "epic", "the ranking still decides who wins");
  assert.equal(
    filled.imageUrl,
    fromGamerPower.imageUrl,
    "a gap in the winning record is filled from the losing one",
  );
  assert.ok(filled.description.length > 0);

  // --- ordering and expiry ---------------------------------------------------
  const kinds = merged.map((offer) => offer.kind);
  assert.equal(kinds[0], "free-now", "free things come first");
  assert.equal(
    kinds[kinds.length - 1],
    "always-free",
    "a title that is free forever is the least urgent thing on the page",
  );

  const sorted = sortOffers([
    { ...caravan, id: "a", title: "Later", endsAt: "2026-08-25T00:00:00.000Z" },
    { ...caravan, id: "b", title: "Sooner", endsAt: "2026-08-20T00:00:00.000Z" },
    { ...caravan, id: "c", title: "Undated", endsAt: null },
  ]);
  assert.deepEqual(
    sorted.map((offer) => offer.title),
    ["Sooner", "Later", "Undated"],
    "soonest deadline first; undated sorts last inside its own kind",
  );

  const now = Date.parse("2026-08-19T12:00:00.000Z");
  const live = dropExpired(merged, now);
  assert.ok(
    live.length > 0 && live.every((offer) => !offer.endsAt || Date.parse(offer.endsAt) > now),
    "an offer whose deadline has passed must not be shown — the link charges full price",
  );
  assert.equal(
    dropExpired([{ ...caravan, endsAt: "2026-08-18T00:00:00.000Z" }], now).length,
    0,
  );

  // --- buckets ---------------------------------------------------------------
  assert.equal(matchesFilter(caravan, "free-now", now), true);
  assert.equal(matchesFilter(caravan, "deals", now), false);
  assert.equal(
    matchesFilter(caravan, "ending-soon", now),
    false,
    "27 hours left (2026-08-19T12:00 -> 2026-08-20T15:00) is outside the 24h window",
  );

  const counts = countByFilter(merged, now);
  assert.ok(counts["free-now"] >= 3, "counts drive the sidebar; they must not be zero");
  assert.equal(counts["free-soon"], 1);
  assert.equal(counts["always-free"], 1);
  assert.equal(counts.deals, 1);

  const endingSoonNow = Date.parse("2026-08-20T10:00:00.000Z");
  assert.equal(
    matchesFilter(caravan, "ending-soon", endingSoonNow),
    true,
    "five hours left is inside the 24h window",
  );
  assert.equal(
    matchesFilter(caravan, "ending-soon", Date.parse("2026-08-21T00:00:00.000Z")),
    false,
    "an offer that has already ended is not 'ending soon'",
  );
  assert.equal(ENDING_SOON_WINDOW_MS, 24 * 60 * 60 * 1000);

  // --- what is new -----------------------------------------------------------
  assert.deepEqual(
    findNewlyFree(merged, merged).map((offer) => offer.id),
    [],
    "an unchanged poll announces nothing",
  );

  const promoted = merged.map((offer) =>
    offer.title === "Next Week Freebie" ? { ...offer, kind: "free-now" } : offer,
  );
  const announced = findNewlyFree(merged, promoted);
  assert.deepEqual(
    announced.map((offer) => offer.title),
    ["Next Week Freebie"],
    "free-soon becoming free-now IS news, and the id does not change across that " +
      "transition — which is why the comparison is keyed on id AND kind",
  );

  const firstRun = findNewlyFree([], merged);
  assert.ok(
    firstRun.length >= 3,
    "with no previous poll everything free is new; the caller suppresses the first round",
  );

  // --- the title cleaner must not eat real words -----------------------------
  // Every one of these was produced by the first version of the regex, which
  // anchored `key` and `free` without a word boundary. The result was not a
  // cosmetic wobble: a truncated title stops matching the same game from another
  // feed, so the page shows one giveaway as two cards.
  const titleCases = [
    ["Super Blood Hockey Giveaway", "Super Blood Hockey"],
    ["Carefree Giveaway", "Carefree"],
    ["Monkey Giveaway", "Monkey"],
    ["Whiskey Giveaway", "Whiskey"],
    ["Deponia (Steam) Giveaway", "Deponia"],
    ["Tape 101: Liminal Descent (Playtest) Steam Key Giveaway", "Tape 101: Liminal Descent"],
    // No "Giveaway" at the end, so nothing is touched at all.
    ["Half-Life 2: Episode One (2006)", "Half-Life 2: Episode One (2006)"],
    ["Monkey Island", "Monkey Island"],
  ];

  for (const [raw, expected] of titleCases) {
    const [offer] = normalizeGamerPowerGiveaways([
      {
        id: 1,
        title: raw,
        type: "Game",
        platforms: "PC, Steam",
        worth: "N/A",
        end_date: "N/A",
        published_date: "N/A",
        description: "",
        thumbnail: "https://www.gamerpower.com/t.jpg",
        image: "",
        open_giveaway_url: "https://www.gamerpower.com/open/x",
        gamerpower_url: "https://www.gamerpower.com/x",
        open_giveaway: "https://www.gamerpower.com/open/x",
      },
    ]);
    assert.equal(offer.title, expected, `"${raw}" cleaned to "${offer.title}"`);
  }

  // --- a malformed promotion must not take the whole source down -------------
  const epicWithNulls = {
    data: {
      Catalog: {
        searchStore: {
          elements: [
            {
              title: "Survives A Null",
              id: "null-1",
              offerType: "BASE_GAME",
              description: "",
              keyImages: [],
              productSlug: "survives-a-null",
              price: {
                totalPrice: {
                  discountPrice: 0,
                  originalPrice: 1000,
                  fmtPrice: { originalPrice: "₺10,00" },
                },
              },
              promotions: {
                // Both shapes seen defensively: a null group, and a null offer
                // inside a real group. The second one used to throw, and the
                // catch upstream reported the whole feed as unreachable.
                promotionalOffers: [
                  null,
                  {
                    promotionalOffers: [
                      null,
                      {
                        startDate: "2026-08-13T15:00:00.000Z",
                        endDate: "2026-08-20T15:00:00.000Z",
                        discountSetting: { discountPercentage: 0 },
                      },
                    ],
                  },
                ],
                upcomingPromotionalOffers: [{ promotionalOffers: [null] }],
              },
            },
          ],
        },
      },
    },
  };

  const survived = normalizeEpicPromotions(epicWithNulls, "tr");
  assert.equal(
    survived.length,
    1,
    "a null inside promotions must be skipped, not thrown on — the throw was " +
      "caught upstream and reported as 'Epic did not answer'",
  );
  assert.equal(survived[0].kind, "free-now");

  // --- announcements survive a source blip -----------------------------------
  // The same giveaway, described by two feeds, under two different ids. The id
  // that ends up on the merged card depends on which feed answered that round.
  const asGamerPower = { ...caravan, id: "gamerpower:3751", source: "gamerpower" };
  const asEpic = { ...caravan, id: "epic:0e44600a", source: "epic" };

  assert.deepEqual(
    findNewlyFree([asGamerPower], [asEpic]),
    [],
    "Epic's feed recovering must not re-announce a game GamerPower already " +
      "reported: the id flips with the winning source, the game does not",
  );
  assert.deepEqual(
    findNewlyFree([asEpic], [asGamerPower]),
    [],
    "and the same in reverse, for the round Epic drops out again",
  );

  // --- titles with no Latin characters stay distinct --------------------------
  const cyrillicOne = { ...caravan, id: "a", title: "Тёмные Земли" };
  const cyrillicTwo = { ...caravan, id: "b", title: "Другая Игра" };
  assert.equal(
    mergeOffers([[cyrillicOne], [cyrillicTwo]]).length,
    2,
    "two unrelated non-Latin titles both fold to an empty key, and an empty key " +
      "is the same key — they must not collapse into one card",
  );

  // --- links -----------------------------------------------------------------
  assert.equal(sanitizeExternalUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeExternalUrl("file:///C:/Windows/System32/calc.exe"), null);
  assert.equal(sanitizeExternalUrl(""), null);
  assert.equal(sanitizeExternalUrl(42), null);
  assert.equal(
    sanitizeExternalUrl("https://store.steampowered.com/app/1/"),
    "https://store.steampowered.com/app/1/",
  );

  // --- rubbish in, no crash out ----------------------------------------------
  for (const junk of [null, undefined, 0, "", [], {}, [null], [{}], { data: null }]) {
    assert.deepEqual(normalizeEpicPromotions(junk), []);
    assert.deepEqual(normalizeGamerPowerGiveaways(junk), []);
    assert.deepEqual(normalizeCheapSharkDeals(junk), []);
    assert.deepEqual(normalizeFreeToGame(junk), []);
  }
  assert.deepEqual(mergeOffers([]), []);
  assert.deepEqual(mergeOffers([[], []]), []);

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    `free-games self-check passed (${merged.length} offers from 4 feeds, discounts rejected, ` +
      "duplicates merged, error envelopes caught)",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
