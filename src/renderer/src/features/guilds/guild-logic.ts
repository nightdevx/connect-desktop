// Servers, the parts with no React in them: which server a room is in, which
// one is selected, what a role may do, and whether a chat message is an
// invite. scripts/check-guilds.cjs holds these.

import {
  NIGHT_GUILD_ID,
  type Guild,
  type GuildJoinMode,
  type GuildRole,
} from "@shared/guild-contracts";

/** A room's server. A room from a backend before servers is NIGHT's. */
export const roomGuildId = (room: { guildId?: string }): string => room.guildId || NIGHT_GUILD_ID;

/**
 * The voice room whose tiles fill the main area. Only while the selected
 * server is the room's own: pick another server and the main area shows that
 * server's rooms while the room carries on in the dock. A room from before
 * servers (no guildId) is NIGHT's; no selection yet changes nothing.
 */
export const stageRoomId = (
  activeLobbyId: string | null,
  activeRoomGuildId: string | null | undefined,
  selectedGuildId: string | null,
): string | null => {
  if (!activeLobbyId) return null;
  if (!selectedGuildId) return activeLobbyId;
  return roomGuildId({ guildId: activeRoomGuildId || undefined }) === selectedGuildId ? activeLobbyId : null;
};

export const roomsOfGuild = <T extends { guildId?: string }>(rooms: T[], guildId: string | null): T[] =>
  guildId ? rooms.filter((room) => roomGuildId(room) === guildId) : [];

/** Servers with a room that has unread messages. */
export const guildsWithUnread = (
  rooms: Array<{ id: string; guildId?: string }>,
  unreadByRoomId: Record<string, number>,
): Set<string> =>
  new Set(rooms.filter((room) => (unreadByRoomId[room.id] ?? 0) > 0).map(roomGuildId));

/**
 * The server to show: the one being viewed (platform staff, no membership),
 * else the one picked last if the user is still in it, else the first in
 * their list, else none.
 */
export const resolveSelectedGuild = (
  guilds: Array<{ id: string }>,
  stored: string | null,
  viewingGuildId?: string | null,
): string | null =>
  viewingGuildId ||
  (guilds.some((guild) => guild.id === stored) ? stored : (guilds[0]?.id ?? null));

/**
 * The rooms that reach the screens. Platform staff are sent every server's
 * rooms (staff-view); keep the user's servers, the one being viewed and the
 * one whose room the user sits in, so leaving the view keeps their room.
 */
export const visibleRooms = <T extends { id: string; guildId?: string }>(
  rooms: T[],
  myGuildIds: Iterable<string>,
  viewingGuildId: string | null,
  currentRoomId: string | null,
): T[] => {
  const keep = new Set(myGuildIds);
  if (viewingGuildId) keep.add(viewingGuildId);
  const current = currentRoomId ? rooms.find((room) => room.id === currentRoomId) : undefined;
  if (current) keep.add(roomGuildId(current));
  return rooms.filter((room) => keep.has(roomGuildId(room)));
};

export type GuildStatus = "active" | "suspended" | "deleted";

export const guildStatus = (guild: { suspendedAt?: string; deletedAt?: string }): GuildStatus =>
  guild.deletedAt ? "deleted" : guild.suspendedAt ? "suspended" : "active";

export interface AllGuildsFilter {
  query: string;
  status: GuildStatus | "all";
  joinMode: GuildJoinMode | "all";
}

/** The Tüm sunucular rows: filtered, sorted by name (Turkish). Input untouched. */
export const filterAllGuilds = <
  T extends { name: string; ownerUsername: string; joinMode: GuildJoinMode; suspendedAt?: string; deletedAt?: string },
>(
  guilds: T[],
  filter: AllGuildsFilter,
): T[] => {
  const lower = (text: string) => text.toLocaleLowerCase("tr-TR");
  const query = lower(filter.query.trim());
  return guilds
    .filter(
      (guild) =>
        (filter.status === "all" || guildStatus(guild) === filter.status) &&
        (filter.joinMode === "all" || guild.joinMode === filter.joinMode) &&
        (!query || lower(guild.name).includes(query) || lower(guild.ownerUsername).includes(query)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
};

/**
 * The badge next to a person. Inside a server (guildId set) only the server
 * role counts: owner, admin and moderator show, a member shows none, and the
 * account role never does. Outside a server (friends, DMs) the account admin
 * badge stays.
 */
export const serverBadge = (
  guildId: string | null | undefined,
  accountRole: string,
  guildRole: GuildRole | undefined,
): string | null => {
  if (guildId) {
    return guildRole && guildRole !== "member" ? ROLE_LABELS[guildRole] : null;
  }
  return accountRole === "admin" ? ROLE_LABELS.admin : null;
};

const RANK: Record<string, number> = { owner: 40, admin: 30, moderator: 20, member: 10 };

/** Platform staff (account role admin or owner) may do anything in any server. */
export const isPlatformStaff = (accountRole: string): boolean =>
  accountRole === "admin" || accountRole === "owner";

export const guildRankAtLeast = (role: GuildRole | undefined, minimum: GuildRole): boolean =>
  (RANK[role ?? ""] ?? 0) >= RANK[minimum];

/**
 * The role the user acts with inside a server's rooms, on the account-role
 * scale the room moderation UI already reads: platform staff at the top (the
 * backend ranks them above every server role), a member by their server
 * role, anyone else "member".
 */
export const roleInGuild = (accountRole: string, guildRole: GuildRole | undefined): GuildRole =>
  isPlatformStaff(accountRole) ? "owner" : (guildRole ?? "member");

/** What the user may touch in a server's settings. */
export const guildPermissions = (guild: Pick<Guild, "myRole">, accountRole: string) => {
  const staff = isPlatformStaff(accountRole);
  const at = (minimum: GuildRole) => staff || guildRankAtLeast(guild.myRole, minimum);
  return {
    /** Name, icon, description, join mode. */
    edit: at("admin"),
    /** Invites, requests, members (kick, ban), bans. */
    moderate: at("moderator"),
    /** Role changes: admins and the owner. */
    setRoles: at("admin"),
    /** Delete and transfer: the owner (or staff). */
    own: staff || guild.myRole === "owner",
  };
};

/** Whether `actor` may act on someone holding `target` (strictly above them). */
export const outranks = (actor: GuildRole | undefined, target: GuildRole, accountRole: string): boolean =>
  isPlatformStaff(accountRole) || (RANK[actor ?? ""] ?? 0) > RANK[target];

export const ROLE_LABELS: Record<GuildRole, string> = {
  owner: "Sahip",
  admin: "Yönetici",
  moderator: "Moderatör",
  member: "Üye",
};

export const JOIN_MODE_LABELS: Record<GuildJoinMode, { label: string; hint: string }> = {
  invite: { label: "Yalnız davetle", hint: "Kod alan katılır. Keşfet'te görünmez." },
  public: { label: "Herkese açık", hint: "Keşfet'te görünür, isteyen hemen katılır." },
  request: { label: "İstekle", hint: "Keşfet'te görünür, bir moderatör onaylayınca katılır." },
};

/** Up to two letters for a server without an icon. */
export const guildInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toLocaleUpperCase("tr-TR");
};

// --- invite codes ------------------------------------------------------------
// The backend's alphabet: no 0/O, 1/I. Codes are 8 characters.
const CODE = "[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}";
const ALONE = new RegExp(`^\\s*(${CODE})\\s*$`);
const IN_TEXT = new RegExp(`(?<![A-Za-z0-9])(${CODE})(?![A-Za-z0-9])`);
const INVITE_WORD = /davet/i;

/** A code as the user typed or pasted it: trimmed, upper case. */
export const normalizeInviteCode = (value: string): string => value.trim().toUpperCase();

export const isInviteCode = (value: string): boolean => ALONE.test(normalizeInviteCode(value));

/**
 * The invite code a chat message carries, or null. Only a message that is
 * just a code, or one that says "davet" next to a code: an 8-letter word in
 * capitals is otherwise too common to guess at. A code must mix in a digit or
 * be in a "davet" message, so a shouted word alone is not taken for one.
 */
export const findInviteCode = (body: string): string | null => {
  const alone = ALONE.exec(body);
  if (alone && /\d/.test(alone[1])) {
    return alone[1];
  }
  if (!INVITE_WORD.test(body)) {
    return null;
  }
  return IN_TEXT.exec(body)?.[1] ?? null;
};

/** "29 gün" until a deleted server is gone for good. */
export const daysLeft = (deletedAt: string | undefined, now = Date.now()): number => {
  if (!deletedAt) return 30;
  const left = 30 - (now - Date.parse(deletedAt)) / 86_400_000;
  return Math.max(0, Math.ceil(left));
};
