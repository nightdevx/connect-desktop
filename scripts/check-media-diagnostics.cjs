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
  // Added in schema v2. Tags say a problem happened somewhere in three hours;
  // these say when, to whom, and what the cause was.
  "episodes",
  "remotes",
  "verdicts",
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

// --- a tag has to mean something -------------------------------------------
//
// Every sample-derived tag used to be raised by a SINGLE sample crossing a
// threshold, so "packet-loss" appeared on every session ever uploaded —
// including ones whose mean loss was 0.01%. The tags are the admin table's
// filter, so a tag that never discriminates costs the whole feature.
assert.ok(
  /problemDwellSamples:\s*[2-9]/.test(shared),
  "problem tags have no dwell, so one sample can tag a whole session",
);
assert.ok(
  collector.includes("commitSampleProblems"),
  "sample-derived tags no longer route through the dwell gate",
);
for (const raised of [
  "MEDIA_DIAGNOSTIC_PROBLEMS.packetLoss",
  "MEDIA_DIAGNOSTIC_PROBLEMS.audioConcealment",
  "MEDIA_DIAGNOSTIC_PROBLEMS.highRtt",
]) {
  assert.ok(
    collector.includes(`breached.add(${raised})`),
    `${raised} is raised straight onto the session instead of through the dwell gate`,
  );
}

// --- the client context survives joining a room ----------------------------
//
// startSession used to rebuild the client record from emptyClient(), which
// discarded everything the async setClientContext IPC had already resolved:
// app version, platform, Electron/Chrome versions, CPU threads and the GPU
// feature status. Every session ever uploaded carried "platform": "" and
// "gpu": null — the exact fields needed to explain a software encoder.
assert.ok(
  !/startSession[\s\S]*?this\.client\s*=\s*\{\s*\.\.\.emptyClient\(\)/.test(collector),
  "startSession resets the client context, discarding what setClientContext resolved",
);
assert.ok(
  /this\.client\s*=\s*\{\s*\.\.\.this\.client,\s*\.\.\.\(client \?\? \{\}\)/.test(collector),
  "startSession no longer merges onto the already-resolved client context",
);

// --- the sample cadence is the one actually used ---------------------------
//
// This constant sizes the per-session entry budget. It said 10s while the real
// producer ran at 2s, so the budget was spent five times faster than planned.
const statsCollector = read(
  "src/renderer/src/features/livekit/services/stream/stats-collector.ts",
);
const declaredInterval = Number(
  shared.match(/sampleIntervalMs:\s*([\d_]+)/)[1].replace(/_/g, ""),
);
const realInterval = Number(
  statsCollector.match(/DEFAULT_INTERVAL_MS\s*=\s*([\d_]+)/)[1].replace(/_/g, ""),
);
assert.equal(
  declaredInterval,
  realInterval,
  `MEDIA_DIAGNOSTICS_LIMITS.sampleIntervalMs (${declaredInterval}) does not match MediaStatsCollector's ${realInterval}ms`,
);

// --- a reconnect is observable, whichever kind it was -----------------------
//
// LiveKit only emits Reconnecting for a full ICE restart; a signal-channel drop
// emits SignalReconnecting and then Reconnected. Keying the tag on the
// "reconnecting" state alone missed three of four reconnects in the field.
const roomEvents = read(
  "src/renderer/src/features/livekit/services/stream/room-event-manager.ts",
);
assert.ok(
  roomEvents.includes("RoomEvent.SignalReconnecting"),
  "a signal-only reconnect is invisible: the log shows a room-reconnected with no beginning",
);
assert.ok(
  /name === "room-reconnected"/.test(collector),
  "the reconnects tag still keys only on the reconnecting state, so signal-only reconnects go untagged",
);

// --- the encoder's own account of itself -----------------------------------
//
// "Requested 60fps, encoded 27" was unanswerable from the old logs because only
// the encoder's output was recorded. The capture side lives on the media-source
// stat, and the cost side on totalEncodeTime / qualityLimitationDurations.
const mediaStats = read("src/shared/media-stats.ts");
for (const [field, why] of [
  [
    "media-source",
    "the capture framerate is never read, so a starved capture and an overloaded encoder stay indistinguishable",
  ],
  [
    "totalEncodeTime",
    "encoder cost per frame is never measured, so 'the CPU cannot keep up' stays an inference",
  ],
  [
    "qualityLimitationDurations",
    "only the instantaneous limitation reason is sampled, which says how many samples landed inside a limitation rather than how long it lasted",
  ],
  [
    "silentConcealedSamples",
    "the DTX share of concealment is not measured",
  ],
]) {
  assert.ok(mediaStats.includes(field), `${field} is not read: ${why}`);
}

// --- the readout, not just the record ---------------------------------------
assert.ok(
  shared.includes("deriveVerdicts"),
  "there is no verdict engine, so a reader is back to interpreting raw thresholds",
);
assert.ok(
  /export const deriveVerdicts = \(\s*summary: MediaDiagnosticsSummary,?\s*\)/.test(shared),
  "deriveVerdicts must be a pure function of the summary so a stored session can be re-judged later",
);
const adminUi = read(
  "src/renderer/src/features/admin/components/admin-diagnostics.tsx",
);
assert.ok(
  adminUi.includes("deriveVerdicts"),
  "the admin drawer does not show verdicts, so the new summary fields have no reader",
);
for (const field of ["episodes", "remotes"]) {
  assert.ok(
    adminUi.includes(field),
    `the admin drawer never renders summary.${field}`,
  );
}

// A per-participant breakdown is the only way to separate "their uplink" from
// "this machine's downlink", which pooled numbers cannot express.
assert.ok(
  collector.includes("trackRemote"),
  "inbound stats are pooled again; per-participant attribution is gone",
);
assert.ok(
  collector.includes("trackEpisodes"),
  "problem episodes are no longer recorded, so a tag cannot be located in time",
);

// --- the verdict engine actually decides -----------------------------------
//
// Exercised against the shapes the field logs actually produced, because a rule
// engine that compiles is not a rule engine that is right.
const compiled = require(path.join(projectRoot, "dist", "shared", "media-diagnostics.js"));
const { deriveVerdicts } = compiled;

const stat = (mean, min = mean, max = mean) => ({ n: 30, min, max, mean });
const baseSummary = (overrides = {}) => ({
  durationMs: 600_000,
  entries: 0,
  events: 0,
  samples: 300,
  truncated: false,
  rttMs: stat(25),
  availableOutgoingBitrateBps: null,
  outboundAudioBitrateBps: null,
  outboundVideo: null,
  inboundVideo: null,
  inboundAudioConcealmentPct: null,
  inboundAudioJitterMs: null,
  packetLossOutboundPct: null,
  packetLossInboundPct: null,
  eventCounts: {},
  warnings: {},
  problems: [],
  episodes: [],
  remotes: [],
  verdicts: [],
  ...overrides,
});
const video = (overrides = {}) => ({
  codecs: { H264: 100 },
  encoderImplementations: { "SimulcastEncoderAdapter (OpenH264, OpenH264)": 100 },
  hardwareEncoderSamples: 0,
  softwareEncoderSamples: 100,
  resolutions: { "1920x1080": 100 },
  layerCounts: { 2: 100 },
  fps: stat(27),
  bitrateBps: stat(2_800_000),
  limitation: { none: 90, cpu: 10, bandwidth: 0, other: 0 },
  limitationSeconds: { cpu: 0, bandwidth: 0, other: 0 },
  encodeMsPerFrame: stat(18),
  framesDroppedPct: stat(0),
  sourceFps: stat(27),
  sourceResolutions: { "1920x1080": 100 },
  retransmittedPct: null,
  ...overrides,
});
const codesOf = (summary) => deriveVerdicts(summary).map((verdict) => verdict.code);

assert.deepEqual(codesOf(baseSummary()), [], "a clean session gets no verdict");

// The headline finding: three hours of software H.264, CPU-bound.
const softwareCpu = codesOf(
  baseSummary({
    outboundVideo: video({ limitationSeconds: { cpu: 240, bandwidth: 0, other: 0 } }),
  }),
);
assert.ok(
  softwareCpu.includes("software-encoder-cpu-bound"),
  "a software encoder held back by CPU must be named as one verdict, not two tags",
);
assert.ok(
  !softwareCpu.includes("cpu-bound"),
  "the generic CPU verdict must not double up with the software-encoder one",
);

// Same limitation, but hardware encoding: a different fix, so a different verdict.
assert.ok(
  codesOf(
    baseSummary({
      outboundVideo: video({
        hardwareEncoderSamples: 100,
        softwareEncoderSamples: 0,
        limitationSeconds: { cpu: 240, bandwidth: 0, other: 0 },
      }),
    }),
  ).includes("cpu-bound"),
  "a hardware encoder that is still CPU-bound gets the generic verdict",
);

// Capture starvation vs encoder overload: the pair v1 could not tell apart.
assert.ok(
  codesOf(
    baseSummary({ outboundVideo: video({ sourceFps: stat(60), fps: stat(27) }) }),
  ).includes("encoder-drops-frames"),
  "capture at 60 and encode at 27 is an encoder that cannot keep up",
);
const starved = codesOf(
  baseSummary({ outboundVideo: video({ sourceFps: stat(27), fps: stat(27) }) }),
);
assert.ok(
  starved.includes("capture-starved"),
  "capture and encode both at 27 on a 1080p share is a starved capture",
);
assert.ok(
  !starved.includes("encoder-drops-frames"),
  "a starved capture must not be blamed on the encoder",
);

// Whose fault is the bad audio. This is the inference that pooled numbers could
// not express, and the one that saves the most time on a report.
const badRemote = (identity) => ({
  identity,
  samples: 30,
  packetLossPct: stat(17),
  concealmentPct: stat(14),
  jitterMs: stat(9),
  bitrateBps: stat(40_000),
});
const goodRemote = (identity) => ({
  identity,
  samples: 30,
  packetLossPct: stat(0),
  concealmentPct: stat(0),
  jitterMs: stat(4),
  bitrateBps: stat(48_000),
});

assert.ok(
  codesOf(
    baseSummary({ remotes: [badRemote("a"), badRemote("b"), badRemote("c")] }),
  ).includes("local-downlink"),
  "every remote arriving damaged is this machine's downlink, not three broken peers",
);
assert.ok(
  codesOf(
    baseSummary({ remotes: [badRemote("a"), goodRemote("b"), goodRemote("c")] }),
  ).includes("remote-uplink"),
  "one bad remote among healthy ones is that peer's uplink",
);
assert.deepEqual(
  codesOf(baseSummary({ remotes: [badRemote("a")] })),
  [],
  "a single remote cannot distinguish the two, so it must claim neither",
);

// Every verdict has to carry its numbers, or nobody can check it.
for (const verdict of deriveVerdicts(
  baseSummary({
    outboundVideo: video({ limitationSeconds: { cpu: 240, bandwidth: 90, other: 0 } }),
    remotes: [badRemote("a"), badRemote("b")],
    eventCounts: { "stream-manager/room-reconnected": 2 },
    rttMs: stat(310, 20, 1424),
  }),
)) {
  assert.ok(verdict.headline.length > 0, `${verdict.code} has no headline`);
  assert.ok(
    verdict.evidence.length > 0,
    `${verdict.code} states no evidence; a headline nobody can check is one nobody acts on`,
  );
}

console.log(
  `media-diagnostics self-check passed (schema v${tsVersion[1]}, ${tags.length} problem tags, ${crossRepo})`,
);
