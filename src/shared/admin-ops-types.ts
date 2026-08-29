import type { PrivacyAudience } from "./auth-contracts";

export interface AdminSessionSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  current: boolean;
}

export interface AdminRelatedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface AdminUserRelations {
  friends: AdminRelatedUser[];
  incomingPending: AdminRelatedUser[];
  outgoingPending: AdminRelatedUser[];
  blocked: AdminRelatedUser[];
  blockedBy: AdminRelatedUser[];
}

export interface AdminAuditEntry {
  id: number;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  reason: string;
  metadata?: Record<string, unknown>;
  clientIp: string;
  occurredAt: string;
}

export interface AdminAuditQuery {
  actorId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  search?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface AdminChatQuery {
  lobbyId?: string;
  channel?: string;
  userId?: string;
  q?: string;
  before?: string;
  after?: string;
  limit?: number;
  offset?: number;
}

export interface AdminPurgeQuery {
  userId?: string;
  lobbyId?: string;
  channel?: string;
  before?: string;
  after?: string;
  reason?: string;
  dryRun?: boolean;
}

export interface AdminAttachmentSummary {
  id: string;
  messageId: string;
  channel: string;
  userId: string;
  username: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface AdminAttachmentStats {
  count: number;
  totalBytes: number;
}

export type AdminReportStatus = "open" | "resolved" | "rejected";

export interface AdminChatReport {
  id: string;
  messageId: string;
  channel: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  status: AdminReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string;
  message?: unknown;
}

export interface AdminLivePublisher {
  room: string;
  userId: string;
  username: string;
  camera: boolean;
  screen: boolean;
  microphone: boolean;
  joinedAt: number;
}

export interface AdminEmoteRow {
  id: string;
  name: string;
  ownerId: string;
  ownerUsername: string;
}

export interface AdminIpBan {
  cidr: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface AdminInviteCode {
  code: string;
  createdBy: string;
  maxUses: number;
  uses: number;
  createdAt: string;
  expiresAt: string | null;
}

export interface AdminPrivacyPatch {
  allowDmFrom?: PrivacyAudience;
  allowCallsFrom?: PrivacyAudience;
  allowFriendRequests?: boolean;
}
