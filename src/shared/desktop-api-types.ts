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
      type: "incoming-call" | "call-accepted" | "call-rejected" | "call-cancelled";
      callPayload: {
        type: string;
        callId: string;
        callerId: string;
        callerName: string;
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
    isLocked?: boolean;
    allowedUsers?: string[];
    password?: string;
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
  kickLobbyMember: (payload: {
    lobbyId: string;
    userId: string;
  }) => Promise<DesktopResult<{ kicked: boolean }>>;
  muteLobbyMember: (payload: {
    lobbyId: string;
    userId: string;
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
  adminListUsers: (params?: { search?: string; role?: string; status?: string }) => Promise<DesktopResult<{ users: AdminUserDetail[] }>>;
  adminGetUser: (userId: string) => Promise<DesktopResult<{ user: AdminUserDetail }>>;
  adminUpdateUser: (userId: string, payload: AdminUpdateUserRequest) => Promise<DesktopResult<{ user: AdminUserDetail }>>;
  adminResetPassword: (userId: string, newPassword: string) => Promise<DesktopResult<{ reset: boolean }>>;
  adminDeleteUser: (userId: string) => Promise<DesktopResult<{ deleted: boolean }>>;
  adminBanUser: (userId: string) => Promise<DesktopResult<{ banned: boolean }>>;
  adminUnbanUser: (userId: string) => Promise<DesktopResult<{ unbanned: boolean }>>;
  adminListLobbies: (params?: { search?: string; locked?: string }) => Promise<DesktopResult<{ lobbies: AdminLobbySnapshot[] }>>;
  adminListLobbyEvents: (payload: { limit?: number; offset?: number; lobbyId?: string; userId?: string; eventType?: string; search?: string }) => Promise<DesktopResult<{ events: AdminLobbyEvent[]; total: number }>>;
  adminGetStats: (payload?: any) => Promise<DesktopResult<{ stats: AdminStats }>>;
  adminKickUser: (lobbyId: string, userId: string) => Promise<DesktopResult<{ kicked: boolean }>>;
}
