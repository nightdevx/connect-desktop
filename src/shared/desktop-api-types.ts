import type {
  ChatMessage,
  ChangePasswordRequest,
  LobbyDescriptor,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserDirectoryEntry,
  UserProfile,
  UserSettingsProfile,
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

export interface LobbyStateMember {
  userId: string;
  username: string;
  joinedAt: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
}

export interface ScreenCaptureSourceDescriptor {
  id: string;
  name: string;
  kind: "screen" | "window";
  displayId: string | null;
}

export interface LiveKitMediaPolicy {
  qualityProfile: string;
  preferredVideoCodec: string;
  backupVideoCodec: string;
  cameraMaxBitrate: number;
  cameraMaxFps: number;
  screenMaxBitrate: number;
  screenMaxFps: number;
  simulcast: boolean;
  dynacast: boolean;
}

export interface LiveKitTokenPayload {
  serverUrl: string;
  room: string;
  identity: string;
  name: string;
  token: string;
  expiresAt: string;
  mediaPolicy: LiveKitMediaPolicy;
}

export interface LobbyRealtimeSnapshot {
  id: string;
  name: string;
  room: string;
  createdAt: string;
  createdBy: string;
  memberCount: number;
  members: LobbyStateMember[];
  size: number;
  revision: number;
}

export type LobbyStreamEvent =
  | {
      type: "lobbies-snapshot";
      lobbies: LobbyRealtimeSnapshot[];
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

export type DirectMessagesStreamEvent =
  | {
      type: "direct-chat-history";
      peerUserId: string;
      messages: ChatMessage[];
      at?: string;
    }
  | {
      type: "direct-chat-message";
      peerUserId: string;
      message: ChatMessage;
      at?: string;
    }
  | {
      type: "system-error";
      peerUserId: string;
      code: string;
      message: string;
      at?: string;
    }
  | {
      type: "stream-status";
      peerUserId: string;
      status: "connected" | "closed";
      detail?: string;
      at?: string;
    };

export type UserDirectoryStreamEvent =
  | {
      type: "user-profile-updated";
      user: {
        userId: string;
        displayName: string;
        avatarUrl?: string | null;
        updatedAt: string;
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
  logout: () => Promise<DesktopResult<SessionSnapshot>>;
  getSession: () => Promise<DesktopResult<SessionSnapshot>>;
  getAuthProfile: () => Promise<
    DesktopResult<{ profile: UserSettingsProfile }>
  >;
  updateAuthProfile: (
    payload: UpdateProfileRequest,
  ) => Promise<DesktopResult<{ profile: UserSettingsProfile }>>;
  getRegisteredUsers: () => Promise<
    DesktopResult<{ users: UserDirectoryEntry[] }>
  >;
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
  }) => Promise<DesktopResult<{ lobby: LobbyDescriptor }>>;
  updateLobby: (payload: {
    lobbyId: string;
    name: string;
  }) => Promise<DesktopResult<{ lobby: LobbyDescriptor }>>;
  deleteLobby: (payload: {
    lobbyId: string;
  }) => Promise<DesktopResult<{ deleted: boolean; lobbyId: string }>>;
  joinLobby: (payload: {
    lobbyId: string;
  }) => Promise<DesktopResult<{ accepted: boolean; lobbyId: string }>>;
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
  createLiveKitToken: (payload?: {
    room?: string;
  }) => Promise<DesktopResult<LiveKitTokenPayload>>;
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
    body: string;
  }) => Promise<DesktopResult<{ message: ChatMessage }>>;
  deleteLobbyMessage: (payload: {
    messageId: string;
  }) => Promise<DesktopResult<{ deleted: boolean; messageId: string }>>;
  listDirectMessages: (payload: {
    peerUserId: string;
    limit?: number;
  }) => Promise<DesktopResult<{ messages: ChatMessage[] }>>;
  sendDirectMessage: (payload: {
    peerUserId: string;
    body: string;
  }) => Promise<DesktopResult<{ message: ChatMessage }>>;
  startDirectMessagesStream: (payload: {
    peerUserId: string;
  }) => Promise<DesktopResult<{ started: boolean; peerUserId: string }>>;
  stopDirectMessagesStream: (payload?: {
    peerUserId?: string;
  }) => Promise<DesktopResult<{ stopped: boolean; peerUserId: string | null }>>;
  onDirectMessagesEvent: (
    listener: (event: DirectMessagesStreamEvent) => void,
  ) => () => void;
  minimizeWindow: () => Promise<DesktopResult<{ minimized: boolean }>>;
  toggleMaximizeWindow: () => Promise<DesktopResult<{ isMaximized: boolean }>>;
  closeWindow: () => Promise<DesktopResult<{ closed: boolean }>>;
  setWindowAttention: (payload: {
    enabled: boolean;
  }) => Promise<DesktopResult<{ attention: boolean }>>;
  getWindowState: () => Promise<DesktopResult<DesktopWindowState>>;
  onWindowStateChanged: (
    listener: (state: DesktopWindowState) => void,
  ) => () => void;
}
