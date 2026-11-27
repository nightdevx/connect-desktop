#!/usr/bin/env node
// Acceptance check (planlar/mobil/MOBIL-SUNUCULAR-PLANI.md Faz 6), written by
// the controller; the implementer makes it pass and never edits it.
//
// 1. Server creation can be closed: for everyone from the panel's settings
//    ("Kullanıcılar sunucu kurabilir", runtime setting guildCreationClosed) and
//    per account (restriction "guildCreate", "Sunucu kuramaz"). The backend
//    answers GET /guilds with canCreate; when it is false the "Sunucu kur"
//    option is not shown at all (user decision: hidden, not greyed out).
// 2. A deleted server must not linger in Keşfet: every change to the server
//    list also refetches the discover list, and Keşfet asks again each time it
//    opens.
//
//   node scripts/check-guild-permissions.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const guilds = "src/renderer/src/features/guilds";

// --- 1. creation permission --------------------------------------------------
const contracts = read("src/shared/guild-contracts.ts");
assert.match(contracts, /\bcanCreate\s*:\s*boolean/, "the /guilds list contract carries canCreate: boolean");

const rail = read(`${guilds}/components/guild-rail-servers.tsx`);
assert.match(rail, /canCreate/, "the rail '+' menu reads canCreate");
const createItem = /key:\s*"create"[^\n]*/.exec(rail);
assert.ok(createItem, "the 'Sunucu kur' menu item still exists for those who may create");
// The item must be conditional: built only when canCreate holds.
assert.match(
  rail,
  /canCreate[\s\S]{0,200}key:\s*"create"|key:\s*"create"[\s\S]{0,40}\]\s*:\s*\[\]|canCreate\s*\?[\s\S]{0,120}"create"/,
  "the 'Sunucu kur' item is only added when canCreate is true",
);

const settings = read("src/renderer/src/features/admin/components/admin-settings.tsx");
assert.match(settings, /guildCreationClosed/, "admin settings binds guildCreationClosed");
assert.match(settings, /Kullanıcılar sunucu kurabilir/, "admin settings shows the switch 'Kullanıcılar sunucu kurabilir'");

const users = read("src/renderer/src/features/admin/components/admin-users.tsx");
assert.match(users, /guildCreate/, "admin users offers the guildCreate restriction");
assert.match(users, /Sunucu kuramaz/, "the restriction is labelled 'Sunucu kuramaz'");

// --- 2. Keşfet stays fresh ---------------------------------------------------
const hooks = read(`${guilds}/use-guilds.ts`);
const invalidate = /export const invalidateGuildViews\s*=[\s\S]*?\n\};?/.exec(hooks) ||
  /export function invalidateGuildViews[\s\S]*?\n\}/.exec(hooks);
assert.ok(invalidate, "use-guilds.ts exports invalidateGuildViews(queryClient)");
for (const key of ["GUILDS_QUERY_KEY", "ALL_GUILDS_QUERY_KEY", "\"guild-discover\""]) {
  assert.ok(invalidate[0].includes(key), `invalidateGuildViews refetches ${key}`);
}
const refresh = /export const useRefreshGuilds[\s\S]*?\n\};/.exec(hooks);
assert.ok(refresh && /invalidateGuildViews\(/.test(refresh[0]), "useRefreshGuilds goes through invalidateGuildViews");
const socket = /guilds-changed[\s\S]{0,400}/.exec(hooks);
assert.ok(socket && /invalidateGuildViews\(/.test(socket[0]), "the guilds-changed handler goes through invalidateGuildViews");

const home = read(`${guilds}/components/guild-home.tsx`);
const discover = /queryKey:\s*\["guild-discover"[\s\S]{0,300}/.exec(home);
assert.ok(discover, "Keşfet keeps its guild-discover query key");
assert.match(
  discover[0],
  /staleTime:\s*0\b|refetchOnMount:\s*"always"/,
  "Keşfet asks again each time it opens (staleTime 0 or refetchOnMount 'always')",
);

console.log("guild permissions check passed (creation switch and restriction, hidden create option, fresh Keşfet)");
