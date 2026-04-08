import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "../shared/desktop-api-types";
import { UPDATE_EVENT_CHANNEL } from "../shared/update-contracts";

const DIRECT_MESSAGES_EVENT_CHANNEL = "desktop:direct-messages-event";
const LOBBY_STREAM_EVENT_CHANNEL = "desktop:lobbies-stream-event";
const USER_DIRECTORY_EVENT_CHANNEL = "desktop:user-directory-event";
const WINDOW_STATE_EVENT_CHANNEL = "desktop:window-state-changed";

const desktopApi: DesktopApi = {
  getAppVersion: async () => ipcRenderer.invoke("desktop:get-version"),
  checkForAppUpdates: async () => ipcRenderer.invoke("desktop:update-check"),
  installDownloadedUpdate: async () =>
    ipcRenderer.invoke("desktop:update-install"),
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
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
