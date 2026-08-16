import { useMemo } from "react";
import { useQueries, useQuery, type QueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@shared/auth-contracts";
import workspaceService from "../../services";

// Public profile cards, keyed by user id.
//
// The directory (["workspace-users"]) is friends-only, so it has no avatar, no
// real username and no join date for anyone you have not added. Everyone in a
// voice room is on screen whether you are friends or not, which is why this
// exists: one cached read per id, from the same endpoint the profile card and
// the roster avatars both need.
//
// Long cache on purpose. A display name or an avatar changes at human pace, and
// the payload carries a base64 avatar — refetching it on every focus would move
// megabytes for nothing. A friend's own row still updates live through the
// users-WS; this is the fallback for everyone else.
const CARD_STALE_MS = 5 * 60_000;
const CARD_GC_MS = 30 * 60_000;

// ponytail: a flat cap rather than windowing by what is on screen. A lobby
// holds 10 and the sidebar shows a handful of lobbies, so this is well above
// anything real — it is here so a pathological lobby list cannot turn one
// render into hundreds of requests. Window it if rooms ever get large.
const MAX_PREFETCHED_CARDS = 60;

export const userCardQueryKey = (userId: string): [string, string] => [
  "user-card",
  userId,
];

const buildCardQuery = (userId: string) => ({
  queryKey: userCardQueryKey(userId),
  queryFn: () => workspaceService.getUserCard({ userId }),
  staleTime: CARD_STALE_MS,
  gcTime: CARD_GC_MS,
  // A 404 is the answer for a blocked or deleted account, not a hiccup —
  // retrying it just spends the rate-limit bucket.
  retry: false,
});

/**
 * The card for one id, outside React — for a click handler that needs the real
 * username before it can act. Served from the same cache the hooks read, so a
 * roster whose cards are already loaded resolves without a request.
 */
export const fetchUserCard = async (
  queryClient: QueryClient,
  userId: string,
): Promise<UserProfile | null> => {
  try {
    const result = await queryClient.fetchQuery(buildCardQuery(userId));
    return result.ok ? (result.data?.user ?? null) : null;
  } catch {
    return null;
  }
};

/** One card. Disabled until an id exists, so a closed popover costs nothing. */
export const useUserCard = (userId: string | null | undefined) => {
  const query = useQuery({
    ...buildCardQuery(userId ?? ""),
    enabled: Boolean(userId),
  });

  return {
    card: query.data?.ok ? (query.data.data?.user ?? null) : null,
    isLoading: Boolean(userId) && query.isPending,
    // Distinguishes "not loaded yet" from "the server will not name them",
    // which is what decides whether the card shows a spinner or a fallback.
    isUnavailable: Boolean(query.data && !query.data.ok),
  };
};

/**
 * Cards for a whole roster, as a lookup.
 *
 * `userIds` may be a fresh array every render — the queries are keyed by id and
 * the result map is memoised on the id list itself, not on its identity.
 */
export const useUserCards = (
  userIds: string[],
): Record<string, UserProfile> => {
  // Sorted and de-duplicated so two renders that name the same people produce
  // the same key, and so the cap cuts a stable set rather than a random one.
  const stableIds = useMemo(() => {
    return [...new Set(userIds.filter(Boolean))]
      .sort()
      .slice(0, MAX_PREFETCHED_CARDS);
  }, [userIds]);

  const results = useQueries({
    queries: stableIds.map((userId) => buildCardQuery(userId)),
  });

  const signature = results
    .map((result) => (result.data?.ok ? "1" : "0"))
    .join("");

  return useMemo(() => {
    const byUserId: Record<string, UserProfile> = {};
    results.forEach((result, index) => {
      const user = result.data?.ok ? result.data.data?.user : null;
      if (user) {
        byUserId[stableIds[index]] = user;
      }
    });
    return byUserId;
    // `results` is a new array on every render; the signature plus the id list
    // is what actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableIds, signature]);
};
