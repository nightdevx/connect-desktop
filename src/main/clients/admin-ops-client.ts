import type { BaseClient } from "./base-client";

type Query = Record<string, string | number | boolean | undefined | null>;

const queryString = (params?: Query): string => {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.append(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
};

export class AdminOpsClient {
  public constructor(private readonly baseClient: BaseClient) {}

  private call<T>(
    accessToken: string,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return this.baseClient.request<T>(path, init);
  }

  public listSessions(token: string, userId: string) {
    return this.call<{ sessions: unknown[] }>(token, "GET", `/admin/users/${encodeURIComponent(userId)}/sessions`);
  }

  public revokeSession(token: string, userId: string, sessionId: string) {
    return this.call<{ revoked: boolean }>(
      token,
      "DELETE",
      `/admin/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
    );
  }

  public relations(token: string, userId: string) {
    return this.call<{ relations: unknown }>(token, "GET", `/admin/users/${encodeURIComponent(userId)}/relations`);
  }

  public removeFriend(token: string, userId: string, peerId: string) {
    return this.call<{ removed: boolean }>(
      token,
      "DELETE",
      `/admin/users/${encodeURIComponent(userId)}/friends/${encodeURIComponent(peerId)}`,
    );
  }

  public setBlock(token: string, userId: string, peerId: string, blocked: boolean) {
    return this.call<{ blocked: boolean }>(
      token,
      blocked ? "POST" : "DELETE",
      `/admin/users/${encodeURIComponent(userId)}/blocks/${encodeURIComponent(peerId)}`,
    );
  }

  public sendPasswordReset(token: string, userId: string) {
    return this.call<{ sent: boolean }>(token, "POST", `/admin/users/${encodeURIComponent(userId)}/send-password-reset`);
  }

  public sendVerification(token: string, userId: string) {
    return this.call<{ sent: boolean }>(token, "POST", `/admin/users/${encodeURIComponent(userId)}/send-verification`);
  }

  public banUser(token: string, userId: string, body: { reason: string; until?: string | null }) {
    return this.call<{ banned: boolean }>(token, "POST", `/admin/users/${encodeURIComponent(userId)}/ban`, body);
  }

  public setDeletion(token: string, userId: string, body: { cancel?: boolean; requestedAt?: string; reason?: string }) {
    return this.call<{ scheduled: boolean }>(token, "PATCH", `/admin/users/${encodeURIComponent(userId)}/deletion`, body);
  }

  public listAudit(token: string, params?: Query) {
    return this.call<{ entries: unknown[]; total: number }>(token, "GET", `/admin/audit${queryString(params)}`);
  }

  public searchChat(token: string, params?: Query) {
    return this.call<{ messages: unknown[]; total: number }>(token, "GET", `/admin/chat/messages${queryString(params)}`);
  }

  public deleteChatMessage(token: string, messageId: string, reason: string) {
    return this.call<{ deleted: boolean }>(token, "DELETE", `/admin/chat/messages/${encodeURIComponent(messageId)}`, { reason });
  }

  public redactChatMessage(token: string, messageId: string, reason: string) {
    return this.call<{ message: unknown }>(token, "POST", `/admin/chat/messages/${encodeURIComponent(messageId)}/redact`, { reason });
  }

  public purgeChat(token: string, params: Query) {
    return this.call<{ deleted: number; matched: number }>(token, "DELETE", `/admin/chat/messages${queryString(params)}`);
  }

  public removeChatReaction(token: string, messageId: string, emoji: string) {
    return this.call<{ message: unknown }>(
      token,
      "DELETE",
      `/admin/chat/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
    );
  }

  public listAttachments(token: string, params?: Query) {
    return this.call<{ attachments: unknown[]; total: number; stats: unknown }>(
      token,
      "GET",
      `/admin/chat/attachments${queryString(params)}`,
    );
  }

  public deleteAttachment(token: string, attachmentId: string, reason: string) {
    return this.call<{ deleted: boolean }>(token, "DELETE", `/admin/chat/attachments/${encodeURIComponent(attachmentId)}`, { reason });
  }

  public listReports(token: string, params?: Query) {
    return this.call<{ reports: unknown[]; total: number }>(token, "GET", `/admin/chat/reports${queryString(params)}`);
  }

  public updateReport(token: string, reportId: string, body: { status: string; reason?: string }) {
    return this.call<{ updated: boolean }>(token, "PATCH", `/admin/chat/reports/${encodeURIComponent(reportId)}`, body);
  }

  public lobbyFeatures(token: string) {
    return this.call<{ features: unknown[] }>(token, "GET", "/admin/lobby-features");
  }

  public createLobby(token: string, body: { name: string; isTextOnly?: boolean; capacity?: number }) {
    return this.call<{ lobby: unknown }>(token, "POST", "/admin/lobbies", body);
  }

  public deleteLobby(token: string, lobbyId: string, reason: string) {
    return this.call<{ deleted: boolean }>(token, "DELETE", `/admin/lobbies/${encodeURIComponent(lobbyId)}`, { reason });
  }

  public transferLobby(token: string, lobbyId: string, userId: string) {
    return this.call<{ lobby: unknown }>(
      token,
      "POST",
      `/admin/lobbies/${encodeURIComponent(lobbyId)}/transfer/${encodeURIComponent(userId)}`,
    );
  }

  public moveMember(token: string, lobbyId: string, userId: string) {
    return this.call<{ moved: boolean }>(
      token,
      "POST",
      `/admin/lobbies/${encodeURIComponent(lobbyId)}/move/${encodeURIComponent(userId)}`,
    );
  }

  public announce(token: string, body: { body: string }, lobbyId?: string) {
    const path = lobbyId ? `/admin/lobbies/${encodeURIComponent(lobbyId)}/announce` : "/admin/announce";
    return this.call<{ delivered: number }>(token, "POST", path, body);
  }

  public disconnectMedia(token: string, userId: string) {
    return this.call<{ disconnected: boolean }>(token, "POST", `/admin/users/${encodeURIComponent(userId)}/disconnect-media`);
  }

  public forceTrackOff(token: string, userId: string, body: { kind: string; reason?: string }) {
    return this.call<{ stopped: boolean }>(token, "POST", `/admin/users/${encodeURIComponent(userId)}/force-track-off`, body);
  }

  public liveMedia(token: string) {
    return this.call<{ publishers: unknown[] }>(token, "GET", "/admin/media/live");
  }

  public closeTable(token: string, tableId: string) {
    return this.call<{ closed: boolean }>(token, "POST", `/admin/minigames/tables/${encodeURIComponent(tableId)}/close`);
  }

  public removeTablePlayer(token: string, tableId: string, userId: string) {
    return this.call<{ removed: boolean }>(
      token,
      "POST",
      `/admin/minigames/tables/${encodeURIComponent(tableId)}/kick/${encodeURIComponent(userId)}`,
    );
  }

  public deleteScore(token: string, game: string, userId: string) {
    return this.call<{ deleted: boolean }>(
      token,
      "DELETE",
      `/admin/minigames/scores/${encodeURIComponent(game)}/${encodeURIComponent(userId)}`,
    );
  }

  public resetLeaderboard(token: string, game: string, reason: string) {
    return this.call<{ removed: number }>(token, "DELETE", `/admin/minigames/scores/${encodeURIComponent(game)}`, { reason });
  }

  public musicQueue(token: string, lobbyId: string) {
    return this.call<{ state: unknown }>(token, "GET", `/admin/music/lobbies/${encodeURIComponent(lobbyId)}/queue`);
  }

  public clearMusicQueue(token: string, lobbyId: string) {
    return this.call<{ state: unknown; reply: string }>(token, "DELETE", `/admin/music/lobbies/${encodeURIComponent(lobbyId)}/queue`);
  }

  public removeMusicTrack(token: string, lobbyId: string, index: number) {
    return this.call<{ state: unknown; reply: string }>(
      token,
      "DELETE",
      `/admin/music/lobbies/${encodeURIComponent(lobbyId)}/queue/${index}`,
    );
  }

  public renameEmote(token: string, emoteId: string, name: string) {
    return this.call<{ emote: unknown }>(token, "PATCH", `/admin/emotes/${encodeURIComponent(emoteId)}`, { name });
  }

  public uploadEmote(token: string, body: { name: string; dataUrl: string }) {
    return this.call<{ emote: unknown }>(token, "POST", "/admin/emotes", body);
  }

  public listIpBans(token: string) {
    return this.call<{ bans: unknown[] }>(token, "GET", "/admin/network/ip-bans");
  }

  public banIp(token: string, body: { cidr: string; reason: string; expiresAt?: string | null }) {
    return this.call<{ ban: unknown }>(token, "POST", "/admin/network/ip-bans", body);
  }

  public unbanIp(token: string, cidr: string) {
    return this.call<{ removed: boolean }>(token, "DELETE", `/admin/network/ip-bans/${encodeURIComponent(cidr)}`);
  }

  public listInvites(token: string) {
    return this.call<{ invites: unknown[] }>(token, "GET", "/admin/invites");
  }

  public createInvite(token: string, body: { code: string; maxUses?: number; expiresAt?: string | null }) {
    return this.call<{ invite: unknown }>(token, "POST", "/admin/invites", body);
  }

  public deleteInvite(token: string, code: string) {
    return this.call<{ removed: boolean }>(token, "DELETE", `/admin/invites/${encodeURIComponent(code)}`);
  }
}
