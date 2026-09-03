#!/usr/bin/env node
// Self-check for the media diagnostics contract.
//
// The whole point of these logs is that somebody reads them WEEKS later, on a
// machine they have never seen, against a build they no longer have. That only
// works while three things stay true, and none of them is visible at runtime:
//
//   * the schema version on the wire matches the one the server stores by,
//   * every problem tag the collector can emit has a label the reader can
//     resolve, and
//   * the collector is actually fed — logLiveKitDebug is the source of ~90 call
//     sites, and it used to return early in production.
//
//   node scripts/check-media-diagnostics.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), "utf8").replace(/\r\n/g, "\n");

const shared = read("src/shared/media-diagnostics.ts");
const collector = read("src/renderer/src/services/media-diagnostics.ts");
const debugLog = read("src/renderer/src/services/debug-log.ts");
const goSharedPath = path.join(
  projectRoot,
  "..",
  "backend-go",
  "internal",
  "mediadiag",
  "mediadiag.go",
);
const goShared = fs.existsSync(goSharedPath)
  ? fs.readFileSync(goSharedPath, "utf8")
  : null;

const tsVersion = shared.match(/MEDIA_DIAGNOSTICS_SCHEMA_VERSION\s*=\s*(\d+)/);
assert.ok(tsVersion, "the client declares no schema version");

// --- every problem tag is resolvable ---------------------------------------
const problemValues = [
  ...shared.matchAll(/^\s{2}[a-zA-Z]+:\s*"([a-z-]+)",$/gm),
]
  .map((match) => match[1])
  .filter((value) => value !== "");

const problemBlock = shared.slice(
  shared.indexOf("MEDIA_DIAGNOSTIC_PROBLEMS = {"),
  shared.indexOf("} as const;", shared.indexOf("MEDIA_DIAGNOSTIC_PROBLEMS = {")),
);
const tags = [...problemBlock.matchAll(/"([a-z-]+)"/g)].map((match) => match[1]);
assert.ok(tags.length >= 10, `expected the full problem vocabulary, found ${tags.length}`);

const labelBlock = shared.slice(shared.indexOf("MEDIA_DIAGNOSTIC_PROBLEM_LABELS"));
for (const tag of tags) {
  assert.ok(
    labelBlock.includes(`"${tag}"`) || labelBlock.includes(`${tag}:`),
    `problem tag "${tag}" has no label; the admin table and the schema doc would show a bare slug`,
  );
}
assert.ok(problemValues.length >= 0);

// --- the doc documents every tag -------------------------------------------
const doc = read("docs/media-diagnostics.md");
for (const tag of tags) {
  assert.ok(
    doc.includes(`\`${tag}\``),
    `problem tag "${tag}" is missing from docs/media-diagnostics.md — the file is what an analysis is handed with the logs`,
  );
}
assert.ok(
  doc.includes("Şema sürümü: " + tsVersion[1]),
  "docs/media-diagnostics.md states a different schema version than the code",
);

// --- the collector is fed in EVERY build -----------------------------------
const recordIndex = debugLog.indexOf("mediaDiagnostics.record(");
const devGateIndex = debugLog.indexOf('process.env.NODE_ENV === \'development\'');
assert.notEqual(recordIndex, -1, "logLiveKitDebug no longer feeds the collector");
assert.notEqual(devGateIndex, -1, "the development console gate went missing");
assert.ok(
  recordIndex < devGateIndex,
  "the collector must be fed BEFORE the development-only return, or production records nothing at all — which is the bug this whole feature exists to fix",
);

// --- caps exist, so one session cannot fill the table ----------------------
for (const cap of [
  "flushIntervalMs",
  "maxEntriesPerBatch",
  "maxEntriesPerSession",
  "maxDataBytesPerEntry",
  "maxPendingEntries",
]) {
  assert.ok(shared.includes(`${cap}:`), `MEDIA_DIAGNOSTICS_LIMITS is missing ${cap}`);
}

// --- the two halves agree, when both halves are here ----------------------
let crossRepo = "cross-repo checks skipped";
if (goShared) {
  const goVersion = goShared.match(/SchemaVersion\s*=\s*(\d+)/);
  assert.ok(goVersion, "the server declares no schema version");
  assert.equal(
    tsVersion[1],
    goVersion[1],
    "client and server schema versions have drifted; a reader cannot tell which shape a stored session has",
  );

  const batchCap = Number(
    shared.match(/maxEntriesPerBatch:\s*([\d_]+)/)[1].replace(/_/g, ""),
  );
  const goBatchCap = Number(goShared.match(/MaxEntriesPerBatch\s*=\s*(\d+)/)[1]);
  assert.ok(
    goBatchCap >= batchCap,
    `the server truncates batches at ${goBatchCap} but the client sends up to ${batchCap}; entries would be silently dropped`,
  );

  const sessionCap = Number(
    shared.match(/maxEntriesPerSession:\s*([\d_]+)/)[1].replace(/_/g, ""),
  );
  const goSessionCap = Number(
    goShared.match(/MaxEntriesPerSession\s*=\s*(\d+)/)[1],
  );
  assert.equal(
    goSessionCap,
    sessionCap,
    "client and server disagree on the per-session entry cap",
  );

  crossRepo = "caps aligned";
} else {
  console.log(
    "check-media-diagnostics: backend-go is not checked out beside this repo — " +
      "the schema-version and entry-cap parity checks were SKIPPED",
  );
}

// --- the summary carries what a diagnosis reads first ----------------------
for (const field of [
  "problems",
  "eventCounts",
  "warnings",
  "outboundVideo",
  "inboundVideo",
  "rttMs",
  "packetLossOutboundPct",
  "truncated",
]) {
  assert.ok(
    shared.includes(`${field}:`),
    `MediaDiagnosticsSummary lost ${field}; the admin list and the export header read it`,
  );
}

// --- the collector derives problems rather than only counting -------------
assert.ok(
  collector.includes("deriveEventProblems"),
  "events no longer contribute problem tags, so a codec fallback would leave no trace in the summary",
);
assert.ok(
  collector.includes("MEDIA_DIAGNOSTIC_PROBLEMS.softwareEncoder"),
  "the software-encoder tag is never raised",
);

console.log(
  `media-diagnostics self-check passed (schema v${tsVersion[1]}, ${tags.length} problem tags, ${crossRepo})`,
);
