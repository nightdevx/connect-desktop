#!/usr/bin/env node
// Self-check for the member-move rules in
// src/renderer/src/features/workspace/components/lobby/parts/member-move.ts.
//
// Moving somebody is offered from two places -- the right-click menu and
// dragging their row onto a room -- and they have to agree on which rooms are a
// legal destination, or one of them offers a click that can only fail. The
// destination list and the drop test are the same rule seen from two angles, so
// this checks them together.
//
// The drop payload is the other half: a drag can start anywhere, including
// outside the app, so a drop is untrusted input and a half-formed one must not
// become a move request with an empty user id.
//
// The module is pure -- no React, no DOM -- so it bundles standalone. Output
// goes under node_modules/.cache for the same reason check-speaking-state.cjs
// does: bare specifiers cannot resolve from a system temp directory.
//
//   node scripts/check-member-move.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-member-move-"));

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
          "src/renderer/src/features/workspace/components/lobby/parts/member-move.ts",
        ),
        formats: ["es"],
        fileName: () => "member-move.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const bundle = path.join(outDir, "member-move.mjs");
  const {
    buildMoveTargets,
    canDropMemberOn,
    decodeMemberDrag,
    encodeMemberDrag,
    MEMBER_DRAG_TYPE,
  } = await import(pathToFileURL(bundle).href);

  const LOBBIES = [
    { id: "genel", name: "Genel", isTextOnly: false },
    { id: "oyun", name: "Oyun", isTextOnly: false },
    { id: "duyuru", name: "Duyuru", isTextOnly: true },
  ];

  // --- which rooms may receive a member --------------------------------------
  const targets = buildMoveTargets(LOBBIES, "genel");
  assert.deepEqual(
    targets.map((target) => target.id),
    ["oyun"],
    "the source room and every text room must be excluded",
  );
  assert.equal(targets[0].name, "Oyun", "the menu row needs the room's name");

  // A text room has no roster at all: moving somebody there takes them out of
  // voice and puts them nowhere.
  assert.deepEqual(
    buildMoveTargets(LOBBIES, "duyuru").map((target) => target.id),
    ["genel", "oyun"],
  );
  assert.deepEqual(buildMoveTargets([], "genel"), []);

  // --- the drop test must agree with the list --------------------------------
  const payload = {
    userId: "u1",
    username: "ayse",
    sourceLobbyId: "genel",
  };

  for (const lobby of LOBBIES) {
    const listed = targets.some((target) => target.id === lobby.id);
    assert.equal(
      canDropMemberOn(payload, lobby),
      listed,
      `drop and menu disagree about ${lobby.id}`,
    );
  }

  assert.equal(
    canDropMemberOn(null, LOBBIES[1]),
    false,
    "a drag carrying nothing of ours is not a drop",
  );

  // --- the payload survives a round trip -------------------------------------
  assert.equal(typeof MEMBER_DRAG_TYPE, "string");
  assert.ok(MEMBER_DRAG_TYPE.length > 0);
  assert.deepEqual(decodeMemberDrag(encodeMemberDrag(payload)), payload);

  // --- a drop is untrusted input ---------------------------------------------
  const REJECTED = [
    "",
    "not json at all",
    "[]",
    "null",
    '"just a string"',
    "{}",
    JSON.stringify({ username: "ayse", sourceLobbyId: "genel" }),
    JSON.stringify({ userId: "", sourceLobbyId: "genel" }),
    JSON.stringify({ userId: "u1", sourceLobbyId: "   " }),
    JSON.stringify({ userId: 7, sourceLobbyId: "genel" }),
    JSON.stringify({ userId: "u1" }),
  ];

  for (const raw of REJECTED) {
    assert.equal(
      decodeMemberDrag(raw),
      null,
      `must refuse: ${JSON.stringify(raw)}`,
    );
  }

  // A missing username is recoverable -- the id is what the move needs, and the
  // name is only there for the confirmation message.
  const nameless = decodeMemberDrag(
    JSON.stringify({ userId: "u1", sourceLobbyId: "genel" }),
  );
  assert.equal(nameless.userId, "u1");
  assert.equal(nameless.username, "u1", "the id stands in for a missing name");

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    "member-move self-check passed (menu and drop agree, malformed drops refused)",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
