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

export interface UserDirectoryEntry {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  role: UserRole;
  createdAt: string;
  appOnline?: boolean;
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
}

export interface ChatMessage {
  id: string;
  channel: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
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
