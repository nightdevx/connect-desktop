#!/usr/bin/env node
// Self-check for room-session-controller.ts: when the reconnect scheduler may
// re-join a room, and when it must wait or give up.
//
// Each rule is a way a background re-join went wrong before: re-joining a room
// the server had just kicked the user from, firing against the room they had
// left for another (every join is exclusive, so that pulled them out of the
// one they were in), racing a deliberate join, dialling with no network.
//
//   node scripts/check-room-session.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-room-session-"));
  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    publicDir: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/renderer/src/features/workspace/hooks/lobby/room-session-controller.ts"),
        formats: ["es"],
        fileName: () => "room-session-controller.mjs",
      },
    },
  });
  const { decideOnTrigger, decideOnAttempt } = await import(
    pathToFileURL(path.join(outDir, "room-session-controller.mjs")).href
  );

  const calm = {
    activeRoomId: "main-lobby",
    kickedRoomId: null,
    transitionBusy: false,
    online: true,
    attemptInFlight: false,
  };

  // --- on a trigger -----------------------------------------------------------
  assert.deepEqual(decideOnTrigger(calm), { schedule: true, roomId: "main-lobby" });
  assert.deepEqual(decideOnTrigger({ ...calm, activeRoomId: null }), { schedule: false, why: "no-room" });
  assert.deepEqual(
    decideOnTrigger({ ...calm, kickedRoomId: "main-lobby" }),
    { schedule: false, why: "kicked" },
    "a re-join was scheduled into the room the user was just kicked from",
  );
  assert.equal(
    decideOnTrigger({ ...calm, kickedRoomId: "other" }).schedule,
    true,
    "a kick from another room blocked this one",
  );

  // --- when the attempt fires -------------------------------------------------
  assert.deepEqual(decideOnAttempt("main-lobby", calm), { action: "rejoin", roomId: "main-lobby", kind: "lobby" });
  assert.deepEqual(
    decideOnAttempt("call_42", { ...calm, activeRoomId: "call_42" }),
    { action: "rejoin", roomId: "call_42", kind: "call" },
  );
  assert.deepEqual(
    decideOnAttempt("main-lobby", { ...calm, activeRoomId: "gaming" }),
    { action: "drop", why: "moved" },
    "an attempt armed for the old room fired against the new one",
  );
  assert.deepEqual(decideOnAttempt("main-lobby", { ...calm, activeRoomId: null }), { action: "drop", why: "no-room" });
  assert.deepEqual(
    decideOnAttempt("main-lobby", { ...calm, kickedRoomId: "main-lobby" }),
    { action: "drop", why: "kicked" },
    "a kick that arrived during the backoff was undone by the attempt",
  );
  assert.deepEqual(
    decideOnAttempt("main-lobby", { ...calm, transitionBusy: true }),
    { action: "wait", why: "transition" },
    "a background re-join raced a deliberate join",
  );
  assert.deepEqual(decideOnAttempt("main-lobby", { ...calm, online: false }), { action: "wait", why: "offline" });
  assert.deepEqual(
    decideOnAttempt("main-lobby", { ...calm, attemptInFlight: true }),
    { action: "wait", why: "in-flight" },
    "two re-join attempts ran at once",
  );
  // Order matters: a move beats a busy transition (the transition is the move).
  assert.equal(decideOnAttempt("main-lobby", { ...calm, activeRoomId: "gaming", transitionBusy: true }).action, "drop");

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("room-session self-check passed (trigger: room, kick; attempt: moved, left, kicked, transition, offline, in flight, call/lobby)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
