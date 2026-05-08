import { ipcMain } from "electron";
import { registerAuthHandlers } from "./handlers/auth-handlers";
import { registerLobbyHandlers } from "./handlers/lobby-handlers";
import { registerDMHandlers } from "./handlers/dm-handlers";
import { registerAppHandlers } from "./handlers/app-handlers";
import {
  directMessagesStreamManager,
  lobbyStreamManager,
  userDirectoryStreamManager,
  getSessionStore,
  withAccessToken,
  backendClient,
} from "./context";

const IPC_INVOKE_CHANNELS = [
  "app:ping",
  "app:get-version",
  "desktop:get-version",
  "desktop:app-preferences-get",
  "desktop:app-preferences-set",
  "desktop:update-check",
  "desktop:update-install",
  "desktop:update-state",
  "desktop:update-debug",
  "desktop:auth-register",
  "desktop:auth-change-password",
  "desktop:auth-login",
  "desktop:auth-logout",
  "desktop:auth-session",
  "desktop:auth-profile",
  "desktop:auth-profile-update",
  "desktop:auth-users",
  "desktop:user-directory-stream-start",
  "desktop:user-directory-stream-stop",
  "desktop:lobbies-list",
  "desktop:lobbies-states",
  "desktop:lobbies-create",
  "desktop:lobbies-update",
  "desktop:lobbies-delete",
  "desktop:lobbies-join",
  "desktop:lobbies-leave",
  "desktop:lobbies-mute",
  "desktop:lobbies-deafen",
  "desktop:lobbies-camera",
  "desktop:lobbies-screen",
  "desktop:lobbies-stream-start",
  "desktop:lobbies-stream-stop",
  "desktop:livekit-token",
  "desktop:screen-capture-sources",
  "desktop:lobbies-state",
  "desktop:lobby-messages-list",
  "desktop:lobby-messages-send",
  "desktop:lobby-messages-delete",
  "desktop:direct-messages-list",
  "desktop:direct-messages-send",
  "desktop:direct-messages-start",
  "desktop:direct-messages-stop",
  "desktop:window-minimize",
  "desktop:window-toggle-maximize",
  "desktop:window-close",
  "desktop:window-attention",
  "desktop:window-state",
] as const;

const clearIpcInvokeHandlers = (): void => {
  for (const channel of IPC_INVOKE_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
};

export async function cleanupBeforeAppQuit(): Promise<void> {
  directMessagesStreamManager.stopAll();
  lobbyStreamManager.stopAll();
  userDirectoryStreamManager.stopAll();

  const current = getSessionStore().get();
  if (!current) {
    return;
  }

  try {
    await withAccessToken((accessToken) => {
      return backendClient.lobby.leaveLobby(accessToken);
    });
  } catch {
    // Best-effort cleanup; app shutdown should continue even if backend is unreachable.
  }
}

export function registerIpcHandlers(): void {
  // Electron dev reload can invoke this multiple times in the same process.
  // Remove previous handlers to keep registration idempotent.
  clearIpcInvokeHandlers();

  registerAppHandlers();
  registerAuthHandlers();
  registerLobbyHandlers();
  registerDMHandlers();
}
