import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Guild, GuildList, GuildRole } from "@shared/guild-contracts";
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

export const ALL_GUILDS_QUERY_KEY = ["guilds-all"] as const;

/** GET /guilds?scope=all: every server, for platform staff only. */
export const useAllGuilds = (enabled = true) =>
  useQuery({
    queryKey: ALL_GUILDS_QUERY_KEY,
    queryFn: () => callGuild("allList", {}),
    enabled,
    staleTime: 30_000,
  });

/**
 * A person's role in a server, from its member list (the key the settings
 * dialog fills too). Undefined while loading, when the list is refused, or
 * when they are not a member.
 */
export const useServerRole = (guildId: string | null | undefined, userId: string): GuildRole | undefined =>
  useQuery({
    queryKey: ["guild", guildId, "members"],
    queryFn: () => callGuild("members", { guildId: guildId as string }),
    enabled: Boolean(guildId),
    staleTime: 30_000,
    retry: false,
  }).data?.members.find((member) => member.userId === userId)?.role;

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
  /** The server on screen, also one viewed without membership (null until it is known). */
  selectedGuild: Guild | null;
  /** The server being viewed without membership, when it is one. */
  viewedGuild: Guild | null;
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
  const viewingGuildId = useGuildUi((state) => state.viewingGuildId);

  useEffect(
    () =>
      window.desktopApi.onUserDirectoryEvent((event) => {
        // A dropped socket may have missed a change: catch up on reconnect.
        if (
          event.type === "guilds-changed" ||
          (event.type === "stream-status" && event.status === "connected")
        ) {
          void queryClient.invalidateQueries({ queryKey: GUILDS_QUERY_KEY });
          void queryClient.invalidateQueries({ queryKey: ALL_GUILDS_QUERY_KEY });
        }
      }),
    [queryClient],
  );

  const list = query.data ?? EMPTY;
  // A server viewed without being in it is not in the list: its name and icon
  // come from the all-servers list (staff only, the only way to view one).
  const viewedElsewhere = Boolean(viewingGuildId) && !list.guilds.some((guild) => guild.id === viewingGuildId);
  const allQuery = useAllGuilds(viewedElsewhere);
  const viewedGuild: Guild | null = viewedElsewhere
    ? (allQuery.data?.guilds.find((guild) => guild.id === viewingGuildId) ?? null)
    : null;
  const selectedGuildId = resolveSelectedGuild(list.guilds, stored, viewingGuildId);
  // The stored pick, as if nothing were being viewed.
  const ownGuildId = resolveSelectedGuild(list.guilds, stored);

  // Keep the stored pick valid, so code outside React (the minigame scores)
  // reads a server the user is in. Only once the list is known.
  useEffect(() => {
    if (query.data && ownGuildId && ownGuildId !== stored) {
      rememberGuild(ownGuildId);
      useGuildUi.setState({ selectedGuildId: ownGuildId });
    }
  }, [query.data, ownGuildId, stored]);

  return {
    list,
    isLoading: query.isLoading,
    isEmpty: Boolean(query.data) && list.guilds.length === 0,
    selectedGuildId,
    selectedGuild: list.guilds.find((guild) => guild.id === selectedGuildId) ?? viewedGuild,
    viewedGuild,
  };
}
