#!/usr/bin/env node
// Self-check for the screen-share audience protocol in
// src/renderer/src/features/livekit/services/stream/screen-watchers.ts.
//
// Nothing in WebRTC reports who subscribed, so who-is-watching-whom is assembled
// entirely from what clients tell each other on the room data channel. That is
// remote input rendered as a name on a tile, and the three things that can go
// wrong with it are all silent:
//
//   BOUNDED    a hostile or broken frame must not produce an unbounded list, an
//              empty name, or a crash in JSON.parse.
//   INVERTED   the map has to answer "who is watching me", built from messages
//              that only ever say "here is what I am watching".
//   IDEMPOTENT re-announcing the same state must produce an identical map, or
//              every re-announce re-renders every tile and re-fires the cue.
//
// The module is pure -- no LiveKit, no DOM beyond TextEncoder -- so it bundles
// standalone. Output goes under node_modules/.cache for the same reason the
// other checks do: bare specifiers cannot resolve from a system temp directory.
//
//   node scripts/check-screen-watchers.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-screen-watchers-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/livekit/services/stream/screen-watchers.ts",
        ),
        formats: ["es"],
        fileName: () => "screen-watchers.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const {
    SCREEN_WATCH_TOPIC,
    buildWatcherMap,
    decodeWatchState,
    encodeWatchState,
    watcherMapsEqual,
  } = await import(pathToFileURL(path.join(outDir, "screen-watchers.mjs")).href);

  const encoder = new TextEncoder();
  const raw = (value) => encoder.encode(value);

  // --- round trip -----------------------------------------------------------
  assert.deepEqual(decodeWatchState(encodeWatchState(["ali", "veli"])), [
    "ali",
    "veli",
  ]);
  assert.deepEqual(
    decodeWatchState(encodeWatchState([])),
    [],
    "an empty list is a real state -- it means this viewer stopped watching",
  );
  assert.deepEqual(
    decodeWatchState(encodeWatchState(["  ali  ", "ali", ""])),
    ["ali"],
    "identities are trimmed and de-duplicated before they go on the wire",
  );

  // --- bounded --------------------------------------------------------------
  assert.equal(
    decodeWatchState(raw("not json at all")),
    null,
    "a non-JSON payload is somebody else's message, not a crash",
  );
  assert.equal(decodeWatchState(raw("[1,2,3]")), null, "an array is not a frame");
  assert.equal(decodeWatchState(raw("null")), null);
  assert.equal(
    decodeWatchState(raw(JSON.stringify({ t: "other.topic", v: 1, targets: ["x"] }))),
    null,
    "another feature's data frame must be ignored, not parsed",
  );
  assert.equal(
    decodeWatchState(raw(JSON.stringify({ t: SCREEN_WATCH_TOPIC, v: 2, targets: [] }))),
    null,
    "a future protocol version is not this one",
  );
  assert.equal(
    decodeWatchState(raw(JSON.stringify({ t: SCREEN_WATCH_TOPIC, v: 1 }))),
    null,
    "a frame with no targets array is malformed",
  );

  const flood = Array.from({ length: 5000 }, (_, index) => `user-${index}`);
  const decodedFlood = decodeWatchState(
    raw(JSON.stringify({ t: SCREEN_WATCH_TOPIC, v: 1, targets: flood })),
  );
  assert.ok(
    decodedFlood.length > 0 && decodedFlood.length <= 32,
    `a 5000-entry frame decoded to ${decodedFlood.length} -- it must be capped`,
  );

  const junk = decodeWatchState(
    raw(
      JSON.stringify({
        t: SCREEN_WATCH_TOPIC,
        v: 1,
        targets: [null, 42, {}, "", "   ", "x".repeat(500), "ali"],
      }),
    ),
  );
  assert.deepEqual(
    junk,
    ["ali"],
    "non-strings, blanks and over-long identities are dropped, the rest survives",
  );

  // --- inverted -------------------------------------------------------------
  // ali and veli both watch mehmet; mehmet watches nobody.
  const byViewer = new Map([
    ["ali", ["mehmet"]],
    ["veli", ["mehmet", "ayse"]],
    ["mehmet", []],
  ]);

  const watchers = buildWatcherMap(byViewer, "ben", ["mehmet"]);
  assert.deepEqual(
    watchers.mehmet,
    ["ali", "ben", "veli"],
    "the local viewer counts itself into the audience, and the list is sorted",
  );
  assert.deepEqual(watchers.ayse, ["veli"]);
  assert.equal(
    watchers.ben,
    undefined,
    "nobody is watching the local user's own share",
  );

  const selfWatch = buildWatcherMap(new Map([["ali", ["ali"]]]), "", []);
  assert.deepEqual(
    selfWatch,
    {},
    "a client claiming to watch itself must not inflate its own audience",
  );

  const noLocal = buildWatcherMap(byViewer, "", ["mehmet"]);
  assert.deepEqual(
    noLocal.mehmet,
    ["ali", "veli"],
    "with no local identity yet, only what other people reported is counted",
  );

  // --- idempotent -----------------------------------------------------------
  const again = buildWatcherMap(byViewer, "ben", ["mehmet"]);
  assert.ok(
    watcherMapsEqual(watchers, again),
    "the same inputs must produce a map that compares equal",
  );
  assert.ok(
    !watcherMapsEqual(watchers, buildWatcherMap(byViewer, "ben", [])),
    "the local viewer leaving an audience is a change",
  );
  assert.ok(
    !watcherMapsEqual(watchers, {}),
    "an empty map is never equal to a populated one",
  );
  assert.ok(
    watcherMapsEqual({}, {}),
    "two empty maps are equal -- this is the common case between rooms",
  );
  assert.ok(
    !watcherMapsEqual({ a: ["x"] }, { a: ["y"] }),
    "same size, different audience",
  );

  // Order of arrival must not matter: the same set announced by the same people
  // in a different sequence is the same audience.
  const reordered = buildWatcherMap(
    new Map([
      ["mehmet", []],
      ["veli", ["ayse", "mehmet"]],
      ["ali", ["mehmet"]],
    ]),
    "ben",
    ["mehmet"],
  );
  assert.ok(
    watcherMapsEqual(watchers, reordered),
    "announcement order must not change the assembled audience",
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    "screen-watchers self-check passed (frames bounded, audiences inverted, re-announces idempotent)",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
