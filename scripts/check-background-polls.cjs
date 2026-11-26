#!/usr/bin/env node
// Acceptance check for what the app fetches on its own while nobody looks
// (plan F4.4 and F4.6; measured in olcum/ses-olcum/veri-butcesi/SONUC.md).
//
//   FREE GAMES  the free-games poll ran every 15 min, tray included: 7 requests
//               and ~117 KB a round, two thirds of everything a minimised app
//               used. Once an hour keeps a new giveaway's toast within the hour
//               (offers run for a week) at a quarter of the cost. Opening the
//               page still gets a fresh list (5-minute rule unchanged), and the
//               first round still runs 8 s after start.
//   ROSTER      while the lobby stream is live it already pushes every roster
//               change; the REST backstop re-read the roster every 30 s. 120 s
//               is the same backstop the chat poll uses next to it. Without a
//               live stream it stays at 8 s.
//
// Needs dist/ (build main first).
//   node scripts/check-background-polls.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const projectRoot = path.join(__dirname, "..");

// --- FREE GAMES: the real poller, its timers captured ----------------------------
const realLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === "electron") {
    return new Proxy({}, {
      get: (_t, key) =>
        key === "app"
          ? { getPath: () => ".", isPackaged: false, on() {}, getVersion: () => "0.0.0" }
          : key === "__esModule" ? false : function stub() { return {}; },
    });
  }
  return realLoad.call(this, request, ...rest);
};
const timers = [];
const realSetTimeout = global.setTimeout;
const realSetInterval = global.setInterval;
global.setTimeout = (fn, ms) => { timers.push({ kind: "timeout", ms }); return { unref() {} }; };
global.setInterval = (fn, ms) => { timers.push({ kind: "interval", ms }); return { unref() {} }; };
const poller = require(path.join(projectRoot, "dist/main/free-games-poller.js"));
poller.startFreeGamesPoller();
global.setTimeout = realSetTimeout;
global.setInterval = realSetInterval;
Module._load = realLoad;

const interval = timers.find((t) => t.kind === "interval");
const first = timers.find((t) => t.kind === "timeout");
assert.ok(interval, "the free-games poller no longer runs on an interval");
assert.equal(interval.ms, 60 * 60_000, `FREE GAMES: polls every ${interval.ms / 60_000} min, want 60`);
assert.equal(first?.ms, 8_000, "FREE GAMES: the first round still runs 8 s after start");

const pollerSource = fs.readFileSync(path.join(projectRoot, "src/main/free-games-poller.ts"), "utf8");
assert.match(pollerSource, /SNAPSHOT_FRESH_MS\s*=\s*5\s*\*\s*60_000/, "FREE GAMES: opening the page must still refresh a list older than 5 min");
assert.match(pollerSource, /MANUAL_REFRESH_COOLDOWN_MS\s*=\s*60_000/, "FREE GAMES: the manual refresh floor stays 60 s");
assert.doesNotMatch(pollerSource, /next interval is 15 minutes away/, "FREE GAMES: a comment still says 15 minutes");

// --- ROSTER: the backstop interval ----------------------------------------------------
const room = fs.readFileSync(path.join(projectRoot, "src/renderer/src/features/workspace/hooks/lobby/use-lobby-room.ts"), "utf8");
const intervals = [...room.matchAll(/refetchInterval:\s*isRosterStreamLive\s*\?\s*([\d_]+)\s*:\s*([\d_]+)/g)].map((m) => [
  Number(m[1].replace(/_/g, "")),
  Number(m[2].replace(/_/g, "")),
]);
assert.equal(intervals.length, 2, "expected the roster and the chat poll, each keyed on isRosterStreamLive");
const [roster, chat] = intervals;
assert.deepEqual(roster, [120_000, 8_000], `ROSTER: live/not-live intervals are ${roster}, want 120000/8000`);
assert.deepEqual(chat, [120_000, 30_000], "the chat poll is not part of this change");
assert.doesNotMatch(room, /30s costs almost nothing/, "ROSTER: the comment still argues for 30 s");

console.log("background-polls check passed (free games hourly with the 5-minute page rule kept; roster backstop 120 s while the stream is live, 8 s without it)");
