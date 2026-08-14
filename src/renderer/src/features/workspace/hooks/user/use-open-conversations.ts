import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import workspaceService from "../../services";

export interface OpenConversation {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface OpenConversationsController {
  conversations: OpenConversation[];
  open: (peer: OpenConversation) => void;
  close: (userId: string) => void;
  isOpen: (userId: string) => boolean;
}

interface StoredState {
  // Most recently opened first.
  conversations: OpenConversation[];
  // Sticky: a peer closed here stays closed across restarts, so the seed below
  // cannot resurrect them. Only open() clears an id from this list.
  closedUserIds: string[];
}

interface OwnedState extends StoredState {
  // Which account the lists belong to, so a sign-out mid-session cannot write
  // one user's conversations into another's key.
  ownerUserId: string;
}

const EMPTY_STATE: OwnedState = {
  ownerUserId: "",
  conversations: [],
  closedUserIds: [],
};

// Keyed by the current user id. The two older keys in this app
// ("connect_muted_call_users", "ct.settings.*") are global and leak between
// accounts on a shared machine.
const storageKey = (currentUserId: string): string =>
  `connect.open-conversations.${currentUserId}`;

const readStoredState = (currentUserId: string): StoredState => {
  try {
    const raw = localStorage.getItem(storageKey(currentUserId));
    if (!raw) {
      return { conversations: [], closedUserIds: [] };
    }

    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      conversations: Array.isArray(parsed.conversations)
        ? parsed.conversations.filter(
            (entry) => typeof entry?.userId === "string",
          )
        : [],
      closedUserIds: Array.isArray(parsed.closedUserIds)
        ? parsed.closedUserIds.filter((id) => typeof id === "string")
        : [],
    };
  } catch {
    return { conversations: [], closedUserIds: [] };
  }
};

const writeStoredState = (currentUserId: string, state: StoredState): void => {
  try {
    localStorage.setItem(
      storageKey(currentUserId),
      JSON.stringify({
        conversations: state.conversations,
        closedUserIds: state.closedUserIds,
      }),
    );
  } catch {
    // Quota, or a profile with storage locked down. An unpersisted list still
    // works for the session; it just starts from the seed next launch.
  }
};

// Peers with history that are neither already listed nor deliberately closed.
// They land at the bottom: anything the user opened by hand is more recent.
const seedConversations = (
  state: OwnedState,
  peers: OpenConversation[],
): OwnedState => {
  const known = new Set(state.conversations.map((entry) => entry.userId));
  const closed = new Set(state.closedUserIds);

  const additions = peers.filter(
    (peer) => !known.has(peer.userId) && !closed.has(peer.userId),
  );

  if (additions.length === 0) {
    return state;
  }

  return {
    ...state,
    conversations: [...state.conversations, ...additions],
  };
};

// The sidebar lists conversations, not people: it is client-owned, seeded from
// the peers this user has history with, and a right-click closes a row for
// good. A closed peer only comes back when something calls open() again — an
// unread message, an incoming call, a fresh selection — which is what makes
// closing behave like Discord rather than like a mute.
export const useOpenConversations = (
  currentUserId: string,
): OpenConversationsController => {
  const [state, setState] = useState<OwnedState>(EMPTY_STATE);

  // Shares the cache entry use-workspace-users already holds: same key, same
  // staleTime, so this is a subscription rather than a second fetch.
  const directoryQuery = useQuery({
    queryKey: ["workspace-users"],
    queryFn: () => workspaceService.getRegisteredUsers(),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!currentUserId) {
      setState(EMPTY_STATE);
      return;
    }

    setState({ ownerUserId: currentUserId, ...readStoredState(currentUserId) });

    let active = true;
    void workspaceService.listConversations().then((result) => {
      if (!active || !result.ok || !result.data) {
        return;
      }

      // The response names its peers; the id-only branch is a backend older
      // than that contract, where a non-friend row stays nameless until its
      // message history loads — the same place it used to be.
      const peers =
        result.data.conversations ??
        result.data.peerUserIds.map((userId) => ({
          userId,
          username: "",
          displayName: "",
        }));

      setState((previous) =>
        previous.ownerUserId === currentUserId
          ? seedConversations(previous, peers)
          : previous,
      );
    });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || state.ownerUserId !== currentUserId) {
      return;
    }

    writeStoredState(currentUserId, state);
  }, [currentUserId, state]);

  const open = useCallback(
    (peer: OpenConversation): void => {
      setState((previous) => {
        const base =
          previous.ownerUserId === currentUserId
            ? previous
            : { ownerUserId: currentUserId, conversations: [], closedUserIds: [] };

        // Idempotent, but still moves the peer to the front and un-closes them:
        // an unread message from someone the user closed reopens the row.
        return {
          ownerUserId: currentUserId,
          conversations: [
            peer,
            ...base.conversations.filter(
              (entry) => entry.userId !== peer.userId,
            ),
          ],
          closedUserIds: base.closedUserIds.filter(
            (userId) => userId !== peer.userId,
          ),
        };
      });
    },
    [currentUserId],
  );

  const close = useCallback(
    (userId: string): void => {
      setState((previous) => {
        if (previous.ownerUserId !== currentUserId) {
          return previous;
        }

        return {
          ownerUserId: currentUserId,
          conversations: previous.conversations.filter(
            (entry) => entry.userId !== userId,
          ),
          closedUserIds: previous.closedUserIds.includes(userId)
            ? previous.closedUserIds
            : [...previous.closedUserIds, userId],
        };
      });
    },
    [currentUserId],
  );

  // The snapshot keeps the row self-sufficient for non-friends; for anyone the
  // directory does know, its copy wins so a rename or a new avatar shows up
  // without waiting for the next open().
  const conversations = useMemo(() => {
    const directory = new Map(
      (directoryQuery.data?.ok ? (directoryQuery.data.data?.users ?? []) : []).map(
        (user) => [user.userId, user] as const,
      ),
    );

    return state.conversations.map((entry) => {
      const user = directory.get(entry.userId);
      if (!user) {
        return entry;
      }

      return {
        userId: entry.userId,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl ?? null,
      };
    });
  }, [directoryQuery.data, state.conversations]);

  const isOpen = useCallback(
    (userId: string): boolean =>
      conversations.some((entry) => entry.userId === userId),
    [conversations],
  );

  return { conversations, open, close, isOpen };
};
