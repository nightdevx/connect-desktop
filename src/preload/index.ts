import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "../shared/desktop-api-types";
import type { StreamingApi } from "../shared/streaming-contracts";

const DIRECT_MESSAGES_EVENT_CHANNEL = "desktop:direct-messages-event";
const LOBBY_STREAM_EVENT_CHANNEL = "desktop:lobbies-stream-event";
const USER_DIRECTORY_EVENT_CHANNEL = "desktop:user-directory-event";
const WINDOW_STATE_EVENT_CHANNEL = "desktop:window-state-changed";
const UPDATE_EVENT_CHANNEL = "desktop:update-event";



const STREAMING_START_CAPTURE_CHANNEL = "streaming:start-capture";
const STREAMING_STOP_CAPTURE_CHANNEL = "streaming:stop-capture";


const desktopApi: DesktopApi = {
  getAppVersion: async () => ipcRenderer.invoke("desktop:get-version"),
  getAppPreferences: async () =>
    ipcRenderer.invoke("desktop:app-preferences-get"),
  setAppPreferences: async (payload) =>
    ipcRenderer.invoke("desktop:app-preferences-set", payload),
  checkForAppUpdates: async () => ipcRenderer.invoke("desktop:update-check"),
  installDownloadedUpdate: async () =>
    ipcRenderer.invoke("desktop:update-install"),
  launchMockUpdateDebug: async () => ipcRenderer.invoke("desktop:update-debug"),
  getUpdateState: async () => ipcRenderer.invoke("desktop:update-state"),
  onUpdateEvent: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      listener(payload as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(UPDATE_EVENT_CHANNEL, wrappedListener);

    return () => {
      ipcRenderer.removeListener(UPDATE_EVENT_CHANNEL, wrappedListener);
    };
  },
  ping: async () => ipcRenderer.invoke("app:ping"),
  register: async (payload) =>
    ipcRenderer.invoke("desktop:auth-register", payload),
  changePassword: async (payload) =>
    ipcRenderer.invoke("desktop:auth-change-password", payload),
  login: async (payload) => ipcRenderer.invoke("desktop:auth-login", payload),
  forgotPassword: async (payload) =>
    ipcRenderer.invoke("desktop:auth-forgot-password", payload),
  resetPassword: async (payload) =>
    ipcRenderer.invoke("desktop:auth-reset-password", payload),
  sendVerificationOTP: async (payload) =>
    ipcRenderer.invoke("desktop:auth-send-verification-otp", payload),
  verifyEmail: async (payload) =>
    ipcRenderer.invoke("desktop:auth-verify-email", payload),
  logout: async () => ipcRenderer.invoke("desktop:auth-logout"),
  getSession: async () => ipcRenderer.invoke("desktop:auth-session"),
  getAuthProfile: async () => ipcRenderer.invoke("desktop:auth-profile"),
  updateAuthProfile: async (payload) =>
    ipcRenderer.invoke("desktop:auth-profile-update", payload),
  getRegisteredUsers: async () => ipcRenderer.invoke("desktop:auth-users"),
  startUserDirectoryStream: async () =>
    ipcRenderer.invoke("desktop:user-directory-stream-start"),
  stopUserDirectoryStream: async () =>
    ipcRenderer.invoke("desktop:user-directory-stream-stop"),
  onUserDirectoryEvent: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      listener(payload as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(USER_DIRECTORY_EVENT_CHANNEL, wrappedListener);

    return () => {
      ipcRenderer.removeListener(USER_DIRECTORY_EVENT_CHANNEL, wrappedListener);
    };
  },
  listLobbies: async () => ipcRenderer.invoke("desktop:lobbies-list"),
  startLobbyStream: async () =>
    ipcRenderer.invoke("desktop:lobbies-stream-start"),
  stopLobbyStream: async () =>
    ipcRenderer.invoke("desktop:lobbies-stream-stop"),
  onLobbyStreamEvent: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      listener(payload as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(LOBBY_STREAM_EVENT_CHANNEL, wrappedListener);

    return () => {
      ipcRenderer.removeListener(LOBBY_STREAM_EVENT_CHANNEL, wrappedListener);
    };
  },
  getLobbyStates: async () => ipcRenderer.invoke("desktop:lobbies-states"),
  createLobby: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-create", payload),
  updateLobby: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-update", payload),
  deleteLobby: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-delete", payload),
  joinLobby: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-join", payload),
  leaveLobby: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-leave", payload),
  setLobbyMuted: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-mute", payload),
  setLobbyDeafened: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-deafen", payload),
  setLobbyCameraEnabled: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-camera", payload),
  setLobbyScreenSharing: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-screen", payload),
  createLiveKitToken: async (payload) =>
    ipcRenderer.invoke("desktop:livekit-token", payload),
  initiateCall: async (payload) =>
    ipcRenderer.invoke("desktop:call-initiate", payload),
  acceptCall: async (payload) =>
    ipcRenderer.invoke("desktop:call-accept", payload),
  rejectCall: async (payload) =>
    ipcRenderer.invoke("desktop:call-reject", payload),
  cancelCall: async (payload) =>
    ipcRenderer.invoke("desktop:call-cancel", payload),
  listScreenCaptureSources: async () =>
    ipcRenderer.invoke("desktop:screen-capture-sources"),
  getLobbyState: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-state", payload),
  listLobbyMessages: async (payload) =>
    ipcRenderer.invoke("desktop:lobby-messages-list", payload),
  sendLobbyMessage: async (payload) =>
    ipcRenderer.invoke("desktop:lobby-messages-send", payload),
  deleteLobbyMessage: async (payload) =>
    ipcRenderer.invoke("desktop:lobby-messages-delete", payload),
  listDirectMessages: async (payload) =>
    ipcRenderer.invoke("desktop:direct-messages-list", payload),
  sendDirectMessage: async (payload) =>
    ipcRenderer.invoke("desktop:direct-messages-send", payload),
  startDirectMessagesStream: async (payload) =>
    ipcRenderer.invoke("desktop:direct-messages-start", payload),
  stopDirectMessagesStream: async (payload) =>
    ipcRenderer.invoke("desktop:direct-messages-stop", payload),
  onDirectMessagesEvent: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      listener(payload as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(DIRECT_MESSAGES_EVENT_CHANNEL, wrappedListener);

    return () => {
      ipcRenderer.removeListener(
        DIRECT_MESSAGES_EVENT_CHANNEL,
        wrappedListener,
      );
    };
  },
  minimizeWindow: async () => ipcRenderer.invoke("desktop:window-minimize"),
  toggleMaximizeWindow: async () =>
    ipcRenderer.invoke("desktop:window-toggle-maximize"),
  closeWindow: async () => ipcRenderer.invoke("desktop:window-close"),
  setWindowAttention: async (payload) =>
    ipcRenderer.invoke("desktop:window-attention", payload),
  getWindowState: async () => ipcRenderer.invoke("desktop:window-state"),
  onWindowStateChanged: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      listener(payload as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(WINDOW_STATE_EVENT_CHANNEL, wrappedListener);

    return () => {
      ipcRenderer.removeListener(WINDOW_STATE_EVENT_CHANNEL, wrappedListener);
    };
  },
  adminListUsers: async (params) => ipcRenderer.invoke("desktop:admin-list-users", params),
  adminGetUser: async (userId) => ipcRenderer.invoke("desktop:admin-get-user", userId),
  adminUpdateUser: async (userId, payload) => ipcRenderer.invoke("desktop:admin-update-user", { userId, payload }),
  adminResetPassword: async (userId, newPassword) => ipcRenderer.invoke("desktop:admin-reset-password", { userId, newPassword }),
  adminDeleteUser: async (userId) => ipcRenderer.invoke("desktop:admin-delete-user", userId),
  adminBanUser: async (userId) => ipcRenderer.invoke("desktop:admin-ban-user", userId),
  adminUnbanUser: async (userId) => ipcRenderer.invoke("desktop:admin-unban-user", userId),
  adminListLobbies: async (params) => ipcRenderer.invoke("desktop:admin-list-lobbies", params),
  adminListLobbyEvents: async (payload) => ipcRenderer.invoke("desktop:admin-list-lobby-events", payload),
  adminGetStats: async () => ipcRenderer.invoke("desktop:admin-get-stats"),
  adminKickUser: async (lobbyId, userId) => ipcRenderer.invoke("desktop:admin-kick-user", { lobbyId, userId }),
};

const streamingApi: StreamingApi = {
  startCapture: async (sourceId, type) =>
    ipcRenderer.invoke(STREAMING_START_CAPTURE_CHANNEL, {
      sourceId,
      type,
    }),
  stopCapture: async () => ipcRenderer.invoke(STREAMING_STOP_CAPTURE_CHANNEL),
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
contextBridge.exposeInMainWorld("streaming", streamingApi);
