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

// GET /admin/media/health: LiveKit's own /metrics, summarised by the backend
// (connect-backend internal/sfumetrics). Every number is over a window; nulls
// mean the window had no samples.
export interface AdminMediaHealthDist {
  samples: number;
  mean: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  /** Share (0-1) of samples above each threshold, keyed by the threshold. */
  over: Record<string, number | null>;
  /**
   * The last bucket bound, when some samples lie beyond it: a quantile at this
   * value means "at least this much".
   */
  cappedAt: number | null;
}

export interface AdminMediaHealthDirection {
  lossPercent: AdminMediaHealthDist;
  rttMs: AdminMediaHealthDist;
  jitterMs: AdminMediaHealthDist;
}

export interface AdminMediaHealthRatio {
  attempts: number;
  successes: number;
  rate: number | null;
}

export interface AdminMediaHealthWindow {
  label: "1h" | "24h" | "sinceStart";
  /** How much time the numbers actually cover. */
  seconds: number;
  /** The history, or LiveKit itself, is younger than the window. */
  partial: boolean;
  /** Microphones sent up to the SFU. */
  upload: AdminMediaHealthDirection;
  /** Microphones the SFU sent down. */
  download: AdminMediaHealthDirection;
  /** Signal connections that went on to connect media. */
  joins: AdminMediaHealthRatio;
  subscriptions: AdminMediaHealthRatio;
  quality: {
    samples: number;
    excellent: number | null;
    good: number | null;
    poor: number | null;
    lost: number | null;
  };
  sessionStartMs: AdminMediaHealthDist;
  /** ICE handshakes per transport. LiveKit 1.13+, empty before. */
  ice: (AdminMediaHealthRatio & { transport: "PUBLISHER" | "SUBSCRIBER" })[];
}

export interface AdminMediaHealth {
  configured: boolean;
  scrapedAt?: string;
  error?: string;
  serverStartedAt?: string;
  rooms: number | null;
  participants: number | null;
  windows: AdminMediaHealthWindow[];
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
