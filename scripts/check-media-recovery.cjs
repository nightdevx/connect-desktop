#!/usr/bin/env node
// Self-check for the deferred media check in
// src/renderer/src/features/workspace/hooks/lobby/media-recovery-check.ts.
//
// When the network came back, or the machine woke, the app used to rejoin the
// media room at once. LiveKit was resuming that very session, so the rejoin
// replaced a room that was about to recover: the SFU logged a successful
// resume, then CLIENT_REQUEST_LEAVE a second later and a brand-new session — a
// two-second hole in everyone's audio for a blip LiveKit had already handled.
//
// The rules this pins down:
//
//   WAIT      a session LiveKit still holds is left alone; the app looks again
//             only after LiveKit has had its chance.
//   STEP IN   if LiveKit gave up during that wait, the app rejoins — once.
//   NO WAIT   if there is no session left at all, the rejoin is immediate;
//             waiting would only add the delay to a rejoin that is certain.
//   MOVED     a check armed for one room never fires against another, nor
//             after the user left: a rejoin is an exclusive server-side join
//             and would pull them out of where they are now.
//   RESTART   a second trigger restarts the wait instead of stacking a check.
//
// The module is pure — timers and state come in as arguments — so it bundles
// standalone, into node_modules/.cache like check-room-transition.cjs.
//
//   node scripts/check-media-recovery.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");
const modulePath =
  "src/renderer/src/features/workspace/hooks/lobby/media-recovery-check.ts";
const hookPath =
  "src/renderer/src/features/workspace/hooks/lobby/use-workspace-lobbies.ts";

// A manual clock: timers fire only when the test advances time, in order.
const createClock = () => {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map();
  return {
    now: () => now,
    pending: () => timers.size,
    setTimer: (callback, delayMs) => {
      const handle = nextHandle++;
      timers.set(handle, { at: now + delayMs, callback });
      return handle;
    },
    clearTimer: (handle) => {
      timers.delete(handle);
    },
    advanceTo: (target) => {
      for (;;) {
        let due = null;
        for (const [handle, timer] of timers) {
          if (timer.at <= target && (due === null || timer.at < due.timer.at)) {
            due = { handle, timer };
          }
        }
        if (due === null) {
          break;
        }
        timers.delete(due.handle);
        now = due.timer.at;
        due.timer.callback();
      }
      now = target;
    },
  };
};

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-media-recovery-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Not vite.config.ts: it carries the Sentry plugin, which would upload a
    // source map for this throwaway bundle on every check run.
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, modulePath),
        formats: ["es"],
        fileName: () => "media-recovery-check.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const { createMediaRecoveryCheck, MEDIA_RECOVERY_CHECK_DELAY_MS: DELAY } =
    await import(pathToFileURL(path.join(outDir, "media-recovery-check.mjs")).href);

  // LiveKit's own recovery has to fit inside the wait: a signal resume is held
  // for at least 2 s and an ICE restart takes a few more. And a session LiveKit
  // gave up on must be rebuilt well inside the server's 45 s membership TTL.
  assert.ok(DELAY >= 5_000, `a ${DELAY} ms wait cuts into LiveKit's own resume`);
  assert.ok(DELAY <= 15_000, `a ${DELAY} ms wait leaves a dead room silent too long`);

  // One scenario: `alive(t, lobbyId)` says whether LiveKit holds a session for
  // that lobby at time t; `lobbyAt(t)` is the room the user is in.
  const run = ({ alive, lobbyAt = () => "lobby-a", triggers = [0], until }) => {
    const clock = createClock();
    const rejoins = [];
    const check = createMediaRecoveryCheck({
      activeLobby: () => lobbyAt(clock.now()),
      isMediaAlive: (lobbyId) => alive(clock.now(), lobbyId),
      rejoin: () => rejoins.push(clock.now()),
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    for (const at of triggers) {
      clock.advanceTo(at);
      check.schedule();
    }
    clock.advanceTo(until ?? triggers[triggers.length - 1] + DELAY * 3);
    return { rejoins, pending: clock.pending(), check, clock };
  };

  // WAIT: LiveKit resumes by itself. The whole point — no rejoin at all.
  assert.deepEqual(
    run({ alive: () => true }).rejoins,
    [],
    "a session LiveKit still holds must not be replaced",
  );

  // Reconnecting through the wait and back: still nothing to do.
  assert.deepEqual(
    run({ alive: (t) => t < 1_000 || t > 3_000 }).rejoins,
    [],
    "a session that dipped and came back during the wait must be left alone",
  );

  // STEP IN: LiveKit gave up during the wait. One rejoin, when the wait ends.
  assert.deepEqual(
    run({ alive: (t) => t < 4_000 }).rejoins,
    [DELAY],
    "a session LiveKit gave up on during the wait must be rejoined, once",
  );

  // NO WAIT: nothing left to wait for.
  const dead = run({ alive: () => false });
  assert.deepEqual(dead.rejoins, [0], "a session already gone must be rejoined at once");
  assert.equal(dead.pending, 0, "an immediate rejoin must not leave a check behind");

  // MOVED: armed for lobby-a, the user is in lobby-b by the time it fires, and
  // lobby-b's session is not up (yet). That room has its own lifecycle.
  assert.deepEqual(
    run({
      alive: (t, lobbyId) => lobbyId === "lobby-a" && t < 1_000,
      lobbyAt: (t) => (t < 2_000 ? "lobby-a" : "lobby-b"),
    }).rejoins,
    [],
    "a check armed for one room must not fire against the next",
  );
  assert.deepEqual(
    run({
      alive: (t) => t < 1_000,
      lobbyAt: (t) => (t < 2_000 ? "lobby-a" : null),
    }).rejoins,
    [],
    "a check must not rejoin a room the user has left",
  );

  // No room at all: nothing to check.
  const idle = run({ alive: () => false, lobbyAt: () => null });
  assert.deepEqual(idle.rejoins, [], "with no active room there is nothing to rejoin");
  assert.equal(idle.pending, 0, "with no active room no check may be armed");

  // RESTART: a second trigger 5 s in restarts the wait. The session dies at
  // 6 s; the first check (due at DELAY) must be gone, so the rejoin comes at
  // 5 s + DELAY and only then.
  const restarted = run({ alive: (t) => t < 6_000, triggers: [0, 5_000] });
  assert.deepEqual(
    restarted.rejoins,
    [5_000 + DELAY],
    "a second trigger must restart the wait, not stack a second check",
  );

  // cancel() drops the pending check (the hook calls it on unmount).
  {
    const clock = createClock();
    const rejoins = [];
    const check = createMediaRecoveryCheck({
      activeLobby: () => "lobby-a",
      isMediaAlive: (lobbyId) => lobbyId === "lobby-a" && clock.now() < 1_000,
      rejoin: () => rejoins.push(clock.now()),
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    check.schedule();
    assert.equal(clock.pending(), 1, "a live session arms exactly one check");
    check.cancel();
    clock.advanceTo(DELAY * 3);
    assert.deepEqual(rejoins, [], "a cancelled check must not fire");
  }

  // The hook really goes through the module, and nothing else turns "network
  // came back" into an immediate rejoin — the regression this replaced.
  const hook = fs.readFileSync(path.join(projectRoot, hookPath), "utf8");
  assert.ok(
    hook.includes("createMediaRecoveryCheck("),
    "use-workspace-lobbies no longer uses the media recovery check",
  );
  assert.equal(
    hook.split('scheduleActiveLobbyReconnect("network-online"').length - 1,
    1,
    "a network-online rejoin is issued outside the media recovery check again",
  );
  assert.equal(
    hook.split("handles.scheduleActiveLobbyMediaCheck()").length - 1,
    2,
    "both the online and the wake paths must go through the deferred check",
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(`media recovery check passed (wait ${DELAY} ms)`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
