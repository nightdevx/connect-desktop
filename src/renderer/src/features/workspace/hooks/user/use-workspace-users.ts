import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { UserDirectoryEntry } from "@shared/auth-contracts";
import type { DesktopResult } from "@shared/desktop-api-types";
import workspaceService from "../../services";
import type { UserFilter } from "../../workspace-utils";

const USER_DIRECTORY_RECONNECT_BASE_MS = 1_000;
const USER_DIRECTORY_RECONNECT_MAX_MS = 10_000;
const USER_DIRECTORY_RECONNECT_MAX_EXPONENT = 5;
const USER_DIRECTORY_RECONNECT_JITTER_MAX_MS = 350;

const getUserDirectoryReconnectDelayMs = (attempt: number): number => {
  const baseDelay = Math.min(
    USER_DIRECTORY_RECONNECT_MAX_MS,
    USER_DIRECTORY_RECONNECT_BASE_MS *
      2 ** Math.min(attempt, USER_DIRECTORY_RECONNECT_MAX_EXPONENT),
  );

  return (
    baseDelay +
    Math.floor(Math.random() * USER_DIRECTORY_RECONNECT_JITTER_MAX_MS)
  );
};

interface UseWorkspaceUsersParams {
  currentUsername: string;
}

export interface UseWorkspaceUsersResult {
  usersQuery: UseQueryResult<
    DesktopResult<{ users: UserDirectoryEntry[] }>,
    Error
  >;
  userSearch: string;
  setUserSearch: (value: string) => void;
  userFilter: UserFilter;
  setUserFilter: (value: UserFilter) => void;
  selectedUserId: string | null;
  setSelectedUserId: (value: string | null) => void;
  directoryUsers: UserDirectoryEntry[];
  filteredUsers: UserDirectoryEntry[];
  selectedUser: UserDirectoryEntry | null;
  onlineCount: number;
}

export const useWorkspaceUsers = ({
  currentUsername,
}: UseWorkspaceUsersParams): UseWorkspaceUsersResult => {
  const queryClient = useQueryClient();
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const streamWantedRef = useRef(false);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<UserFilter>("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const clearReconnectTimer = (): void => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const isBrowserOnline = (): boolean => {
    if (typeof navigator === "undefined") {
      return true;
    }

    return navigator.onLine;
  };

  const startUserDirectoryStream = async (): Promise<boolean> => {
    if (!streamWantedRef.current) {
      return true;
    }

    const result = await workspaceService.startUserDirectoryStream();
    if (result.ok) {
      reconnectAttemptRef.current = 0;
      return true;
    }

    void queryClient.invalidateQueries({ queryKey: ["workspace-users"] });
    return false;
  };

  const scheduleStreamReconnect = (immediate = false): void => {
    if (!streamWantedRef.current) {
      return;
    }

    if (reconnectTimerRef.current !== null) {
      return;
    }

    const delay = immediate
      ? 0
      : getUserDirectoryReconnectDelayMs(reconnectAttemptRef.current);

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;

      if (!streamWantedRef.current) {
        return;
      }

      if (!isBrowserOnline()) {
        scheduleStreamReconnect();
        return;
      }

      void startUserDirectoryStream().then((started) => {
        if (started) {
          return;
        }

        reconnectAttemptRef.current += 1;
        scheduleStreamReconnect();
      });
    }, delay);
  };

  // Always enabled, not gated on the visible tab. The directory feeds the
  // sidebar, the lobby rosters and the DM list, and gating it meant a member
  // sitting on Settings had a stale (or empty) directory the moment they came
  // back.
  const usersQuery = useQuery({
    queryKey: ["workspace-users"],
    queryFn: () => workspaceService.getRegisteredUsers(),
    staleTime: 15_000,
  });

  useEffect(() => {
    const patchDirectory = (
      userId: string,
      patch: Partial<UserDirectoryEntry>,
    ): void => {
      queryClient.setQueryData<DesktopResult<{ users: UserDirectoryEntry[] }>>(
        ["workspace-users"],
        (previous) => {
          if (!previous?.ok || !previous.data) {
            return previous;
          }

          let changed = false;
          const nextUsers = previous.data.users.map((user) => {
            if (user.userId !== userId) {
              return user;
            }
            changed = true;
            return { ...user, ...patch };
          });

          // Nothing to update means nothing to re-render: returning `previous`
          // unchanged keeps react-query from waking every subscriber.
          if (!changed) {
            return previous;
          }

          return { ...previous, data: { ...previous.data, users: nextUsers } };
        },
      );
    };

    const unsubscribe = workspaceService.onUserDirectoryEvent((event) => {
      // Presence flips carry only the flag, so merging the whole profile (and
      // nulling the avatar with it) is not an option here.
      if (event.type === "user-presence-updated") {
        patchDirectory(event.presence.userId, {
          appOnline: event.presence.appOnline,
          presence:
            event.presence.presence ??
            (event.presence.appOnline ? "online" : "offline"),
        });
        return;
      }

      // A deleted (or self-deactivated) account must disappear for everyone,
      // not linger until the next full refetch.
      if (event.type === "profile-deleted") {
        queryClient.setQueryData<DesktopResult<{ users: UserDirectoryEntry[] }>>(
          ["workspace-users"],
          (previous) => {
            if (!previous?.ok || !previous.data) {
              return previous;
            }

            const nextUsers = previous.data.users.filter(
              (user) => user.userId !== event.user.userId,
            );
            if (nextUsers.length === previous.data.users.length) {
              return previous;
            }

            return { ...previous, data: { ...previous.data, users: nextUsers } };
          },
        );
        return;
      }

      if (event.type !== "user-profile-updated") {
        if (event.type === "stream-status" && event.status === "connected") {
          reconnectAttemptRef.current = 0;
          clearReconnectTimer();
          // Every registration, rename and deletion that happened while the
          // socket was down was missed — the stream carries no backlog. Refetch
          // once on (re)connect so the list is correct rather than "correct
          // from here on".
          void queryClient.invalidateQueries({ queryKey: ["workspace-users"] });
          return;
        }

        if (event.type === "stream-status" && event.status === "closed") {
          scheduleStreamReconnect();
          return;
        }

        if (event.type === "system-error") {
          scheduleStreamReconnect();
        }

        return;
      }

      queryClient.setQueryData<DesktopResult<{ users: UserDirectoryEntry[] }>>(
        ["workspace-users"],
        (previous: DesktopResult<{ users: UserDirectoryEntry[] }> | undefined) => {
          if (!previous?.ok || !previous.data) {
            return previous;
          }

          const exists = previous.data.users.some(
            (u) => u.userId === event.user.userId,
          );
          let nextUsers: UserDirectoryEntry[];

          if (exists) {
            nextUsers = previous.data.users.map((user: UserDirectoryEntry) => {
              if (user.userId !== event.user.userId) {
                return user;
              }

              return {
                ...user,
                // username was missing here, so a handle change never showed
                // up on anyone else's screen.
                username: event.user.username || user.username,
                displayName: event.user.displayName,
                avatarUrl: event.user.avatarUrl ?? null,
                role: event.user.role ?? user.role,
                appOnline: event.user.appOnline ?? user.appOnline,
              };
            });
          } else {
            const appOnline = event.user.appOnline ?? false;
            const newUser: UserDirectoryEntry = {
              userId: event.user.userId,
              username: event.user.username || "",
              displayName: event.user.displayName,
              avatarUrl: event.user.avatarUrl ?? null,
              role: event.user.role ?? "member",
              createdAt: event.user.createdAt || new Date().toISOString(),
              appOnline,
              // Without this the entry renders with no presence at all until
              // the next presence event, which for an idle account never comes.
              presence: appOnline ? "online" : "offline",
            };
            nextUsers = [...previous.data.users, newUser];
          }

          return {
            ...previous,
            data: {
              ...previous.data,
              users: nextUsers,
            },
          };
        },
      );
    });

    return () => {
      clearReconnectTimer();

      unsubscribe();
    };
  }, [queryClient]);

  // The directory stream stays open for the whole session, like the lobby
  // stream. It used to be torn down whenever the user left the Users/Lobbies
  // tabs, which had two consequences: every profile, presence and registration
  // event that fired meanwhile was lost, and — because the server counts an
  // open socket as "online" — a member sitting on the Settings tab or in a
  // voice room was broadcast to everyone else as offline.
  useEffect(() => {
    streamWantedRef.current = true;

    let cancelled = false;

    void startUserDirectoryStream().then((started) => {
      if (cancelled || started) {
        return;
      }

      reconnectAttemptRef.current += 1;
      scheduleStreamReconnect();
    });

    const handleOnline = (): void => {
      if (!streamWantedRef.current) {
        return;
      }

      reconnectAttemptRef.current = 0;
      clearReconnectTimer();
      scheduleStreamReconnect(true);
    };

    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      clearReconnectTimer();
      reconnectAttemptRef.current = 0;
      streamWantedRef.current = false;

      void workspaceService.stopUserDirectoryStream();
    };
    // Mount/unmount only: the stream must not be torn down on a tab change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const users =
    usersQuery.data?.ok && usersQuery.data.data
      ? usersQuery.data.data.users
      : [];

  const directoryUsers = useMemo(() => {
    return users.filter((user) => user.username !== currentUsername);
  }, [currentUsername, users]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = userSearch.trim().toLocaleLowerCase("tr-TR");
    const sorted = [...directoryUsers].sort((a, b) => {
      const onlineDiff =
        Number(Boolean(b.appOnline)) - Number(Boolean(a.appOnline));
      if (onlineDiff !== 0) {
        return onlineDiff;
      }

      const left = (a.displayName || a.username).toLocaleLowerCase("tr-TR");
      const right = (b.displayName || b.username).toLocaleLowerCase("tr-TR");
      return left.localeCompare(right, "tr");
    });

    return sorted.filter((user) => {
      if (userFilter === "online" && !user.appOnline) {
        return false;
      }

      if (userFilter === "offline" && user.appOnline) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchSpace =
        `${user.displayName} ${user.username}`.toLocaleLowerCase("tr-TR");
      return searchSpace.includes(normalizedSearch);
    });
  }, [directoryUsers, userFilter, userSearch]);

  const onlineCount = useMemo(() => {
    return directoryUsers.filter((user) => user.appOnline).length;
  }, [directoryUsers]);

  // Auto-selection removed to preserve unread message badges and allow a clean empty state
  // useEffect(() => {
  //   if (filteredUsers.length === 0) {
  //     setSelectedUserId(null);
  //     return;
  //   }
  // 
  //   const hasSelectedUser = filteredUsers.some(
  //     (user) => user.userId === selectedUserId,
  //   );
  //   if (!hasSelectedUser) {
  //     setSelectedUserId(filteredUsers[0].userId);
  //   }
  // }, [filteredUsers, selectedUserId]);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) {
      return null;
    }

    return filteredUsers.find((user) => user.userId === selectedUserId) ?? null;
  }, [filteredUsers, selectedUserId]);

  return {
    usersQuery,
    userSearch,
    setUserSearch,
    userFilter,
    setUserFilter,
    selectedUserId,
    setSelectedUserId,
    directoryUsers,
    filteredUsers,
    selectedUser,
    onlineCount,
  };
};



