#!/usr/bin/env node
// Acceptance check for planlar/mobil/MOBIL-SUNUCULAR-PLANI.md F2.1/F2.2
// (written by the controller; the implementer makes it pass, never edits it).
//
// Platform staff (account role admin/owner) open any server without joining:
// the client asks the backend for every server's rooms (staff-view), keeps
// only the servers the user is in plus the one being viewed (and the one
// whose room they sit in), and a badge inside a server is the server role.
//
//   node scripts/check-staff-view.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  // --- the client asks for every server --------------------------------------
  const baseClient = fs.readFileSync(path.join(projectRoot, "src/main/clients/base-client.ts"), "utf8");
  const features = /export const CLIENT_FEATURES = "([^"]*)"/.exec(baseClient);
  assert.ok(features, "CLIENT_FEATURES must stay a string literal in base-client.ts");
  const tokens = features[1].split(",").map((token) => token.trim());
  assert.ok(tokens.includes("guilds"), "CLIENT_FEATURES keeps guilds");
  assert.ok(tokens.includes("staff-view"), "CLIENT_FEATURES asks for staff-view");

  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-staff-view-"));
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

  // --- which rooms reach the screens -----------------------------------------
  // The backend now sends staff every server's rooms. Only these reach the
  // screens: the user's servers, the server being viewed, and the server of
  // the room the user is in (so leaving the view does not drop their room).
  const rooms = [
    { id: "n1", guildId: "night" },
    { id: "n2" }, // before servers: NIGHT's
    { id: "a1", guildId: "a" },
    { id: "b1", guildId: "b" },
    { id: "c1", guildId: "c" },
  ];
  const ids = (list) => list.map((room) => room.id);
  assert.deepEqual(ids(logic.visibleRooms(rooms, ["night"], null, null)), ["n1", "n2"], "member servers only");
  assert.deepEqual(ids(logic.visibleRooms(rooms, ["night"], "b", null)), ["n1", "n2", "b1"], "plus the viewed server");
  assert.deepEqual(
    ids(logic.visibleRooms(rooms, ["night"], null, "c1")),
    ["n1", "n2", "c1"],
    "plus the server of the room the user sits in",
  );
  assert.deepEqual(ids(logic.visibleRooms(rooms, new Set(["a"]), "a", null)), ["a1"], "a Set works, no duplicates");
  assert.deepEqual(ids(logic.visibleRooms(rooms, [], null, "missing")), [], "an unknown current room adds nothing");

  // --- the selected server ---------------------------------------------------
  const mine = [{ id: "night" }, { id: "a" }];
  assert.equal(logic.resolveSelectedGuild(mine, "a"), "a", "old two-argument call unchanged");
  assert.equal(logic.resolveSelectedGuild(mine, "zzz"), "night", "old fallback unchanged");
  assert.equal(logic.resolveSelectedGuild(mine, "a", "b"), "b", "a viewed server wins over the stored pick");
  assert.equal(logic.resolveSelectedGuild([], null, "b"), "b", "staff in no server can still view one");
  assert.equal(logic.resolveSelectedGuild(mine, "a", null), "a", "no view: stored pick");

  // --- the Tüm sunucular list ------------------------------------------------
  const t = "2026-11-20T10:00:00Z";
  assert.equal(logic.guildStatus({}), "active");
  assert.equal(logic.guildStatus({ suspendedAt: t }), "suspended");
  assert.equal(logic.guildStatus({ deletedAt: t }), "deleted");
  assert.equal(logic.guildStatus({ suspendedAt: t, deletedAt: t }), "deleted", "deleted wins");

  const all = [
    { id: "1", name: "Zeytin", ownerUsername: "ali", joinMode: "public", member: false },
    { id: "2", name: "çay ocağı", ownerUsername: "Veli", joinMode: "invite", member: true },
    { id: "3", name: "İstanbul", ownerUsername: "zeynep", joinMode: "request", member: false, suspendedAt: t },
    { id: "4", name: "Arşiv", ownerUsername: "ali", joinMode: "invite", member: false, deletedAt: t },
  ];
  const pick = (filter) => logic.filterAllGuilds(all, filter).map((g) => g.id);
  const everything = { query: "", status: "all", joinMode: "all" };
  assert.deepEqual(pick(everything), ["4", "2", "3", "1"], "sorted by name, Turkish collation");
  assert.deepEqual(pick({ ...everything, query: "ÇAY" }), ["2"], "name search ignores case (Turkish)");
  assert.deepEqual(pick({ ...everything, query: "istanbul" }), ["3"], "i/İ match in Turkish");
  assert.deepEqual(pick({ ...everything, query: "veli" }), ["2"], "owner name is searched too");
  assert.deepEqual(pick({ ...everything, query: "  ali " }), ["4", "1"], "query is trimmed");
  assert.deepEqual(pick({ ...everything, status: "active" }), ["2", "1"]);
  assert.deepEqual(pick({ ...everything, status: "suspended" }), ["3"]);
  assert.deepEqual(pick({ ...everything, status: "deleted" }), ["4"]);
  assert.deepEqual(pick({ ...everything, joinMode: "invite" }), ["4", "2"]);
  assert.deepEqual(pick({ query: "a", status: "active", joinMode: "invite" }), ["2"], "filters combine");
  assert.equal(all[0].id, "1", "the input list is not reordered in place");

  // --- badges inside a server are server roles -------------------------------
  // Inside a server (guildId set) only the server role shows; a member shows
  // none. The account role never shows there, staff included. Outside a
  // server (friends, DMs) the account badge stays as it is.
  assert.equal(logic.serverBadge("g", "admin", undefined), null, "staff not in the server: no badge");
  assert.equal(logic.serverBadge("g", "admin", "member"), null, "staff who joined as member: no badge");
  assert.equal(logic.serverBadge("g", "member", "owner"), "Sahip");
  assert.equal(logic.serverBadge("g", "member", "admin"), "Yönetici");
  assert.equal(logic.serverBadge("g", "moderator", "moderator"), "Moderatör");
  assert.equal(logic.serverBadge("g", "moderator", "member"), null, "an account moderator role means nothing inside");
  assert.equal(logic.serverBadge(null, "admin", undefined), "Yönetici", "outside a server: account admin badge");
  assert.equal(logic.serverBadge(null, "member", "owner"), null, "outside a server a server role shows nothing");

  console.log("staff-view self-check passed (features, visible rooms, selection, all servers, badges)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
