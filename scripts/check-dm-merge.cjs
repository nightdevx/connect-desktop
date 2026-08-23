#!/usr/bin/env node
// Self-check for the direct-message page merge in
// src/renderer/src/features/workspace/hooks/chat/direct-message-merge.ts.
//
// The DM query always refetches the NEWEST 120 into the same cache entry the
// "load older" pages are prepended to, so this function decides what survives a
// reconnect. Every way it can be wrong is silent and looks like the app losing
// messages:
//
//   * drop the older half -> the history the user just scrolled back for
//     disappears mid-read;
//   * drop the newer half -> a message the socket delivered while the request
//     was in flight is gone for good, since the socket carries no backlog;
//   * decide "newer" by timestamp instead of by identity -> a message deleted
//     while the socket was down is resurrected on every single refetch.
//
// All three shipped at some point during this feature, which is why the check
// exists. The module is pure -- no React, no DOM -- so it bundles standalone,
// into node_modules/.cache for the same reason check-chat-links.cjs does.
//
//   node scripts/check-dm-merge.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const message = (id, createdAt) => ({
  id,
  channel: "dm:a:b",
  userId: "u1",
  username: "ayse",
  body: id,
  createdAt,
});

const ids = (messages) => messages.map((entry) => entry.id);

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-dm-merge-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Not vite.config.ts: it carries the Sentry plugin, which would upload a
    // source map for this throwaway bundle on every check run.
    configFile: false,
    resolve: {
      alias: {
        "@shared": path.join(projectRoot, "src/shared"),
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/workspace/hooks/chat/direct-message-merge.ts",
        ),
        formats: ["es"],
        fileName: () => "direct-message-merge.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const bundle = path.join(outDir, "direct-message-merge.mjs");
  const { mergeDirectMessagePages } = await import(
    pathToFileURL(bundle).href
  );

  const merge = (cached, fresh, inFlightBefore = cached) =>
    mergeDirectMessagePages({
      cached,
      fresh,
      inFlightBefore: new Set(inFlightBefore.map((entry) => entry.id)),
    });

  // --- the reported bug: paged-in history must survive a refetch ------------
  const older = [message("m1", "10:00"), message("m2", "10:01")];
  const newest = [message("m3", "10:02"), message("m4", "10:03")];
  assert.deepEqual(
    ids(merge([...older, ...newest], newest)),
    ["m1", "m2", "m3", "m4"],
    "a refetch of the newest page must not drop the older pages",
  );

  // --- a message that arrived while the request was in flight ---------------
  const inFlight = message("m5", "10:04");
  assert.deepEqual(
    ids(merge([...newest, inFlight], newest, newest)),
    ["m3", "m4", "m5"],
    "a socket message delivered during the fetch must be kept",
  );

  // --- ...but not one the server has since deleted --------------------------
  // Same shape as above, except m5 was already in the entry when the request
  // left. The server answering without it is a deletion, not a race.
  assert.deepEqual(
    ids(merge([...newest, message("m5", "10:04")], newest, [
      ...newest,
      message("m5", "10:04"),
    ])),
    ["m3", "m4"],
    "a message deleted server-side must not come back",
  );

  // --- ties on createdAt ----------------------------------------------------
  // Two messages in the same second, split across the page boundary: the older
  // one is not in the fresh page and must not fall through both halves.
  const tie = [message("t1", "10:00"), message("t2", "10:00")];
  assert.deepEqual(
    ids(merge(tie, [tie[1]])),
    ["t1", "t2"],
    "a cached message sharing the newest page's oldest timestamp must be kept",
  );

  // --- no duplicates, in any arrangement -----------------------------------
  const everything = [...older, ...newest, inFlight];
  for (const fresh of [newest, everything, [newest[1]], older]) {
    const merged = merge(everything, fresh, older);
    const seen = new Set();
    for (const entry of merged) {
      assert.ok(!seen.has(entry.id), `duplicate ${entry.id} in the merge`);
      seen.add(entry.id);
    }
    for (const entry of fresh) {
      assert.ok(
        seen.has(entry.id),
        `the server's own page must survive: ${entry.id}`,
      );
    }
  }

  // --- ordering stays oldest-first, which is what the thread renders --------
  const merged = merge(everything, newest, older);
  const timestamps = merged.map((entry) => entry.createdAt);
  assert.deepEqual(
    [...timestamps].sort(),
    timestamps,
    "the merged thread must stay in chronological order",
  );

  // --- empty / first-load cases --------------------------------------------
  assert.deepEqual(ids(merge([], newest, [])), ["m3", "m4"]);
  assert.deepEqual(ids(merge(newest, [], newest)), [], "an empty page replaces");

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    "dm-merge self-check passed (history kept, in-flight kept, deleted stays deleted)",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
