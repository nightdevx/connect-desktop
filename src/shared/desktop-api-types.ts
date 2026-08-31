import type {
  ChatMessage,
  ChangePasswordRequest,
  LobbyDescriptor,
  LobbyStateMember,
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
import type {
  AdminAttachmentStats,
  AdminAttachmentSummary,
  AdminAuditEntry,
  AdminAuditQuery,
  AdminChatQuery,
  AdminChatReport,
  AdminEmoteRow,
  AdminInviteCode,
  AdminIpBan,
  AdminLivePublisher,
  AdminPurgeQuery,
  AdminReportStatus,
  AdminSessionSummary,
  AdminUserRelations,
} from "./admin-ops-types";
import type { AppUpdateEvent, AppUpdateSnapshot } from "./update-contracts";
import type { FreeGamesSnapshot } from "./free-games";
import type {
  MinigameLeaderboard,
  MinigameScoreMap,
  MinigameTable,
  MinigameTableOverview,
  MultiplayerGameId,
} from "./minigames";
import type { MusicCatalog, MusicDJ, MusicState } from "./music";
import type { WatchSnapshot, WatchState } from "./watch";

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
  // A toast when a game becomes free. Separate from desktopNotifications
  // because it is a different kind of interruption: a message is somebody
  // waiting for you, a giveaway is an errand. Both must be refusable on
  // their own.
  freeGameNotifications: boolean;
}

export type DesktopNotificationKind =
  | "direct-message"
  | "incoming-call"
  | "lobby-message"
  // Raised by the main-process poller, not by the renderer: the whole point
  // is that it fires while the window is in the tray.
  | "free-game";

export interface DesktopNotificationRequest {
  kind: DesktopNotificationKind;
  title: string;
  body: string;
  // Echoed back on activation so the renderer can open the right conversation.
  peerUserId?: string;
  // Lobby chat only. Doubles as the toast's identity: a busy room replaces its
  // own toast instead of stacking one per message, which is the whole reason
  // lobby chat used to raise no toast at all.
  lobbyId?: string;
}

export interface DesktopHotkeyEvent {
  action: "toggle-mute" | "toggle-deafen";
}

// Defined in auth-contracts (the admin contracts there need it); re-exported
// here so every existing import path keeps working.
export type { LobbyStateMember } from "./auth-contracts";

export interface ScreenCaptureSourceDescriptor {
  id: string;
  name: string;
  kind: "screen" | "window";
  displayId: string | null;
  previewDataUrl: string | null;
}



export interface LiveKitIceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface LiveKitTokenPayload {
  serverUrl: string;
  room: string;
  identity: string;
  name: string;
  token: string;
  expiresAt: string;
  iceServers?: LiveKitIceServer[];
}

// The lobby list is rebuilt from each snapshot, so this must carry everything
// LobbyDescriptor has. It used to omit the lock/password/allow-list fields,
// which meant every push silently rendered a private room as public until the
// next REST refetch put them back.
export interface LobbyRealtimeSnapshot {
  id: string;
  name: string;
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
  // The room's member ceiling. Optional: an older server omits it.
  capacity?: number;
  disabledFeatures?: LobbyFeatureId[];
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
  | "moved"
  // A moderator carried them into another room. The opposite of "moved": that
  // one is this account's own doing on another device and is ignored, this one
  // is somebody else's decision and is followed.
  | "moved-by-moderator";

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

export const LOBBY_FEATURES = [
  { id: "soundEmotes", label: "Sesli emote" },
  { id: "customEmotes", label: "Yüklenen emoteler" },
  { id: "chat", label: "Oda sohbeti" },
  { id: "attachments", label: "Dosya eki" },
  { id: "camera", label: "Kamera" },
  { id: "screenShare", label: "Ekran paylaşımı" },
  { id: "music", label: "Müzik botu" },
  { id: "watchTogether", label: "Birlikte izleme" },
] as const;

export type LobbyFeatureId = (typeof LOBBY_FEATURES)[number]["id"];

export const LOBBY_FEATURE_IDS = LOBBY_FEATURES.map((feature) => feature.id) as readonly LobbyFeatureId[];

export const lobbyFeatureLabel = (id: string): string =>
  LOBBY_FEATURES.find((feature) => feature.id === id)?.label ?? id;

export const isLobbyFeatureEnabled = (
  disabled: readonly string[] | undefined,
  feature: LobbyFeatureId,
): boolean => !disabled?.includes(feature);

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
      // For "moved" and "moved-by-moderator": which room the account went to.
      // Lets a client tell its own room change from the same account moving on
      // another device, and tells a moved client where to follow to.
      movedTo?: string;
      // "moved-by-moderator" only: who did it, for the message shown on arrival.
      movedBy?: string;
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
      label?: string;
      holdMs?: number;
      sentAt?: number;
      at?: string;
    }
  | {
      // One game table, in full, after every change.
      //
      // Rides this socket but has nothing to do with lobbies: a table is its own
      // lobby, open to anyone signed in, and there is no room to belong to. It
      // is here because every client already holds this connection open, and a
      // second websocket for a handful of frames a minute would be a second
      // stream manager and a second reconnect ladder.
      //
      // The server owns the board, so this is the whole table and not a delta —
      // there is no move to replay and nothing to reconcile, which is what makes
      // a dropped frame cost a repaint rather than a desynced game. One table
      // per frame rather than the whole registry: the client keeps a map keyed
      // by id and derives both the browser list and its own board from it.
      //
      // `table: null` is an explicit frame, not silence: it is what tells the
      // remaining player their opponent walked away, and the browser that a
      // listing is gone. Inferring that from an absence is the same mistake
      // lobby-removed exists to undo.
      type: "minigame-table";
      tableId: string;
      table: MinigameTable | null;
      at?: string;
    }
  | {
      type: "music-state";
      lobbyId: string;
      state: MusicState;
      at?: string;
    }
  | {
      type: "watch-state";
      lobbyId: string;
      state: WatchState;
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
        // Only on THIS event, not on the directory listing it feeds. It is what
        // updates an open profile card; UserDirectoryEntry deliberately has no
        // banner, because that list is re-sent on presence flips.
        bannerUrl?: string | null;
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
    // The room's own member ceiling; omitted takes the server default.
    capacity?: number;
  }) => Promise<DesktopResult<{ lobby: LobbyDescriptor }>>;
  updateLobby: (payload: {
    lobbyId: string;
    name: string;
    isLocked?: boolean;
    allowedUsers?: string[];
    password?: string | null;
    // undefined keeps the room's ceiling, 0 returns it to the server default.
    capacity?: number;
    disabledFeatures?: LobbyFeatureId[];
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
  // Carries a member into another room. The destination's own rules still apply
  // to the person being moved, so this answers the same refusals a join does.
  moveLobbyMember: (payload: {
    lobbyId: string;
    userId: string;
    targetLobbyId: string;
  }) => Promise<DesktopResult<{ moved: boolean; targetLobbyId: string }>>;
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
  // Every open game table, read once when the page opens. Each later change
  // arrives on the lobby stream as a minigame-table frame, so this is a
  // starting point and not a poll.
  listMinigameTables: () => Promise<
    DesktopResult<{ tables: MinigameTable[]; disabledGames?: string[] }>
  >;
  // Open, join, start, move, restart and leave, behind one call. The reply
  // carries the resulting table so the clicker repaints without waiting for its
  // own broadcast to come back round; everyone else is what the stream is for.
  //
  // `cell` under a gravity game names a COLUMN's worth of target — the server
  // takes the column and drops the mark itself, because a client cannot know
  // the landing row without racing the opponent.
  //
  // `start` only means anything at a table that seats more than two: a
  // two-player table starts the moment the second chair is taken.
  playMinigame: (payload: {
    action:
      | "open"
      | "configure"
      | "join"
      | "start"
      | "move"
      | "restart"
      | "leave"
      | "watch"
      | "unwatch";
    game?: MultiplayerGameId;
    tableId?: string;
    // Table settings, for `configure`. The host only, and only before the
    // table is dealt. Anything left out is left alone.
    handSize?: number;
    maxSeats?: number;
    // A grid game sends `cell`; everything else sends `move` — a verb and its
    // colon-separated arguments ("roll", "keep:1,3,5", "place:12:4,5,6"), with
    // chess's UCI as the degenerate case of a verb with no arguments. The
    // server reads whichever its table's engine wants and ignores the other.
    cell?: number;
    move?: string;
  }) => Promise<DesktopResult<{ table: MinigameTable | null }>>;
  // Every solo game this account holds a record at. Read once when the page
  // opens; a submission answers with the new value, so nothing polls.
  listMinigameScores: () => Promise<DesktopResult<{ scores: MinigameScoreMap }>>;
  // Records a finished run. Idempotent: the server keeps the score only if it
  // beats what is stored, which is what lets the desktop re-send its local
  // records on every launch to catch up whatever was earned offline.
  submitMinigameScore: (payload: { game: string; score: number }) => Promise<
    DesktopResult<{ updated: boolean; game: string; best: number }>
  >;
  // One game ranked, plus the caller's own place in it. Public to every
  // signed-in account — a board only its holder can see is not a board.
  getMinigameLeaderboard: (payload: { game: string; limit?: number }) => Promise<
    DesktopResult<MinigameLeaderboard>
  >;
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
      lobbyId: string | null;
    }) => void,
  ) => () => void;
  // Free-game offers, gathered in main from four upstreams. `refresh` is the
  // page's manual button; main still applies its own cooldown and answers
  // from cache when it refuses.
  getFreeGames: (payload?: {
    refresh?: boolean;
  }) => Promise<DesktopResult<FreeGamesSnapshot>>;
  // Pushed whenever the background poll produces a new snapshot, so a page
  // left open updates without asking.
  onFreeGamesUpdated: (
    listener: (snapshot: FreeGamesSnapshot) => void,
  ) => () => void;
  onHotkey: (listener: (event: DesktopHotkeyEvent) => void) => () => void;
  getWindowState: () => Promise<DesktopResult<DesktopWindowState>>;
  onWindowStateChanged: (
    listener: (state: DesktopWindowState) => void,
  ) => () => void;
  // Fired when the machine wakes from sleep. Every socket is dead by then and
  // nothing in the page can tell: window "online" does not fire on wake, nor on
  // a network handoff that keeps the interface up.
  onSystemResumed: (listener: (event: { at: number }) => void) => () => void;
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
  adminListMinigames: () => Promise<
    DesktopResult<{ tables: MinigameTableOverview[]; disabledGames: string[] }>
  >;
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
  adminListLobbies: (params?: { search?: string; locked?: string; kind?: string; limit?: number; offset?: number }) => Promise<DesktopResult<{ lobbies: AdminLobbySnapshot[]; total: number }>>;
  adminListLobbyEvents: (payload: { limit?: number; offset?: number; lobbyId?: string; userId?: string; eventType?: string; search?: string }) => Promise<DesktopResult<{ events: AdminLobbyEvent[]; total: number }>>;
  adminGetStats: () => Promise<DesktopResult<{ stats: AdminStats }>>;
  adminKickUser: (lobbyId: string, userId: string) => Promise<DesktopResult<{ kicked: boolean }>>;
  adminForceLogout: (userId: string) => Promise<DesktopResult<{ loggedOut: boolean }>>;
  adminListEmotes: () => Promise<DesktopResult<AdminEmoteLibrary>>;
  adminDeleteEmote: (emoteId: string) => Promise<DesktopResult<{ deleted: boolean }>>;
  adminSetEmoteQuota: (payload: { userId?: string; quota: number | null }) => Promise<
    DesktopResult<{ globalQuota: number; userQuotas: Record<string, number> }>
  >;
  getMusicCatalog: () => Promise<DesktopResult<MusicCatalog>>;
  getMusicState: (payload: {
    lobbyId: string;
  }) => Promise<DesktopResult<{ state: MusicState; isDj: boolean }>>;
  sendMusicCommand: (payload: {
    lobbyId: string;
    command: string;
  }) => Promise<DesktopResult<{ state: MusicState; reply: string; isDj: boolean }>>;
  adminListMusicDJs: () => Promise<DesktopResult<{ djs: MusicDJ[]; spotifyEnabled: boolean }>>;
  adminGrantMusicDJ: (userId: string) => Promise<DesktopResult<{ dj: MusicDJ }>>;
  adminRevokeMusicDJ: (userId: string) => Promise<DesktopResult<{ revoked: boolean }>>;
  getWatchPlayerUrl: () => Promise<DesktopResult<{ url: string; directUrl: string }>>;
  resolveWatchSource: (payload: {
    pageUrl: string;
  }) => Promise<
    DesktopResult<{ src: string; kind: "hls" | "dash" | "mp4" | "webm"; title: string }>
  >;
  getWatchState: (payload: { lobbyId: string }) => Promise<DesktopResult<WatchSnapshot>>;
  startWatch: (payload: {
    lobbyId: string;
    link: string;
  }) => Promise<DesktopResult<WatchSnapshot>>;
  playWatch: (payload: {
    lobbyId: string;
    position?: number;
  }) => Promise<DesktopResult<WatchSnapshot>>;
  pauseWatch: (payload: {
    lobbyId: string;
    position?: number;
  }) => Promise<DesktopResult<WatchSnapshot>>;
  seekWatch: (payload: {
    lobbyId: string;
    position: number;
  }) => Promise<DesktopResult<WatchSnapshot>>;
  describeWatch: (payload: {
    lobbyId: string;
    videoId: string;
    title: string;
    durationSeconds: number;
  }) => Promise<DesktopResult<WatchSnapshot>>;
  stopWatch: (payload: { lobbyId: string }) => Promise<DesktopResult<WatchSnapshot>>;
  adminOps: {
    userSessions: (payload: { userId: string }) => Promise<DesktopResult<{ sessions: AdminSessionSummary[] }>>;
    revokeSession: (payload: { userId: string; sessionId: string }) => Promise<DesktopResult<{ revoked: boolean }>>;
    userRelations: (payload: { userId: string }) => Promise<DesktopResult<{ relations: AdminUserRelations }>>;
    removeFriend: (payload: { userId: string; peerId: string }) => Promise<DesktopResult<{ removed: boolean }>>;
    setBlock: (payload: { userId: string; peerId: string; blocked: boolean }) => Promise<DesktopResult<{ blocked: boolean }>>;
    sendPasswordReset: (payload: { userId: string }) => Promise<DesktopResult<{ sent: boolean }>>;
    sendVerification: (payload: { userId: string }) => Promise<DesktopResult<{ sent: boolean }>>;
    banUser: (payload: { userId: string; reason: string; until?: string | null }) => Promise<DesktopResult<{ banned: boolean }>>;
    setDeletion: (payload: { userId: string; cancel?: boolean; requestedAt?: string | null; reason?: string }) => Promise<DesktopResult<{ scheduled: boolean }>>;
    listAudit: (payload: AdminAuditQuery) => Promise<DesktopResult<{ entries: AdminAuditEntry[]; total: number }>>;
    searchChat: (payload: AdminChatQuery) => Promise<DesktopResult<{ messages: ChatMessage[]; total: number }>>;
    deleteChatMessage: (payload: { messageId: string; reason: string }) => Promise<DesktopResult<{ deleted: boolean }>>;
    redactChatMessage: (payload: { messageId: string; reason: string }) => Promise<DesktopResult<{ message: ChatMessage }>>;
    purgeChat: (payload: AdminPurgeQuery) => Promise<DesktopResult<{ deleted: number; matched: number }>>;
    removeChatReaction: (payload: { messageId: string; emoji: string }) => Promise<DesktopResult<{ message: ChatMessage }>>;
    listAttachments: (payload: { limit?: number; offset?: number }) => Promise<DesktopResult<{ attachments: AdminAttachmentSummary[]; total: number; stats: AdminAttachmentStats }>>;
    deleteAttachment: (payload: { attachmentId: string; reason: string }) => Promise<DesktopResult<{ deleted: boolean }>>;
    listReports: (payload: { status?: AdminReportStatus; limit?: number; offset?: number }) => Promise<DesktopResult<{ reports: AdminChatReport[]; total: number }>>;
    updateReport: (payload: { reportId: string; status: AdminReportStatus; reason?: string }) => Promise<DesktopResult<{ updated: boolean }>>;
    lobbyFeatures: () => Promise<DesktopResult<{ features: Array<{ id: LobbyFeatureId; label: string }> }>>;
    createLobby: (payload: { name: string; isTextOnly?: boolean; capacity?: number }) => Promise<DesktopResult<{ lobby: LobbyDescriptor }>>;
    deleteLobby: (payload: { lobbyId: string; reason: string }) => Promise<DesktopResult<{ deleted: boolean }>>;
    transferLobby: (payload: { lobbyId: string; userId: string }) => Promise<DesktopResult<{ lobby: LobbyDescriptor }>>;
    moveMember: (payload: { lobbyId: string; userId: string }) => Promise<DesktopResult<{ moved: boolean }>>;
    announce: (payload: { lobbyId?: string; body: string }) => Promise<DesktopResult<{ delivered: number }>>;
    disconnectMedia: (payload: { userId: string }) => Promise<DesktopResult<{ disconnected: boolean }>>;
    forceTrackOff: (payload: { userId: string; kind: "camera" | "screen" | "microphone"; reason?: string }) => Promise<DesktopResult<{ stopped: boolean }>>;
    liveMedia: () => Promise<DesktopResult<{ publishers: AdminLivePublisher[] }>>;
    closeTable: (payload: { tableId: string }) => Promise<DesktopResult<{ closed: boolean }>>;
    removeTablePlayer: (payload: { tableId: string; userId: string }) => Promise<DesktopResult<{ removed: boolean }>>;
    deleteScore: (payload: { game: string; userId: string }) => Promise<DesktopResult<{ deleted: boolean }>>;
    resetLeaderboard: (payload: { game: string; reason: string }) => Promise<DesktopResult<{ removed: number }>>;
    musicQueue: (payload: { lobbyId: string }) => Promise<DesktopResult<{ state: MusicState }>>;
    clearMusicQueue: (payload: { lobbyId: string }) => Promise<DesktopResult<{ state: MusicState; reply: string }>>;
    removeMusicTrack: (payload: { lobbyId: string; index: number }) => Promise<DesktopResult<{ state: MusicState; reply: string }>>;
    renameEmote: (payload: { emoteId: string; name: string }) => Promise<DesktopResult<{ emote: AdminEmoteRow }>>;
    uploadEmote: (payload: { name: string; dataUrl: string }) => Promise<DesktopResult<{ emote: AdminEmoteRow }>>;
    listIpBans: () => Promise<DesktopResult<{ bans: AdminIpBan[] }>>;
    banIp: (payload: { cidr: string; reason: string; expiresAt?: string | null }) => Promise<DesktopResult<{ ban: AdminIpBan }>>;
    // Bans the address the account last signed in from and ends its sessions.
    // An operator knows who is causing trouble, not what their address is.
    banUserIp: (payload: { userId: string; reason: string; expiresAt?: string | null }) => Promise<DesktopResult<{ ban: AdminIpBan }>>;
    unbanIp: (payload: { cidr: string }) => Promise<DesktopResult<{ removed: boolean }>>;
    listInvites: () => Promise<DesktopResult<{ invites: AdminInviteCode[] }>>;
    createInvite: (payload: { code: string; maxUses?: number; expiresAt?: string | null }) => Promise<DesktopResult<{ invite: AdminInviteCode }>>;
    deleteInvite: (payload: { code: string }) => Promise<DesktopResult<{ removed: boolean }>>;
  };

}
export * from "./admin-ops-types";
