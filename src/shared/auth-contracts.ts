export type UserRole = "admin" | "member";

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  role: UserRole;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  inviteCode?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UserSettingsProfile {
  displayName: string;
  email: string | null;
  emailVerified?: boolean;
  bio: string | null;
  avatarUrl: string | null;
  updatedAt: string;
}

export interface UpdateProfileRequest {
  displayName: string;
  email?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface SendVerificationOTPRequest {
  email: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: AuthTokens;
}

// What the user is telling other people, as opposed to appOnline, which is
// merely whether a socket exists. "offline" is derived, never chosen.
export type PresenceStatus = "online" | "idle" | "dnd" | "offline";
export type SelectablePresenceStatus = Exclude<PresenceStatus, "offline">;

export interface UserDirectoryEntry {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  role: UserRole;
  createdAt: string;
  appOnline?: boolean;
  presence?: PresenceStatus;
}

export interface LobbyDescriptor {
  id: string;
  name: string;
  room: string;
  createdAt: string;
  createdBy: string;
  createdByUsername?: string;
  memberCount: number;
  isLocked?: boolean;
  allowedUsers?: string;
  hasPassword?: boolean;
}

// The quoted message shown above a reply. Denormalised by the server so a
// reply still renders after the original scrolls out of the loaded page.
export interface ChatReplyPreview {
  id: string;
  userId?: string;
  username?: string;
  body?: string;
  // True when the quoted message has since been deleted.
  deleted?: boolean;
}

// Metadata only. Bytes come from getChatAttachment, which returns a data URL.
export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  isImage: boolean;
}

// userIds rather than a "mine" flag: the same payload is broadcast to every
// client, so the viewer-relative answer has to be derived on the client.
export interface ChatReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ChatMessage {
  id: string;
  channel: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
  // Set once the author has edited it; rendered as a "(düzenlendi)" marker.
  editedAt?: string;
  replyTo?: ChatReplyPreview | null;
  attachment?: ChatAttachment | null;
  reactions?: ChatReaction[];
  // Marks a re-publish of an existing message (edit or reaction) so the client
  // replaces by id instead of appending.
  updated?: boolean;
}

export interface AdminUserDetail {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  bio: string | null;
  avatarUrl: string | null;
  role: UserRole;
  bannedAt: string | null;
  // Non-null while the account is inside its self-service deletion window.
  deletionScheduledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUpdateUserRequest {
  displayName?: string;
  email?: string | null;
  bio?: string | null;
  role?: UserRole;
}

export interface AdminLobbyMember {
  userId: string;
  username: string;
  joinedAt: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
}

export interface AdminLobbySnapshot {
  lobby: LobbyDescriptor;
  members: AdminLobbyMember[];
  size: number;
  revision: number;
}

export interface AdminLobbyEvent {
  id: number;
  eventType: "join" | "leave";
  lobbyId: string;
  lobbyName: string;
  userId: string;
  username: string;
  occurredAt: string;
}

export interface AdminStats {
  totalUsers: number;
  onlineUsers: number;
  totalLobbies: number;
  activeMembers: number;
  todayEvents: number;
  dbStatus?: string;
  liveKitStatus?: string;
  apiUrl?: string;
  envMode?: string;
  liveKitUrl?: string;
  activityTrend?: number[];
}
