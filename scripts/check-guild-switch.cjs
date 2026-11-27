#!/usr/bin/env node
// Acceptance check (planlar/mobil/MOBIL-SUNUCULAR-PLANI.md F6.5), written by
// the controller; the implementer makes it pass and never edits it.
//
// Bug (user, 2026-11-27): in voice in one server, clicking another server put
// that server's room list over the area where the voice tiles are. Decision
// (user): the main area shows the clicked server's room list; the voice room
// carries on in the bottom bar, and clicking that bar brings the tiles back
// (it selects the room's server again).
//
//   node scripts/check-guild-switch.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-guild-switch-"));
  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    resolve: { alias: { "@shared": path.join(projectRoot, "src/shared") } },
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/renderer/src/features/guilds/guild-logic.ts"),
        formats: ["es"],
        fileName: () => "guild-logic.mjs",
      },
    },
  });
  const logic = await import(pathToFileURL(path.join(outDir, "guild-logic.mjs")).href);
  fs.rmSync(outDir, { recursive: true, force: true });

  // stageRoomId(activeLobbyId, activeRoomGuildId, selectedGuildId): the room
  // whose tiles fill the main area, or null for the selected server's list.
  assert.equal(logic.stageRoomId("r1", "night", "night"), "r1", "same server: the tiles stay");
  assert.equal(logic.stageRoomId("r1", "night", "g2"), null, "another server picked: its room list");
  assert.equal(logic.stageRoomId(null, null, "g2"), null, "not in a room: the list");
  assert.equal(logic.stageRoomId("r1", null, "night"), "r1", "a room from before servers is NIGHT's");
  assert.equal(logic.stageRoomId("r1", "", "night"), "r1", "an empty guildId is NIGHT's");

  const shell = fs.readFileSync(path.join(projectRoot, "src/renderer/src/app/WorkspaceShell.tsx"), "utf8");
  assert.match(shell, /\bstageRoomId\(/, "WorkspaceShell decides the main area with stageRoomId");

  console.log("guild switch check passed (another server shows its list, the voice room stays in the bar)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
