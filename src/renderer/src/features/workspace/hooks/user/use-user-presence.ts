import { useQuery } from "@tanstack/react-query";
import type { PresenceStatus } from "@shared/auth-contracts";
import workspaceService from "../../services";

export interface UserPresence {
  appOnline: boolean;
  presence: PresenceStatus;
}

/**
 * One person's presence, read off the directory the workspace already keeps.
 *
 * Same query key, same staleTime as useWorkspaceUsers, so this subscribes to
 * the cache that hook is already filling rather than opening a second stream of
 * requests — a card opened while the workspace is mounted costs nothing.
 *
 * Returns null for anyone the directory does not carry. That is not an edge
 * case: the directory is friends-only, and the profile card exists precisely
 * because a lobby is full of people who are not on it. A card that guessed
 * "çevrimdışı" for every stranger would be wrong about most of the room.
 */
export const useUserPresence = (
  userId: string | null | undefined,
): UserPresence | null => {
  const { data } = useQuery({
    queryKey: ["workspace-users"],
    queryFn: () => workspaceService.getRegisteredUsers(),
    staleTime: 15_000,
    // Only this person's two fields reach the component, so the card does not
    // re-render every time somebody else in the directory goes idle.
    select: (result): UserPresence | null => {
      if (!userId || !result.ok) {
        return null;
      }

      const entry = result.data?.users.find(
        (candidate) => candidate.userId === userId,
      );
      if (!entry) {
        return null;
      }

      const appOnline = entry.appOnline ?? false;
      return {
        appOnline,
        presence: entry.presence ?? (appOnline ? "online" : "offline"),
      };
    },
  });

  return data ?? null;
};
