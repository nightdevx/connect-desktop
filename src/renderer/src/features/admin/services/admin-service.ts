import {
  AdminUserDetail,
  AdminUpdateUserRequest,
  AdminLobbySnapshot,
  AdminLobbyEvent,
  AdminStats,
} from "@shared/auth-contracts";

class AdminService {
  public async listUsers(params?: { search?: string; role?: string; status?: string }): Promise<{ users: AdminUserDetail[] }> {
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

  public async listLobbies(params?: { search?: string; locked?: string }): Promise<{ lobbies: AdminLobbySnapshot[] }> {
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

  public async kickUser(lobbyId: string, userId: string): Promise<{ kicked: boolean }> {
    const res = await window.desktopApi.adminKickUser(lobbyId, userId);
    if (!res.ok || !res.data) throw new Error(res.error?.message || "Kullanıcı odadan atılamadı");
    return res.data;
  }
}

export const adminService = new AdminService();
export default adminService;
