import { useCallback, useEffect, useState } from "react";
import type { FriendEntry } from "@shared/auth-contracts";
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

// The block list is the only member-level tool for "stop contacting me".
// Before this, the sole remedy was asking an admin to ban the whole account.
//
// The server enforces it in both directions on every messaging path; this hook
// only mirrors the list so the UI can label the button correctly and hide
// blocked people from the directory.
export const useBlockedUsers = (enabled: boolean): BlockedUsersController => {
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<FriendEntry[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const result = await workspaceService.listBlockedUsers();
    if (!result.ok || !result.data) {
      return;
    }

    setBlockedUserIds(result.data.blockedUserIds);
    setBlockedUsers(result.data.blockedUsers ?? []);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void refresh();
  }, [enabled, refresh]);

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
        setBlockedUserIds((previous) =>
          previous.includes(userId) ? previous : [...previous, userId],
        );
        // The id patch flips the button straight away; the name for the
        // Gizlilik row only exists server-side, so re-read for it.
        void refresh();
        return true;
      } finally {
        setIsUpdating(false);
      }
    },
    [refresh],
  );

  const unblockUser = useCallback(async (userId: string): Promise<boolean> => {
    setIsUpdating(true);
    try {
      const result = await workspaceService.unblockUser({ userId });
      if (!result.ok) {
        return false;
      }
      setBlockedUserIds((previous) => previous.filter((id) => id !== userId));
      setBlockedUsers((previous) =>
        previous.filter((user) => user.userId !== userId),
      );
      return true;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  return {
    blockedUserIds,
    blockedUsers,
    isBlocked,
    blockUser,
    unblockUser,
    isUpdating,
  };
};
