#!/usr/bin/env node
// Self-check for resolveMappedTracks in
// src/renderer/src/features/workspace/components/lobby/lobby-view-utils.ts.
//
// This function decides WHOSE camera, screen share and speaking state a given
// roster row is rendered with. Getting it wrong does not throw and does not fail
// a typecheck: it just draws one person's video, and lights one person's speaking
// ring, on somebody else's tile.
//
// It used to fall back to case-insensitive substring matching in both directions
// over every entry in the map --
//
//     id.includes(userId) || userId.includes(id)
//
// -- which is how "the green ring shows the wrong person" happens. The LiveKit
// identity is the account id (the backend mints the token with
// SetIdentity(user.ID), see internal/media/livekit/handler.go), so the exact
// lookup below is the entire mapping, and this check is here to keep a future
// "be more forgiving" edit from reintroducing a wrong answer.
//
// The module has no runtime imports at all -- livekit-client is type-only -- so
// it bundles without electron, React or a DOM. Output goes under
// node_modules/.cache for the same reason check-publish-plan.cjs does: bare
// specifiers cannot resolve from a system temp directory.
//
//   node scripts/check-participant-mapping.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

// Enough of a ParticipantMediaState to be told apart. `isLocal` is the flag the
// function reads; the label is only here to make a failure legible.
const mediaState = (label, isLocal = false) => ({
  label,
  participant: { isLocal },
  isSpeaking: false,
});

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-participant-mapping-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Not vite.config.ts: it carries the Sentry plugin, which would upload a
    // source map for this throwaway bundle on every check run.
    configFile: false,
    resolve: {
      alias: { "@": path.join(projectRoot, "src/renderer/src") },
    },
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/workspace/components/lobby/lobby-view-utils.ts",
        ),
        formats: ["es"],
        fileName: () => "lobby-view-utils.mjs",
      },
      rollupOptions: { external: ["electron", "livekit-client"] },
    },
  });

  const bundle = path.join(outDir, "lobby-view-utils.mjs");
  const { resolveMappedTracks } = await import(pathToFileURL(bundle).href);

  // Two accounts whose ids contain one another. This is the exact shape the old
  // substring fallback got wrong, and ids like these are ordinary: any scheme
  // where one id is a prefix of another produces them.
  const streams = {
    "user-1": mediaState("user-1"),
    "user-10": mediaState("user-10"),
  };

  // --- an exact id wins, both ways -----------------------------------------
  assert.equal(
    resolveMappedTracks({ userId: "user-1", username: "ada" }, streams).label,
    "user-1",
    "an exact id must map to its own entry",
  );
  assert.equal(
    resolveMappedTracks({ userId: "user-10", username: "bora" }, streams).label,
    "user-10",
    "'user-10' must not be answered with 'user-1' because one contains the other",
  );

  // --- somebody with no LiveKit presence gets nothing -----------------------
  // A roster row for a member who has not connected to the room yet, or whose
  // media this client never subscribed to, has no tracks and is not speaking.
  // Handing them the first loosely-matching entry is the bug this replaces.
  assert.equal(
    resolveMappedTracks({ userId: "user", username: "ceyda" }, streams),
    undefined,
    "a prefix of a real id is a different account and must map to nothing",
  );
  assert.equal(
    resolveMappedTracks({ userId: "user-1-extra", username: "deniz" }, streams),
    undefined,
    "an id that merely contains a real one must map to nothing",
  );

  // --- a username is not a key ---------------------------------------------
  // The map is keyed by identity only. Matching on username too meant a person
  // who set their display handle to somebody else's id could take their tile.
  assert.equal(
    resolveMappedTracks({ userId: "user-404", username: "user-1" }, streams),
    undefined,
    "a username must never be used as a lookup key",
  );

  // --- the local placeholder is the one exception ---------------------------
  // The local roster row can be built client-side before the server confirms the
  // join, so its userId may not be in the map yet; the local participant is then
  // found by flag.
  const withLocal = {
    "user-1": mediaState("user-1"),
    "local-identity": mediaState("local", true),
  };
  assert.equal(
    resolveMappedTracks(
      { userId: "not-yet-known", username: "me", isLocalUser: true },
      withLocal,
    ).label,
    "local",
    "the local tile falls back to the local participant",
  );
  // But only for the local row: a remote row must never be answered with the
  // local participant's camera.
  assert.equal(
    resolveMappedTracks({ userId: "not-yet-known", username: "them" }, withLocal),
    undefined,
    "a remote row must not fall back to the local participant",
  );
  // And an exact key still beats the fallback, so the local user's own entry is
  // used when it exists.
  assert.equal(
    resolveMappedTracks(
      { userId: "user-1", username: "me", isLocalUser: true },
      withLocal,
    ).label,
    "user-1",
    "an exact key must outrank the local fallback",
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("participant-mapping self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
