#!/usr/bin/env node
// Self-check for the session lifecycle of the media diagnostics collector
// (src/renderer/src/services/media-diagnostics.ts).
//
// A session used to stay open until its final upload came back. A room switch
// does not wait for that: the next room found the session still active, wrote
// into it, and everything it recorded after that was dropped once the old
// session closed underneath it. Every room change went unrecorded — the
// sessions the diagnostics exist for, reconnects included. And a periodic batch
// still in flight could land after the final one, while the server keeps the
// summary of whichever batch it stored last.
//
//   CLOSED        endSession() closes the session at once, before its upload
//                 is answered.
//   NEXT          the next session records from its first entry while the
//                 previous one is still uploading.
//   ORDER         batches reach the server in the order they were cut, across
//                 sessions; a session's last batch is its final one.
//   NOTHING LOST  every recorded entry arrives in exactly one batch, and a
//                 failed periodic batch is retried — but never inherited by the
//                 session after it.
//
// The collector is bundled standalone with the two @shared modules it imports
// and run against a stub uploader that answers with a programmable delay.
//
//   node scripts/check-diagnostics-session.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-diagnostics-session-"));

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
        entry: path.join(projectRoot, "src/renderer/src/services/media-diagnostics.ts"),
        formats: ["es"],
        fileName: () => "media-diagnostics.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  // The uploader: answers each call after the next scripted delay, with the
  // next scripted outcome, and records what arrived in arrival order.
  const arrived = [];
  let script = [];
  globalThis.window = {
    // The collector's own flush timer is not used: the test flushes by hand.
    setInterval: () => 1,
    clearInterval: () => {},
    desktopApi: {
      uploadMediaDiagnostics: (batch) => {
        const { delay = 0, ok = true } = script.shift() ?? {};
        return new Promise((resolve) => {
          setTimeout(() => {
            if (ok) {
              arrived.push(JSON.parse(JSON.stringify(batch)));
            }
            resolve(ok ? { ok: true, data: { stored: true, enabled: true } } : { ok: false });
          }, delay);
        });
      },
    },
  };

  const { mediaDiagnostics: collector } = await import(
    pathToFileURL(path.join(outDir, "media-diagnostics.mjs")).href
  );
  const flush = () => collector["flush"]();
  const label = (batch) => `${batch.lobbyId}#${batch.seq}${batch.final ? "F" : ""}`;
  const names = (batch) => batch.entries.map((entry) => entry.name);
  const take = () => arrived.splice(0);

  // --- a room switch while the previous session is still uploading ----------
  collector.startSession("lobby-a");
  collector.record("session", "a-1");
  script = [{ delay: 80 }];
  const periodic = flush(); // slow: still in flight when the session ends
  collector.record("session", "a-2");
  const endA = collector.endSession();
  assert.equal(
    collector.isActive(),
    false,
    "endSession must close the session before its upload is answered",
  );

  collector.startSession("lobby-b");
  assert.ok(collector.isActiveFor("lobby-b"), "the next room must get its own session");
  assert.ok(!collector.isActiveFor("lobby-a"), "the previous room's session must be over");
  collector.record("session", "b-1");
  const endB = collector.endSession();
  await Promise.all([periodic, endA, endB]);

  const switched = take();
  assert.deepEqual(
    switched.map(label),
    ["lobby-a#1", "lobby-a#2F", "lobby-b#1F"],
    "batches must arrive in the order they were cut, the slow periodic one included",
  );
  assert.deepEqual(
    switched.flatMap((batch) => names(batch).map((name) => `${batch.lobbyId}:${name}`)),
    [
      "lobby-a:session-started",
      "lobby-a:a-1",
      "lobby-a:a-2",
      "lobby-a:session-ended",
      "lobby-b:session-started",
      "lobby-b:b-1",
      "lobby-b:session-ended",
    ],
    "every entry of both rooms must arrive, each in its own room's session",
  );
  assert.notEqual(
    switched[0].sessionId,
    switched[2].sessionId,
    "two rooms must be two sessions",
  );

  // --- a failed periodic batch is retried with the next one --------------
  collector.startSession("lobby-c");
  collector.record("session", "c-1");
  script = [{ ok: false }];
  await flush();
  await collector.endSession();
  const retried = take();
  assert.deepEqual(retried.map(label), ["lobby-c#1F"], "the failed batch's number is reused");
  assert.deepEqual(
    names(retried[0]),
    ["session-started", "c-1", "session-ended"],
    "entries of a failed batch must go out with the next one, in order",
  );

  // --- ...but never into the session after it -----------------------------
  collector.startSession("lobby-d");
  collector.record("session", "d-1");
  script = [{ delay: 50, ok: false }];
  const failing = flush(); // takes d-1 with it, then fails after the switch
  const endD = collector.endSession();
  collector.startSession("lobby-e");
  collector.record("session", "e-1");
  await Promise.all([failing, endD]);
  await collector.endSession();
  const isolated = take();
  assert.deepEqual(isolated.map(label), ["lobby-d#2F", "lobby-e#1F"]);
  assert.deepEqual(
    names(isolated[1]),
    ["session-started", "e-1", "session-ended"],
    "a batch that failed after its session ended must not reappear in the next session",
  );

  // --- a long session's tail is split, and only the last part is final -----
  collector.startSession("lobby-f");
  for (let index = 0; index < 900; index += 1) {
    collector.record("session", `f-${index}`);
  }
  await collector.endSession();
  const tail = take();
  assert.deepEqual(
    tail.map(label),
    ["lobby-f#1", "lobby-f#2", "lobby-f#3F"],
    "a tail longer than one batch must be split, final on the last part only",
  );
  assert.equal(
    tail.reduce((count, batch) => count + batch.entries.length, 0),
    902,
    "every entry of a long tail must arrive (900 + start + end)",
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    "diagnostics-session self-check passed (closed at once, ordered across sessions, nothing lost or inherited)",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
