// Straight from base-client, not the ../backend-client barrel: the barrel pulls
// in all five API clients, and scripts/check-gif-mapping.cjs bundles this module
// to exercise toGifItem against a recorded payload.
import { DesktopApiError } from "./base-client";
import { isGifProviderMediaUrl } from "../../shared/gif-hosts";
import type { GifItem } from "../../shared/desktop-api-types";

// KLIPY (klipy.com) replaced Tenor. Google stopped issuing Tenor keys on
// 2026-01-13 and shut the API down completely on 2026-06-30, so the previous
// integration cannot be repaired -- there is nothing left to call.
//
// This deliberately does NOT go through BaseClient. BaseClient interpolates the
// full target URL into every DesktopApiError message, and those messages travel
// back over IPC to the renderer, where Sentry attaches them to error reports.
// KLIPY puts the API key in the URL PATH, so a single timeout would have
// shipped the key to Sentry. Nothing in this file may put the request URL into
// an error, a log line, or an IPC reply.
const KLIPY_API_ORIGIN = "https://api.klipy.com";

// Exported so main's Sentry.init can drop breadcrumbs for this host. Sentry's
// HTTP integrations record outgoing request URLs verbatim in BOTH processes --
// moving the fetch here would otherwise have moved the leak, not closed it.
export const KLIPY_API_HOSTNAME = "api.klipy.com";

// KLIPY's own default page size (min 8, max 50). Two columns of twelve fills
// the panel without asking for media nobody scrolls to.
const PER_PAGE = 24;

// pg-13 or stricter was the brief. This is a work chat, not a meme board.
const CONTENT_RATING = "pg-13";

const REQUEST_TIMEOUT_MS = 8_000;

// The free test key allows 100 calls/hour, so a renderer stuck in a render loop
// could burn the whole quota in seconds. The picker already debounces at 350ms;
// this is the backstop at the trust boundary, where a renderer bug cannot
// reach past it.
//
// ponytail: one module-level timestamp, not a per-window token bucket -- there
// is one picker open at a time. Swap in a bucket if the panel ever paginates.
const MIN_REQUEST_INTERVAL_MS = 300;
let lastRequestAt = 0;

// The payload, read off a live call rather than the docs (docs.klipy.com and
// its /gifs-api page both answer 403):
//
//   { result, data: { data: [ { id, slug, title, file: {
//       hd | md | sm | xs : { gif | webp | jpg | mp4 | webm : {url,width,height,size} }
//   } } ], current_page, per_page, has_next, meta } }
//
// This replaced a defensive walk that guessed at the schema, and the guess was
// wrong in two ways that both produced silent failures:
//
//   * The field is `file`, SINGULAR. Reading `files` walked undefined, so every
//     row mapped to null and the panel answered "Sonuç bulunamadı" for every
//     query -- indistinguishable from an empty search.
//   * Each tier holds five FORMATS at identical dimensions, so ranking variants
//     by pixel area chose between .gif/.mp4/.webm/.webp by object key order.
//     The chat renderer only auto-loads image extensions, so a picked GIF could
//     land in the message as a bare text link. Only the `gif` sub-key is read.
//
// Measured sizes: xs 90px/66KB, sm 220px/306KB, md 400px/788KB, hd 400px/805KB.
// sm is the grid preview; md and hd are within 2% of each other so hd sends.
const PREVIEW_TIERS = ["sm", "xs", "md", "hd"] as const;
const SEND_TIERS = ["hd", "md", "sm", "xs"] as const;

// Diagnostic bookkeeping only. HOSTNAME ONLY, never the URL: the API key is a
// path segment, and a media URL from this payload can carry a signature of its
// own, so nothing but the host is ever allowed into a log line.
const noteRejectedHost = (value: string, into: Set<string>): void => {
  try {
    into.add(new URL(value).hostname);
  } catch {
    // Not a URL at all -- there is no host to name, and it is not the
    // allowlist that rejected it.
  }
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

// The host check stays even though we now know the shape: it is the boundary
// that stops a redirecting or compromised upstream from putting a third-party
// URL into a message body, which is the same URL the renderer will auto-load.
const gifUrlForTier = (
  file: Record<string, unknown>,
  tier: string,
  rejectedHosts: Set<string>,
): string | null => {
  const gif = asRecord(asRecord(file[tier])?.gif);
  const url = gif?.url;

  if (typeof url !== "string" || !url.trim()) {
    return null;
  }
  if (!isGifProviderMediaUrl(url)) {
    noteRejectedHost(url, rejectedHosts);
    return null;
  }

  return url;
};

const firstTierUrl = (
  file: Record<string, unknown>,
  tiers: readonly string[],
  rejectedHosts: Set<string>,
): string | null => {
  for (const tier of tiers) {
    const url = gifUrlForTier(file, tier, rejectedHosts);
    if (url) {
      return url;
    }
  }
  return null;
};

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    // `id` arrives as a number (e.g. 5122930761797986), which a string-only
    // check would skip straight past to the slug.
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
};

// Returns null for anything unmappable rather than a half-built item: an
// unrenderable cell in the grid is worse than one fewer GIF.
//
// Exported for scripts/check-gif-mapping.cjs, which pins it against a recorded
// KLIPY row. This mapper is the one piece here that reads a schema we do not
// control, and it has already failed silently once.
export const toGifItem = (
  raw: unknown,
  rejectedHosts: Set<string>,
): GifItem | null => {
  const record = asRecord(raw);
  const file = record && asRecord(record.file);

  if (!record || !file) {
    return null;
  }

  const previewUrl = firstTierUrl(file, PREVIEW_TIERS, rejectedHosts);
  const sendUrl = firstTierUrl(file, SEND_TIERS, rejectedHosts);

  if (!previewUrl || !sendUrl) {
    return null;
  }

  return {
    // The id only has to be unique within one grid; the URL is a fine fallback
    // when the payload names the field something we did not expect.
    id: firstString(record.id, record.slug, record.title) ?? previewUrl,
    previewUrl,
    sendUrl,
    description: firstString(record.title, record.slug) ?? "GIF",
  };
};

// query is already trimmed and length-capped by the IPC validator. It is
// user-controlled text going into a URL, so it is set as a search PARAMETER --
// URL takes care of the encoding and it can never reach the path, where the
// API key lives.
export const searchKlipyGifs = async (
  apiKey: string,
  query: string,
): Promise<GifItem[]> => {
  const now = Date.now();
  if (now - lastRequestAt < MIN_REQUEST_INTERVAL_MS) {
    throw new DesktopApiError(
      "GIF_THROTTLED",
      429,
      "Çok hızlı GIF araması yapıldı",
    );
  }
  lastRequestAt = now;

  // An empty box shows what is trending rather than an empty panel.
  const endpoint = query ? "search" : "trending";
  const url = new URL(
    `${KLIPY_API_ORIGIN}/api/v1/${encodeURIComponent(apiKey)}/gifs/${endpoint}`,
  );
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("page", "1");
  url.searchParams.set("rating", CONTENT_RATING);
  if (query) {
    url.searchParams.set("q", query);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let payload: unknown;
  try {
    const response = await fetch(url.toString(), { signal: controller.signal });

    if (!response.ok) {
      // No URL and no response body in this message. Both carry the key, and
      // this message is returned to the renderer.
      throw new DesktopApiError(
        "GIF_REQUEST_FAILED",
        response.status,
        "GIF servisine ulaşılamadı",
      );
    }

    payload = await response.json();
  } catch (error) {
    if (error instanceof DesktopApiError) {
      throw error;
    }
    // Every transport failure collapses to one fixed message. A raw fetch
    // error is not re-thrown because its `cause` chain can quote the request
    // URL -- which is the key.
    throw new DesktopApiError(
      "GIF_REQUEST_FAILED",
      503,
      "GIF servisine ulaşılamadı",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // { result, data: { data: [ ... ] } } -- the list is nested one level deeper
  // than the paging metadata that surrounds it.
  const outer = (payload ?? {}) as { data?: { data?: unknown } };
  const items = Array.isArray(outer.data?.data) ? outer.data.data : [];

  // Wrapped in an arrow rather than passed by reference: Array#map hands the
  // index as the second argument, which would land in rejectedHosts.
  const rejectedHosts = new Set<string>();
  const gifs = items
    .map((raw) => toGifItem(raw, rejectedHosts))
    .filter((item): item is GifItem => item !== null);

  // The host allowlist is the one thing here that can fail totally AND
  // silently: if KLIPY serves media from a domain outside klipy.com, every row
  // maps to null, the picker prints "Sonuç bulunamadı" for every query, and it
  // is indistinguishable from a search that found nothing. One line per call,
  // hosts only -- see noteRejectedHost for why no URL appears here.
  if (items.length > 0 && gifs.length === 0) {
    console.warn(
      `[klipy] all ${items.length} result rows were dropped by the CDN host allowlist; hosts seen: ${
        rejectedHosts.size > 0 ? [...rejectedHosts].join(", ") : "none (payload carried no media URLs)"
      }`,
    );
  }

  return gifs;
};
