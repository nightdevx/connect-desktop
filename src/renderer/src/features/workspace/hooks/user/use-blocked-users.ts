import { useCallback, useEffect, useState } from "react";
import workspaceService from "../../services";

export interface BlockedUsersController {
  blockedUserIds: string[];
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
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;
    void workspaceService.listBlockedUsers().then((result) => {
      if (active && result.ok && result.data) {
        setBlockedUserIds(result.data.blockedUserIds);
      }
    });

    return () => {
      active = false;
    };
  }, [enabled]);

  const isBlocked = useCallback(
    (userId: string) => blockedUserIds.includes(userId),
    [blockedUserIds],
  );

  const blockUser = useCallback(async (userId: string): Promise<boolean> => {
    setIsUpdating(true);
    try {
      const result = await workspaceService.blockUser({ userId });
      if (!result.ok) {
        return false;
      }
      setBlockedUserIds((previous) =>
        previous.includes(userId) ? previous : [...previous, userId],
      );
      return true;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  const unblockUser = useCallback(async (userId: string): Promise<boolean> => {
    setIsUpdating(true);
    try {
      const result = await workspaceService.unblockUser({ userId });
      if (!result.ok) {
        return false;
      }
      setBlockedUserIds((previous) => previous.filter((id) => id !== userId));
      return true;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  return { blockedUserIds, isBlocked, blockUser, unblockUser, isUpdating };
};
