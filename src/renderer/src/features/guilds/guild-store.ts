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
  | { kind: "join"; code?: string };

interface GuildUiState {
  /** The server picked in the column, remembered on this machine. */
  selectedGuildId: string | null;
  /** A server platform staff look at without being in it. Not remembered. */
  viewingGuildId: string | null;
  /** Keşfet is on screen in place of the rooms. */
  discovering: boolean;
  /** "Tüm sunucular" (platform staff) is on screen in place of the rooms. */
  browsingAll: boolean;
  /** Sunucu ayarları (this server) is on screen in place of the rooms. */
  settingsGuildId: string | null;
  dialog: GuildDialog | null;
  selectGuild: (guildId: string | null) => void;
  view: (guildId: string) => void;
  stopViewing: () => void;
  openAllGuilds: () => void;
  closeAllGuilds: () => void;
  openDiscover: () => void;
  closeDiscover: () => void;
  openSettings: (guildId: string) => void;
  closeSettings: () => void;
  openDialog: (dialog: GuildDialog) => void;
  closeDialog: () => void;
}

export const useGuildUi = create<GuildUiState>((set) => ({
  selectedGuildId: readSelected(),
  viewingGuildId: null,
  discovering: false,
  browsingAll: false,
  settingsGuildId: null,
  dialog: null,
  // Picking one of the user's own servers ends a view.
  selectGuild: (guildId) => {
    rememberGuild(guildId);
    set({ selectedGuildId: guildId, discovering: false, browsingAll: false, settingsGuildId: null, viewingGuildId: null });
  },
  view: (guildId) => {
    useUiStore.getState().setWorkspaceSection("lobbies");
    set({ viewingGuildId: guildId, discovering: false, browsingAll: false, settingsGuildId: null });
  },
  stopViewing: () => set({ viewingGuildId: null }),
  // Keşfet, Tüm sunucular and the settings are drawn where the rooms are: open that section with them.
  openAllGuilds: () => {
    useUiStore.getState().setWorkspaceSection("lobbies");
    set({ browsingAll: true, discovering: false, settingsGuildId: null });
  },
  closeAllGuilds: () => set({ browsingAll: false }),
  openDiscover: () => {
    useUiStore.getState().setWorkspaceSection("lobbies");
    set({ discovering: true, browsingAll: false, settingsGuildId: null });
  },
  closeDiscover: () => set({ discovering: false }),
  // Server settings are drawn where the rooms are, like Keşfet.
  openSettings: (guildId) => {
    useUiStore.getState().setWorkspaceSection("lobbies");
    set({ settingsGuildId: guildId, discovering: false, browsingAll: false });
  },
  closeSettings: () => set({ settingsGuildId: null }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
}));

/** Shows a server: selects it and opens the rooms section. */
export const showGuild = (guildId: string): void => {
  useGuildUi.getState().selectGuild(guildId);
  useUiStore.getState().setWorkspaceSection("lobbies");
};
