import { create } from "zustand";

type AuthPage = "login" | "register";
type StatusTone = "ok" | "warn" | "error";
export type WorkspaceSection = "users" | "lobbies" | "settings" | "admin";
export type AdminSection = "dashboard" | "users" | "lobbies" | "activity";
export type SettingsSection =
  | "profile"
  | "security"
  | "camera"
  | "audio"
  | "stream"
  | "application";

interface UiState {
  activePage: AuthPage;
  statusMessage: string;
  statusTone: StatusTone;
  workspaceSection: WorkspaceSection;
  settingsSection: SettingsSection;
  adminSection: AdminSection;
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
  workspaceSection: "lobbies",
  settingsSection: "profile",
  adminSection: "dashboard",
  setActivePage: (page) => {
    if (document.startViewTransition) {
      document.startViewTransition(() => set({ activePage: page }));
    } else {
      set({ activePage: page });
    }
  },
  setStatus: (message, tone) =>
    set({ statusMessage: message, statusTone: tone }),
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
