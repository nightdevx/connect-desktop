#!/usr/bin/env node
// Self-check for the room-change rules in
// src/renderer/src/features/workspace/hooks/lobby/lobby-transition.ts.
//
// This is the highest-churn path in the product and the one with the most
// expensive failure: a user is in at most one room, so whatever decides "let go
// of the current one" decides whether a refused join leaves them nowhere.
//
// Two rules, both learned from real reports:
//
//   * lobby -> lobby must NOT leave first. The server's join is exclusive — it
//     removes the user from every other lobby as part of admitting them — so
//     leaving up front bought nothing and made every refusal destructive:
//     cancelling a password prompt, a full room, a ban, a timed-out request each
//     returned to a user who had already been removed from the room they were
//     sitting in.
//   * anything involving a 1:1 call still tears down. There is another person on
//     the other end, and nothing else will tell them.
//
// And the interlock: a background reconnect must stand down while a deliberate
// join or leave is in flight, because a re-join lands as an exclusive join and
// can pull the user out of the room they are moving into.
//
// The module is pure — no React, no DOM — so it bundles standalone, into
// node_modules/.cache for the same reason check-chat-links.cjs does.
//
//   node scripts/check-room-transition.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-room-transition-"));

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
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/workspace/hooks/lobby/lobby-transition.ts",
        ),
        formats: ["es"],
        fileName: () => "lobby-transition.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const bundle = path.join(outDir, "lobby-transition.mjs");
  const {
    resolveRoomTransition,
    isLobbyTransitionBusy,
    createLobbyTransitionState,
  } = await import(pathToFileURL(bundle).href);

  // --- the matrix ----------------------------------------------------------
  const cases = [
    {
      name: "lobby -> another lobby leaves nothing behind",
      current: "main-lobby",
      next: "oyun-odasi",
      want: "none",
    },
    {
      name: "the same lobby is not a transition at all",
      current: "main-lobby",
      next: "main-lobby",
      want: "none",
    },
    {
      name: "not being in a room is not a transition",
      current: null,
      next: "main-lobby",
      want: "none",
    },
    {
      name: "lobby -> nothing must leave: nothing else lets go of it",
      current: "main-lobby",
      next: null,
      want: "leave-lobby",
    },
    {
      name: "lobby -> call must leave: the call join is not exclusive with it",
      current: "main-lobby",
      next: "call_alice_bob",
      want: "leave-lobby",
    },
    {
      name: "call -> lobby tears the call down, so the peer is told",
      current: "call_alice_bob",
      next: "main-lobby",
      want: "teardown-call",
    },
    {
      name: "call -> nothing tears the call down",
      current: "call_alice_bob",
      next: null,
      want: "teardown-call",
    },
    {
      name: "call -> another call still tears the first one down",
      current: "call_alice_bob",
      next: "call_alice_carol",
      want: "teardown-call",
    },
  ];

  for (const testCase of cases) {
    assert.equal(
      resolveRoomTransition(testCase.current, testCase.next),
      testCase.want,
      testCase.name,
    );
  }

  // The regression this file exists for, stated on its own so the failure
  // message names it.
  assert.notEqual(
    resolveRoomTransition("main-lobby", "oyun-odasi"),
    "leave-lobby",
    "switching lobbies must not leave first: a refused join would strand the user in no room",
  );

  // --- the interlock -------------------------------------------------------
  const idle = createLobbyTransitionState();
  assert.equal(isLobbyTransitionBusy(idle), false, "a fresh state is idle");

  assert.equal(
    isLobbyTransitionBusy({ joiningLobbyId: "main-lobby", isLeaving: false }),
    true,
    "a join in flight blocks the background reconnect",
  );
  assert.equal(
    isLobbyTransitionBusy({ joiningLobbyId: null, isLeaving: true }),
    true,
    "a leave in flight blocks it too — this is the half the UI used to ignore",
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    `room-transition self-check passed (${cases.length} transitions, interlock closed both ways)`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
