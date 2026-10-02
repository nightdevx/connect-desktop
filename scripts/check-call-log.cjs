#!/usr/bin/env node
// Self-check for the call history in a conversation
// (src/renderer/src/features/workspace/hooks/user/call-log.ts).
//
// A call is written into the thread as fixed message bodies. The thread folds a
// "started" into the "ended" that closes it and shows the time between them;
// get the pairing wrong and every call shows twice, or a running call loses
// its entry.
//
//   node scripts/check-call-log.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-call-log-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/renderer/src/features/workspace/hooks/user/call-log.ts"),
        formats: ["es"],
        fileName: () => "call-log.mjs",
      },
    },
  });

  const { CALL_LOG_BODIES, callLogKind, pairCallLog, formatCallDuration } = await import(
    pathToFileURL(path.join(outDir, "call-log.mjs")).href
  );

  const at = (seconds) => new Date(Date.UTC(2026, 9, 2, 12, 0, seconds)).toISOString();
  const msg = (id, body, seconds) => ({ id, body, createdAt: at(seconds), userId: "u", username: "u", channel: "dm" });

  // --- recognised bodies; anything else is a message -------------------------
  assert.equal(callLogKind(CALL_LOG_BODIES.started), "started");
  assert.equal(callLogKind(CALL_LOG_BODIES.declined), "declined");
  assert.equal(callLogKind("📞 Arama bitti!"), null);
  assert.equal(callLogKind("selam"), null);

  // --- a finished call is one entry with its duration --------------------------
  const info = pairCallLog([
    msg("a", "selam", 0),
    msg("s1", CALL_LOG_BODIES.started, 10),
    msg("b", "duyuyor musun", 20),
    msg("e1", CALL_LOG_BODIES.ended, 202),
    msg("m1", CALL_LOG_BODIES.missed, 300),
    msg("s2", CALL_LOG_BODIES.started, 400),
  ]);
  assert.equal(info.get("s1")?.hidden, true, "a closed start is folded away");
  assert.equal(info.get("e1")?.durationSeconds, 192);
  assert.equal(info.get("m1"), undefined, "a missed call stands on its own");
  assert.equal(info.get("s2"), undefined, "a running call keeps its start");
  assert.equal(info.get("a"), undefined);

  // --- an end with no start, or after a missed call, carries no duration -------
  const orphan = pairCallLog([
    msg("s", CALL_LOG_BODIES.started, 0),
    msg("d", CALL_LOG_BODIES.declined, 5),
    msg("e", CALL_LOG_BODIES.ended, 9),
  ]);
  assert.equal(orphan.get("e"), undefined, "a declined call breaks the pairing");
  assert.equal(orphan.get("s"), undefined);

  // --- durations ---------------------------------------------------------------
  assert.equal(formatCallDuration(45), "45 sn");
  assert.equal(formatCallDuration(192), "3 dk 12 sn");
  assert.equal(formatCallDuration(3840), "1 sa 4 dk");

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("call-log self-check passed (pairing, orphans, durations)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
