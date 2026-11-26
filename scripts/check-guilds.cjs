#!/usr/bin/env node
// Self-check for src/renderer/src/features/guilds/guild-logic.ts: which rooms
// a server shows, which server is selected, what a role may do, and when a
// chat message is an invite. Each fails quietly when broken: a room in the
// wrong server, a remembered pick that points nowhere, a card under an
// ordinary shouted word, or a missing one under a real code.
//
//   node scripts/check-guilds.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-guilds-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Not vite.config.ts: it carries the Sentry plugin.
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

  // --- rooms by server ------------------------------------------------------
  const rooms = [
    { id: "a", guildId: "night" },
    { id: "b", guildId: "g2" },
    { id: "c" }, // a backend from before servers: NIGHT's
    { id: "d", guildId: "" },
  ];
  assert.deepEqual(logic.roomsOfGuild(rooms, "night").map((room) => room.id), ["a", "c", "d"]);
  assert.deepEqual(logic.roomsOfGuild(rooms, "g2").map((room) => room.id), ["b"]);
  assert.deepEqual(logic.roomsOfGuild(rooms, null), [], "no server selected shows no rooms");
  assert.deepEqual(
    [...logic.guildsWithUnread(rooms, { b: 2, c: 0 })],
    ["g2"],
    "only a room with unread messages marks its server",
  );

  // --- the remembered pick --------------------------------------------------
  const mine = [{ id: "night" }, { id: "g2" }];
  assert.equal(logic.resolveSelectedGuild(mine, "g2"), "g2", "a pick still valid is kept");
  assert.equal(logic.resolveSelectedGuild(mine, "gone"), "night", "a left server falls back to the first");
  assert.equal(logic.resolveSelectedGuild(mine, null), "night");
  assert.equal(logic.resolveSelectedGuild([], "g2"), null, "no servers, no selection");

  // --- roles ----------------------------------------------------------------
  assert.equal(logic.roleInGuild("admin", "member"), "owner", "platform staff act at the top in every server");
  assert.equal(logic.roleInGuild("moderator", "member"), "member", "a platform moderator is a member in a server");
  assert.equal(logic.roleInGuild("member", "admin"), "admin");
  assert.equal(logic.roleInGuild("member", undefined), "member");
  const asMod = logic.guildPermissions({ myRole: "moderator" }, "member");
  assert.deepEqual(asMod, { edit: false, moderate: true, setRoles: false, own: false });
  assert.equal(logic.guildPermissions({ myRole: "member" }, "owner").own, true, "staff may delete any server");
  assert.equal(logic.outranks("admin", "moderator", "member"), true);
  assert.equal(logic.outranks("admin", "admin", "member"), false, "nobody acts on an equal");

  // --- invite codes ---------------------------------------------------------
  assert.equal(logic.findInviteCode("K7QW2MPA"), "K7QW2MPA", "a message that is only a code");
  assert.equal(logic.findInviteCode("  K7QW2MPA \n"), "K7QW2MPA");
  assert.equal(logic.findInviteCode("gel: davet kodu K7QW2MPA"), "K7QW2MPA", "a code beside the word davet");
  assert.equal(logic.findInviteCode("Davet: ABCDEFGH"), "ABCDEFGH", "letters only, but said to be an invite");
  assert.equal(logic.findInviteCode("HAHAHAHA"), null, "a shouted word alone is not a code");
  assert.equal(logic.findInviteCode("bunu dene K7QW2MPA"), null, "no davet, more than a code: not guessed at");
  assert.equal(logic.findInviteCode("davet K7QW2MPA9"), null, "nine characters is not a code");
  assert.equal(logic.findInviteCode("davet k7qw2mpa"), null, "the backend's codes are upper case");
  assert.equal(logic.findInviteCode("davet K0QW2MPA"), null, "0 is not in the alphabet");
  assert.equal(logic.isInviteCode(" k7qw2mpa "), true, "typed in the dialog: trimmed and upper-cased");
  assert.equal(logic.normalizeInviteCode(" k7qw2mpa "), "K7QW2MPA");

  assert.equal(logic.guildInitials("NIGHT"), "NI");
  assert.equal(logic.guildInitials("istanbul"), "İS", "Turkish upper case");
  assert.equal(logic.guildInitials("çay ocağı"), "ÇO");
  assert.equal(logic.daysLeft(new Date(Date.now() - 86_400_000).toISOString()), 29);

  console.log("guilds self-check passed (rooms by server, selection, roles, invite codes)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
