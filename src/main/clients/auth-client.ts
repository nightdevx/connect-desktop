import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserDirectoryEntry,
  UserProfile,
  UserSettingsProfile,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  SendVerificationOTPRequest,
  VerifyEmailRequest,
  AdminUserDetail,
  AdminUpdateUserRequest,
  AdminLobbySnapshot,
  AdminLobbyEvent,
  AdminStats,
} from "../../shared/auth-contracts";
import type { BaseClient } from "./base-client";

export class AuthClient {
  public constructor(private readonly baseClient: BaseClient) {}

  public async register(payload: RegisterRequest): Promise<AuthResponse> {
    return this.baseClient.request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async forgotPassword(
    payload: ForgotPasswordRequest,
  ): Promise<{ sent: boolean }> {
    return this.baseClient.request<{ sent: boolean }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async resetPassword(
    payload: ResetPasswordRequest,
  ): Promise<{ reset: boolean }> {
    return this.baseClient.request<{ reset: boolean }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async sendVerificationOTP(
    accessToken: string,
    payload: SendVerificationOTPRequest,
  ): Promise<{ sent: boolean }> {
    return this.baseClient.request<{ sent: boolean }>("/auth/send-verification-otp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  public async verifyEmail(
    accessToken: string,
    payload: VerifyEmailRequest,
  ): Promise<{ verified: boolean }> {
    return this.baseClient.request<{ verified: boolean }>("/auth/verify-email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  public async login(payload: LoginRequest): Promise<AuthResponse> {
    return this.baseClient.request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async refresh(refreshToken: string): Promise<AuthResponse> {
    return this.baseClient.request<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  public async changePassword(
    accessToken: string,
    payload: ChangePasswordRequest,
  ): Promise<{ changed: boolean }> {
    return this.baseClient.request<{ changed: boolean }>("/auth/change-password", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  public async getMe(accessToken: string): Promise<{ user: UserProfile }> {
    return this.baseClient.request<{ user: UserProfile }>("/auth/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async getSettingsProfile(
    accessToken: string,
  ): Promise<{ profile: UserSettingsProfile }> {
    return this.baseClient.request<{ profile: UserSettingsProfile }>("/auth/profile", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async updateSettingsProfile(
    accessToken: string,
    payload: UpdateProfileRequest,
  ): Promise<{ profile: UserSettingsProfile }> {
    return this.baseClient.request<{ profile: UserSettingsProfile }>("/auth/profile", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  public async getRegisteredUsers(
    accessToken: string,
  ): Promise<{ users: UserDirectoryEntry[] }> {
    return this.baseClient.request<{ users: UserDirectoryEntry[] }>("/auth/users", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async adminListUsers(
    accessToken: string,
    params?: { search?: string; role?: string; status?: string }
  ): Promise<{ users: AdminUserDetail[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.append("search", params.search);
    if (params?.role && params.role !== "all") query.append("role", params.role);
    if (params?.status && params.status !== "all") query.append("status", params.status);

    const queryString = query.toString() ? `?${query.toString()}` : "";
    return this.baseClient.request<{ users: AdminUserDetail[] }>(`/admin/users${queryString}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminGetUser(accessToken: string, userId: string): Promise<{ user: AdminUserDetail }> {
    return this.baseClient.request<{ user: AdminUserDetail }>(`/admin/users/${userId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminUpdateUser(
    accessToken: string,
    userId: string,
    payload: AdminUpdateUserRequest,
  ): Promise<{ user: AdminUserDetail }> {
    return this.baseClient.request<{ user: AdminUserDetail }>(`/admin/users/${userId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  public async adminResetPassword(
    accessToken: string,
    userId: string,
    payload: { newPassword: string },
  ): Promise<{ reset: boolean }> {
    return this.baseClient.request<{ reset: boolean }>(`/admin/users/${userId}/reset-password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  public async adminDeleteUser(accessToken: string, userId: string): Promise<{ deleted: boolean }> {
    return this.baseClient.request<{ deleted: boolean }>(`/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminBanUser(accessToken: string, userId: string): Promise<{ banned: boolean }> {
    return this.baseClient.request<{ banned: boolean }>(`/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminUnbanUser(accessToken: string, userId: string): Promise<{ unbanned: boolean }> {
    return this.baseClient.request<{ unbanned: boolean }>(`/admin/users/${userId}/unban`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminListLobbies(
    accessToken: string,
    params?: { search?: string; locked?: string }
  ): Promise<{ lobbies: AdminLobbySnapshot[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.append("search", params.search);
    if (params?.locked && params.locked !== "all") query.append("locked", params.locked);

    const queryString = query.toString() ? `?${query.toString()}` : "";
    return this.baseClient.request<{ lobbies: AdminLobbySnapshot[] }>(`/admin/lobbies${queryString}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminListLobbyEvents(
    accessToken: string,
    params: { limit?: number; offset?: number; lobbyId?: string; userId?: string; eventType?: string; search?: string },
  ): Promise<{ events: AdminLobbyEvent[]; total: number }> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    if (params.lobbyId) query.set("lobbyId", params.lobbyId);
    if (params.userId) query.set("userId", params.userId);
    if (params.eventType && params.eventType !== "all") query.set("eventType", params.eventType);
    if (params.search) query.set("search", params.search);

    const queryString = query.toString();
    const url = `/admin/lobby-events${queryString ? `?${queryString}` : ""}`;

    return this.baseClient.request<{ events: AdminLobbyEvent[]; total: number }>(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminGetStats(accessToken: string): Promise<{ stats: AdminStats }> {
    return this.baseClient.request<{ stats: AdminStats }>("/admin/stats", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminKickUser(accessToken: string, lobbyId: string, userId: string): Promise<{ kicked: boolean }> {
    return this.baseClient.request<{ kicked: boolean }>(`/admin/lobbies/${lobbyId}/kick/${userId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}
