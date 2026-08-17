import { create } from "zustand";
import {
  applyThemeMode,
  readThemeMode,
  saveThemeMode,
  type ThemeMode,
} from "../styles/theme-mode";

type AuthPage = "login" | "register";
type StatusTone = "ok" | "warn" | "error";
export type WorkspaceSection = "users" | "lobbies" | "settings" | "admin";
export type AdminSection =
  | "dashboard"
  | "users"
  | "lobbies"
  | "activity"
  | "sounds";
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
  /** Drives the data-theme attribute on <html> and antd's algorithm. */
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  setActivePage: (page: AuthPage) => void;
  setStatus: (message: string, tone: StatusTone) => void;
  setWorkspaceSection: (section: WorkspaceSection) => void;
  setSettingsSection: (section: SettingsSection) => void;
  setAdminSection: (section: AdminSection) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activePage: "login",
  statusMessage: "Giriş gerekli",
  statusTone: "warn",
  statusNonce: 0,
  workspaceSection: "lobbies",
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
}));
