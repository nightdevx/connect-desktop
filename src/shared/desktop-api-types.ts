import type {
  ChatMessage,
  ChangePasswordRequest,
  LobbyDescriptor,
  LobbyTimeout,
  AdminRuntimeSettings,
  AdminRuntimeSettingsPatch,
  AdminVoiceMute,
  AdminLobbyTimeout,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserDirectoryEntry,
  UserProfile,
  UserSettingsProfile,
  UserRole,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  SendVerificationOTPRequest,
  VerifyEmailRequest,
  AdminUserDetail,
  AdminUpdateUserRequest,
  AdminLobbySnapshot,
  AdminLobbyEvent,
  AdminStats,
  PresenceStatus,
  SelectablePresenceStatus,
  FriendEntry,
  FriendRequestLists,
  PrivacySettings,
  UpdatePrivacyRequest,
} from "./auth-contracts";
import type { AppUpdateEvent, AppUpdateSnapshot } from "./update-contracts";

export interface ApiErrorPayload {
  code: string;
  message: string;
  statusCode: number;
}

export interface DesktopResult<T> {
  ok: boolean;
  data?: T;
  error?: ApiErrorPayload;
}

export interface SessionSnapshot {
  authenticated: boolean;
  user: UserProfile | null;
}

export interface DesktopWindowState {
  isMaximized: boolean;
}

export interface DesktopAppPreferences {
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  // Applied as GPU/WebRTC command-line switches at startup, so a change only
  // takes effect after a relaunch. Off = software encode/decode fallback for
  // machines whose GPU driver produces a black or torn stream.
  hardwareAcceleration: boolean;
  // OS notifications for direct messages and incoming calls. Only raised while
  // the window is not focused, so an open conversation never double-notifies.
  desktopNotifications: boolean;
  // Electron accelerator strings ("" = unbound). Registered globally, so they
  // work while the app is in the background.
  hotkeyToggleMute: string;
  hotkeyToggleDeafen: string;
  // Hold-to-talk. Electron's globalShortcut only reports key-DOWN, so genuine
  // hold-to-talk cannot be done globally without a native keyboard hook; this
  // one is handled in the renderer and therefore only applies while the window
  // has focus. pushToTalkKey is a KeyboardEvent.code ("Space", "KeyV", …).
  pushToTalk: boolean;
  pushToTalkKey: string;
}

export type DesktopNotificationKind = "direct-message" | "incoming-call";

export interface DesktopNotificationRequest {
  kind: DesktopNotificationKind;
  title: string;
  body: string;
  // Echoed back on activation so the renderer can open the right conversation.
  peerUserId?: string;
}

export interface DesktopHotkeyEvent {
  action: "toggle-mute" | "toggle-deafen";
}

// Server-reported lobby membership. Deliberately has no `speaking` flag: the
// backend cannot know it (LiveKit does not report speaking state), so the field
// was always false on the wire. Speaking is derived client-side from LiveKit's
// ActiveSpeakersChanged — see LobbyParticipantView.
export interface LobbyStateMember {
  userId: string;
  username: string;
  joinedAt: string;
  muted: boolean;
  serverMuted: boolean;
  deafened: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
}

export interface ScreenCaptureSourceDescriptor {
  id: string;
  name: string;
  kind: "screen" | "window";
  displayId: string | null;
  previewDataUrl: string | null;
}



export interface LiveKitTokenPayload {
  serverUrl: string;
  room: string;
  identity: string;
  name: string;
  token: string;
  expiresAt: string;
}

// The lobby list is rebuilt from each snapshot, so this must carry everything
// LobbyDescriptor has. It used to omit the lock/password/allow-list fields,
// which meant every push silently rendered a private room as public until the
// next REST refetch put them back.
export interface LobbyRealtimeSnapshot {
  id: string;
  name: string;
  room: string;
  createdAt: string;
  createdBy: string;
  createdByUsername?: string;
  memberCount: number;
  members: LobbyStateMember[];
  size: number;
  revision: number;
  isLocked?: boolean;
  allowedUsers?: string;
  hasPassword?: boolean;
  isTextOnly?: boolean;
}

// Inline file upload carried in the same payload as the message. mimeType is a
// hint only: the backend sniffs the real type from the bytes and stores that.
export interface ChatAttachmentUpload {
  name: string;
  mimeType?: string;
  // Raw file, base64-encoded. A data: URL prefix is tolerated.
  dataBase64: string;
}

// One GIF, already normalised in the main process. This is the entire surface
// the renderer sees of the GIF provider: no raw API payload, no host, and above
// all no API key -- KLIPY carries the key in the URL path, so the renderer is
// never given anything it could reconstruct it from.
export interface GifItem {
  id: string;
  // Small variant for the picker grid.
  previewUrl: string;
  // Larger variant; this is the string that becomes the message body.
  sendUrl: string;
  // Alt text and tooltip.
  description: string;
}

// Mirrors lobby.RemovalReason in the Go backend. "kicked", "banned" and
// "lobby-deleted" are decisions and end the membership; the two timeouts are
// failures, which the client recovers from by re-joining rather than leaving.
export type LobbyRemovalReason =
  | "kicked"
  | "banned"
  | "lobby-deleted"
  | "media-timeout"
  | "heartbeat-timeout"
  | "moved";

// Mirrors the soundEmotes set in the Go backend (internal/lobby/emote.go).
// Closed on both sides: the server refuses anything outside it, and the client
// has a synthesised sound for each. Adding one means touching both files.
export const LOBBY_SOUND_EMOTES = [
  "clap",
  "laugh",
  "drum",
  "airhorn",
  "wow",
  "sad",
] as const;

export type LobbySoundEmote = (typeof LOBBY_SOUND_EMOTES)[number];

/** Marks an emote id as an upload rather than one of the synthesised set. */
export const CUSTOM_EMOTE_PREFIX = "custom:";

/**
 * An uploaded sound, without the sound. The sample is fetched per id and cached
 * — a list of them would otherwise carry every clip on the server.
 */
export interface CustomEmoteSummary {
  id: string;
  name: string;
  ownerId: string;
  ownerUsername: string;
  mimeType: string;
  byteLength: number;
  createdAt: string;
}

/** The admin view: the whole library plus the quotas that bound it. */
export interface AdminEmoteLibrary {
  emotes: CustomEmoteSummary[];
  globalQuota: number;
  /** Only users with an explicit override appear here. */
  userQuotas: Record<string, number>;
  usageByOwner: Record<string, number>;
  maxQuota: number;
}

export type LobbyStreamEvent =
  | {
      type: "lobbies-snapshot";
      lobbies: LobbyRealtimeSnapshot[];
      at?: string;
    }
  | {
      // Pushed by the lobby websocket so chat lands in well under a second.
      // It used to arrive via a 3s REST poll.
      type: "lobby-message";
      lobbyId: string;
      message: ChatMessage;
      at?: string;
    }
  | {
      // Tombstone. Only message.id is meaningful.
      type: "lobby-message-deleted";
      lobbyId: string;
      message: ChatMessage;
      at?: string;
    }
  | {
      // "You are no longer in that room, and here is why."
      //
      // A snapshot is a set, so a removed member is simply absent from it — and
      // the client used to have to infer a kick from that absence, which was
      // wrong every time the absence was transient. This frame carries the
      // answer instead of leaving it to be guessed.
      type: "lobby-removed";
      lobbyId: string;
      reason: LobbyRemovalReason;
      // Only for "moved": which room the account went to. Lets a client tell its
      // own room change from the same account moving on another device.
      movedTo?: string;
      at?: string;
    }
  | {
      // A sound emote: everyone in the room plays the same short noise. The id
      // names one of a fixed server-side set; no audio crosses the wire, so this
      // never touches the media path and reaches members whose microphone is
      // muted just the same.
      type: "lobby-emote";
      lobbyId: string;
      userId: string;
      username: string;
      emote: LobbySoundEmote;
      at?: string;
    }
  | {
      type: "system-error";
      code: string;
      message: string;
      at?: string;
    }
  | {
      type: "stream-status";
      status: "connected" | "closed";
      detail?: string;
      at?: string;
    };

// One multiplexed socket carries every conversation, so peerUserId identifies
// which one a frame belongs to; the connection-level frames have no peer at all.
// (The "direct-chat-history" frame is gone: the client loads the conversation
// it is looking at over REST rather than having the server push history for
// every peer in the directory at once.)
export type DirectMessagesStreamEvent =
  | {
      type: "direct-chat-message";
      peerUserId: string;
      message: ChatMessage;
      at?: string;
    }
  | {
      // Tombstone. Only message.id is meaningful.
      type: "direct-chat-message-deleted";
      peerUserId: string;
      message: ChatMessage;
      at?: string;
    }
  | {
      // Transient. The server sends no "stopped typing"; the client expires it.
      type: "direct-chat-typing";
      peerUserId: string;
      message: ChatMessage;
      at?: string;
    }
  | {
      type: "system-error";
      code: string;
      message: string;
      at?: string;
    }
  | {
      type: "stream-status";
      status: "connected" | "closed";
      detail?: string;
      at?: string;
    };

export type UserDirectoryStreamEvent =
  | {
      type: "user-profile-updated";
      user: {
        userId: string;
        username?: string;
        displayName: string;
        avatarUrl?: string | null;
        role?: UserRole;
        createdAt?: string;
        appOnline?: boolean;
        updatedAt: string;
      };
      at?: string;
    }
  | {
      // The account is gone: admin delete, or the owner's own deletion
      // request, which deactivates immediately.
      type: "profile-deleted";
      user: {
        userId: string;
        username?: string;
      };
      at?: string;
    }
  | {
      // Online/offline only. The server no longer replays the whole profile
      // (avatar data URL included) on every connect and disconnect.
      type: "user-presence-updated";
      presence: {
        userId: string;
        appOnline: boolean;
        presence?: PresenceStatus;
      };
      at?: string;
    }
  | {
      // Ids and names only: the friend half of the users-WS carries no profile,
      // so it is safe to publish per-recipient. userId is always the OTHER
      // party from the receiving client's point of view.
      type: "friend-request" | "friend-accepted" | "friend-removed";
      friend: {
        userId: string;
        username: string;
        displayName: string;
      };
      at?: string;
    }
  | {
      type: "incoming-call" | "call-accepted" | "call-rejected" | "call-cancelled";
      callPayload: {
        type: string;
        callId: string;
        callerId: string;
        callerName: string;
        // Optional: an older backend does not send it, and the handle is only
        // ever used where an empty one is already the seeded-row case.
        callerUsername?: string;
        targetUserId: string;
      };
      at?: string;
    }
  | {
      type: "system-error";
      code: string;
      message: string;
      at?: string;
    }
  | {
      type: "stream-status";
      status: "connected" | "closed";
      detail?: string;
      at?: string;
    };

export interface DesktopApi {
  getAppVersion: () => Promise<string>;
  getAppPreferences: () => Promise<
    DesktopResult<{
      preferences: DesktopAppPreferences;
    }>
  >;
  setAppPreferences: (payload: Partial<DesktopAppPreferences>) => Promise<
    DesktopResult<{
      preferences: DesktopAppPreferences;
    }>
  >;
  relaunchApp: () => Promise<DesktopResult<{ relaunching: boolean }>>;
  checkForAppUpdates: () => Promise<
    DesktopResult<{
      requested: boolean;
      reason?: string;
    }>
  >;
  installDownloadedUpdate: () => Promise<
    DesktopResult<{
      accepted: boolean;
      reason?: string;
    }>
  >;
  launchMockUpdateDebug: () => Promise<
    DesktopResult<{
      started: boolean;
      reason?: string;
    }>
  >;
  getUpdateState: () => Promise<DesktopResult<{ state: AppUpdateSnapshot }>>;
  onUpdateEvent: (listener: (event: AppUpdateEvent) => void) => () => void;
  ping: () => Promise<string>;
  register: (
    payload: RegisterRequest,
  ) => Promise<DesktopResult<SessionSnapshot>>;
  changePassword: (payload: ChangePasswordRequest) => Promise<
    DesktopResult<{
      changed: boolean;
    }>
  >;
  login: (payload: LoginRequest) => Promise<DesktopResult<SessionSnapshot>>;
  forgotPassword: (payload: ForgotPasswordRequest) => Promise<DesktopResult<{ sent: boolean }>>;
  resetPassword: (payload: ResetPasswordRequest) => Promise<DesktopResult<{ reset: boolean }>>;
  sendVerificationOTP: (payload: SendVerificationOTPRequest) => Promise<DesktopResult<{ sent: boolean }>>;
  verifyEmail: (payload: VerifyEmailRequest) => Promise<DesktopResult<{ verified: boolean }>>;
  logout: () => Promise<DesktopResult<SessionSnapshot>>;
  // Deactivates immediately and schedules the purge; the session ends with it,
  // so there is no matching "cancel" call — signing back in is the undo.
  deleteAccount: (payload: {
    password: string;
  }) => Promise<
    DesktopResult<{
      deletion: { pending: boolean; requestedAt?: string; scheduledAt?: string };
    }>
  >;
  exportAccountData: () => Promise<
    DesktopResult<{ saved: boolean; path?: string }>
  >;
  getSession: () => Promise<DesktopResult<SessionSnapshot>>;
  // Fires when main has established that the session is over and cannot be
  // recovered — the refresh token was rejected, the account was banned, or it
  // was deactivated. `reason` is the backend error code.
  onSessionExpired: (
    listener: (payload: { reason: string }) => void,
  ) => () => void;
  getAuthProfile: () => Promise<
    DesktopResult<{ profile: UserSettingsProfile }>
  >;
  updateAuthProfile: (
    payload: UpdateProfileRequest,
  ) => Promise<DesktopResult<{ profile: UserSettingsProfile }>>;
  // Friends and self only. Anyone else has to be reached by exact username.
  getRegisteredUsers: () => Promise<
    DesktopResult<{ users: UserDirectoryEntry[] }>
  >;
  // Exact match, 404 USER_NOT_FOUND otherwise. Never a prefix search.
  lookupUserByUsername: (payload: {
    username: string;
  }) => Promise<DesktopResult<{ user: FriendEntry }>>;
  // The public card for an id you already hold: a lobby roster row, a message
  // author, a caller. Carries the avatar and the real username, neither of
  // which the friends-only directory has for a stranger.
  getUserCard: (payload: {
    userId: string;
  }) => Promise<DesktopResult<{ user: UserProfile }>>;
  startUserDirectoryStream: () => Promise<DesktopResult<{ started: boolean }>>;
  stopUserDirectoryStream: () => Promise<DesktopResult<{ stopped: boolean }>>;
  onUserDirectoryEvent: (
    listener: (event: UserDirectoryStreamEvent) => void,
  ) => () => void;
  listLobbies: () => Promise<DesktopResult<{ lobbies: LobbyDescriptor[] }>>;
  startLobbyStream: () => Promise<DesktopResult<{ started: boolean }>>;
  stopLobbyStream: () => Promise<DesktopResult<{ stopped: boolean }>>;
  onLobbyStreamEvent: (
    listener: (event: LobbyStreamEvent) => void,
  ) => () => void;
  getLobbyStates: () => Promise<
    DesktopResult<{
      lobbies: Array<{
        lobbyId: string;
        members: LobbyStateMember[];
        size: number;
        revision: number;
      }>;
    }>
  >;
  createLobby: (payload: {
    name: string;
    isLocked?: boolean;
    allowedUsers?: string[];
    password?: string;
    // Chat-only room. Create-only: updateLobby has no counterpart.
    isTextOnly?: boolean;
  }) => Promise<DesktopResult<{ lobby: LobbyDescriptor }>>;
  updateLobby: (payload: {
    lobbyId: string;
    name: string;
    isLocked?: boolean;
    allowedUsers?: string[];
    password?: string | null;
  }) => Promise<DesktopResult<{ lobby: LobbyDescriptor }>>;
  deleteLobby: (payload: {
    lobbyId: string;
  }) => Promise<DesktopResult<{ deleted: boolean; lobbyId: string }>>;
  joinLobby: (payload: {
    lobbyId: string;
    password?: string;
  }) => Promise<DesktopResult<{ accepted: boolean; lobbyId: string }>>;
  // A kick only removes them; they are back after the cooldown. Keeping someone
  // out is timeoutLobbyMember, where durationSeconds omitted means indefinite —
  // until it is lifted by hand from the admin panel.
  kickLobbyMember: (payload: {
    lobbyId: string;
    userId: string;
  }) => Promise<DesktopResult<{ kicked: boolean }>>;
  timeoutLobbyMember: (payload: {
    lobbyId: string;
    userId: string;
    durationSeconds?: number;
  }) => Promise<DesktopResult<{ banned: boolean }>>;
  clearLobbyTimeout: (payload: {
    lobbyId: string;
    userId: string;
  }) => Promise<DesktopResult<{ unbanned: boolean }>>;
  listLobbyTimeouts: (payload: {
    lobbyId: string;
  }) => Promise<DesktopResult<{ bans: LobbyTimeout[] }>>;
  muteLobbyMember: (payload: {
    lobbyId: string;
    userId: string;
    muted: boolean;
    durationSeconds?: number;
  }) => Promise<DesktopResult<{ muted: boolean }>>;
  leaveLobby: (payload?: {
    lobbyId?: string;
  }) => Promise<DesktopResult<{ accepted: boolean; lobbyId: string }>>;
  setLobbyMuted: (payload: {
    lobbyId: string;
    muted: boolean;
  }) => Promise<DesktopResult<{ accepted: boolean; lobbyId: string }>>;
  setLobbyDeafened: (payload: {
    lobbyId: string;
    deafened: boolean;
  }) => Promise<DesktopResult<{ accepted: boolean; lobbyId: string }>>;
  setLobbyCameraEnabled: (payload: {
    lobbyId: string;
    enabled: boolean;
  }) => Promise<DesktopResult<{ accepted: boolean; lobbyId: string }>>;
  setLobbyScreenSharing: (payload: {
    lobbyId: string;
    enabled: boolean;
  }) => Promise<DesktopResult<{ accepted: boolean; lobbyId: string }>>;
  // Fans a short synthesised noise out to the room. The reply only confirms the
  // broadcast; the sound itself arrives back over the lobby stream, like it does
  // for everyone else.
  // An uploaded emote travels as "custom:<id>"; a built-in as its own name.
  sendLobbyEmote: (payload: {
    lobbyId: string;
    emote: LobbySoundEmote | string;
  }) => Promise<DesktopResult<{ accepted: boolean }>>;
  // The uploaded soundboard. The list carries no audio; getEmoteSample is the
  // one call that does, and a client reads each id once and caches it.
  listEmotes: () => Promise<
    DesktopResult<{ emotes: CustomEmoteSummary[]; quota: number; used: number }>
  >;
  getEmoteSample: (payload: { emoteId: string }) => Promise<
    DesktopResult<{ id: string; name: string; mimeType: string; dataUrl: string }>
  >;
  uploadEmote: (payload: { name: string; dataUrl: string }) => Promise<
    DesktopResult<{ emote: CustomEmoteSummary; quota: number; used: number }>
  >;
  deleteEmote: (payload: { emoteId: string }) => Promise<
    DesktopResult<{ deleted: boolean }>
  >;
  createLiveKitToken: (payload?: {
    room?: string;
  }) => Promise<DesktopResult<LiveKitTokenPayload>>;
  initiateCall: (payload: {
    targetUserId: string;
  }) => Promise<DesktopResult<{ callId: string }>>;
  acceptCall: (payload: {
    callId: string;
    callerId: string;
  }) => Promise<DesktopResult<{ ok: boolean }>>;
  rejectCall: (payload: {
    callId: string;
    callerId: string;
  }) => Promise<DesktopResult<{ ok: boolean }>>;
  cancelCall: (payload: {
    callId: string;
    targetUserId: string;
  }) => Promise<DesktopResult<{ ok: boolean }>>;
  listScreenCaptureSources: () => Promise<
    DesktopResult<{ sources: ScreenCaptureSourceDescriptor[] }>
  >;
  getLobbyState: (payload: { lobbyId: string }) => Promise<
    DesktopResult<{
      lobbyId: string;
      members: LobbyStateMember[];
      size: number;
      revision: number;
    }>
  >;
  listLobbyMessages: (payload: {
    lobbyId: string;
    limit?: number;
  }) => Promise<DesktopResult<{ messages: ChatMessage[] }>>;
  sendLobbyMessage: (payload: {
    lobbyId: string;
    // May be empty when an attachment is present.
    body: string;
    replyToId?: string;
    attachment?: ChatAttachmentUpload;
  }) => Promise<DesktopResult<{ message: ChatMessage }>>;
  deleteLobbyMessage: (payload: {
    messageId: string;
  }) => Promise<DesktopResult<{ deleted: boolean; messageId: string }>>;
  editChatMessage: (payload: {
    messageId: string;
    body: string;
  }) => Promise<DesktopResult<{ message: ChatMessage }>>;
  setChatReaction: (payload: {
    messageId: string;
    emoji: string;
    add: boolean;
  }) => Promise<DesktopResult<{ message: ChatMessage }>>;
  searchLobbyMessages: (payload: {
    lobbyId: string;
    query: string;
    limit?: number;
  }) => Promise<DesktopResult<{ messages: ChatMessage[] }>>;
  searchDirectMessages: (payload: {
    peerUserId: string;
    query: string;
    limit?: number;
  }) => Promise<DesktopResult<{ messages: ChatMessage[] }>>;
  // Bytes come back as a data URL: the renderer has no bearer token of its own.
  getChatAttachment: (payload: {
    attachmentId: string;
  }) => Promise<
    DesktopResult<{ dataUrl: string; mimeType: string; size: number }>
  >;
  saveChatAttachment: (payload: {
    attachmentId: string;
    fileName: string;
  }) => Promise<DesktopResult<{ saved: boolean; path?: string }>>;
  // Saves an image that lives at a remote URL (a posted GIF). Main re-checks
  // the host against the auto-load allowlist before fetching anything.
  saveChatImage: (payload: {
    url: string;
  }) => Promise<DesktopResult<{ saved: boolean; path?: string }>>;
  // Peers with any direct-message history; the sidebar seeds its open list here.
  // conversations carries the names — a non-friend peer is absent from the
  // directory, so this is the only place the sidebar can learn what to call
  // them. Optional: an older backend still answers with ids alone.
  listConversations: () => Promise<
    DesktopResult<{ peerUserIds: string[]; conversations?: FriendEntry[] }>
  >;
  listDirectMessages: (payload: {
    peerUserId: string;
    limit?: number;
    // Message id cursor: returns the page immediately older than it.
    before?: string;
  }) => Promise<DesktopResult<{ messages: ChatMessage[]; hasMore?: boolean }>>;
  sendDirectMessage: (payload: {
    peerUserId: string;
    body: string;
    replyToId?: string;
    attachment?: ChatAttachmentUpload;
  }) => Promise<DesktopResult<{ message: ChatMessage }>>;
  startDirectMessagesStream: () => Promise<DesktopResult<{ started: boolean }>>;
  stopDirectMessagesStream: () => Promise<DesktopResult<{ stopped: boolean }>>;
  onDirectMessagesEvent: (
    listener: (event: DirectMessagesStreamEvent) => void,
  ) => () => void;
  minimizeWindow: () => Promise<DesktopResult<{ minimized: boolean }>>;
  toggleMaximizeWindow: () => Promise<DesktopResult<{ isMaximized: boolean }>>;
  closeWindow: () => Promise<DesktopResult<{ closed: boolean }>>;
  setWindowAttention: (payload: {
    enabled: boolean;
  }) => Promise<DesktopResult<{ attention: boolean }>>;
  setPresence: (payload: {
    status: SelectablePresenceStatus;
  }) => Promise<DesktopResult<{ presence: PresenceStatus }>>;
  // blockedUsers is optional: an older backend answers with the ids alone.
  listBlockedUsers: () => Promise<
    DesktopResult<{ blockedUserIds: string[]; blockedUsers?: FriendEntry[] }>
  >;
  blockUser: (payload: {
    userId: string;
  }) => Promise<DesktopResult<{ blocked: boolean }>>;
  unblockUser: (payload: {
    userId: string;
  }) => Promise<DesktopResult<{ unblocked: boolean }>>;
  listFriends: () => Promise<DesktopResult<{ friendUserIds: string[] }>>;
  listFriendRequests: () => Promise<DesktopResult<FriendRequestLists>>;
  // accepted is true when the target had already asked: the mutual-pending case
  // collapses to one accepted edge instead of a second row.
  sendFriendRequest: (payload: {
    username: string;
  }) => Promise<DesktopResult<{ requested: boolean; accepted: boolean }>>;
  acceptFriendRequest: (payload: {
    userId: string;
  }) => Promise<DesktopResult<{ accepted: boolean }>>;
  // Also serves reject and cancel — the same edge, deleted from either side.
  removeFriend: (payload: {
    userId: string;
  }) => Promise<DesktopResult<{ removed: boolean }>>;
  getPrivacySettings: () => Promise<DesktopResult<{ privacy: PrivacySettings }>>;
  updatePrivacySettings: (
    payload: UpdatePrivacyRequest,
  ) => Promise<DesktopResult<{ privacy: PrivacySettings }>>;
  markDirectRead: (payload: {
    peerUserId: string;
  }) => Promise<DesktopResult<{ marked: boolean }>>;
  getDirectUnreadCounts: (payload: {
    peerUserIds: string[];
  }) => Promise<DesktopResult<{ unreadByPeerUserId: Record<string, number> }>>;
  sendDirectTyping: (payload: {
    peerUserId: string;
  }) => Promise<DesktopResult<{ sent: boolean }>>;
  // Answers whether a KLIPY key is configured, so the renderer can decide
  // whether to render the GIF button at all. It deliberately cannot read the
  // key itself -- only whether one exists.
  isGifPickerEnabled: () => Promise<DesktopResult<{ enabled: boolean }>>;
  // An empty query returns what is trending. The fetch happens in main; the
  // renderer never talks to the GIF provider directly.
  searchGifs: (payload: {
    query: string;
  }) => Promise<DesktopResult<{ items: GifItem[] }>>;
  notify: (
    payload: DesktopNotificationRequest,
  ) => Promise<DesktopResult<{ shown: boolean }>>;
  onNotificationActivated: (
    listener: (payload: {
      kind: DesktopNotificationKind;
      peerUserId: string | null;
    }) => void,
  ) => () => void;
  onHotkey: (listener: (event: DesktopHotkeyEvent) => void) => () => void;
  getWindowState: () => Promise<DesktopResult<DesktopWindowState>>;
  onWindowStateChanged: (
    listener: (state: DesktopWindowState) => void,
  ) => () => void;
  adminListUsers: (params?: { search?: string; role?: string; status?: string; limit?: number; offset?: number }) => Promise<DesktopResult<{ users: AdminUserDetail[]; total: number }>>;
  adminGetUser: (userId: string) => Promise<DesktopResult<{ user: AdminUserDetail }>>;
  adminUpdateUser: (userId: string, payload: AdminUpdateUserRequest) => Promise<DesktopResult<{ user: AdminUserDetail }>>;
  adminResetPassword: (userId: string, newPassword: string) => Promise<DesktopResult<{ reset: boolean }>>;
  adminDeleteUser: (userId: string) => Promise<DesktopResult<{ deleted: boolean }>>;
  adminBanUser: (userId: string) => Promise<DesktopResult<{ banned: boolean }>>;
  adminListVoiceMutes: () => Promise<DesktopResult<{ mutes: AdminVoiceMute[] }>>;
  adminSetVoiceMute: (payload: {
    userId: string;
    muted: boolean;
    durationSeconds?: number;
  }) => Promise<DesktopResult<{ muted: boolean }>>;
  adminListTimeouts: () => Promise<DesktopResult<{ timeouts: AdminLobbyTimeout[] }>>;
  adminClearTimeout: (payload: {
    lobbyId: string;
    userId: string;
  }) => Promise<DesktopResult<{ cleared: boolean }>>;
  adminGetSettings: () => Promise<DesktopResult<{ settings: AdminRuntimeSettings }>>;
  adminUpdateSettings: (
    patch: AdminRuntimeSettingsPatch,
  ) => Promise<DesktopResult<{ settings: AdminRuntimeSettings }>>;
  adminClearProfileMedia: (userId: string) => Promise<DesktopResult<{ user: AdminUserDetail }>>;
  adminSetEmailVerified: (payload: {
    userId: string;
    verified: boolean;
  }) => Promise<DesktopResult<{ user: AdminUserDetail }>>;
  adminCancelDeletion: (userId: string) => Promise<DesktopResult<{ cancelled: boolean }>>;
  adminUnbanUser: (userId: string) => Promise<DesktopResult<{ unbanned: boolean }>>;
  adminListLobbies: (params?: { search?: string; locked?: string; limit?: number; offset?: number }) => Promise<DesktopResult<{ lobbies: AdminLobbySnapshot[]; total: number }>>;
  adminListLobbyEvents: (payload: { limit?: number; offset?: number; lobbyId?: string; userId?: string; eventType?: string; search?: string }) => Promise<DesktopResult<{ events: AdminLobbyEvent[]; total: number }>>;
  adminGetStats: () => Promise<DesktopResult<{ stats: AdminStats }>>;
  adminKickUser: (lobbyId: string, userId: string) => Promise<DesktopResult<{ kicked: boolean }>>;
  adminForceLogout: (userId: string) => Promise<DesktopResult<{ loggedOut: boolean }>>;
  adminListEmotes: () => Promise<DesktopResult<AdminEmoteLibrary>>;
  adminDeleteEmote: (emoteId: string) => Promise<DesktopResult<{ deleted: boolean }>>;
  adminSetEmoteQuota: (payload: { userId?: string; quota: number | null }) => Promise<
    DesktopResult<{ globalQuota: number; userQuotas: Record<string, number> }>
  >;
}
