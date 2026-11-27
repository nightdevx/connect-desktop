import { create } from "zustand";
import { useUiStore } from "@/store/ui-store";

const SELECTED_KEY = "ct.guilds.selected";

const readSelected = (): string | null => {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
};

/** Writes the choice for the next launch; storage refused, it lasts the session. */
export const rememberGuild = (guildId: string | null): void => {
  try {
    if (guildId) localStorage.setItem(SELECTED_KEY, guildId);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    // Nothing to do: the in-memory choice still holds.
  }
};

/** Which dialog of the servers feature is open, if any. */
export type GuildDialog =
  | { kind: "create" }
  | { kind: "join"; code?: string }
  | { kind: "settings"; guildId: string };

interface GuildUiState {
  /** The server picked in the column, remembered on this machine. */
  selectedGuildId: string | null;
  /** A server platform staff look at without being in it. Not remembered. */
  viewingGuildId: string | null;
  /** Keşfet is on screen in place of the rooms. */
  discovering: boolean;
  /** "Tüm sunucular" (platform staff) is on screen in place of the rooms. */
  browsingAll: boolean;
  dialog: GuildDialog | null;
  selectGuild: (guildId: string | null) => void;
  view: (guildId: string) => void;
  stopViewing: () => void;
  openAllGuilds: () => void;
  closeAllGuilds: () => void;
  openDiscover: () => void;
  closeDiscover: () => void;
  openDialog: (dialog: GuildDialog) => void;
  closeDialog: () => void;
}

export const useGuildUi = create<GuildUiState>((set) => ({
  selectedGuildId: readSelected(),
  viewingGuildId: null,
  discovering: false,
  browsingAll: false,
  dialog: null,
  // Picking one of the user's own servers ends a view.
  selectGuild: (guildId) => {
    rememberGuild(guildId);
    set({ selectedGuildId: guildId, discovering: false, browsingAll: false, viewingGuildId: null });
  },
  view: (guildId) => {
    useUiStore.getState().setWorkspaceSection("lobbies");
    set({ viewingGuildId: guildId, discovering: false, browsingAll: false });
  },
  stopViewing: () => set({ viewingGuildId: null }),
  // Keşfet and Tüm sunucular are drawn where the rooms are: open that section with them.
  openAllGuilds: () => {
    useUiStore.getState().setWorkspaceSection("lobbies");
    set({ browsingAll: true, discovering: false });
  },
  closeAllGuilds: () => set({ browsingAll: false }),
  openDiscover: () => {
    useUiStore.getState().setWorkspaceSection("lobbies");
    set({ discovering: true, browsingAll: false });
  },
  closeDiscover: () => set({ discovering: false }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
}));

/** Shows a server: selects it and opens the rooms section. */
export const showGuild = (guildId: string): void => {
  useGuildUi.getState().selectGuild(guildId);
  useUiStore.getState().setWorkspaceSection("lobbies");
};
