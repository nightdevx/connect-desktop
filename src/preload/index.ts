import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "../shared/desktop-api-types";
import type { StreamingApi } from "../shared/streaming-contracts";

const DIRECT_MESSAGES_EVENT_CHANNEL = "desktop:direct-messages-event";
const LOBBY_STREAM_EVENT_CHANNEL = "desktop:lobbies-stream-event";
const USER_DIRECTORY_EVENT_CHANNEL = "desktop:user-directory-event";
const WINDOW_STATE_EVENT_CHANNEL = "desktop:window-state-changed";
const SYSTEM_RESUMED_EVENT_CHANNEL = "desktop:system-resumed";
const UPDATE_EVENT_CHANNEL = "desktop:update-event";
const SESSION_EXPIRED_CHANNEL = "desktop:session-expired";



const STREAMING_LOOPBACK_START_CHANNEL = "streaming:loopback-start";
const STREAMING_LOOPBACK_STOP_CHANNEL = "streaming:loopback-stop";
const STREAMING_LOOPBACK_PCM_CHANNEL = "streaming:loopback-pcm";


const desktopApi: DesktopApi = {
  getAppVersion: async () => ipcRenderer.invoke("desktop:get-version"),
  getAppPreferences: async () =>
    ipcRenderer.invoke("desktop:app-preferences-get"),
  setAppPreferences: async (payload) =>
    ipcRenderer.invoke("desktop:app-preferences-set", payload),
  relaunchApp: async () => ipcRenderer.invoke("desktop:app-relaunch"),
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
  deleteAccount: async (payload) =>
    ipcRenderer.invoke("desktop:auth-delete-account", payload),
  exportAccountData: async () => ipcRenderer.invoke("desktop:auth-export-data"),
  getSession: async () => ipcRenderer.invoke("desktop:auth-session"),
  // Push, not poll. The renderer re-reads the session only on mount, so without
  // main announcing it the workspace stayed mounted after the session died.
  onSessionExpired: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      listener(payload as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(SESSION_EXPIRED_CHANNEL, wrappedListener);

    return () => {
      ipcRenderer.removeListener(SESSION_EXPIRED_CHANNEL, wrappedListener);
    };
  },
  getAuthProfile: async () => ipcRenderer.invoke("desktop:auth-profile"),
  updateAuthProfile: async (payload) =>
    ipcRenderer.invoke("desktop:auth-profile-update", payload),
  getRegisteredUsers: async () => ipcRenderer.invoke("desktop:auth-users"),
  lookupUserByUsername: async (payload) =>
    ipcRenderer.invoke("desktop:auth-user-lookup", payload),
  getUserCard: async (payload) =>
    ipcRenderer.invoke("desktop:auth-user-card", payload),
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
  kickLobbyMember: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-kick", payload),
  moveLobbyMember: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-move-member", payload),
  timeoutLobbyMember: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-timeout-member", payload),
  clearLobbyTimeout: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-clear-timeout", payload),
  listLobbyTimeouts: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-list-timeouts", payload),
  muteLobbyMember: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-mute-member", payload),
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
  sendLobbyEmote: async (payload) =>
    ipcRenderer.invoke("desktop:lobbies-emote", payload),
  listMinigameTables: async () => ipcRenderer.invoke("desktop:minigame-list"),
  playMinigame: async (payload) =>
    ipcRenderer.invoke("desktop:minigame-play", payload),
  listMinigameScores: async () => ipcRenderer.invoke("desktop:minigame-scores"),
  submitMinigameScore: async (payload) =>
    ipcRenderer.invoke("desktop:minigame-score-submit", payload),
  getMinigameLeaderboard: async (payload) =>
    ipcRenderer.invoke("desktop:minigame-leaderboard", payload),
  listEmotes: async () => ipcRenderer.invoke("desktop:emotes-list"),
  getEmoteSample: async (payload) =>
    ipcRenderer.invoke("desktop:emotes-sample", payload),
  uploadEmote: async (payload) =>
    ipcRenderer.invoke("desktop:emotes-upload", payload),
  deleteEmote: async (payload) =>
    ipcRenderer.invoke("desktop:emotes-delete", payload),
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
  editChatMessage: async (payload) =>
    ipcRenderer.invoke("desktop:chat-message-edit", payload),
  setChatReaction: async (payload) =>
    ipcRenderer.invoke("desktop:chat-message-reaction", payload),
  searchLobbyMessages: async (payload) =>
    ipcRenderer.invoke("desktop:lobby-messages-search", payload),
  searchDirectMessages: async (payload) =>
    ipcRenderer.invoke("desktop:chat-direct-search", payload),
  getChatAttachment: async (payload) =>
    ipcRenderer.invoke("desktop:chat-attachment-get", payload),
  saveChatAttachment: async (payload) =>
    ipcRenderer.invoke("desktop:chat-attachment-save", payload),
  saveChatImage: async (payload) =>
    ipcRenderer.invoke("desktop:chat-image-save", payload),
  listConversations: async () =>
    ipcRenderer.invoke("desktop:chat-conversations"),
  listDirectMessages: async (payload) =>
    ipcRenderer.invoke("desktop:direct-messages-list", payload),
  sendDirectMessage: async (payload) =>
    ipcRenderer.invoke("desktop:direct-messages-send", payload),
  startDirectMessagesStream: async () =>
    ipcRenderer.invoke("desktop:direct-messages-start"),
  stopDirectMessagesStream: async () =>
    ipcRenderer.invoke("desktop:direct-messages-stop"),
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
  onSystemResumed: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      listener(payload as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(SYSTEM_RESUMED_EVENT_CHANNEL, wrappedListener);

    return () => {
      ipcRenderer.removeListener(SYSTEM_RESUMED_EVENT_CHANNEL, wrappedListener);
    };
  },
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
  setPresence: async (payload) =>
    ipcRenderer.invoke("desktop:auth-presence", payload),
  listBlockedUsers: async () => ipcRenderer.invoke("desktop:auth-blocks"),
  blockUser: async (payload) => ipcRenderer.invoke("desktop:auth-block", payload),
  unblockUser: async (payload) =>
    ipcRenderer.invoke("desktop:auth-unblock", payload),
  listFriends: async () => ipcRenderer.invoke("desktop:auth-friends"),
  listFriendRequests: async () =>
    ipcRenderer.invoke("desktop:auth-friend-requests"),
  sendFriendRequest: async (payload) =>
    ipcRenderer.invoke("desktop:auth-friend-request-send", payload),
  acceptFriendRequest: async (payload) =>
    ipcRenderer.invoke("desktop:auth-friend-accept", payload),
  removeFriend: async (payload) =>
    ipcRenderer.invoke("desktop:auth-friend-remove", payload),
  getPrivacySettings: async () => ipcRenderer.invoke("desktop:auth-privacy"),
  updatePrivacySettings: async (payload) =>
    ipcRenderer.invoke("desktop:auth-privacy-update", payload),
  markDirectRead: async (payload) =>
    ipcRenderer.invoke("desktop:direct-read", payload),
  getDirectUnreadCounts: async (payload) =>
    ipcRenderer.invoke("desktop:direct-unread", payload),
  sendDirectTyping: async (payload) =>
    ipcRenderer.invoke("desktop:direct-typing", payload),
  isGifPickerEnabled: async () => ipcRenderer.invoke("desktop:gif-enabled"),
  searchGifs: async (payload) => ipcRenderer.invoke("desktop:gif-search", payload),
  getFreeGames: async (payload) => ipcRenderer.invoke("desktop:free-games", payload),
  onFreeGamesUpdated: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      listener(payload as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on("desktop:free-games-updated", wrappedListener);

    return () => {
      ipcRenderer.removeListener("desktop:free-games-updated", wrappedListener);
    };
  },
  notify: async (payload) => ipcRenderer.invoke("desktop:notify", payload),
  onNotificationActivated: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      listener(payload as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on("desktop:notification-activated", wrappedListener);

    return () => {
      ipcRenderer.removeListener(
        "desktop:notification-activated",
        wrappedListener,
      );
    };
  },
  onHotkey: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: unknown,
    ) => {
      listener(payload as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on("desktop:hotkey", wrappedListener);

    return () => {
      ipcRenderer.removeListener("desktop:hotkey", wrappedListener);
    };
  },
  adminListUsers: async (params) => ipcRenderer.invoke("desktop:admin-list-users", params),
  adminGetUser: async (userId) => ipcRenderer.invoke("desktop:admin-get-user", userId),
  adminUpdateUser: async (userId, payload) => ipcRenderer.invoke("desktop:admin-update-user", { userId, payload }),
  adminResetPassword: async (userId, newPassword) => ipcRenderer.invoke("desktop:admin-reset-password", { userId, newPassword }),
  adminDeleteUser: async (userId) => ipcRenderer.invoke("desktop:admin-delete-user", userId),
  adminBanUser: async (userId) => ipcRenderer.invoke("desktop:admin-ban-user", userId),
  adminListVoiceMutes: async () => ipcRenderer.invoke("desktop:admin-list-voice-mutes"),
  adminSetVoiceMute: async (payload) =>
    ipcRenderer.invoke("desktop:admin-set-voice-mute", payload),
  adminListTimeouts: async () => ipcRenderer.invoke("desktop:admin-list-timeouts"),
  adminClearTimeout: async (payload) =>
    ipcRenderer.invoke("desktop:admin-clear-timeout", payload),
  adminGetSettings: async () => ipcRenderer.invoke("desktop:admin-get-settings"),
  adminListMinigames: async () => ipcRenderer.invoke("desktop:admin-list-minigames"),
  adminUpdateSettings: async (patch) =>
    ipcRenderer.invoke("desktop:admin-update-settings", patch),
  adminClearProfileMedia: async (userId) =>
    ipcRenderer.invoke("desktop:admin-clear-profile-media", userId),
  adminSetEmailVerified: async (payload) =>
    ipcRenderer.invoke("desktop:admin-set-email-verified", payload),
  adminCancelDeletion: async (userId) =>
    ipcRenderer.invoke("desktop:admin-cancel-deletion", userId),
  adminUnbanUser: async (userId) => ipcRenderer.invoke("desktop:admin-unban-user", userId),
  adminListLobbies: async (params) => ipcRenderer.invoke("desktop:admin-list-lobbies", params),
  adminListLobbyEvents: async (payload) => ipcRenderer.invoke("desktop:admin-list-lobby-events", payload),
  adminGetStats: async () => ipcRenderer.invoke("desktop:admin-get-stats"),
  adminKickUser: async (lobbyId, userId) => ipcRenderer.invoke("desktop:admin-kick-user", { lobbyId, userId }),
  adminForceLogout: async (userId) => ipcRenderer.invoke("desktop:admin-force-logout", { userId }),
  adminListEmotes: async () => ipcRenderer.invoke("desktop:admin-list-emotes"),
  adminDeleteEmote: async (emoteId) => ipcRenderer.invoke("desktop:admin-delete-emote", { emoteId }),
  adminSetEmoteQuota: async (payload) => ipcRenderer.invoke("desktop:admin-set-emote-quota", payload),
};

const streamingApi: StreamingApi = {
  startSystemAudioLoopback: async () =>
    ipcRenderer.invoke(STREAMING_LOOPBACK_START_CHANNEL),
  stopSystemAudioLoopback: async () =>
    ipcRenderer.invoke(STREAMING_LOOPBACK_STOP_CHANNEL),
  onSystemAudioPcm: (listener) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      samples: Float32Array,
    ) => {
      listener(samples);
    };

    ipcRenderer.on(STREAMING_LOOPBACK_PCM_CHANNEL, wrappedListener);

    return () => {
      ipcRenderer.removeListener(
        STREAMING_LOOPBACK_PCM_CHANNEL,
        wrappedListener,
      );
    };
  },
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
contextBridge.exposeInMainWorld("streaming", streamingApi);
