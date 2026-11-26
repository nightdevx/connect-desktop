#!/usr/bin/env node
// Acceptance check for the four defects the whole-branch review found
// (plan SES-VERIMLILIK, final review, 2026-11-27):
//
//   R1  a failed update check must not count as the day's check: Windows starts
//       the app before the network is up, and the day was spent on a failure.
//   R2  every way a session ends (sign-out, expiry or ban, account deletion)
//       clears the attachment cache, not only the sign-out button.
//   R4  two downloads of the same attachment at once never leave a half-written
//       file in the cache.
//   R8  only a room switch carries a screen share's tracks over without
//       stopping them; any other leave (sign-out, window teardown) still stops
//       them, so a capture never keeps running after the app left the room.
//
// Needs dist/ (build main first).
//   node scripts/check-review-fixes.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const projectRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(projectRoot, rel), "utf8").replace(/\r\n/g, "\n");

const main = async () => {
  // ---------------------------------------------------------------- R1
  {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ct-update-retry-"));
    let fail = true;
    let calls = 0;
    const stubUpdater = {
      on() { return stubUpdater; },
      removeAllListeners() {},
      checkForUpdates: async () => { calls += 1; if (fail) throw new Error("net::ERR_INTERNET_DISCONNECTED"); return { updateInfo: { version: "0.0.1" } }; },
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
    const start = async () => {
      delete require.cache[require.resolve(updaterPath)];
      const timeouts = [];
      const realTimeout = global.setTimeout;
      global.setTimeout = (fn, ms) => { timeouts.push(fn); return { unref() {}, ref() {} }; };
      try {
        const { ModularUpdater } = require(updaterPath);
        new ModularUpdater({ beforeInstall: async () => {} }).initialize();
      } finally {
        global.setTimeout = realTimeout;
      }
      for (const fn of timeouts) fn();
      for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
    };
    await start(); // offline: the check fails
    assert.equal(calls, 1, "R1: the first start must try a check");
    fail = false;
    await start(); // restarted minutes later, now online
    assert.equal(calls, 2, "R1: a failed check must not use up the day; the next start must check again");
    await start(); // restarted again: the successful check counts
    assert.equal(calls, 2, "R1: a successful check is remembered for the day");
    Module._load = realLoad;
    fs.rmSync(userData, { recursive: true, force: true });
  }

  // ---------------------------------------------------------------- R2
  {
    const context = read("src/main/ipc/context.ts");
    const endSession = context.slice(context.indexOf("export const endSession"), context.indexOf("\n};", context.indexOf("export const endSession")));
    assert.match(endSession, /clearAttachmentCache\(/, "R2: endSession (expiry, ban) must clear the attachment cache");
    const auth = read("src/main/ipc/handlers/auth-handlers.ts");
    const delStart = auth.indexOf('"desktop:auth-delete-account"');
    assert.ok(delStart > 0, "the delete-account handler was not found");
    const deleteAccount = auth.slice(delStart, auth.indexOf("handle(", delStart + 10));
    assert.match(deleteAccount, /clearAttachmentCache\(|endSession\(/, "R2: deleting the account must clear the attachment cache");
  }

  // ---------------------------------------------------------------- R4
  {
    const realLoad = Module._load;
    Module._load = function load(request, ...rest) {
      if (request === "electron") return { app: { getPath: () => os.tmpdir() } };
      return realLoad.call(this, request, ...rest);
    };
    delete require.cache[require.resolve(path.join(projectRoot, "dist/main/attachment-cache.js"))];
    const { createAttachmentCache } = require(path.join(projectRoot, "dist/main/attachment-cache.js"));
    Module._load = realLoad;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ct-attach-race-"));
    const cache = createAttachmentCache({ dir, maxBytes: 50 * 1024 * 1024 });
    const big = (fill) => Buffer.alloc(2_000_000, fill);
    for (let round = 0; round < 25; round += 1) {
      const id = `same-${round}`;
      await Promise.all([cache.put(id, "image/png", big(1)), cache.put(id, "image/png", big(2)), cache.put(id, "image/png", big(3))]);
      const got = await cache.get(id);
      assert.ok(got, `R4: round ${round}: nothing cached`);
      assert.equal(got.bytes.length, 2_000_000, `R4: round ${round}: a half-written file was cached (${got.bytes.length} bytes)`);
      const first = got.bytes[0];
      assert.ok(got.bytes.every((b) => b === first), `R4: round ${round}: the cached file mixes two downloads`);
    }
    const leftovers = fs.readdirSync(dir).filter((n) => n.endsWith(".tmp"));
    assert.deepEqual(leftovers, [], "R4: temporary files were left behind");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ---------------------------------------------------------------- R8
  {
    const manager = read("src/renderer/src/features/livekit/services/stream/stream-manager.ts");
    const discStart = manager.indexOf("public async disconnect(");
    const disc = manager.slice(discStart, manager.indexOf("await room.disconnect()", discStart));
    assert.match(manager.slice(discStart, discStart + 120), /disconnect\(\s*(options|\{)[^)]*\)/,
      "R8: disconnect() must take an option saying whether the share is being carried to another room");
    const keepBlock = disc.slice(disc.indexOf("unpublishTrack(") - 600, disc.indexOf("unpublishTrack(") + 60);
    assert.match(keepBlock, /keepScreenShare/, "R8: the unpublish-without-stop must run only when the caller asked to keep the share");
    const replacing = manager.slice(manager.indexOf("replaced-room") - 1500, manager.indexOf("replaced-room") + 1500);
    assert.match(manager, /this\.disconnect\(\s*\{\s*keepScreenShare:\s*true\s*\}\s*\)/, "R8: the room-switch path must ask to keep the share");
    assert.ok(replacing.length > 0);
    const session = read("src/renderer/src/features/livekit/hooks/use-livekit-session.ts");
    assert.doesNotMatch(session, /disconnect\(\s*\{\s*keepScreenShare:\s*true/, "R8: tearing the session down must not keep the share alive");
  }

  console.log("review-fixes check passed (failed update check does not use up the day; every session end clears attachments; concurrent puts never cache a partial file; only a room switch keeps the share's tracks)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
