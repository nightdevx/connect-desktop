#!/usr/bin/env node
// Acceptance check (planlar/mobil/MOBIL-SUNUCULAR-PLANI.md F6.6), written by
// the controller; the implementer makes it pass and never edits it.
//
// User, 2026-11-27: server settings open as a page, not a modal. The page is
// drawn where the rooms are (like Keşfet and Tüm sunucular), with its sections
// (the existing panels) and a way back to the rooms.
//
//   node scripts/check-guild-settings-page.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const guilds = path.join(root, "src/renderer/src/features/guilds");
const read = (file) => fs.readFileSync(path.join(guilds, file), "utf8");

// The modal is gone.
assert.ok(!fs.existsSync(path.join(guilds, "components/guild-settings-dialog.tsx")), "guild-settings-dialog.tsx (the modal) is removed");
const store = read("guild-store.ts");
assert.ok(!/kind:\s*"settings"/.test(store), "GuildDialog no longer has a settings kind");

// The page state lives in the guild UI store.
for (const name of ["settingsGuildId", "openSettings", "closeSettings"]) {
  assert.match(store, new RegExp(`\b${name}\b`), `useGuildUi has ${name}`);
}
// Selecting a server, Keşfet or Tüm sunucular leaves the settings page.
assert.match(store, /selectGuild:[\s\S]{0,300}settingsGuildId:\s*null/, "selectGuild closes the settings page");
assert.match(store, /openDiscover:[\s\S]{0,300}settingsGuildId:\s*null/, "openDiscover closes the settings page");

// A page component, drawn by the servers' home like Keşfet.
assert.ok(fs.existsSync(path.join(guilds, "components/guild-settings-page.tsx")), "components/guild-settings-page.tsx exists");
const page = read("components/guild-settings-page.tsx");
assert.ok(!/\bModal\b/.test(page), "the page does not use antd Modal");
assert.match(page, /closeSettings/, "the page has a way back (closeSettings)");
assert.match(page, /guild-settings-panels/, "the page reuses the existing panels");
const home = read("components/guild-home.tsx");
assert.match(home, /GuildSettingsPage/, "guild-home draws GuildSettingsPage");

// Every opener goes to the page.
const menu = read("components/guild-header-menu.tsx");
assert.match(menu, /openSettings\(/, "the server header menu opens the page");

console.log("guild settings page check passed (no modal, page in the rooms area, way back)");
