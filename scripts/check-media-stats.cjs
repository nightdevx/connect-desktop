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
  isHardwareImplementation,
  summarizeSenderReport,
  summarizeReceiverReport,
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
assert.equal(
  computePacketLossPct(sample(1000, 0, 0, 0), sample(2000, 0, 0, 0)),
  0,
  "no traffic at all",
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

console.log("media-stats self-check passed");
