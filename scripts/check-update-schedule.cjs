#!/usr/bin/env node
// Acceptance check for when the app looks for a new version (plan F4.7).
//
// The updater checked 15 s after start and then every 15 minutes, tray
// included: 5 requests on two hosts each time (~188 KB an hour, measured).
// The owner's decision (2026-11-27): check only when the app starts, at most
// once a day. Two things keep a release from being missed:
//   * a mandatory update seen before still checks at once on start (unchanged),
//   * the server turning an old build away still starts a check at once
//     (requireMinimumVersion, unchanged), whether or not a day has passed.
// What must hold:
//
//   NO TIMER     nothing checks on an interval.
//   DAILY        on start, a check runs (after the usual 15 s) only if the last
//                one was 24 h ago or more, or never happened.
//   REMEMBERED   a check that ran is remembered across restarts.
//   STILL FAST   a mandatory update known from an earlier run, or the server's
//                minimum version, checks regardless of the day rule.
//   MANUAL       the "check now" button still checks any time.
//
// Needs dist/ (build main first).
//   node scripts/check-update-schedule.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const projectRoot = path.join(__dirname, "..");
const DAY = 24 * 60 * 60 * 1000;

const main = async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ct-update-"));
  const updaterCalls = [];
  const stubUpdater = {
    on() { return stubUpdater; },
    removeAllListeners() {},
    checkForUpdates: async () => { updaterCalls.push(Date.now()); return { updateInfo: { version: "0.0.1" } }; },
    downloadUpdate: async () => {},
    quitAndInstall() {},
  };
  const realLoad = Module._load;
  Module._load = function load(request, ...rest) {
    if (request === "electron-updater") return { autoUpdater: stubUpdater };
    if (request === "electron") {
      return new Proxy({}, {
        get: (_t, key) => {
          if (key === "app") return { isPackaged: true, getPath: () => userData, getVersion: () => "0.3.7", on() {}, quit() {} };
          if (key === "BrowserWindow") return { getAllWindows: () => [] };
          if (key === "__esModule") return false;
          return new Proxy(function stub() {}, { get: () => () => undefined });
        },
      });
    }
    return realLoad.call(this, request, ...rest);
  };

  const updaterPath = path.join(projectRoot, "dist/main/update/modular-updater.js");
  const schedulePath = path.join(projectRoot, "dist/main/update/update-schedule.js");
  assert.ok(fs.existsSync(schedulePath), "dist/main/update/update-schedule.js is missing (src/main/update/update-schedule.ts, then build main)");

  // --- the rule itself ----------------------------------------------------------------
  const { shouldCheckOnStart } = require(schedulePath);
  assert.equal(typeof shouldCheckOnStart, "function", "shouldCheckOnStart is not exported");
  const now = 1_800_000_000_000;
  assert.equal(shouldCheckOnStart(null, now), true, "DAILY: never checked: check");
  assert.equal(shouldCheckOnStart(now - DAY + 60_000, now), false, "DAILY: checked 23:59 ago: skip");
  assert.equal(shouldCheckOnStart(now - DAY, now), true, "DAILY: checked 24 h ago: check");
  assert.equal(shouldCheckOnStart(now + 3_600_000, now), true, "a last-check time in the future (clock moved back) must not block checks");

  // --- the updater, with its timers captured --------------------------------------
  const run = (seed) => {
    for (const name of fs.readdirSync(userData)) fs.rmSync(path.join(userData, name), { force: true, recursive: true });
    if (seed !== undefined) seed();
    delete require.cache[require.resolve(updaterPath)];
    const timeouts = [];
    const intervals = [];
    const realTimeout = global.setTimeout;
    const realInterval = global.setInterval;
    global.setTimeout = (fn, ms) => { timeouts.push({ fn, ms }); return { unref() {}, ref() {} }; };
    global.setInterval = (fn, ms) => { intervals.push({ fn, ms }); return { unref() {}, ref() {} }; };
    let updater;
    try {
      const mod = require(updaterPath);
      const Ctor = mod.ModularUpdater;
      if (typeof Ctor === "function") {
        updater = new Ctor({ beforeInstall: async () => {} });
        updater.initialize();
      } else {
        mod.initializeModularUpdater({ beforeInstall: async () => {} });
        updater = { checkForUpdates: mod.checkForAppUpdates ?? mod.requestUpdateCheck };
      }
    } finally {
      global.setTimeout = realTimeout;
      global.setInterval = realInterval;
    }
    return { timeouts, intervals, updater };
  };
  const fire = async (timers) => {
    for (const t of timers) t.fn();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  };

  // Never checked before: one check, 15 s after start, and it is remembered.
  updaterCalls.length = 0;
  let r = run();
  assert.equal(r.intervals.length, 0, `NO TIMER: ${r.intervals.length} interval(s) set by the updater`);
  assert.ok(r.timeouts.some((t) => t.ms === 15_000), "DAILY: the first start must check after the usual 15 s");
  await fire(r.timeouts);
  assert.equal(updaterCalls.length, 1, "DAILY: the first start must check once");
  const remembered = fs.readdirSync(userData);
  assert.ok(remembered.length > 0, "REMEMBERED: nothing was written to remember the check");

  // Restart an hour later: the remembered check stands, nothing runs.
  const stamp = fs.readdirSync(userData).map((n) => [n, fs.readFileSync(path.join(userData, n))]);
  updaterCalls.length = 0;
  r = run(() => { for (const [n, b] of stamp) fs.writeFileSync(path.join(userData, n), b); });
  await fire(r.timeouts);
  assert.equal(updaterCalls.length, 0, "DAILY: a restart within a day must not check again");
  assert.equal(r.intervals.length, 0, "NO TIMER");

  // MANUAL: the button still checks.
  await r.updater.checkForUpdates();
  assert.equal(updaterCalls.length, 1, "MANUAL: the check-now button must still check");

  // STILL FAST: the server's minimum version starts a check at once, day or not.
  updaterCalls.length = 0;
  r = run(() => { for (const [n, b] of stamp) fs.writeFileSync(path.join(userData, n), b); });
  if (typeof r.updater.requireMinimumVersion === "function") {
    r.updater.requireMinimumVersion("9.9.9");
    await new Promise((res) => setImmediate(res));
    assert.equal(updaterCalls.length, 1, "STILL FAST: the server's minimum version must check at once");
  }

  // The app no longer asks for a periodic check.
  const index = fs.readFileSync(path.join(projectRoot, "src/main/index.ts"), "utf8");
  assert.doesNotMatch(index, /periodicCheckMs\s*:/, "NO TIMER: src/main/index.ts still passes periodicCheckMs");

  Module._load = realLoad;
  fs.rmSync(userData, { recursive: true, force: true });
  console.log("update-schedule check passed (no interval; on start only if a day has passed, remembered across restarts; manual and server-minimum checks unchanged)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
