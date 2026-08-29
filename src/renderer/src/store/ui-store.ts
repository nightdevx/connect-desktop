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
  readMinigameDifficulties,
  readMinigameScores,
  saveMinigameDifficulties,
  saveMinigameScores,
  splitScoreKey,
  tracksScore,
  type DifficultyId,
  type MinigameDifficulties,
  type MinigameId,
  type MinigameScores,
} from "./minigame-scores";
import { readSeenMinigameRules, writeSeenMinigameRules } from "./minigame-seen";
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
  | "minigames"
  | "music"
  | "chat"
  | "audit"
  | "media"
  | "access"
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
  /**
   * The two-player table being watched, or null.
   *
   * Here rather than inside the board for the same reason the selection is:
   * the "Canlı Masalar" rail is a sibling of the board, and pressing İzle on a
   * chess table from the 2048 page has to do two things at once — switch the
   * game and hand the board a table it does not own. A prop pair threaded
   * through the shell for that would be the third one on this page.
   *
   * Only ever a table this account is NOT seated at. Sitting down clears it,
   * because a seat is not a seat in the audience.
   */
  watchedTableId: string | null;
  setWatchedTable: (tableId: string | null) => void;
  seenMinigameRules: Set<MinigameId>;
  markMinigameRulesSeen: (game: MinigameId) => void;
  /**
   * Personal bests, keyed "game:difficulty" and mirrored into localStorage on
   * every write. A time on a 9x9 field is not a time on a 30x16 one, so they
   * are not the same record.
   */
  minigameBestScores: MinigameScores;
  /** Which difficulty each game is set to. Persisted, so a page reopens where
   *  it was left rather than snapping back to normal. */
  minigameDifficulty: MinigameDifficulties;
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
  setMinigameDifficulty: (game: MinigameId, difficulty: DifficultyId) => void;
  /**
   * Stores a finished run, keyed "game:difficulty", keeping it only if it beats
   * what is there, and reporting whether it did. The boolean is what lets a
   * game say "yeni rekor" on the run that earned it rather than on every run.
   *
   * Takes the composite key rather than the two parts because its other caller
   * is useScoreSync, which is merging keys the SERVER sent and has no business
   * taking them apart to put them back together.
   */
  recordMinigameScore: (key: string, score: number) => boolean;
}

export const useUiStore = create<UiState>((set, get) => ({
  activePage: "login",
  statusMessage: "Giriş gerekli",
  statusTone: "warn",
  statusNonce: 0,
  workspaceSection: "lobbies",
  freeGamesFilter: "free-now",
  freeGamesStore: "all",
  selectedMinigame: "2048",
  watchedTableId: null,
  seenMinigameRules: readSeenMinigameRules(),
  minigameBestScores: readMinigameScores(),
  minigameDifficulty: readMinigameDifficulties(),
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
  // Changing the game drops whatever was being watched: the watched table
  // belongs to ONE game, and carrying its id into another one leaves the board
  // hunting for a table that is not in its list.
  setSelectedMinigame: (game) =>
    set((state) =>
      state.selectedMinigame === game
        ? state
        : { selectedMinigame: game, watchedTableId: null },
    ),
  setWatchedTable: (tableId) => set({ watchedTableId: tableId }),
  markMinigameRulesSeen: (game) => {
    const current = get().seenMinigameRules;
    if (current.has(game)) {
      return;
    }
    const next = new Set(current);
    next.add(game);
    writeSeenMinigameRules(next);
    set({ seenMinigameRules: next });
  },
  setMinigameDifficulty: (game, difficulty) => {
    const next = { ...get().minigameDifficulty, [game]: difficulty };
    saveMinigameDifficulties(next);
    set({ minigameDifficulty: next });
  },

  // Reads through get() rather than the set() updater, because it has an answer
  // to give: a set() updater returns the next state, not a verdict.
  recordMinigameScore: (key, score) => {
    // The two-player games keep no record: a win against another person is not
    // a personal best. Checked on the BASE game, since the key carries a
    // difficulty the catalogue knows nothing about.
    const { game } = splitScoreKey(key);
    if (!Number.isFinite(score) || !tracksScore(game as MinigameId)) {
      return false;
    }

    const scores = get().minigameBestScores;
    const previous = scores[key];
    if (previous !== undefined && !isBetterScore(key, score, previous)) {
      return false;
    }

    const next = { ...scores, [key]: score };
    saveMinigameScores(next);
    set({ minigameBestScores: next });
    return true;
  },
}));
