import { ipcMain } from "electron";
import { z } from "zod";

import { backendClient, fail, ok, withAccessToken } from "../context";

const userId = z.string().min(1).max(128);
const reason = z.string().min(3).max(280);
const optionalReason = z.string().max(280).optional();
const isoDate = z.string().datetime().optional().nullable();

const schemas = {
  sessions: z.object({ userId }),
  revokeSession: z.object({ userId, sessionId: z.string().min(1).max(64) }),
  relations: z.object({ userId }),
  peer: z.object({ userId, peerId: z.string().min(1).max(128) }),
  setBlock: z.object({ userId, peerId: z.string().min(1).max(128), blocked: z.boolean() }),
  ban: z.object({ userId, reason, until: isoDate }),
  deletion: z.object({ userId, cancel: z.boolean().optional(), requestedAt: isoDate, reason: optionalReason }),
  audit: z.object({
    actorId: z.string().max(128).optional(),
    targetType: z.string().max(32).optional(),
    targetId: z.string().max(128).optional(),
    action: z.string().max(64).optional(),
    search: z.string().max(128).optional(),
    since: z.string().max(40).optional(),
    until: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  chatSearch: z.object({
    lobbyId: z.string().max(128).optional(),
    channel: z.string().max(160).optional(),
    userId: z.string().max(128).optional(),
    q: z.string().max(160).optional(),
    before: z.string().max(40).optional(),
    after: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  messageAction: z.object({ messageId: z.string().min(1).max(128), reason }),
  purge: z.object({
    userId: z.string().max(128).optional(),
    lobbyId: z.string().max(128).optional(),
    channel: z.string().max(160).optional(),
    before: z.string().max(40).optional(),
    after: z.string().max(40).optional(),
    reason: optionalReason,
    dryRun: z.boolean().optional(),
  }),
  reaction: z.object({ messageId: z.string().min(1).max(128), emoji: z.string().min(1).max(32) }),
  attachments: z.object({ limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional() }),
  attachmentAction: z.object({ attachmentId: z.string().min(1).max(128), reason }),
  reports: z.object({
    status: z.enum(["open", "resolved", "rejected"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  updateReport: z.object({
    reportId: z.string().min(1).max(128),
    status: z.enum(["open", "resolved", "rejected"]),
    reason: optionalReason,
  }),
  createLobby: z.object({
    name: z.string().min(2).max(64),
    isTextOnly: z.boolean().optional(),
    capacity: z.number().int().min(0).max(100).optional(),
  }),
  lobbyAction: z.object({ lobbyId: z.string().min(1).max(128), reason }),
  lobbyUser: z.object({ lobbyId: z.string().min(1).max(128), userId }),
  announce: z.object({ lobbyId: z.string().max(128).optional(), body: z.string().min(1).max(2000) }),
  trackOff: z.object({ userId, kind: z.enum(["camera", "screen", "microphone"]), reason: optionalReason }),
  table: z.object({ tableId: z.string().min(1).max(128) }),
  tablePlayer: z.object({ tableId: z.string().min(1).max(128), userId }),
  score: z.object({ game: z.string().min(1).max(64), userId }),
  leaderboard: z.object({ game: z.string().min(1).max(64), reason }),
  lobbyOnly: z.object({ lobbyId: z.string().min(1).max(128) }),
  musicTrack: z.object({ lobbyId: z.string().min(1).max(128), index: z.number().int().min(1).max(500) }),
  renameEmote: z.object({ emoteId: z.string().min(1).max(128), name: z.string().min(1).max(48) }),
  uploadEmote: z.object({ name: z.string().min(1).max(48), dataUrl: z.string().min(16).max(2_000_000) }),
  banIp: z.object({ cidr: z.string().min(3).max(64), reason, expiresAt: isoDate }),
  cidr: z.object({ cidr: z.string().min(3).max(64) }),
  createInvite: z.object({
    code: z.string().min(3).max(64),
    maxUses: z.number().int().min(1).max(10_000).optional(),
    expiresAt: isoDate,
  }),
  inviteCode: z.object({ code: z.string().min(3).max(64) }),
};

export function registerAdminOpsHandlers(): void {
  const bind = <S extends z.ZodTypeAny>(
    schema: S,
    run: (parsed: z.infer<S>, token: string) => Promise<unknown>,
  ) => async (_event: unknown, payload: unknown) => {
    try {
      const parsed = schema.parse(payload ?? {});
      const result = await withAccessToken((token) => run(parsed, token));
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  };

  const ops = () => backendClient.adminOps;

  ipcMain.handle("desktop:admin-user-sessions", bind(schemas.sessions, (p, t) => ops().listSessions(t, p.userId)));
  ipcMain.handle("desktop:admin-revoke-session", bind(schemas.revokeSession, (p, t) => ops().revokeSession(t, p.userId, p.sessionId)));
  ipcMain.handle("desktop:admin-user-relations", bind(schemas.relations, (p, t) => ops().relations(t, p.userId)));
  ipcMain.handle("desktop:admin-remove-friend", bind(schemas.peer, (p, t) => ops().removeFriend(t, p.userId, p.peerId)));
  ipcMain.handle("desktop:admin-set-block", bind(schemas.setBlock, (p, t) => ops().setBlock(t, p.userId, p.peerId, p.blocked)));
  ipcMain.handle("desktop:admin-send-password-reset", bind(schemas.sessions, (p, t) => ops().sendPasswordReset(t, p.userId)));
  ipcMain.handle("desktop:admin-send-verification", bind(schemas.sessions, (p, t) => ops().sendVerification(t, p.userId)));
  ipcMain.handle("desktop:admin-ban-user-detailed", bind(schemas.ban, (p, t) => ops().banUser(t, p.userId, { reason: p.reason, until: p.until ?? null })));
  ipcMain.handle("desktop:admin-set-deletion", bind(schemas.deletion, (p, t) => ops().setDeletion(t, p.userId, { cancel: p.cancel, requestedAt: p.requestedAt ?? undefined, reason: p.reason })));

  ipcMain.handle("desktop:admin-list-audit", bind(schemas.audit, (p, t) => ops().listAudit(t, p)));

  ipcMain.handle("desktop:admin-search-chat", bind(schemas.chatSearch, (p, t) => ops().searchChat(t, p)));
  ipcMain.handle("desktop:admin-delete-chat-message", bind(schemas.messageAction, (p, t) => ops().deleteChatMessage(t, p.messageId, p.reason)));
  ipcMain.handle("desktop:admin-redact-chat-message", bind(schemas.messageAction, (p, t) => ops().redactChatMessage(t, p.messageId, p.reason)));
  ipcMain.handle("desktop:admin-purge-chat", bind(schemas.purge, (p, t) => ops().purgeChat(t, {
    userId: p.userId,
    lobbyId: p.lobbyId,
    channel: p.channel,
    before: p.before,
    after: p.after,
    reason: p.reason,
    dryRun: p.dryRun ? "1" : undefined,
  })));
  ipcMain.handle("desktop:admin-remove-chat-reaction", bind(schemas.reaction, (p, t) => ops().removeChatReaction(t, p.messageId, p.emoji)));
  ipcMain.handle("desktop:admin-list-attachments", bind(schemas.attachments, (p, t) => ops().listAttachments(t, p)));
  ipcMain.handle("desktop:admin-delete-attachment", bind(schemas.attachmentAction, (p, t) => ops().deleteAttachment(t, p.attachmentId, p.reason)));
  ipcMain.handle("desktop:admin-list-reports", bind(schemas.reports, (p, t) => ops().listReports(t, p)));
  ipcMain.handle("desktop:admin-update-report", bind(schemas.updateReport, (p, t) => ops().updateReport(t, p.reportId, { status: p.status, reason: p.reason })));

  ipcMain.handle("desktop:admin-lobby-features", bind(z.object({}), (_p, t) => ops().lobbyFeatures(t)));
  ipcMain.handle("desktop:admin-create-lobby", bind(schemas.createLobby, (p, t) => ops().createLobby(t, p)));
  ipcMain.handle("desktop:admin-delete-lobby", bind(schemas.lobbyAction, (p, t) => ops().deleteLobby(t, p.lobbyId, p.reason)));
  ipcMain.handle("desktop:admin-transfer-lobby", bind(schemas.lobbyUser, (p, t) => ops().transferLobby(t, p.lobbyId, p.userId)));
  ipcMain.handle("desktop:admin-move-member", bind(schemas.lobbyUser, (p, t) => ops().moveMember(t, p.lobbyId, p.userId)));
  ipcMain.handle("desktop:admin-announce", bind(schemas.announce, (p, t) => ops().announce(t, { body: p.body }, p.lobbyId)));

  ipcMain.handle("desktop:admin-disconnect-media", bind(schemas.sessions, (p, t) => ops().disconnectMedia(t, p.userId)));
  ipcMain.handle("desktop:admin-force-track-off", bind(schemas.trackOff, (p, t) => ops().forceTrackOff(t, p.userId, { kind: p.kind, reason: p.reason })));
  ipcMain.handle("desktop:admin-live-media", bind(z.object({}), (_p, t) => ops().liveMedia(t)));

  ipcMain.handle("desktop:admin-close-table", bind(schemas.table, (p, t) => ops().closeTable(t, p.tableId)));
  ipcMain.handle("desktop:admin-remove-table-player", bind(schemas.tablePlayer, (p, t) => ops().removeTablePlayer(t, p.tableId, p.userId)));
  ipcMain.handle("desktop:admin-delete-score", bind(schemas.score, (p, t) => ops().deleteScore(t, p.game, p.userId)));
  ipcMain.handle("desktop:admin-reset-leaderboard", bind(schemas.leaderboard, (p, t) => ops().resetLeaderboard(t, p.game, p.reason)));

  ipcMain.handle("desktop:admin-music-queue", bind(schemas.lobbyOnly, (p, t) => ops().musicQueue(t, p.lobbyId)));
  ipcMain.handle("desktop:admin-clear-music-queue", bind(schemas.lobbyOnly, (p, t) => ops().clearMusicQueue(t, p.lobbyId)));
  ipcMain.handle("desktop:admin-remove-music-track", bind(schemas.musicTrack, (p, t) => ops().removeMusicTrack(t, p.lobbyId, p.index)));

  ipcMain.handle("desktop:admin-rename-emote", bind(schemas.renameEmote, (p, t) => ops().renameEmote(t, p.emoteId, p.name)));
  ipcMain.handle("desktop:admin-upload-emote", bind(schemas.uploadEmote, (p, t) => ops().uploadEmote(t, p)));

  ipcMain.handle("desktop:admin-list-ip-bans", bind(z.object({}), (_p, t) => ops().listIpBans(t)));
  ipcMain.handle("desktop:admin-ban-ip", bind(schemas.banIp, (p, t) => ops().banIp(t, { cidr: p.cidr, reason: p.reason, expiresAt: p.expiresAt ?? null })));
  ipcMain.handle("desktop:admin-unban-ip", bind(schemas.cidr, (p, t) => ops().unbanIp(t, p.cidr)));

  ipcMain.handle("desktop:admin-list-invites", bind(z.object({}), (_p, t) => ops().listInvites(t)));
  ipcMain.handle("desktop:admin-create-invite", bind(schemas.createInvite, (p, t) => ops().createInvite(t, { code: p.code, maxUses: p.maxUses, expiresAt: p.expiresAt ?? null })));
  ipcMain.handle("desktop:admin-delete-invite", bind(schemas.inviteCode, (p, t) => ops().deleteInvite(t, p.code)));
}
