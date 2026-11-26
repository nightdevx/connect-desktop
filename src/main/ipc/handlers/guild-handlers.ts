import { z } from "zod";
import type { GuildAction, GuildCalls } from "../../../shared/guild-contracts";
import { handle } from "../handle";
import { backendClient, fail, ok, withAccessToken } from "../context";

const guildId = z.string().min(1).max(128);
const userId = z.string().min(1).max(128);
const id = z.object({ guildId });
const target = z.object({ guildId, userId });
const none = z.object({});
const joinMode = z.enum(["invite", "public", "request"]);
// The backend's codes are 8 characters; the check here only keeps junk out of
// the URL.
const code = z.string().trim().min(4).max(32).regex(/^[A-Za-z0-9]+$/);
const name = z.string().trim().min(1).max(48);
const description = z.string().max(300);
// 256 KB on the server; base64 grows it by a third, plus the data: prefix.
const icon = z.string().max(360_000).refine((value) => value === "" || value.startsWith("data:image/"));

/** Each call's payload, checked before it leaves for the backend. */
const SCHEMAS: { [K in GuildAction]: z.ZodType<GuildCalls[K]["in"]> } = {
  list: none,
  create: z.object({ name, description, iconDataUrl: icon, joinMode }),
  discover: z.object({ q: z.string().max(64) }),
  previewInvite: z.object({ code }),
  joinInvite: z.object({ code }),
  get: id,
  update: z.object({
    guildId,
    name: name.optional(),
    description: description.optional(),
    iconDataUrl: icon.optional(),
    joinMode: joinMode.optional(),
  }),
  remove: id,
  restore: id,
  join: id,
  cancelRequest: id,
  leave: id,
  transfer: target,
  members: id,
  setRole: target.extend({ role: z.enum(["admin", "moderator", "member"]) }),
  kick: target,
  bans: id,
  ban: target.extend({
    reason: z.string().max(300),
    durationMinutes: z.number().int().min(0).max(525_600),
  }),
  unban: target,
  requests: id,
  decide: target.extend({ approve: z.boolean() }),
  invites: id,
  createInvite: id.extend({
    maxUses: z.number().int().min(0).max(10_000),
    ttlHours: z.number().int().min(0).max(720),
  }),
  deleteInvite: id.extend({ code }),
  adminList: none,
  adminSuspend: id.extend({ suspended: z.boolean() }),
  adminRestore: id,
  adminSetMemberLimit: id.extend({ memberLimit: z.number().int().min(0).max(100_000) }),
  adminPurge: id,
  adminJoin: id,
};

const isAction = (value: unknown): value is GuildAction =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(SCHEMAS, value);

/** Servers: every /guilds call on one channel, by name (GuildCalls). */
export function registerGuildHandlers(): void {
  handle("desktop:guilds", async (_event, action: unknown, payload: unknown) => {
    try {
      if (!isAction(action)) {
        throw new Error("unknown server call");
      }
      const input = SCHEMAS[action].parse(payload ?? {});
      const result = await withAccessToken((token) => backendClient.guilds.call(token, action, input));
      return ok(result ?? null);
    } catch (error) {
      return fail(error);
    }
  });
}
