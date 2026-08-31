#!/usr/bin/env node
// Self-check for the getStats() delta math in src/shared/media-stats.ts.
// Run after `pnpm build:main` (reads the compiled CommonJS output):
//   node scripts/check-media-stats.cjs

const assert = require("node:assert/strict");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "dist", "shared", "media-stats.js");
let stats;
try {
  stats = require(modulePath);
} catch (error) {
  console.error(
    `Could not load ${modulePath}. Run "pnpm build:main" first.\n${error.message}`,
  );
  process.exit(1);
}

const {
  computeBitrateBps,
  computePacketLossPct,
  packetWindow,
  poolPacketLossPct,
  MIN_LOSS_WINDOW_PACKETS,
  isHardwareImplementation,
  summarizeSenderReport,
  summarizeReceiverReport,
  computeConcealmentPct,
  MIN_CONCEALMENT_WINDOW_SAMPLES,
} = stats;

// --- bitrate ---------------------------------------------------------------
const sample = (timestampMs, bytes, packets = 0, packetsLost = 0) => ({
  timestampMs,
  bytes,
  packets,
  packetsLost,
  frames: 0,
});

assert.equal(computeBitrateBps(undefined, sample(1000, 500)), null, "no previous sample");
assert.equal(computeBitrateBps(sample(1000, 0), sample(1000, 500)), null, "clock did not advance");
assert.equal(computeBitrateBps(sample(2000, 0), sample(1000, 500)), null, "clock went backwards");
// 125000 bytes over 1s = 1 Mbit/s
assert.equal(computeBitrateBps(sample(1000, 0), sample(2000, 125_000)), 1_000_000, "1 Mbps");
// Counter reset on renegotiation must not produce a huge negative rate.
assert.equal(computeBitrateBps(sample(1000, 900_000), sample(2000, 10)), null, "counter reset");

// --- packet loss -----------------------------------------------------------
assert.equal(computePacketLossPct(undefined, sample(1000, 0, 100, 0)), null, "no previous sample");
assert.equal(
  computePacketLossPct(sample(1000, 0, 100, 0), sample(2000, 0, 200, 0)),
  0,
  "no loss",
);
// 5 lost of (95 received + 5 lost) = 5%
assert.equal(
  computePacketLossPct(sample(1000, 0, 100, 10), sample(2000, 0, 195, 15)),
  5,
  "5% loss in window",
);
// A burst that already ended must not keep showing up.
assert.equal(
  computePacketLossPct(sample(1000, 0, 100, 500), sample(2000, 0, 200, 500)),
  0,
  "old burst does not persist",
);
// An unmeasurable window is not a good one. A track that carried nothing must
// report null so the badge skips it, rather than 0 so the badge calls it clean.
assert.equal(
  computePacketLossPct(sample(1000, 0, 0, 0), sample(2000, 0, 0, 0)),
  null,
  "no traffic at all",
);

// The DTX trap, and the reason MIN_LOSS_WINDOW_PACKETS exists. A silent
// participant sends a handful of comfort-noise packets per second; one gap in
// three is not a 33% connection problem, it is an unmeasurable window. This is
// the arithmetic that kept the lobby badge red in a busy room.
assert.equal(
  computePacketLossPct(sample(1000, 0, 100, 0), sample(2000, 0, 102, 1)),
  null,
  "a three-packet window says nothing",
);
// One packet over the floor is measurable, and reported honestly.
assert.equal(
  computePacketLossPct(
    sample(1000, 0, 0, 0),
    sample(2000, 0, MIN_LOSS_WINDOW_PACKETS - 1, 1),
  ),
  5,
  "at the floor the window counts",
);
assert.ok(
  MIN_LOSS_WINDOW_PACKETS >= 10,
  "a floor this low lets a two-packet window through again",
);

// --- pooled loss -----------------------------------------------------------
// The badge pools a direction instead of taking its worst track. Nine healthy
// streams and one thin noisy one is a healthy connection, and used to read as a
// broken one.
const thin = { packets: 21, packetsLost: 7 };
const healthy = { packets: 500, packetsLost: 1 };
// The thin track on its own reads as 25%, which is what the badge used to show.
assert.equal(poolPacketLossPct([thin]), 25, "the thin track really is noisy");
assert.equal(
  poolPacketLossPct([healthy, healthy, thin]),
  0.9,
  "one thin track must not describe the whole direction",
);
assert.equal(poolPacketLossPct([]), null, "nothing to pool");
assert.equal(poolPacketLossPct([{ packets: 3, packetsLost: 1 }]), null, "pool below the floor");
assert.equal(
  poolPacketLossPct([{ packets: 90, packetsLost: 10 }]),
  10,
  "a real 10% still reads as 10%",
);

// --- window counters -------------------------------------------------------
// Pooling needs the raw counts even when the ratio is unmeasurable, so the
// window has to survive where computePacketLossPct returns null.
assert.deepEqual(
  packetWindow(sample(1000, 0, 100, 0), sample(2000, 0, 102, 1)),
  { packets: 2, packetsLost: 1 },
  "the counts outlive the ratio",
);
assert.equal(packetWindow(undefined, sample(1000, 0, 100, 0)), null, "no baseline");
assert.equal(
  packetWindow(sample(1000, 0, 900, 0), sample(2000, 0, 10, 0)),
  null,
  "a counter reset is not a window",
);

// --- encoder classification ------------------------------------------------
assert.equal(isHardwareImplementation("libvpx"), false, "libvpx is software");
assert.equal(
  isHardwareImplementation("SimulcastEncoderAdapter (libvpx, libvpx, libvpx)"),
  false,
  "simulcast wrapping software is software",
);
assert.equal(
  isHardwareImplementation("MediaFoundationVideoEncodeAccelerator"),
  true,
  "MediaFoundation is hardware",
);
assert.equal(isHardwareImplementation("ExternalEncoder"), true, "ExternalEncoder is hardware");
assert.equal(isHardwareImplementation(null), null, "unknown stays unknown");
assert.equal(
  isHardwareImplementation("libvpx", true),
  true,
  "powerEfficientEncoder overrides the name heuristic",
);

// --- simulcast: which layer describes the encoder --------------------------
// A simulcast send is several outbound-rtp entries and they do not have to
// agree. Hardware encoders have minimum-resolution and instance limits, so
// Chromium routinely encodes the big layer on the GPU and the thumbnail in
// libvpx. The panel must describe the layer carrying the picture, not whichever
// entry Chromium happened to emit last.
const mixedSimulcast = (order) => [
  { id: "C1", type: "codec", timestamp: 1000, mimeType: "video/H264" },
  ...order.map((layer) => ({
    id: layer.id,
    type: "outbound-rtp",
    timestamp: 1000,
    kind: "video",
    codecId: "C1",
    bytesSent: 1000,
    packetsSent: 10,
    frameWidth: layer.width,
    frameHeight: layer.height,
    framesPerSecond: 30,
    encoderImplementation: layer.implementation,
    powerEfficientEncoder: layer.powerEfficient,
    qualityLimitationReason: "none",
  })),
];

const bigHardware = {
  id: "O-high",
  width: 2560,
  height: 1440,
  implementation: "MediaFoundationVideoEncodeAccelerator",
  powerEfficient: true,
};
const smallSoftware = {
  id: "O-low",
  width: 640,
  height: 360,
  implementation: "libvpx",
  powerEfficient: false,
};

// The regression: the software thumbnail emitted LAST used to decide the
// verdict, and the panel told users with hardware acceleration ON that their
// video was software-encoded.
const thumbnailLast = summarizeSenderReport(
  mixedSimulcast([bigHardware, smallSoftware]),
  new Map(),
  "mixed-a",
);
assert.equal(
  thumbnailLast.hardwareEncoder,
  true,
  "a software thumbnail emitted last must not describe the whole send",
);
assert.equal(
  thumbnailLast.encoderImplementation,
  "MediaFoundationVideoEncodeAccelerator",
  "the implementation shown must be the top layer's",
);
assert.equal(thumbnailLast.frameHeight, 1440, "resolution still comes from the top layer");

// Order must not change the answer.
const thumbnailFirst = summarizeSenderReport(
  mixedSimulcast([smallSoftware, bigHardware]),
  new Map(),
  "mixed-b",
);
assert.equal(
  thumbnailFirst.hardwareEncoder,
  true,
  "layer order must not decide the encoder verdict",
);

// All-software really is software, whichever way round it is emitted.
const allSoftware = summarizeSenderReport(
  mixedSimulcast([
    { ...bigHardware, implementation: "libvpx", powerEfficient: false },
    smallSoftware,
  ]),
  new Map(),
  "mixed-c",
);
assert.equal(allSoftware.hardwareEncoder, false, "every layer software is software");
assert.equal(allSoftware.encoderImplementation, "libvpx", "and it says so by name");

// Audio has no frame dimensions, so there is no top layer to read. It must
// still report rather than crash on an empty pick.
const audioOnly = summarizeSenderReport(
  [
    { id: "C2", type: "codec", timestamp: 1000, mimeType: "audio/opus" },
    {
      id: "OA",
      type: "outbound-rtp",
      timestamp: 1000,
      kind: "audio",
      codecId: "C2",
      bytesSent: 500,
      packetsSent: 25,
    },
  ],
  new Map(),
  "mic",
);
assert.equal(audioOnly.kind, "audio", "audio stays audio");
assert.equal(audioOnly.hardwareEncoder, null, "audio makes no hardware claim");

// --- sender report ---------------------------------------------------------
const senderEntries = (timestamp, bytesSent, packetsSent, packetsLost) => [
  { id: "C1", type: "codec", timestamp, mimeType: "video/VP9" },
  {
    id: "O-low",
    type: "outbound-rtp",
    timestamp,
    kind: "video",
    codecId: "C1",
    bytesSent: Math.round(bytesSent * 0.2),
    packetsSent: Math.round(packetsSent * 0.2),
    frameWidth: 640,
    frameHeight: 360,
    framesPerSecond: 15,
    encoderImplementation: "MediaFoundationVideoEncodeAccelerator",
    qualityLimitationReason: "none",
  },
  {
    id: "O-high",
    type: "outbound-rtp",
    timestamp,
    kind: "video",
    codecId: "C1",
    bytesSent: Math.round(bytesSent * 0.8),
    packetsSent: Math.round(packetsSent * 0.8),
    frameWidth: 2560,
    frameHeight: 1440,
    framesPerSecond: 60,
    encoderImplementation: "MediaFoundationVideoEncodeAccelerator",
    qualityLimitationReason: "none",
  },
  { id: "RI", type: "remote-inbound-rtp", timestamp, packetsLost, roundTripTime: 0.042 },
  {
    id: "CP",
    type: "candidate-pair",
    timestamp,
    state: "succeeded",
    nominated: true,
    currentRoundTripTime: 0.05,
    availableOutgoingBitrate: 8_000_000,
  },
];

const senderCache = new Map();
const first = summarizeSenderReport(senderEntries(1000, 0, 0, 0), senderCache, "screen");
assert.equal(first.bitrateBps, null, "first sender sample has no rate yet");
assert.equal(first.layerCount, 2, "two simulcast layers");
assert.equal(first.frameWidth, 2560, "reports the highest layer resolution");
assert.equal(first.framesPerSecond, 60, "reports the highest layer fps");
assert.equal(first.codec, "VP9", "codec resolved from codecId");
assert.equal(first.hardwareEncoder, true, "hardware encoder detected");
assert.equal(first.qualityLimitationReason, null, '"none" is not a limitation');
assert.equal(first.rttMs, 42, "rtt from remote-inbound-rtp");
assert.equal(first.availableOutgoingBitrateBps, 8_000_000, "bwe from candidate pair");

const second = summarizeSenderReport(
  senderEntries(2000, 125_000, 200, 0),
  senderCache,
  "screen",
);
assert.equal(second.bitrateBps, 1_000_000, "sender rate across two samples");
assert.equal(second.packetLossPct, 0, "no sender-side loss");

const third = summarizeSenderReport(
  senderEntries(3000, 250_000, 400, 10),
  senderCache,
  "screen",
);
assert.equal(third.packetLossPct, 4.8, "10 lost of 210 in window");

assert.equal(
  summarizeSenderReport([{ id: "C1", type: "codec", timestamp: 1 }], new Map(), "x"),
  null,
  "no outbound-rtp means no sender stats",
);

// --- receiver report -------------------------------------------------------
const receiverEntries = (timestamp, bytesReceived, packetsReceived, packetsLost) => [
  { id: "C2", type: "codec", timestamp, mimeType: "audio/opus" },
  {
    id: "I1",
    type: "inbound-rtp",
    timestamp,
    kind: "audio",
    codecId: "C2",
    bytesReceived,
    packetsReceived,
    packetsLost,
    jitter: 0.012,
    jitterBufferDelay: 4,
    jitterBufferEmittedCount: 100,
    decoderImplementation: "libopus",
  },
];

const receiverCache = new Map();
summarizeReceiverReport(receiverEntries(1000, 0, 0, 0), receiverCache, "peer-a");
const inbound = summarizeReceiverReport(
  receiverEntries(2000, 12_500, 100, 0),
  receiverCache,
  "peer-a",
);
assert.equal(inbound.bitrateBps, 100_000, "receiver rate");
assert.equal(inbound.kind, "audio");
assert.equal(inbound.codec, "opus");
assert.equal(inbound.jitterMs, 12, "jitter in ms");
assert.equal(inbound.jitterBufferDelayMs, 40, "mean jitter buffer delay in ms");

// --- quality limitation ---------------------------------------------------
const { findQualityLimitation } = stats;

const videoTrack = (overrides) => ({
  trackKey: "local:screen_share",
  kind: "video",
  qualityLimitationReason: null,
  hardwareEncoder: true,
  ...overrides,
});

assert.equal(findQualityLimitation([]), null, "no tracks, no limitation");
assert.equal(findQualityLimitation([videoTrack({})]), null, "healthy track is not limited");
assert.equal(
  findQualityLimitation([{ ...videoTrack({}), kind: "audio", qualityLimitationReason: "cpu" }]),
  null,
  "audio tracks are ignored",
);

const bandwidth = findQualityLimitation([videoTrack({ qualityLimitationReason: "bandwidth" })]);
assert.equal(bandwidth.kind, "bandwidth");
assert.equal(bandwidth.softwareEncoderAtFault, false, "bandwidth limit is never the encoder's fault");

const cpuHardware = findQualityLimitation([
  videoTrack({ qualityLimitationReason: "cpu", hardwareEncoder: true }),
]);
assert.equal(cpuHardware.kind, "cpu");
assert.equal(
  cpuHardware.softwareEncoderAtFault,
  false,
  "already on hardware, so suggesting hardware encoding would be wrong",
);

const cpuSoftware = findQualityLimitation([
  videoTrack({ qualityLimitationReason: "cpu", hardwareEncoder: false }),
]);
assert.equal(cpuSoftware.softwareEncoderAtFault, true, "software encoder + cpu limit is actionable");

const cpuUnknownEncoder = findQualityLimitation([
  videoTrack({ qualityLimitationReason: "cpu", hardwareEncoder: null }),
]);
assert.equal(
  cpuUnknownEncoder.softwareEncoderAtFault,
  false,
  "unknown encoder must not be blamed",
);

assert.equal(
  findQualityLimitation([videoTrack({ qualityLimitationReason: "other" })]).kind,
  "other",
);

// --- audio concealment ------------------------------------------------------
//
// The receive-side number that says whether it actually SOUNDED bad. Packet
// loss and concealment come apart in both directions -- a deep jitter buffer
// hides real loss, and clock drift conceals samples with no loss at all -- so
// this has its own window math and its own floor.
const audioSample = (timestampMs, concealedSamples, totalSamplesReceived) => ({
  timestampMs,
  bytes: 0,
  packets: 0,
  packetsLost: 0,
  frames: 0,
  concealedSamples,
  totalSamplesReceived,
});

assert.equal(
  computeConcealmentPct(undefined, audioSample(1000, 0, 48_000)),
  null,
  "no previous sample",
);

// 480 concealed out of 48000 in the window = 1.0%
assert.equal(
  computeConcealmentPct(audioSample(1000, 0, 0), audioSample(2000, 480, 48_000)),
  1,
  "1% concealment",
);

assert.equal(
  computeConcealmentPct(audioSample(1000, 100, 48_000), audioSample(2000, 100, 96_000)),
  0,
  "nothing concealed in this window",
);

// A renegotiation resets the counters; a negative delta must not become a rate.
assert.equal(
  computeConcealmentPct(audioSample(1000, 9_000, 480_000), audioSample(2000, 10, 48_000)),
  null,
  "counter reset",
);

// Too few samples to divide by: one Opus frame is 960 samples, so a window
// holding a handful of them makes any single concealed frame look catastrophic.
assert.equal(
  computeConcealmentPct(
    audioSample(1000, 0, 0),
    audioSample(2000, 480, MIN_CONCEALMENT_WINDOW_SAMPLES - 1),
  ),
  null,
  "window below the floor",
);

// Video tracks report neither field, and must not produce a fake zero.
assert.equal(
  computeConcealmentPct(sample(1000, 0), sample(2000, 100)),
  null,
  "video inbound has no concealment fields",
);

console.log("media-stats self-check passed");
