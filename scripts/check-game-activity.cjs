#!/usr/bin/env node
// Self-check for the game matcher in src/shared/game-activity.ts.
//
// The matcher is what turns a process list into a line on somebody's profile,
// and both of its failure modes are silent. A key that still carries ".exe", or
// a capital letter, or a stray path never matches anything: the feature simply
// does nothing and nobody can tell it apart from "not playing". A key that is
// a name ordinary software also uses (an "update.exe", a bare "game") matches
// far too much and announces a game nobody launched.
//
//   node scripts/check-game-activity.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  GAME_ART,
  KNOWN_GAME_PROCESSES,
  isMinecraftWindowTitle,
  matchKnownGame,
  normalizeProcessName,
} = require("../dist/shared/game-activity.js");

const keys = Object.keys(KNOWN_GAME_PROCESSES);
assert.ok(keys.length > 50, `expected a real game list, found ${keys.length}`);

for (const key of keys) {
  assert.equal(
    key,
    normalizeProcessName(key),
    `"${key}" is not in the form the matcher looks up (lower case, no .exe, no path)`,
  );
  assert.ok(
    KNOWN_GAME_PROCESSES[key].trim().length > 0,
    `"${key}" maps to an empty title`,
  );
}

// Names common enough that some updater, launcher or utility on the machine
// will eventually be called one of them.
const TOO_GENERIC = new Set([
  "game",
  "launcher",
  "client",
  "update",
  "updater",
  "setup",
  "install",
  "installer",
  "start",
  "run",
  "app",
  "main",
  "server",
  "steam",
  "epicgameslauncher",
  "explorer",
  "chrome",
  "electron",
  "node",
]);
for (const key of keys) {
  assert.ok(!TOO_GENERIC.has(key), `"${key}" is too generic to identify a game`);
}

// Windows hands over "VALORANT-Win64-Shipping.exe"; Linux hands over a whole
// argv[0] path. Both have to land on the same entry.
assert.equal(
  matchKnownGame(["svchost.exe", "VALORANT-Win64-Shipping.exe", "chrome.exe"]),
  "VALORANT",
);
assert.equal(matchKnownGame(["/usr/games/factorio"]), "Factorio");
assert.equal(matchKnownGame(["C:\\Games\\cs2.exe"]), "Counter-Strike 2");
assert.equal(matchKnownGame(["chrome.exe", "code.exe", "Discord.exe"]), null);
assert.equal(matchKnownGame([]), null);
assert.equal(matchKnownGame(["", "   "]), null);

// Executables as the games ship them, including the ones whose file name is
// not the game's name: a space, an _x64 suffix, an engine name, a .bin.
for (const [exe, title] of [
  ["League of Legends.exe", "League of Legends"],
  ["Among Us.exe", "Among Us"],
  ["DayZ_x64.exe", "DayZ"],
  ["SC2_x64.exe", "StarCraft II"],
  ["D2R.exe", "Diablo II: Resurrected"],
  ["MK12.exe", "Mortal Kombat 1"],
  ["SoTGame.exe", "Sea of Thieves"],
  ["Minecraft.Windows.exe", "Minecraft"],
  ["Marvel-Win64-Shipping.exe", "Marvel Rivals"],
  ["Stardew Valley.exe", "Stardew Valley"],
  ["osu!.exe", "osu!"],
  ["wolfteam.bin", "Wolfteam"],
]) {
  assert.equal(matchKnownGame([exe]), title, exe);
}

// javaw.exe is any Java program. Minecraft: Java Edition is told apart by its
// window title (the poller asks tasklist /V only while a javaw.exe runs).
assert.equal(matchKnownGame(["javaw.exe"]), null);
assert.ok(isMinecraftWindowTitle("Minecraft 1.21.4"));
assert.ok(isMinecraftWindowTitle("Minecraft* 1.21.4 - Multiplayer (3rd-party Server)"));
assert.ok(isMinecraftWindowTitle("Lunar Client 1.8.9 (v2.18.3-2451)"));
assert.ok(!isMinecraftWindowTitle("N/A"));
assert.ok(!isMinecraftWindowTitle("Eclipse IDE for Java Developers"));

// Every game shows its square picture. A key that is not a title the matcher
// can produce, or a file that is not on disk, fails just as silently as a
// missing entry: the initials stand in and nobody can tell why.
const titles = new Set(Object.values(KNOWN_GAME_PROCESSES));
const artDir = path.join(__dirname, "..", "src", "renderer", "public", "games");
for (const [title, file] of Object.entries(GAME_ART)) {
  assert.ok(titles.has(title), `GAME_ART has "${title}", which no executable maps to`);
  assert.ok(fs.existsSync(path.join(artDir, `${file}.jpg`)), `no picture public/games/${file}.jpg for "${title}"`);
}
// No logo to be had for these; they show their initials.
const WITHOUT_ART = new Set(["Wolfteam"]);
for (const title of titles) {
  assert.ok(title in GAME_ART || WITHOUT_ART.has(title), `"${title}" has no picture in GAME_ART`);
}
const used = new Set(Object.values(GAME_ART));
for (const file of fs.readdirSync(artDir)) {
  assert.ok(used.has(file.replace(/\.jpg$/, "")), `public/games/${file} is not used by any game`);
}

console.log(
  `game-activity self-check passed (${keys.length} executables, ${used.size} pictures)`,
);
