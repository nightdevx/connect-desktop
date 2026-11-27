// Servers (guilds): the backend's /guilds API as this app sees it. Bound to
// the generated types in api-contracts.ts. Go embeds GuildView's Guild and
// MemberEntry's Member, so on the wire their fields are flat, which is how
// they are written here (tygo draws them as a nested field).

export type GuildRole = "owner" | "admin" | "moderator" | "member";
export type GuildJoinMode = "invite" | "public" | "request";

/** NIGHT, the first server: the whole community from before servers. */
export const NIGHT_GUILD_ID = "night";

export interface Guild {
  id: string;
  name: string;
  description: string;
  iconDataUrl: string;
  ownerId: string;
  joinMode: GuildJoinMode;
  memberLimit: number;
  createdAt: string;
  suspendedAt?: string;
  deletedAt?: string;
  myRole: GuildRole;
  memberCount: number;
  pendingRequests: number;
}

export interface GuildLimits {
  guildsPerUser: number;
  membersPerGuild: number;
  roomsPerGuild: number;
}

/** A public server in Keşfet, or one the user asked to join. */
export interface GuildDiscoverEntry {
  id: string;
  name: string;
  description: string;
  iconDataUrl: string;
  joinMode: GuildJoinMode;
  memberCount: number;
}

export interface GuildList {
  guilds: Guild[];
  /** Servers this user owns that were deleted and can still be restored. */
  deleted: Guild[];
  /** Join requests still waiting for a moderator. */
  requests: GuildDiscoverEntry[];
  limits: GuildLimits;
}

export interface GuildInvitePreview {
  guildId: string;
  name: string;
  iconDataUrl: string;
  memberCount: number;
  isMember: boolean;
}

export interface GuildInvite {
  code: string;
  guildId: string;
  createdBy: string;
  maxUses: number;
  uses: number;
  createdAt: string;
  expiresAt?: string;
}

export interface GuildMember {
  guildId: string;
  userId: string;
  role: GuildRole;
  joinedAt: string;
  username: string;
}

export interface GuildBan {
  guildId: string;
  userId: string;
  bannedBy: string;
  reason: string;
  bannedAt: string;
  expiresAt?: string;
  username: string;
}

export interface GuildJoinRequest {
  guildId: string;
  userId: string;
  createdAt: string;
  username: string;
}

/** A server in the platform panel, with its owner's login name. */
export interface AdminGuild extends Guild {
  ownerUsername: string;
}

/** A row of Tüm sunucular: any server, and whether the viewer is in it. */
export interface AllGuild extends AdminGuild {
  member: boolean;
}

export interface GuildEditInput {
  name?: string;
  description?: string;
  iconDataUrl?: string;
  joinMode?: GuildJoinMode;
}

type Id = { guildId: string };
type Target = Id & { userId: string };

/**
 * Every /guilds call, by name: what it takes and what it answers. One IPC
 * channel carries them all (desktop:guilds); the main process validates each
 * payload against its own schema (guild-handlers.ts).
 */
export interface GuildCalls {
  list: { in: Record<string, never>; out: GuildList };
  create: {
    in: { name: string; description: string; iconDataUrl: string; joinMode: GuildJoinMode };
    out: { guild: Guild };
  };
  discover: { in: { q: string }; out: { guilds: GuildDiscoverEntry[] } };
  previewInvite: { in: { code: string }; out: { invite: GuildInvitePreview } };
  joinInvite: { in: { code: string }; out: { guild: Guild } };
  get: { in: Id; out: { guild: Guild } };
  update: { in: Id & GuildEditInput; out: { guild: Guild } };
  remove: { in: Id; out: void };
  restore: { in: Id; out: void };
  join: { in: Id; out: { joined: boolean; requested: boolean } };
  cancelRequest: { in: Id; out: void };
  leave: { in: Id; out: void };
  transfer: { in: Target; out: void };
  members: { in: Id; out: { members: GuildMember[] } };
  setRole: { in: Target & { role: Exclude<GuildRole, "owner"> }; out: void };
  kick: { in: Target; out: void };
  bans: { in: Id; out: { bans: GuildBan[] } };
  ban: { in: Target & { reason: string; durationMinutes: number }; out: void };
  unban: { in: Target; out: void };
  requests: { in: Id; out: { requests: GuildJoinRequest[] } };
  decide: { in: Target & { approve: boolean }; out: void };
  invites: { in: Id; out: { invites: GuildInvite[] } };
  createInvite: { in: Id & { maxUses: number; ttlHours: number }; out: { invite: GuildInvite } };
  deleteInvite: { in: Id & { code: string }; out: void };
  /** Platform staff: every server, members or not (GET /guilds?scope=all). */
  allList: { in: Record<string, never>; out: { guilds: AllGuild[] } };
  adminList: { in: Record<string, never>; out: { guilds: AdminGuild[]; limits: GuildLimits } };
  adminSuspend: { in: Id & { suspended: boolean }; out: void };
  adminRestore: { in: Id; out: void };
  adminSetMemberLimit: { in: Id & { memberLimit: number }; out: { guild: Guild } };
  adminPurge: { in: Id; out: void };
  adminJoin: { in: Id; out: { joined: boolean; requested: boolean } };
}

export type GuildAction = keyof GuildCalls;
