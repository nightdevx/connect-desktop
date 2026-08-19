import type { FreeGameFilter, FreeGameOffer } from "@shared/free-games";

/** The sidebar's buckets, in the order they are offered. */
export const FREE_GAME_FILTERS: Array<{
  id: FreeGameFilter;
  label: string;
  description: string;
}> = [
  {
    id: "free-now",
    label: "Şu an ücretsiz",
    description: "Kütüphanene kalıcı olarak ekleyebileceklerin",
  },
  {
    id: "ending-soon",
    label: "Son 24 saat",
    description: "Yakında sona erecek kampanyalar",
  },
  {
    id: "free-soon",
    label: "Yakında ücretsiz",
    description: "Sırada bekleyen kampanyalar",
  },
  {
    id: "deals",
    label: "Fırsatlar",
    description: "En yüksek indirimli oyunlar",
  },
  {
    id: "always-free",
    label: "Kalıcı ücretsiz",
    description: "Her zaman oynanabilen oyunlar",
  },
];

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How long is left, in the coarsest unit that is still true.
 *
 * Deliberately never counts seconds. A ticking second hand on a giveaway that
 * runs for six days is noise, and it would force the whole grid to re-render
 * once a second for the whole time the page is open.
 */
export const formatRemaining = (endsAt: string | null, nowMs: number): string | null => {
  if (!endsAt) {
    return null;
  }

  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) {
    return null;
  }

  const remaining = end - nowMs;
  if (remaining <= 0) {
    return "Sona erdi";
  }

  if (remaining >= DAY_MS) {
    const days = Math.floor(remaining / DAY_MS);
    const hours = Math.floor((remaining % DAY_MS) / HOUR_MS);
    return hours > 0 ? `${days} gün ${hours} saat` : `${days} gün`;
  }

  if (remaining >= HOUR_MS) {
    const hours = Math.floor(remaining / HOUR_MS);
    const minutes = Math.floor((remaining % HOUR_MS) / MINUTE_MS);
    return minutes > 0 ? `${hours} saat ${minutes} dk` : `${hours} saat`;
  }

  return `${Math.max(1, Math.floor(remaining / MINUTE_MS))} dk`;
};

/** When an upcoming giveaway opens. Same coarseness as the countdown. */
export const formatStartsIn = (startsAt: string | null, nowMs: number): string | null => {
  if (!startsAt) {
    return null;
  }
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start) || start <= nowMs) {
    return null;
  }
  return formatRemaining(startsAt, nowMs);
};

/** "3 dakika önce" for the last-refreshed line. */
export const formatFetchedAt = (fetchedAt: string, nowMs: number): string => {
  const at = Date.parse(fetchedAt);
  if (!Number.isFinite(at) || at <= 0) {
    return "henüz güncellenmedi";
  }

  const elapsed = Math.max(0, nowMs - at);
  if (elapsed < MINUTE_MS) {
    return "az önce";
  }
  if (elapsed < HOUR_MS) {
    return `${Math.floor(elapsed / MINUTE_MS)} dakika önce`;
  }
  return `${Math.floor(elapsed / HOUR_MS)} saat önce`;
};

/** Human names for the upstreams, for the "kaynak yanıt vermedi" line. */
export const SOURCE_LABELS: Record<FreeGameOffer["source"], string> = {
  epic: "Epic Games",
  gamerpower: "GamerPower",
  cheapshark: "CheapShark",
  freetogame: "FreeToGame",
};
