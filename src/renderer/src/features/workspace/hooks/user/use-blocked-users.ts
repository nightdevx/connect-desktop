import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FriendEntry } from "@shared/auth-contracts";
import type { DesktopResult } from "@shared/desktop-api-types";
import workspaceService from "../../services";

export interface BlockedUsersController {
  blockedUserIds: string[];
  // Named rows for the Gizlilik tab. A blocked non-friend is absent from the
  // friends-only directory, so without these a block could never be undone.
  blockedUsers: FriendEntry[];
  isBlocked: (userId: string) => boolean;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;
  isUpdating: boolean;
}

type BlockedUsersResult = DesktopResult<{
  blockedUserIds: string[];
  blockedUsers?: FriendEntry[];
}>;

export const BLOCKED_USERS_QUERY_KEY = ["blocked-users"] as const;

// Stable identities for "nothing loaded yet": a fresh [] per render would make
// every memo and every isBlocked callback downstream churn on each render.
const EMPTY_IDS: string[] = [];
const EMPTY_USERS: FriendEntry[] = [];

// The block list is the only member-level tool for "stop contacting me".
// Before this, the sole remedy was asking an admin to ban the whole account.
//
// The server enforces it in both directions on every messaging path; this hook
// only mirrors the list so the UI can label the button correctly and hide
// blocked people from the directory.
//
// It lives in the query cache rather than in component state because two places
// mount it — the workspace shell and the Gizlilik tab — and with local state
// that meant two independent copies: two requests for one list, and a block made
// from the shell left the settings tab showing a list that no longer existed.
export const useBlockedUsers = (enabled: boolean): BlockedUsersController => {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const query = useQuery<BlockedUsersResult>({
    queryKey: BLOCKED_USERS_QUERY_KEY,
    queryFn: () => workspaceService.listBlockedUsers(),
    enabled,
    // Blocking is rare and every mutation below writes the cache itself, so the
    // only thing a refetch buys is a change made on another device.
    staleTime: 5 * 60_000,
  });

  const data = query.data?.ok ? query.data.data : null;
  const blockedUserIds = data?.blockedUserIds ?? EMPTY_IDS;
  const blockedUsers = data?.blockedUsers ?? EMPTY_USERS;

  const isBlocked = useCallback(
    (userId: string) => blockedUserIds.includes(userId),
    [blockedUserIds],
  );

  const blockUser = useCallback(
    async (userId: string): Promise<boolean> => {
      setIsUpdating(true);
      try {
        const result = await workspaceService.blockUser({ userId });
        if (!result.ok) {
          return false;
        }

        // The id lands straight away so the button flips; the display name for
        // the Gizlilik row only exists server-side, so re-read for it.
        queryClient.setQueryData<BlockedUsersResult>(
          BLOCKED_USERS_QUERY_KEY,
          (previous) => {
            if (!previous?.ok || !previous.data) {
              return previous;
            }
            if (previous.data.blockedUserIds.includes(userId)) {
              return previous;
            }

            return {
              ...previous,
              data: {
                ...previous.data,
                blockedUserIds: [...previous.data.blockedUserIds, userId],
              },
            };
          },
        );
        void queryClient.invalidateQueries({
          queryKey: BLOCKED_USERS_QUERY_KEY,
        });
        return true;
      } finally {
        setIsUpdating(false);
      }
    },
    [queryClient],
  );

  const unblockUser = useCallback(
    async (userId: string): Promise<boolean> => {
      setIsUpdating(true);
      try {
        const result = await workspaceService.unblockUser({ userId });
        if (!result.ok) {
          return false;
        }

        // No refetch here: removal needs no name, so the local edit is the whole
        // answer.
        queryClient.setQueryData<BlockedUsersResult>(
          BLOCKED_USERS_QUERY_KEY,
          (previous) => {
            if (!previous?.ok || !previous.data) {
              return previous;
            }

            return {
              ...previous,
              data: {
                ...previous.data,
                blockedUserIds: previous.data.blockedUserIds.filter(
                  (id) => id !== userId,
                ),
                blockedUsers: previous.data.blockedUsers?.filter(
                  (user) => user.userId !== userId,
                ),
              },
            };
          },
        );
        return true;
      } finally {
        setIsUpdating(false);
      }
    },
    [queryClient],
  );

  return {
    blockedUserIds,
    blockedUsers,
    isBlocked,
    blockUser,
    unblockUser,
    isUpdating,
  };
};
