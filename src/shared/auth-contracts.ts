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

export interface RegisterRequest extends LoginRequest {
  inviteCode?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UserSettingsProfile {
  displayName: string;
  email: string | null;
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
  memberCount: number;
}

export interface ChatMessage {
  id: string;
  channel: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
}
