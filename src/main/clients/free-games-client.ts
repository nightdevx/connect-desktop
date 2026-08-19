import { net } from "electron";
import {
  isEpicErrorPayload,
  normalizeCheapSharkDeals,
  normalizeEpicPromotions,
  normalizeFreeToGame,
  normalizeGamerPowerGiveaways,
  type FreeGameOffer,
  type FreeGameSource,
} from "../../shared/free-games";

// Free-game offers, gathered from four upstreams.
//
// This runs in MAIN, not the renderer, for a reason that is not stylistic:
// Epic's endpoint sends no Access-Control-Allow-Origin header at all — not even
// when the request carries an Origin — and its OPTIONS preflight answers with a
// bare text/html "OK". A renderer fetch is blocked before it starts. The other
// three do send CORS headers, but splitting the page across two processes to
// save one proxy would put half the failure modes somewhere else.
//
// Deliberately NOT a BaseClient subclass: that class is built around one base
// URL and one backend's error envelope, and these are four unrelated hosts with
// four unrelated shapes. What IS copied from it is the part that matters —
// net.fetch over Node's global fetch, and a timeout that spans the body read
// rather than stopping when the headers arrive.

const EPIC_FREE_GAMES_URL =
  "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions";

// No platform filter. `/api/giveaways` is the endpoint that was verified to
// answer every active giveaway across every store, and the normaliser drops
// what is not a game — 78 of the 105 records in a live sample were DLC or loot.
// Filtering here instead would mean trusting a `platform=a.b.c` slug list that
// is not documented anywhere and fails silently on a typo.
const GAMERPOWER_GIVEAWAYS_URL = "https://www.gamerpower.com/api/giveaways";

const CHEAPSHARK_STORES_URL = "https://www.cheapshark.com/api/1.0/stores";

// pageSize is capped at 60 upstream whatever you ask for, so depth comes from
// pageNumber. Three pages is 180 discounts — enough for the page to be worth
// paginating without walking a catalogue whose own docs ask callers not to
// bulk-cache it.
const CHEAPSHARK_DEAL_PAGES = 3;
const CHEAPSHARK_PAGE_SIZE = 60;

const cheapSharkDealsUrl = (page: number): string =>
  `https://www.cheapshark.com/api/1.0/deals?onSale=1&sortBy=Savings&pageSize=${CHEAPSHARK_PAGE_SIZE}&pageNumber=${page}`;

const CHEAPSHARK_FREE_URL =
  "https://www.cheapshark.com/api/1.0/deals?upperPrice=0&sortBy=Recent&pageSize=60";

const FREETOGAME_URL = "https://www.freetogame.com/api/games?platform=pc";

const REQUEST_TIMEOUT_MS = 8_000;

// Not decoration. CheapShark answers HTTP 400 to a request with a missing or
// generic User-Agent — "Please identify your client with a descriptive
// User-Agent" — and it is the polite thing to send to the other three, which are
// community APIs paying for the bandwidth. Carries no version and no machine
// detail: it identifies the client, it does not fingerprint the user.
const USER_AGENT = "ConnectDesktop (+https://github.com/nightdevx/connect-desktop)";

/**
 * One JSON GET, bounded.
 *
 * The timeout covers the body, not just the headers: fetch resolves as soon as
 * headers arrive, and a proxy that flushes headers and then stalls would leave
 * the poll awaiting forever with its in-flight guard still set.
 */
const fetchJson = async (url: string): Promise<unknown> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await net.fetch(url, {
      method: "GET",
      cache: "no-store",
      // These are plain https hosts. Nothing here should ever be answerable by
      // a protocol handler this app registered.
      bypassCustomProtocolHandlers: true,
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    } as RequestInit);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeoutId);
  }
};

interface SourceResult {
  source: FreeGameSource;
  offers: FreeGameOffer[];
  ok: boolean;
}

const failed = (source: FreeGameSource): SourceResult => ({
  source,
  offers: [],
  ok: false,
});

const loadEpic = async (): Promise<SourceResult> => {
  try {
    // locale drives the title, description and currency; country/allowCountries
    // decide which region's promotion is described. A locale with no country
    // still answers, but with USD prices.
    const payload = await fetchJson(
      `${EPIC_FREE_GAMES_URL}?locale=tr&country=TR&allowCountries=TR`,
    );

    // HTTP 200 with an error envelope is Epic's answer to a bad country code.
    // Normalised it is an empty list, which would sit on screen for weeks
    // reading as "no giveaways" — so it is reported as the failure it is.
    if (isEpicErrorPayload(payload)) {
      return failed("epic");
    }

    return { source: "epic", offers: normalizeEpicPromotions(payload, "tr"), ok: true };
  } catch {
    return failed("epic");
  }
};

const loadGamerPower = async (): Promise<SourceResult> => {
  try {
    const payload = await fetchJson(GAMERPOWER_GIVEAWAYS_URL);
    return {
      source: "gamerpower",
      offers: normalizeGamerPowerGiveaways(payload),
      ok: true,
    };
  } catch {
    return failed("gamerpower");
  }
};

// Fetched once per process: CheapShark's store list changes a few times a year,
// and it is only needed to turn "25" into "Epic Games Store".
let cheapSharkStoreNames: Record<string, string> | null = null;

const loadCheapSharkStores = async (): Promise<Record<string, string>> => {
  if (cheapSharkStoreNames) {
    return cheapSharkStoreNames;
  }

  const payload = await fetchJson(CHEAPSHARK_STORES_URL);
  const names: Record<string, string> = {};

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (entry && typeof entry === "object") {
        const store = entry as Record<string, unknown>;
        const id = typeof store.storeID === "string" ? store.storeID : "";
        const name = typeof store.storeName === "string" ? store.storeName : "";
        // isActive is 0 for stores CheapShark has retired; their old deals can
        // still appear, so they are kept — a name is better than a number.
        if (id && name) {
          names[id] = name;
        }
      }
    }
  }

  cheapSharkStoreNames = names;
  return names;
};

const loadCheapShark = async (): Promise<SourceResult> => {
  try {
    const storeNames = await loadCheapSharkStores();
    // Separate queries, because "the best bargains" and "the things that cost
    // nothing" are different questions and the free one returns almost nothing
    // most days.
    const [free, ...dealPages] = await Promise.all([
      fetchJson(CHEAPSHARK_FREE_URL),
      ...Array.from({ length: CHEAPSHARK_DEAL_PAGES }, (_, page) =>
        fetchJson(cheapSharkDealsUrl(page)),
      ),
    ]);

    return {
      source: "cheapshark",
      offers: [
        ...normalizeCheapSharkDeals(free, storeNames),
        ...dealPages.flatMap((page) => normalizeCheapSharkDeals(page, storeNames)),
      ],
      ok: true,
    };
  } catch {
    return failed("cheapshark");
  }
};

const loadFreeToGame = async (): Promise<SourceResult> => {
  try {
    const payload = await fetchJson(FREETOGAME_URL);

    // The whole catalogue — ~350 titles — not a slice of it. It used to be cut
    // to the newest 60 to keep one tab from rendering hundreds of cards, which
    // solved a rendering problem by throwing away data. The grid pages through
    // it now, so the cut had nothing left to buy.
    //
    // Newest first: the upstream's own order is unspecified, and its ids are
    // sequential, so the id is the closest thing to a release order it exposes.
    const offers = [...normalizeFreeToGame(payload)].sort((left, right) => {
      const leftId = Number(left.id.split(":")[1] ?? 0);
      const rightId = Number(right.id.split(":")[1] ?? 0);
      return rightId - leftId;
    });

    return { source: "freetogame", offers, ok: true };
  } catch {
    return failed("freetogame");
  }
};

export interface FreeGamesFetch {
  /** What each source returned this round. A failed source contributes []. */
  offersBySource: Record<FreeGameSource, FreeGameOffer[]>;
  failedSources: FreeGameSource[];
}

/**
 * Everything that is free or discounted right now, from every source at once.
 *
 * Sources are fetched in parallel and failures are reported rather than thrown:
 * three feeds answering and one timing out is a usable page, and the one that
 * failed is named so the caller can say so instead of presenting a short list
 * as the whole truth.
 *
 * Returns the sources SEPARATELY rather than one merged list. The caller keeps
 * the last good result per source, and a merged list cannot be taken apart
 * again — mergeOffers folds a giveaway that two feeds both carry into one
 * record under one source, so "drop what GamerPower said" is not a question the
 * merged list can answer.
 *
 * Always fetches all four. Rate limiting belongs to the caller.
 */
export const fetchFreeGames = async (): Promise<FreeGamesFetch> => {
  const results = await Promise.all([
    loadEpic(),
    loadGamerPower(),
    loadCheapShark(),
    loadFreeToGame(),
  ]);

  const offersBySource = {
    epic: [],
    gamerpower: [],
    cheapshark: [],
    freetogame: [],
  } as Record<FreeGameSource, FreeGameOffer[]>;

  for (const result of results) {
    offersBySource[result.source] = result.offers;
  }

  return {
    offersBySource,
    failedSources: results.filter((result) => !result.ok).map((result) => result.source),
  };
};
