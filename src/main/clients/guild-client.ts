import type { GuildAction, GuildCalls } from "../../shared/guild-contracts";
import type { BaseClient } from "./base-client";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Route<K extends GuildAction> = (input: GuildCalls[K]["in"]) => [Method, string, unknown?];

const at = (id: string): string => `/guilds/${encodeURIComponent(id)}`;
const admin = (id: string): string => `/admin/guilds/${encodeURIComponent(id)}`;

/** Each call as the request it makes: method, path and body. */
const ROUTES: { [K in GuildAction]: Route<K> } = {
  list: () => ["GET", "/guilds"],
  create: (p) => ["POST", "/guilds", p],
  discover: (p) => ["GET", `/guilds/discover${p.q ? `?q=${encodeURIComponent(p.q)}` : ""}`],
  previewInvite: (p) => ["GET", `/guilds/invites/${encodeURIComponent(p.code)}`],
  joinInvite: (p) => ["POST", "/guilds/join-invite", { code: p.code }],
  get: (p) => ["GET", at(p.guildId)],
  update: ({ guildId, ...patch }) => ["PATCH", at(guildId), patch],
  remove: (p) => ["DELETE", at(p.guildId)],
  restore: (p) => ["POST", `${at(p.guildId)}/restore`],
  join: (p) => ["POST", `${at(p.guildId)}/join`],
  cancelRequest: (p) => ["DELETE", `${at(p.guildId)}/request`],
  leave: (p) => ["POST", `${at(p.guildId)}/leave`],
  transfer: (p) => ["POST", `${at(p.guildId)}/transfer`, { userId: p.userId }],
  members: (p) => ["GET", `${at(p.guildId)}/members`],
  setRole: (p) => ["PATCH", `${at(p.guildId)}/members/${encodeURIComponent(p.userId)}`, { role: p.role }],
  kick: (p) => ["DELETE", `${at(p.guildId)}/members/${encodeURIComponent(p.userId)}`],
  bans: (p) => ["GET", `${at(p.guildId)}/bans`],
  ban: (p) => [
    "POST",
    `${at(p.guildId)}/bans`,
    { userId: p.userId, reason: p.reason, durationMinutes: p.durationMinutes },
  ],
  unban: (p) => ["DELETE", `${at(p.guildId)}/bans/${encodeURIComponent(p.userId)}`],
  requests: (p) => ["GET", `${at(p.guildId)}/requests`],
  decide: (p) => ["POST", `${at(p.guildId)}/requests/${encodeURIComponent(p.userId)}`, { approve: p.approve }],
  invites: (p) => ["GET", `${at(p.guildId)}/invites`],
  createInvite: (p) => ["POST", `${at(p.guildId)}/invites`, { maxUses: p.maxUses, ttlHours: p.ttlHours }],
  deleteInvite: (p) => ["DELETE", `${at(p.guildId)}/invites/${encodeURIComponent(p.code)}`],
  adminList: () => ["GET", "/admin/guilds"],
  adminSuspend: (p) => ["POST", `${admin(p.guildId)}/suspend`, { suspended: p.suspended }],
  adminRestore: (p) => ["POST", `${admin(p.guildId)}/restore`],
  adminSetMemberLimit: (p) => ["PATCH", admin(p.guildId), { memberLimit: p.memberLimit }],
  adminPurge: (p) => ["DELETE", admin(p.guildId)],
  adminJoin: (p) => ["POST", `${admin(p.guildId)}/join`],
};

/** The servers API: /guilds, and the platform panel's /admin/guilds. */
export class GuildClient {
  public constructor(private readonly baseClient: BaseClient) {}

  public call<K extends GuildAction>(
    accessToken: string,
    action: K,
    input: GuildCalls[K]["in"],
  ): Promise<GuildCalls[K]["out"]> {
    const [method, path, body] = (ROUTES[action] as Route<K>)(input);
    return this.baseClient.request<GuildCalls[K]["out"]>(path, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
}
