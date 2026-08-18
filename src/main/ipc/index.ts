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
  "desktop:gif-enabled",
  "desktop:gif-search",
  "desktop:notify",
  "desktop:app-relaunch",
  "desktop:update-check",
  "desktop:update-install",
  "desktop:update-state",
  "desktop:update-debug",
  "desktop:screen-capture-sources",
  "desktop:window-minimize",
  "desktop:window-toggle-maximize",
  "desktop:window-close",
  "desktop:window-attention",
  "desktop:window-state",
  "desktop:auth-register",
  "desktop:auth-change-password",
  "desktop:auth-login",
  "desktop:auth-forgot-password",
  "desktop:auth-reset-password",
  "desktop:auth-send-verification-otp",
  "desktop:auth-verify-email",
  "desktop:auth-logout",
  "desktop:auth-delete-account",
  "desktop:auth-export-data",
  "desktop:auth-session",
  "desktop:auth-profile",
  "desktop:auth-profile-update",
  "desktop:auth-users",
  "desktop:auth-user-lookup",
  "desktop:auth-user-card",
  "desktop:auth-presence",
  "desktop:auth-blocks",
  "desktop:auth-block",
  "desktop:auth-unblock",
  "desktop:auth-friends",
  "desktop:auth-friend-requests",
  "desktop:auth-friend-request-send",
  "desktop:auth-friend-accept",
  "desktop:auth-friend-remove",
  "desktop:auth-privacy",
  "desktop:auth-privacy-update",
  "desktop:user-directory-stream-start",
  "desktop:user-directory-stream-stop",
  "desktop:admin-list-users",
  "desktop:admin-get-user",
  "desktop:admin-update-user",
  "desktop:admin-reset-password",
  "desktop:admin-delete-user",
  "desktop:admin-ban-user",
  "desktop:admin-list-voice-mutes",
  "desktop:admin-set-voice-mute",
  "desktop:admin-list-timeouts",
  "desktop:admin-clear-timeout",
  "desktop:admin-get-settings",
  "desktop:admin-update-settings",
  "desktop:admin-clear-profile-media",
  "desktop:admin-set-email-verified",
  "desktop:admin-cancel-deletion",
  "desktop:admin-unban-user",
  "desktop:admin-list-lobbies",
  "desktop:admin-list-lobby-events",
  "desktop:admin-get-stats",
  "desktop:admin-force-logout",
  "desktop:admin-list-emotes",
  "desktop:admin-delete-emote",
  "desktop:admin-set-emote-quota",
  "desktop:admin-kick-user",
  "desktop:chat-message-edit",
  "desktop:chat-message-reaction",
  "desktop:chat-direct-search",
  "desktop:chat-attachment-get",
  "desktop:chat-attachment-save",
  "desktop:chat-image-save",
  "desktop:chat-conversations",
  "desktop:direct-messages-list",
  "desktop:direct-messages-send",
  "desktop:direct-read",
  "desktop:direct-unread",
  "desktop:direct-typing",
  "desktop:direct-messages-start",
  "desktop:direct-messages-stop",
  "desktop:lobbies-list",
  "desktop:lobbies-states",
  "desktop:lobbies-create",
  "desktop:lobbies-update",
  "desktop:lobbies-delete",
  "desktop:lobbies-join",
  "desktop:lobbies-kick",
  "desktop:lobbies-move-member",
  "desktop:lobbies-timeout-member",
  "desktop:lobbies-clear-timeout",
  "desktop:lobbies-list-timeouts",
  "desktop:lobbies-mute-member",
  "desktop:lobbies-leave",
  "desktop:lobbies-mute",
  "desktop:lobbies-deafen",
  "desktop:lobbies-camera",
  "desktop:lobbies-screen",
  "desktop:emotes-list",
  "desktop:emotes-sample",
  "desktop:emotes-upload",
  "desktop:emotes-delete",
  "desktop:lobbies-emote",
  "desktop:lobbies-stream-start",
  "desktop:lobbies-stream-stop",
  "desktop:livekit-token",
  "desktop:lobbies-state",
  "desktop:lobby-messages-list",
  "desktop:lobby-messages-send",
  "desktop:lobby-messages-search",
  "desktop:lobby-messages-delete",
  "desktop:call-initiate",
  "desktop:call-accept",
  "desktop:call-reject",
  "desktop:call-cancel",
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
