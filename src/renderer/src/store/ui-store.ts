import { create } from "zustand";
import {
  applyThemeMode,
  readThemeMode,
  saveThemeMode,
  type ThemeMode,
} from "../styles/theme-mode";
import {
  readGifPlayback,
  saveGifPlayback,
  type GifPlayback,
} from "../styles/gif-playback";
import type { FreeGameFilter, FreeGameStore } from "@shared/free-games";
import {
  isBetterScore,
  readMinigameScores,
  saveMinigameScores,
  tracksScore,
  type MinigameId,
  type MinigameScores,
} from "./minigame-scores";
import {
  readViewPreferences,
  saveViewPreferences,
  type ViewPreferences,
} from "./view-preferences";
import {
  clampEmoteVolumePercent,
  readEmoteVolumePercent,
  saveEmoteVolumePercent,
} from "./emote-volume";

type AuthPage = "login" | "register";
export type StatusTone = "ok" | "warn" | "error";
export type WorkspaceSection =
  | "users"
  | "lobbies"
  | "free-games"
  | "minigames"
  | "settings"
  | "admin";
export type AdminSection =
  | "dashboard"
  | "users"
  | "lobbies"
  | "activity"
  | "sounds"
  | "moderation"
  | "settings";
export type SettingsSection =
  | "profile"
  | "security"
  | "privacy"
  | "camera"
  | "audio"
  | "stream"
  | "application";

interface UiState {
  activePage: AuthPage;
  statusMessage: string;
  statusTone: StatusTone;
  /** Bumped on every setStatus so repeating the same text still notifies. */
  statusNonce: number;
  workspaceSection: WorkspaceSection;
  settingsSection: SettingsSection;
  adminSection: AdminSection;
  /**
   * Which bucket the free-games page is showing.
   *
   * In the store rather than in a panel because the sidebar picks it and the
   * main panel renders it, and they are siblings — the alternative is another
   * pair of props threaded through the shell for a value the shell has no
   * interest in.
   */
  freeGamesFilter: FreeGameFilter;
  /** Store the free-games page is narrowed to, or "all". */
  freeGamesStore: FreeGameStore | "all";
  /**
   * Which game the Oyunlar page is showing.
   *
   * Here for the same reason as freeGamesFilter: the sidebar picks it and the
   * main panel renders it, and they are siblings -- the alternative is another
   * pair of props threaded through the shell for a value the shell has no
   * interest in.
   */
  selectedMinigame: MinigameId;
  /** Personal bests, mirrored into localStorage on every write. */
  minigameBestScores: MinigameScores;
  /** Drives the data-theme attribute on <html> and antd's algorithm. */
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /** Whether GIFs in a conversation animate always, or only under the cursor. */
  gifPlayback: GifPlayback;
  setGifPlayback: (mode: GifPlayback) => void;
  /** How loud other people's soundboard plays, 0-200%. */
  emoteVolumePercent: number;
  setEmoteVolumePercent: (percent: number) => void;
  /** Panel show/hide choices that outlive the panel that draws them. */
  viewPreferences: ViewPreferences;
  setViewPreference: <K extends keyof ViewPreferences>(
    key: K,
    value: ViewPreferences[K],
  ) => void;
  setActivePage: (page: AuthPage) => void;
  setStatus: (message: string, tone: StatusTone) => void;
  setWorkspaceSection: (section: WorkspaceSection) => void;
  setSettingsSection: (section: SettingsSection) => void;
  setAdminSection: (section: AdminSection) => void;
  setFreeGamesFilter: (filter: FreeGameFilter) => void;
  setFreeGamesStore: (store: FreeGameStore | "all") => void;
  setSelectedMinigame: (game: MinigameId) => void;
  /** Records a finished run. Keeps it only when it beats the stored one. */
  recordMinigameScore: (game: MinigameId, score: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activePage: "login",
  statusMessage: "Giriş gerekli",
  statusTone: "warn",
  statusNonce: 0,
  workspaceSection: "lobbies",
  freeGamesFilter: "free-now",
  freeGamesStore: "all",
  selectedMinigame: "2048",
  minigameBestScores: readMinigameScores(),
  settingsSection: "profile",
  adminSection: "dashboard",
  themeMode: readThemeMode(),
  setThemeMode: (mode) => {
    // The attribute is written here rather than in an effect: the stylesheet
    // has to change in the same frame as the state, or antd's freshly rebuilt
    // token set is briefly painted over the old palette's CSS.
    applyThemeMode(mode);
    saveThemeMode(mode);
    set({ themeMode: mode });
  },
  gifPlayback: readGifPlayback(),
  setGifPlayback: (mode) => {
    saveGifPlayback(mode);
    set({ gifPlayback: mode });
  },
  emoteVolumePercent: readEmoteVolumePercent(),
  setEmoteVolumePercent: (percent) => {
    const next = clampEmoteVolumePercent(percent);
    saveEmoteVolumePercent(next);
    set({ emoteVolumePercent: next });
  },
  viewPreferences: readViewPreferences(),
  setViewPreference: (key, value) =>
    set((state) => {
      if (state.viewPreferences[key] === value) {
        return state;
      }
      const next = { ...state.viewPreferences, [key]: value };
      saveViewPreferences(next);
      return { viewPreferences: next };
    }),
  setActivePage: (page) => {
    if (document.startViewTransition) {
      document.startViewTransition(() => set({ activePage: page }));
    } else {
      set({ activePage: page });
    }
  },
  setStatus: (message, tone) =>
    set((state) => ({
      statusMessage: message,
      statusTone: tone,
      statusNonce: state.statusNonce + 1,
    })),
  setWorkspaceSection: (section) => {
    if (document.startViewTransition) {
      document.startViewTransition(() => set({ workspaceSection: section }));
    } else {
      set({ workspaceSection: section });
    }
  },
  setSettingsSection: (section) => {
    if (document.startViewTransition) {
      document.startViewTransition(() => set({ settingsSection: section }));
    } else {
      set({ settingsSection: section });
    }
  },
  setAdminSection: (section) => {
    if (document.startViewTransition) {
      document.startViewTransition(() => set({ adminSection: section }));
    } else {
      set({ adminSection: section });
    }
  },
  // No view transition here, unlike the section setters above: this swaps the
  // contents of one panel, and animating a list re-filter reads as a stutter
  // rather than as a navigation.
  setFreeGamesFilter: (filter) => set({ freeGamesFilter: filter }),
  setFreeGamesStore: (store) => set({ freeGamesStore: store }),
  // Same reasoning as the free-games setters: swapping the contents of one
  // panel, not navigating, so no view transition.
  setSelectedMinigame: (game) => set({ selectedMinigame: game }),
  recordMinigameScore: (game, score) =>
    set((state) => {
      // The two-player games keep no record: a win against another person is
      // not a personal best.
      if (!Number.isFinite(score) || !tracksScore(game)) {
        return state;
      }

      const previous = state.minigameBestScores[game];
      if (previous !== undefined && !isBetterScore(game, score, previous)) {
        return state;
      }

      const next = { ...state.minigameBestScores, [game]: score };
      saveMinigameScores(next);
      return { minigameBestScores: next };
    }),
}));
