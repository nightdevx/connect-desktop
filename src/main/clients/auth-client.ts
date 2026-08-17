import type {
  AdminLobbyTimeout,
  AdminRuntimeSettings,
  AdminRuntimeSettingsPatch,
  AdminVoiceMute,
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
  PresenceStatus,
  FriendEntry,
  FriendRequestLists,
  PrivacySettings,
  UpdatePrivacyRequest,
} from "../../shared/auth-contracts";
import type { AdminEmoteLibrary } from "../../shared/desktop-api-types";
import type { BaseClient } from "./base-client";

export class AuthClient {
  public constructor(private readonly baseClient: BaseClient) {}

  public async register(payload: RegisterRequest): Promise<AuthResponse> {
    return this.baseClient.request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // blockedUsers names the rows so a block stays reversible: the directory is
  // friends-only, and blocking a non-friend would otherwise have no way back.
  // blockedUserIds stays for installed builds that only read it.
  public async listBlockedUsers(
    accessToken: string,
  ): Promise<{ blockedUserIds: string[]; blockedUsers?: FriendEntry[] }> {
    return this.baseClient.request<{
      blockedUserIds: string[];
      blockedUsers?: FriendEntry[];
    }>(
      "/auth/blocks",
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  // Exact match only — this is a user enumeration surface, not a search.
  public async lookupUserByUsername(
    accessToken: string,
    username: string,
  ): Promise<{ user: FriendEntry }> {
    return this.baseClient.request<{ user: FriendEntry }>(
      `/auth/users/lookup/${encodeURIComponent(username)}`,
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  // By id, for someone already on screen — a lobby roster row, a message
  // author. The directory is friends-only, so this is what supplies their
  // avatar and their real username.
  public async getUserCard(
    accessToken: string,
    userId: string,
  ): Promise<{ user: UserProfile }> {
    return this.baseClient.request<{ user: UserProfile }>(
      `/auth/users/${encodeURIComponent(userId)}/card`,
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  public async blockUser(
    accessToken: string,
    userId: string,
  ): Promise<{ blocked: boolean }> {
    return this.baseClient.request<{ blocked: boolean }>(
      `/auth/blocks/${encodeURIComponent(userId)}`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  public async unblockUser(
    accessToken: string,
    userId: string,
  ): Promise<{ unblocked: boolean }> {
    return this.baseClient.request<{ unblocked: boolean }>(
      `/auth/blocks/${encodeURIComponent(userId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  public async listFriends(
    accessToken: string,
  ): Promise<{ friendUserIds: string[] }> {
    return this.baseClient.request<{ friendUserIds: string[] }>(
      "/auth/friends",
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  public async listFriendRequests(
    accessToken: string,
  ): Promise<FriendRequestLists> {
    return this.baseClient.request<FriendRequestLists>(
      "/auth/friends/requests",
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  // By username, not id: the target is typed in, and the backend never reveals
  // an id the caller has not already seen.
  public async sendFriendRequest(
    accessToken: string,
    username: string,
  ): Promise<{ requested: boolean; accepted: boolean }> {
    return this.baseClient.request<{ requested: boolean; accepted: boolean }>(
      `/auth/friends/requests/${encodeURIComponent(username)}`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  public async acceptFriendRequest(
    accessToken: string,
    userId: string,
  ): Promise<{ accepted: boolean }> {
    return this.baseClient.request<{ accepted: boolean }>(
      `/auth/friends/${encodeURIComponent(userId)}/accept`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  // Unfriend, reject and cancel are all this one DELETE: the edge is the same
  // row whichever side asks for it to go.
  public async removeFriend(
    accessToken: string,
    userId: string,
  ): Promise<{ removed: boolean }> {
    return this.baseClient.request<{ removed: boolean }>(
      `/auth/friends/${encodeURIComponent(userId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  public async getPrivacySettings(
    accessToken: string,
  ): Promise<{ privacy: PrivacySettings }> {
    return this.baseClient.request<{ privacy: PrivacySettings }>(
      "/auth/privacy",
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  public async updatePrivacySettings(
    accessToken: string,
    payload: UpdatePrivacyRequest,
  ): Promise<{ privacy: PrivacySettings }> {
    return this.baseClient.request<{ privacy: PrivacySettings }>(
      "/auth/privacy",
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      },
    );
  }

  public async setPresence(
    accessToken: string,
    status: PresenceStatus,
  ): Promise<{ presence: PresenceStatus }> {
    return this.baseClient.request<{ presence: PresenceStatus }>(
      "/auth/presence",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ status }),
      },
    );
  }

  // Ends the session server-side. Without it, logging out only deleted the
  // local token file while the refresh token stayed valid for its full
  // lifetime, so a token copied off a shared machine kept working.
  public async logout(refreshToken: string): Promise<{ loggedOut: boolean }> {
    return this.baseClient.request<{ loggedOut: boolean }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
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

  // Refresh gets its own, much longer deadline than the 8s shared by the other
  // control-plane calls, because it is the one request where giving up early is
  // worse than waiting.
  //
  // Rotation is single-use: by the time the response is on its way back, the
  // server has already consumed this token and issued the replacement. Aborting
  // then does not cancel any of that — it just throws the new pair away while
  // the client keeps a token the server considers spent. The next call presents
  // it again, the server reads that as a stolen token being replayed, and every
  // session on the account is revoked. That is exactly what a desktop client
  // produces when it wakes from a long sleep and its first refresh crawls over
  // a network stack that is still coming up.
  public async refresh(refreshToken: string): Promise<AuthResponse> {
    return this.baseClient.request<AuthResponse>(
      "/auth/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      },
      30_000,
    );
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

  // Deactivates the account and schedules the purge. The server revokes every
  // session as part of it, so the caller must clear local state afterwards.
  public async deleteAccount(
    accessToken: string,
    password: string,
  ): Promise<{
    deletion: { pending: boolean; requestedAt?: string; scheduledAt?: string };
  }> {
    return this.baseClient.request<{
      deletion: { pending: boolean; requestedAt?: string; scheduledAt?: string };
    }>("/auth/account/delete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ password }),
    });
  }

  public async exportAccountData(accessToken: string): Promise<unknown> {
    return this.baseClient.request<unknown>("/auth/account/export", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
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
    params?: { search?: string; role?: string; status?: string; limit?: number; offset?: number }
  ): Promise<{ users: AdminUserDetail[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.search) query.append("search", params.search);
    if (params?.role && params.role !== "all") query.append("role", params.role);
    if (params?.status && params.status !== "all") query.append("status", params.status);
    if (params?.limit != null) query.append("limit", String(params.limit));
    if (params?.offset != null) query.append("offset", String(params.offset));

    const queryString = query.toString() ? `?${query.toString()}` : "";
    return this.baseClient.request<{ users: AdminUserDetail[]; total: number }>(`/admin/users${queryString}`, {
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

  // Moderation state that outlives the room it was applied in, and the settings
  // that used to need a redeploy. See internal/admin/moderation_handler.go.
  public async adminListVoiceMutes(accessToken: string): Promise<{ mutes: AdminVoiceMute[] }> {
    return this.baseClient.request<{ mutes: AdminVoiceMute[] }>("/admin/moderation/voice-mutes", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminSetVoiceMute(
    accessToken: string,
    userId: string,
    muted: boolean,
    durationSeconds?: number,
  ): Promise<{ muted: boolean }> {
    return this.baseClient.request<{ muted: boolean }>(
      `/admin/moderation/voice-mutes/${encodeURIComponent(userId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ muted, durationSeconds }),
      },
    );
  }

  public async adminListTimeouts(accessToken: string): Promise<{ timeouts: AdminLobbyTimeout[] }> {
    return this.baseClient.request<{ timeouts: AdminLobbyTimeout[] }>("/admin/moderation/timeouts", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminClearTimeout(
    accessToken: string,
    lobbyId: string,
    userId: string,
  ): Promise<{ cleared: boolean }> {
    return this.baseClient.request<{ cleared: boolean }>(
      `/admin/moderation/timeouts/${encodeURIComponent(lobbyId)}/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  public async adminGetSettings(accessToken: string): Promise<{ settings: AdminRuntimeSettings }> {
    return this.baseClient.request<{ settings: AdminRuntimeSettings }>("/admin/settings", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminUpdateSettings(
    accessToken: string,
    patch: AdminRuntimeSettingsPatch,
  ): Promise<{ settings: AdminRuntimeSettings }> {
    return this.baseClient.request<{ settings: AdminRuntimeSettings }>("/admin/settings", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    });
  }

  public async adminClearProfileMedia(
    accessToken: string,
    userId: string,
  ): Promise<{ user: AdminUserDetail }> {
    return this.baseClient.request<{ user: AdminUserDetail }>(
      `/admin/users/${userId}/clear-media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  public async adminSetEmailVerified(
    accessToken: string,
    userId: string,
    verified: boolean,
  ): Promise<{ user: AdminUserDetail }> {
    return this.baseClient.request<{ user: AdminUserDetail }>(
      `/admin/users/${userId}/email-verified`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ verified }),
      },
    );
  }

  public async adminCancelDeletion(
    accessToken: string,
    userId: string,
  ): Promise<{ cancelled: boolean }> {
    return this.baseClient.request<{ cancelled: boolean }>(
      `/admin/users/${userId}/cancel-deletion`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  public async adminListLobbies(
    accessToken: string,
    params?: { search?: string; locked?: string; limit?: number; offset?: number }
  ): Promise<{ lobbies: AdminLobbySnapshot[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.search) query.append("search", params.search);
    if (params?.locked && params.locked !== "all") query.append("locked", params.locked);
    if (params?.limit != null) query.append("limit", String(params.limit));
    if (params?.offset != null) query.append("offset", String(params.offset));

    const queryString = query.toString() ? `?${query.toString()}` : "";
    return this.baseClient.request<{ lobbies: AdminLobbySnapshot[]; total: number }>(`/admin/lobbies${queryString}`, {
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

  public async adminForceLogout(accessToken: string, userId: string): Promise<{ loggedOut: boolean }> {
    return this.baseClient.request<{ loggedOut: boolean }>(`/admin/users/${userId}/force-logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminListEmotes(accessToken: string): Promise<AdminEmoteLibrary> {
    return this.baseClient.request<AdminEmoteLibrary>("/admin/emotes", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  public async adminDeleteEmote(accessToken: string, emoteId: string): Promise<{ deleted: boolean }> {
    return this.baseClient.request<{ deleted: boolean }>(
      `/admin/emotes/${encodeURIComponent(emoteId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  // userId absent => the global default. quota null with a userId => clear that
  // user's override, which is not the same as setting it to zero.
  public async adminSetEmoteQuota(
    accessToken: string,
    payload: { userId?: string; quota: number | null },
  ): Promise<{ globalQuota: number; userQuotas: Record<string, number> }> {
    return this.baseClient.request<{ globalQuota: number; userQuotas: Record<string, number> }>(
      "/admin/emote-quota",
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      },
    );
  }
}
