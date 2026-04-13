import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "../shared/desktop-api-types";
import type { StreamingApi } from "../shared/streaming-contracts";

const DIRECT_MESSAGES_EVENT_CHANNEL = "desktop:direct-messages-event";
const LOBBY_STREAM_EVENT_CHANNEL = "desktop:lobbies-stream-event";
const USER_DIRECTORY_EVENT_CHANNEL = "desktop:user-directory-event";
const WINDOW_STATE_EVENT_CHANNEL = "desktop:window-state-changed";
const UPDATE_EVENT_CHANNEL = "desktop:update-event";

const STREAMING_QUALITY_CHANGED_CHANNEL = "quality-changed";
const STREAMING_QUALITY_PREPARE_CHANNEL = "quality-prepare";
const STREAMING_ERROR_CHANNEL = "streaming-error";

const STREAMING_START_CAPTURE_CHANNEL = "streaming:start-capture";
const STREAMING_STOP_CAPTURE_CHANNEL = "streaming:stop-capture";
const STREAMING_GET_NETWORK_STATUS_CHANNEL = "streaming:get-network-status";
const STREAMING_SET_MANUAL_QUALITY_CHANNEL = "streaming:set-manual-quality";
const STREAMING_REPORT_BANDWIDTH_CHANNEL = "streaming:report-bandwidth";

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

const streamingApi: StreamingApi = {
  startCapture: async (sourceId, type) =>
    ipcRenderer.invoke(STREAMING_START_CAPTURE_CHANNEL, {
      sourceId,
      type,
    }),
  stopCapture: async () => ipcRenderer.invoke(STREAMING_STOP_CAPTURE_CHANNEL),
  onQualityChange: (listener) => {
    const wrappedChangedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      listener({
        ...(payload as Parameters<typeof listener>[0]),
        stage: "commit",
      });
    };

    const wrappedPrepareListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      listener({
        ...(payload as Parameters<typeof listener>[0]),
        stage: "prepare",
      });
    };

    const wrappedErrorListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      const message =
        payload && typeof payload === "object" && "message" in payload
          ? String((payload as { message?: unknown }).message ?? "")
          : "Unknown streaming error";
      console.error("[streaming]", message, payload);
    };

    ipcRenderer.on(STREAMING_QUALITY_PREPARE_CHANNEL, wrappedPrepareListener);
    ipcRenderer.on(STREAMING_QUALITY_CHANGED_CHANNEL, wrappedChangedListener);
    ipcRenderer.on(STREAMING_ERROR_CHANNEL, wrappedErrorListener);

    return () => {
      ipcRenderer.removeListener(
        STREAMING_QUALITY_PREPARE_CHANNEL,
        wrappedPrepareListener,
      );
      ipcRenderer.removeListener(
        STREAMING_QUALITY_CHANGED_CHANNEL,
        wrappedChangedListener,
      );
      ipcRenderer.removeListener(STREAMING_ERROR_CHANNEL, wrappedErrorListener);
    };
  },
  getNetworkStatus: async () =>
    ipcRenderer.invoke(STREAMING_GET_NETWORK_STATUS_CHANNEL),
  setManualQuality: async (profile) =>
    ipcRenderer.invoke(STREAMING_SET_MANUAL_QUALITY_CHANNEL, {
      profile,
    }),
  reportBandwidthEstimate: async (payload) =>
    ipcRenderer.invoke(STREAMING_REPORT_BANDWIDTH_CHANNEL, payload),
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
contextBridge.exposeInMainWorld("streaming", streamingApi);
