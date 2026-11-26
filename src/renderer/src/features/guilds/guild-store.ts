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
  /** Keşfet is on screen in place of the rooms. */
  discovering: boolean;
  dialog: GuildDialog | null;
  selectGuild: (guildId: string | null) => void;
  openDiscover: () => void;
  closeDiscover: () => void;
  openDialog: (dialog: GuildDialog) => void;
  closeDialog: () => void;
}

export const useGuildUi = create<GuildUiState>((set) => ({
  selectedGuildId: readSelected(),
  discovering: false,
  dialog: null,
  selectGuild: (guildId) => {
    rememberGuild(guildId);
    set({ selectedGuildId: guildId, discovering: false });
  },
  openDiscover: () => set({ discovering: true }),
  closeDiscover: () => set({ discovering: false }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
}));

/** Shows a server: selects it and opens the rooms section. */
export const showGuild = (guildId: string): void => {
  useGuildUi.getState().selectGuild(guildId);
  useUiStore.getState().setWorkspaceSection("lobbies");
};
