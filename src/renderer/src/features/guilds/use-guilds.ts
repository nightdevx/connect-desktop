import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Guild, GuildList } from "@shared/guild-contracts";
import { callGuild } from "./guild-service";
import { resolveSelectedGuild } from "./guild-logic";
import { rememberGuild, useGuildUi } from "./guild-store";

export const GUILDS_QUERY_KEY = ["guilds"] as const;

const EMPTY: GuildList = {
  guilds: [],
  deleted: [],
  requests: [],
  limits: { guildsPerUser: 0, membersPerGuild: 0, roomsPerGuild: 0 },
};

/** GET /guilds, cached; every component that needs the list reads this. */
export const useGuildList = () =>
  useQuery({
    queryKey: GUILDS_QUERY_KEY,
    queryFn: () => callGuild("list", {}),
    staleTime: 60_000,
  });

/** Refetches the list (after a change this client made, or one it heard of). */
export const useRefreshGuilds = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: GUILDS_QUERY_KEY });
};

export interface GuildsState {
  list: GuildList;
  isLoading: boolean;
  /** Loaded, and the user is in no server. */
  isEmpty: boolean;
  selectedGuildId: string | null;
  selectedGuild: Guild | null;
}

/**
 * The servers for the shell: the list, the selected one (the last pick if the
 * user is still in it, else the first), and a refetch whenever the users
 * socket says the list changed. Mounted once, by the workspace shell.
 */
export function useGuilds(): GuildsState {
  const query = useGuildList();
  const queryClient = useQueryClient();
  const stored = useGuildUi((state) => state.selectedGuildId);

  useEffect(
    () =>
      window.desktopApi.onUserDirectoryEvent((event) => {
        // A dropped socket may have missed a change: catch up on reconnect.
        if (
          event.type === "guilds-changed" ||
          (event.type === "stream-status" && event.status === "connected")
        ) {
          void queryClient.invalidateQueries({ queryKey: GUILDS_QUERY_KEY });
        }
      }),
    [queryClient],
  );

  const list = query.data ?? EMPTY;
  const selectedGuildId = resolveSelectedGuild(list.guilds, stored);

  // Keep the stored pick valid, so code outside React (the minigame scores)
  // reads a server the user is in. Only once the list is known.
  useEffect(() => {
    if (query.data && selectedGuildId && selectedGuildId !== stored) {
      rememberGuild(selectedGuildId);
      useGuildUi.setState({ selectedGuildId });
    }
  }, [query.data, selectedGuildId, stored]);

  return {
    list,
    isLoading: query.isLoading,
    isEmpty: Boolean(query.data) && list.guilds.length === 0,
    selectedGuildId,
    selectedGuild: list.guilds.find((guild) => guild.id === selectedGuildId) ?? null,
  };
}
