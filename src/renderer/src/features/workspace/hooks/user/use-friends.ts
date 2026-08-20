import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { FriendEntry, FriendRequestLists } from "@shared/auth-contracts";
import type { ApiErrorPayload, DesktopResult } from "@shared/desktop-api-types";
import workspaceService from "../../services";

const FRIENDS_QUERY_KEY = ["friends"];
const FRIEND_REQUESTS_QUERY_KEY = ["friend-requests"];
// The directory is friends-only now, so a friendship change adds or removes a
// row there. Patched by hand below rather than left to that query's 15s
// staleTime, which only refetches on mount or focus.
const WORKSPACE_USERS_QUERY_KEY = ["workspace-users"];

type FriendsQueryData = DesktopResult<{ friendUserIds: string[] }>;
type FriendRequestsQueryData = DesktopResult<FriendRequestLists>;

// One shared empty array rather than a fresh [] per render: these feed
// useMemo/useCallback deps downstream, and a new identity on every render would
// invalidate all of them while the lists are still loading.
const EMPTY_IDS: string[] = [];
const EMPTY_ENTRIES: FriendEntry[] = [];

// All four return the SAME array when nothing changed, which is what lets every
// patch below short-circuit instead of waking react-query's subscribers.
const withId = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids : [...ids, id];

const withoutId = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((value) => value !== id) : ids;

const withEntry = (entries: FriendEntry[], entry: FriendEntry): FriendEntry[] =>
  entries.some((value) => value.userId === entry.userId)
    ? entries
    : [...entries, entry];

const withoutEntry = (entries: FriendEntry[], userId: string): FriendEntry[] =>
  entries.some((value) => value.userId === userId)
    ? entries.filter((value) => value.userId !== userId)
    : entries;

const dropFromRequests = (
  lists: FriendRequestLists,
  userId: string,
): FriendRequestLists => {
  const incoming = withoutEntry(lists.incoming, userId);
  const outgoing = withoutEntry(lists.outgoing, userId);
  if (incoming === lists.incoming && outgoing === lists.outgoing) {
    return lists;
  }

  return { incoming, outgoing };
};

const patchFriends = (
  queryClient: QueryClient,
  mutate: (ids: string[]) => string[],
): void => {
  queryClient.setQueryData<FriendsQueryData>(FRIENDS_QUERY_KEY, (previous) => {
    if (!previous?.ok || !previous.data) {
      return previous;
    }

    const nextIds = mutate(previous.data.friendUserIds);
    if (nextIds === previous.data.friendUserIds) {
      return previous;
    }

    return { ...previous, data: { ...previous.data, friendUserIds: nextIds } };
  });
};

const patchRequests = (
  queryClient: QueryClient,
  mutate: (lists: FriendRequestLists) => FriendRequestLists,
): void => {
  queryClient.setQueryData<FriendRequestsQueryData>(
    FRIEND_REQUESTS_QUERY_KEY,
    (previous) => {
      if (!previous?.ok || !previous.data) {
        return previous;
      }

      const nextLists = mutate(previous.data);
      if (nextLists === previous.data) {
        return previous;
      }

      return { ...previous, data: nextLists };
    },
  );
};

// The server answers in codes; the user reads Turkish. Anything unmapped falls
// back rather than leaking a raw code (or an English server message).
const SEND_REQUEST_ERRORS: Record<string, string> = {
  USER_NOT_FOUND: "Kullanıcı bulunamadı.",
  FRIEND_REQUESTS_DISABLED: "Bu kullanıcı arkadaşlık isteği kabul etmiyor.",
  FRIEND_REQUEST_FAILED: "Arkadaşlık isteği gönderilemedi.",
  VALIDATION_ERROR: "Geçerli bir kullanıcı adı girin.",
  USER_BANNED: "Bu hesap askıya alınmış.",
  ACCOUNT_DEACTIVATED: "Bu hesap kapatılmış.",
  DESKTOP_BRIDGE_OUTDATED:
    "Masaüstü uygulaması güncel değil. Uygulamayı kapatıp yeniden başlatın.",
};

const SEND_REQUEST_FALLBACK = "Arkadaşlık isteği gönderilemedi.";

export interface FriendsController {
  friendIds: string[];
  // Whether the lists are empty because there is nothing, or because the call
  // failed. Without this every failure — a 404 from an out-of-date server, a
  // 500, a dropped connection — rendered as "you have no friends yet", so a
  // broken backend and an empty social graph looked identical on screen and
  // the app reported nothing anywhere.
  loadError: ApiErrorPayload | null;
  // Named, not bare ids: a request comes from someone who is not a friend yet,
  // so the friends-only directory cannot name them.
  incomingRequests: FriendEntry[];
  outgoingRequests: FriendEntry[];
  isLoading: boolean;
  // Re-reads both lists. Behind the retry button on the load-error state, which
  // was otherwise a dead end: the queries are 30s-stale and the WS only
  // re-reads on a reconnect, so a failed first load stayed failed on screen.
  refresh: () => void;
  isRefreshing: boolean;
  // Per-id, not one global boolean: a requests list has a button per row.
  pendingUserIds: string[];
  sendRequest: (username: string) => Promise<{ ok: boolean; message: string }>;
  acceptRequest: (userId: string) => Promise<boolean>;
  // One call for unfriend, reject and cancel - they are the same delete.
  removeFriend: (userId: string) => Promise<boolean>;
}

// Friendship decides who may DM or call you, so the lists have to be live: an
// incoming request that only shows up after a relaunch is a request the sender
// reads as ignored. Both lists ride the users-WS that use-workspace-users
// already holds open for the whole session - this hook only subscribes, and
// never starts or stops the stream, or leaving the Users tab would tear the
// directory out from under that hook.
export const useFriends = (enabled: boolean): FriendsController => {
  const queryClient = useQueryClient();
  const [pendingUserIds, setPendingUserIds] = useState<string[]>([]);

  const friendsQuery = useQuery({
    queryKey: FRIENDS_QUERY_KEY,
    queryFn: () => workspaceService.listFriends(),
    enabled,
    staleTime: 30_000,
  });

  const requestsQuery = useQuery({
    queryKey: FRIEND_REQUESTS_QUERY_KEY,
    queryFn: () => workspaceService.listFriendRequests(),
    enabled,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const unsubscribe = workspaceService.onUserDirectoryEvent((event) => {
      if (event.type === "stream-status" && event.status === "connected") {
        // Every request sent, accepted or withdrawn while the socket was down
        // was missed - the stream carries no backlog. Re-read both lists on
        // (re)connect so they are correct rather than "correct from here on".
        void queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_KEY });
        void queryClient.invalidateQueries({
          queryKey: FRIEND_REQUESTS_QUERY_KEY,
        });
        return;
      }

      if (event.type === "friend-request") {
        // The event carries the name; keep it. Nothing else can supply one for
        // a request that arrived while the app was open.
        const friend = event.friend;
        patchRequests(queryClient, (lists) => {
          // Guard against our own request echoing back: an id in both lists
          // would render an Accept button for a request we sent ourselves.
          if (lists.outgoing.some((entry) => entry.userId === friend.userId)) {
            return lists;
          }

          const incoming = withEntry(lists.incoming, friend);
          return incoming === lists.incoming ? lists : { ...lists, incoming };
        });
        return;
      }

      // Both sides see this one - the acceptor's own click already patched, so
      // the merge has to be idempotent.
      if (event.type === "friend-accepted") {
        const { userId } = event.friend;
        patchFriends(queryClient, (ids) => withId(ids, userId));
        patchRequests(queryClient, (lists) => dropFromRequests(lists, userId));
        // A new friend has no directory row yet - no avatar, no presence, no
        // row at all - until some unrelated refetch happens to run.
        void queryClient.invalidateQueries({
          queryKey: WORKSPACE_USERS_QUERY_KEY,
        });
        return;
      }

      // Unfriend, reject and cancel all arrive as friend-removed, so clear the
      // id wherever it sits.
      if (event.type === "friend-removed") {
        const { userId } = event.friend;
        patchFriends(queryClient, (ids) => withoutId(ids, userId));
        patchRequests(queryClient, (lists) => dropFromRequests(lists, userId));
        // Mirror of the accept case: they are out of the directory now.
        void queryClient.invalidateQueries({
          queryKey: WORKSPACE_USERS_QUERY_KEY,
        });
      }
    });

    return unsubscribe;
  }, [enabled, queryClient]);

  const friendIds =
    friendsQuery.data?.ok && friendsQuery.data.data
      ? friendsQuery.data.data.friendUserIds
      : EMPTY_IDS;

  const requestLists =
    requestsQuery.data?.ok && requestsQuery.data.data
      ? requestsQuery.data.data
      : null;

  // Either list failing is worth showing: they render side by side, and a
  // half-loaded friends section is still a broken one.
  const loadError =
    (friendsQuery.data && !friendsQuery.data.ok
      ? (friendsQuery.data.error ?? null)
      : null) ??
    (requestsQuery.data && !requestsQuery.data.ok
      ? (requestsQuery.data.error ?? null)
      : null);

  const refresh = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: FRIEND_REQUESTS_QUERY_KEY });
  }, [queryClient]);

  // No pending marker here: sendRequest is keyed by username and there is no
  // user id to hang one on until the server answers. Its caller owns that
  // button's busy state.
  const sendRequest = useCallback(
    async (username: string): Promise<{ ok: boolean; message: string }> => {
      const trimmed = username.trim();
      if (!trimmed) {
        return { ok: false, message: "Kullanıcı adı girin." };
      }

      const result = await workspaceService.sendFriendRequest({
        username: trimmed,
      });

      if (!result.ok) {
        return {
          ok: false,
          message:
            SEND_REQUEST_ERRORS[result.error?.code ?? ""] ??
            SEND_REQUEST_FALLBACK,
        };
      }

      // The response carries no user id, so there is nothing to patch by hand.
      void queryClient.invalidateQueries({
        queryKey: FRIEND_REQUESTS_QUERY_KEY,
      });

      // Mutual pending: they had already asked us, so the request collapsed
      // into the single edge that was already there.
      if (result.data?.accepted) {
        void queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_KEY });
        void queryClient.invalidateQueries({
          queryKey: WORKSPACE_USERS_QUERY_KEY,
        });
        return { ok: true, message: "Artık arkadaşsınız." };
      }

      return { ok: true, message: "Arkadaşlık isteği gönderildi." };
    },
    [queryClient],
  );

  const acceptRequest = useCallback(
    async (userId: string): Promise<boolean> => {
      setPendingUserIds((previous) => withId(previous, userId));
      try {
        const result = await workspaceService.acceptFriendRequest({ userId });
        if (!result.ok) {
          // Most likely a stale row - already accepted, or withdrawn while it
          // sat on screen. Re-read instead of leaving a button that 404s.
          void queryClient.invalidateQueries({
            queryKey: FRIEND_REQUESTS_QUERY_KEY,
          });
          return false;
        }

        patchFriends(queryClient, (ids) => withId(ids, userId));
        patchRequests(queryClient, (lists) => dropFromRequests(lists, userId));
        // Not left to the echoing WS event: with the socket down this is the
        // only thing that puts the new friend in the directory.
        void queryClient.invalidateQueries({
          queryKey: WORKSPACE_USERS_QUERY_KEY,
        });
        return true;
      } finally {
        setPendingUserIds((previous) => withoutId(previous, userId));
      }
    },
    [queryClient],
  );

  const removeFriend = useCallback(
    async (userId: string): Promise<boolean> => {
      setPendingUserIds((previous) => withId(previous, userId));
      try {
        const result = await workspaceService.removeFriend({ userId });
        if (!result.ok) {
          void queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_KEY });
          void queryClient.invalidateQueries({
            queryKey: FRIEND_REQUESTS_QUERY_KEY,
          });
          return false;
        }

        patchFriends(queryClient, (ids) => withoutId(ids, userId));
        patchRequests(queryClient, (lists) => dropFromRequests(lists, userId));
        void queryClient.invalidateQueries({
          queryKey: WORKSPACE_USERS_QUERY_KEY,
        });
        return true;
      } finally {
        setPendingUserIds((previous) => withoutId(previous, userId));
      }
    },
    [queryClient],
  );

  return {
    friendIds,
    loadError,
    incomingRequests: requestLists?.incoming ?? EMPTY_ENTRIES,
    outgoingRequests: requestLists?.outgoing ?? EMPTY_ENTRIES,
    // A disabled react-query sits in `pending` forever, which would pin this
    // true for anyone who never opens the section.
    isLoading: enabled && (friendsQuery.isPending || requestsQuery.isPending),
    refresh,
    // isFetching, not isPending: a failed load still holds data (an ok:false
    // envelope), so the retry would otherwise spin nothing.
    isRefreshing: friendsQuery.isFetching || requestsQuery.isFetching,
    pendingUserIds,
    sendRequest,
    acceptRequest,
    removeFriend,
  };
};
