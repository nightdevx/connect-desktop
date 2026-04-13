import { create } from "zustand";

type AuthPage = "login" | "register";
type StatusTone = "ok" | "warn" | "error";
export type WorkspaceSection = "users" | "lobbies" | "settings";
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
  setActivePage: (page: AuthPage) => void;
  setStatus: (message: string, tone: StatusTone) => void;
  setWorkspaceSection: (section: WorkspaceSection) => void;
  setSettingsSection: (section: SettingsSection) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activePage: "login",
  statusMessage: "Giriş gerekli",
  statusTone: "warn",
  workspaceSection: "lobbies",
  settingsSection: "profile",
  setActivePage: (page) => set({ activePage: page }),
  setStatus: (message, tone) =>
    set({ statusMessage: message, statusTone: tone }),
  setWorkspaceSection: (section) => set({ workspaceSection: section }),
  setSettingsSection: (section) => set({ settingsSection: section }),
}));
