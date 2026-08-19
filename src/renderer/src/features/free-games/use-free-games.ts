import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { DesktopResult } from "@shared/desktop-api-types";
import {
  countByFilter,
  dropExpired,
  matchesFilter,
  storeLabel,
  type FreeGameFilter,
  type FreeGameOffer,
  type FreeGameStore,
  type FreeGamesSnapshot,
} from "@shared/free-games";
import { useUiStore } from "@/store/ui-store";
import { EMPTY_FREE_GAMES_SNAPSHOT, freeGamesService } from "./service";

const FREE_GAMES_QUERY_KEY = ["free-games"] as const;

// Main caches a snapshot for five minutes and pushes every new one over its own
// channel, so react-query's job here is to hold the last answer, not to poll.
// Matching the two windows means opening the page never fires a request main
// would have refused anyway.
const SNAPSHOT_STALE_MS = 5 * 60_000;

// How often the countdowns and the "ending soon" bucket are recomputed.
//
// One minute, not one second: nothing on this page is measured more finely than
// minutes, and a per-second tick would re-render the whole grid 3,600 times an
// hour for a number that changes 60 times.
const CLOCK_TICK_MS = 60_000;

// Stable identity for "nothing yet" — a fresh [] every render would invalidate
// every memo downstream.
const EMPTY_OFFERS: FreeGameOffer[] = [];

/** A minute-resolution clock, shared by the countdowns and the expiry filter. */
const useMinuteClock = (): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  return now;
};

/** How many cards one page of the grid holds. */
export const FREE_GAMES_PAGE_SIZES = [24, 48, 96] as const;

export interface FreeGameStoreOption {
  value: FreeGameStore | "all";
  label: string;
  count: number;
}

export interface FreeGamesController {
  query: UseQueryResult<DesktopResult<FreeGamesSnapshot>, Error>;
  snapshot: FreeGamesSnapshot;
  /** Everything still claimable, expired offers already removed. */
  offers: FreeGameOffer[];
  /** The selected bucket, narrowed to the selected store. */
  visibleOffers: FreeGameOffer[];
  /** Just the current page of visibleOffers. */
  pagedOffers: FreeGameOffer[];
  counts: Record<FreeGameFilter, number>;
  filter: FreeGameFilter;
  setFilter: (filter: FreeGameFilter) => void;
  store: FreeGameStore | "all";
  setStore: (store: FreeGameStore | "all") => void;
  /** Every store present in the live data, with how much each has. */
  storeOptions: FreeGameStoreOption[];
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  /** Minute-resolution clock the cards share, so they tick together. */
  nowMs: number;
  isRefreshing: boolean;
  refresh: () => void;
}

/**
 * The free-games page's data.
 *
 * Main owns the fetching, the cache, the cooldown and the schedule; this reads
 * what main has and subscribes to what main pushes. Nothing here talks to an
 * upstream — Epic's endpoint sends no CORS headers and would not answer a
 * renderer anyway.
 */
export const useFreeGames = (): FreeGamesController => {
  const queryClient = useQueryClient();
  const filter = useUiStore((state) => state.freeGamesFilter);
  const setFilter = useUiStore((state) => state.setFreeGamesFilter);
  const store = useUiStore((state) => state.freeGamesStore);
  const setStore = useUiStore((state) => state.setFreeGamesStore);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(FREE_GAMES_PAGE_SIZES[0]);
  const nowMs = useMinuteClock();

  const query = useQuery({
    queryKey: FREE_GAMES_QUERY_KEY,
    queryFn: () => freeGamesService.getFreeGames(),
    staleTime: SNAPSHOT_STALE_MS,
  });

  // The background poll's result, written straight into the cache. Without this
  // a page left open all evening would show whatever was free when it was
  // opened — which is the one thing this page must not do.
  useEffect(() => {
    return freeGamesService.onFreeGamesUpdated((snapshot) => {
      queryClient.setQueryData<DesktopResult<FreeGamesSnapshot>>(
        FREE_GAMES_QUERY_KEY,
        { ok: true, data: snapshot },
      );
    });
  }, [queryClient]);

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    void freeGamesService
      .getFreeGames({ refresh: true })
      .then((result) => {
        if (result.ok && result.data) {
          queryClient.setQueryData<DesktopResult<FreeGamesSnapshot>>(
            FREE_GAMES_QUERY_KEY,
            result,
          );
        }
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [queryClient]);

  const snapshot =
    query.data?.ok && query.data.data ? query.data.data : EMPTY_FREE_GAMES_SNAPSHOT;

  // Expired offers are dropped here rather than upstream: main's snapshot can be
  // fifteen minutes old, and a giveaway that ended in the meantime would still
  // be in it. Clicking one sends the user to a store page charging full price.
  const offers = useMemo(
    () => (snapshot.offers.length === 0 ? EMPTY_OFFERS : dropExpired(snapshot.offers, nowMs)),
    [snapshot.offers, nowMs],
  );

  // Narrowed by store BEFORE the buckets are counted, so the sidebar numbers
  // describe the list the user is actually looking at. Counting the unfiltered
  // set instead would put "12" beside a bucket that renders three cards.
  const storeOffers = useMemo(
    () => (store === "all" ? offers : offers.filter((offer) => offer.store === store)),
    [offers, store],
  );

  const counts = useMemo(() => countByFilter(storeOffers, nowMs), [storeOffers, nowMs]);

  // The bucket WITHOUT the store filter applied. Two different lists are needed:
  // this one decides which stores are worth offering, and the store-filtered one
  // below is what gets rendered. Deriving the options from the rendered list
  // instead would collapse the select to whatever is already selected.
  const bucketOffers = useMemo(
    () => offers.filter((offer) => matchesFilter(offer, filter, nowMs)),
    [offers, filter, nowMs],
  );

  const visibleOffers = useMemo(
    () => (store === "all" ? bucketOffers : bucketOffers.filter((offer) => offer.store === store)),
    [bucketOffers, store],
  );

  /**
   * Scoped to the bucket on screen.
   *
   * Built from every offer at first, which made the select useless: the
   * free-to-play catalogue is ~350 titles that belong to no store, so every
   * tab's dropdown opened on "Diğer (388)" with the stores that actually have
   * giveaways buried under it.
   */
  const storeOptions = useMemo<FreeGameStoreOption[]>(() => {
    const byStore = new Map<FreeGameStore, number>();
    for (const offer of bucketOffers) {
      byStore.set(offer.store, (byStore.get(offer.store) ?? 0) + 1);
    }

    const named = [...byStore.entries()]
      .map(([value, count]) => ({ value, label: storeLabel(value), count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label, "tr"),
      );

    return [
      { value: "all" as const, label: "Tüm mağazalar", count: bucketOffers.length },
      ...named,
    ];
  }, [bucketOffers]);

  // Switching bucket can strip the selected store out from under the user —
  // there are Epic giveaways but no Epic free-to-play titles. Without this the
  // select would keep showing "Epic Games" over an empty grid.
  useEffect(() => {
    if (store === "all" || bucketOffers.length === 0) {
      return;
    }
    if (!bucketOffers.some((offer) => offer.store === store)) {
      setStore("all");
    }
  }, [bucketOffers, store, setStore]);

  // A filter change that leaves the user on page 7 of a 2-page list shows an
  // empty grid with no explanation.
  useEffect(() => {
    setPage(1);
  }, [filter, store, pageSize]);

  // Clamped rather than only reset: the list also shrinks on its own when a
  // giveaway expires under a minute tick, and nothing fires an effect for that.
  const pageCount = Math.max(1, Math.ceil(visibleOffers.length / pageSize));
  const safePage = Math.min(page, pageCount);

  const pagedOffers = useMemo(
    () => visibleOffers.slice((safePage - 1) * pageSize, safePage * pageSize),
    [visibleOffers, safePage, pageSize],
  );

  return {
    query,
    snapshot,
    offers,
    visibleOffers,
    pagedOffers,
    counts,
    filter,
    setFilter,
    store,
    setStore,
    storeOptions,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    nowMs,
    isRefreshing,
    refresh,
  };
};
