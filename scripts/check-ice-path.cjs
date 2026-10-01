#!/usr/bin/env node
// Self-check for the network-path reading in src/shared/media-stats.ts
// (summarizeIcePath / classifyIcePath / icePathKey).
//
// The path a connection rides on was invisible from the client, and two real
// production faults hid there: clients routed through a TURN relay on the SFU's
// own host, and sessions LiveKit had pinned to ICE/TCP after a short UDP
// failure. Every other number (RTT, loss, bitrate) looks the same whichever
// path carries the media, so this reading is the only witness — and it is
// built from getStats() entries whose shape is easy to misread:
//
//   SELECTED   the transport entry's selectedCandidatePairId names the pair in
//              use. A report can carry several pairs that are succeeded and
//              nominated (an old pair outlives an ICE restart), so picking
//              "a" nominated pair can name the wrong path.
//   RELAY      a relayed candidate's own `protocol` is the relayed address's
//              (udp); how the client reaches the TURN server is relayProtocol.
//              A relay is a relay either way, and must classify as one.
//   TCP        ICE/TCP is a host candidate with protocol "tcp" — it must not
//              read as the direct UDP path.
//
//   node scripts/check-ice-path.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-ice-path-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(projectRoot, "src/shared/media-stats.ts"),
        formats: ["es"],
        fileName: () => "media-stats.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const { summarizeIcePath, classifyIcePath, icePathKey, EMPTY_ICE_PATHS } =
    await import(pathToFileURL(path.join(outDir, "media-stats.mjs")).href);

  const candidate = (id, type, candidateType, protocol, extra = {}) => ({
    id,
    type,
    timestamp: 1,
    candidateType,
    protocol,
    ...extra,
  });

  const pair = (id, localCandidateId, remoteCandidateId, extra = {}) => ({
    id,
    type: "candidate-pair",
    timestamp: 1,
    localCandidateId,
    remoteCandidateId,
    ...extra,
  });

  // --- SELECTED: the transport's pick wins over any nominated pair ----------
  const restarted = [
    { id: "T1", type: "transport", timestamp: 1, selectedCandidatePairId: "CP-new" },
    // The pre-restart pair: still succeeded and nominated, no longer in use.
    pair("CP-old", "L-old", "R1", { nominated: true, state: "succeeded" }),
    pair("CP-new", "L-new", "R1", { nominated: true, state: "succeeded" }),
    candidate("L-old", "local-candidate", "srflx", "udp"),
    candidate("L-new", "local-candidate", "relay", "udp", { relayProtocol: "tcp" }),
    candidate("R1", "remote-candidate", "host", "udp"),
  ];
  const restartedPath = summarizeIcePath(restarted);
  assert.equal(restartedPath.localCandidateType, "relay", "the selected pair, not the first nominated one");
  assert.equal(restartedPath.relayProtocol, "tcp");
  assert.equal(classifyIcePath(restartedPath), "relay");
  assert.equal(icePathKey(restartedPath), "udp/relay");

  // --- fallback: no transport entry, nominated + succeeded pair -------------
  const tcpReport = [
    pair("CP1", "L1", "R1", { nominated: true, state: "succeeded" }),
    pair("CP2", "L2", "R2", { nominated: false, state: "failed" }),
    candidate("L1", "local-candidate", "host", "tcp"),
    candidate("R1", "remote-candidate", "host", "tcp"),
    candidate("L2", "local-candidate", "srflx", "udp"),
    candidate("R2", "remote-candidate", "host", "udp"),
  ];
  const tcpPath = summarizeIcePath(tcpReport);
  assert.equal(classifyIcePath(tcpPath), "tcp", "ICE/TCP must not read as direct UDP");
  assert.equal(icePathKey(tcpPath), "tcp/host");

  // --- direct UDP, the healthy case ------------------------------------------
  const udpReport = [
    { id: "T1", type: "transport", timestamp: 1, selectedCandidatePairId: "CP1" },
    pair("CP1", "L1", "R1", { nominated: true, state: "succeeded" }),
    candidate("L1", "local-candidate", "srflx", "udp", { networkType: "wifi" }),
    candidate("R1", "remote-candidate", "host", "udp"),
  ];
  const udpPath = summarizeIcePath(udpReport);
  assert.deepEqual(udpPath, {
    localCandidateType: "srflx",
    remoteCandidateType: "host",
    protocol: "udp",
    relayProtocol: null,
    networkType: "wifi",
  });
  assert.equal(classifyIcePath(udpPath), "udp");

  // A relay on the far end is a relay too.
  assert.equal(
    classifyIcePath({ ...udpPath, remoteCandidateType: "relay" }),
    "relay",
  );

  // --- nothing usable yet ----------------------------------------------------
  assert.equal(summarizeIcePath([]), null, "no pair selected yet");
  assert.equal(
    summarizeIcePath([pair("CP1", "missing", "gone", { nominated: true, state: "succeeded" })]),
    null,
    "a pair whose candidates are not in the report says nothing",
  );
  assert.equal(
    summarizeIcePath([pair("CP1", "L1", "R1", { nominated: false, state: "in-progress" })]),
    null,
    "a pair that has not succeeded is not a path",
  );
  assert.equal(classifyIcePath(null), null);
  assert.equal(icePathKey(null), null);
  assert.deepEqual(EMPTY_ICE_PATHS, { publisher: null, subscriber: null });

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    "ice-path self-check passed (selected pair wins, relay and tcp classified, gaps are null)",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
