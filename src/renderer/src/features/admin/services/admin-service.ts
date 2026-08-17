import {
  AdminUserDetail,
  AdminUpdateUserRequest,
  AdminLobbySnapshot,
  AdminLobbyEvent,
  AdminStats,
} from "@shared/auth-contracts";
import { AdminEmoteLibrary } from "@shared/desktop-api-types";

class AdminService {
  public async listUsers(params?: { search?: string; role?: string; status?: string; limit?: number; offset?: number }): Promise<{ users: AdminUserDetail[]; total: number }> {
    const res = await window.desktopApi.adminListUsers(params);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Kullanıcılar yüklenemedi");
    return res.data;
  }

  public async getUser(userId: string): Promise<{ user: AdminUserDetail }> {
    const res = await window.desktopApi.adminGetUser(userId);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Kullanıcı yüklenemedi");
    return res.data;
  }

  public async updateUser(userId: string, payload: AdminUpdateUserRequest): Promise<{ user: AdminUserDetail }> {
    const res = await window.desktopApi.adminUpdateUser(userId, payload);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Kullanıcı güncellenemedi");
    return res.data;
  }

  public async resetPassword(userId: string, newPassword: string): Promise<{ reset: boolean }> {
    const res = await window.desktopApi.adminResetPassword(userId, newPassword);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Şifre sıfırlanamadı");
    return res.data;
  }

  public async deleteUser(userId: string): Promise<{ deleted: boolean }> {
    const res = await window.desktopApi.adminDeleteUser(userId);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Kullanıcı silinemedi");
    return res.data;
  }

  public async banUser(userId: string): Promise<{ banned: boolean }> {
    const res = await window.desktopApi.adminBanUser(userId);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Kullanıcı yasaklanamadı");
    return res.data;
  }

  public async unbanUser(userId: string): Promise<{ unbanned: boolean }> {
    const res = await window.desktopApi.adminUnbanUser(userId);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Kullanıcı yasağı kaldırılamadı");
    return res.data;
  }

  public async listLobbies(params?: { search?: string; locked?: string; limit?: number; offset?: number }): Promise<{ lobbies: AdminLobbySnapshot[]; total: number }> {
    const res = await window.desktopApi.adminListLobbies(params);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Lobiler yüklenemedi");
    return res.data;
  }

  public async listLobbyEvents(params: {
    limit?: number;
    offset?: number;
    lobbyId?: string;
    userId?: string;
    eventType?: string;
    search?: string;
  }): Promise<{ events: AdminLobbyEvent[]; total: number }> {
    const res = await window.desktopApi.adminListLobbyEvents(params);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Aktivite geçmişi yüklenemedi");
    return res.data;
  }

  public async getStats(): Promise<{ stats: AdminStats }> {
    const res = await window.desktopApi.adminGetStats();
    if (!res.ok || !res.data) throw new Error(res.error?.message || "İstatistikler yüklenemedi");
    return res.data;
  }

  public async forceLogout(userId: string): Promise<{ loggedOut: boolean }> {
    const res = await window.desktopApi.adminForceLogout(userId);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Oturumlar sonlandırılamadı");
    return res.data;
  }

  public async listEmotes(): Promise<AdminEmoteLibrary> {
    const res = await window.desktopApi.adminListEmotes();
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Sesler yüklenemedi");
    return res.data;
  }

  public async deleteEmote(emoteId: string): Promise<{ deleted: boolean }> {
    const res = await window.desktopApi.adminDeleteEmote(emoteId);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Ses silinemedi");
    return res.data;
  }

  // userId absent => the global default. quota null with a userId clears that
  // user's override, which is not the same as setting it to zero.
  public async setEmoteQuota(payload: { userId?: string; quota: number | null }): Promise<{
    globalQuota: number;
    userQuotas: Record<string, number>;
  }> {
    const res = await window.desktopApi.adminSetEmoteQuota(payload);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Limit güncellenemedi");
    return res.data;
  }

  public async kickUser(lobbyId: string, userId: string): Promise<{ kicked: boolean }> {
    const res = await window.desktopApi.adminKickUser(lobbyId, userId);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Kullanıcı odadan atılamadı");
    return res.data;
  }
}

export const adminService = new AdminService();
export default adminService;
