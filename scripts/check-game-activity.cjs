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
const {
  KNOWN_GAME_PROCESSES,
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

console.log(`game-activity self-check passed (${keys.length} executables)`);
