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
  readAvailableOutgoingBitrate,
  BWE_PLACEHOLDER_BPS,
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
assert.equal(
  inbound.jitterBufferWindowMs,
  null,
  "nothing came out of the buffer in the window: no window figure",
);

// The whole-call average barely moves; the window says what the buffer holds
// now. 0.6 s held over the 10 samples emitted in the window is 60 ms, while the
// call's average only creeps from 40 to 42.
const bufferEntries = (timestamp, delaySec, emitted) => {
  const entries = receiverEntries(timestamp, 12_500, 100, 0);
  entries[1] = { ...entries[1], jitterBufferDelay: delaySec, jitterBufferEmittedCount: emitted };
  return entries;
};
const bufferCache = new Map();
summarizeReceiverReport(bufferEntries(1000, 4, 100), bufferCache, "peer-b");
const buffered = summarizeReceiverReport(bufferEntries(2000, 4.6, 110), bufferCache, "peer-b");
assert.equal(buffered.jitterBufferWindowMs, 60, "jitter buffer delay over the last window");
assert.equal(buffered.jitterBufferDelayMs, 42, "jitter buffer delay over the whole call");

// --- mouth-to-ear estimate -------------------------------------------------
const { estimateMouthToEar, MOUTH_TO_EAR_FIXED_MS } = stats;
assert.equal(
  estimateMouthToEar({ rttMs: null, jitterBufferMs: 60, outputMs: 20, playbackDynamicsStages: 1 }),
  null,
  "no round trip, no estimate",
);
assert.equal(
  estimateMouthToEar({ rttMs: 30, jitterBufferMs: null, outputMs: 20, playbackDynamicsStages: 1 }),
  null,
  "nobody else's voice arriving, no estimate",
);
const fixedPath =
  MOUTH_TO_EAR_FIXED_MS.capture +
  MOUTH_TO_EAR_FIXED_MS.noiseSuppression +
  MOUTH_TO_EAR_FIXED_MS.microphoneLimiter +
  MOUTH_TO_EAR_FIXED_MS.opus +
  MOUTH_TO_EAR_FIXED_MS.playbackHandOver;
const estimate = estimateMouthToEar({
  rttMs: 30,
  jitterBufferMs: 60,
  outputMs: 20,
  playbackDynamicsStages: 2,
});
assert.equal(estimate.networkMs, 30, "both one-way legs: the whole round trip, not half of it");
assert.equal(
  estimate.processingMs,
  Math.round(fixedPath + 2 * MOUTH_TO_EAR_FIXED_MS.playbackDynamicsStage),
  "each playback dynamics stage adds its look-ahead",
);
assert.equal(estimate.totalMs, Math.round(30 + 60 + 20 + fixedPath + 12), "the parts add up");
assert.ok(
  fixedPath > 50 && fixedPath < 80,
  `the fixed path (${fixedPath} ms) is capture, RNNoise, a limiter and one Opus frame: tens of ms, not hundreds`,
);

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

// --- renegotiation invalidates a delta ---------------------------------------
//
// The counters this module subtracts are pooled over several stats entries, and
// a reconnect changes WHICH entries. The old guards only rejected a delta that
// went negative, so a report that gained an entry produced a large positive
// jump instead: every outbound "packet loss" spike above 3% in the field logs
// landed within 1.2s of a reconnect, read 80-93%, and had 0% on both sides.
const withSource = (base, sourceKey) => ({ ...base, sourceKey });

assert.equal(
  computePacketLossPct(
    withSource(sample(1000, 0, 5_000, 10), "outbound-rtp:111"),
    withSource(sample(2000, 0, 5_100, 900), "outbound-rtp:222"),
  ),
  null,
  "a loss ratio must not span a change of RTP stream",
);
assert.equal(
  computePacketLossPct(
    withSource(sample(1000, 0, 5_000, 10), "outbound-rtp:111"),
    withSource(sample(2000, 0, 5_100, 15), "outbound-rtp:111"),
  ),
  4.8,
  "the same stream still measures normally",
);
assert.equal(
  computeBitrateBps(
    withSource(sample(1000, 0), "outbound-rtp:111"),
    withSource(sample(2000, 125_000), "outbound-rtp:222"),
  ),
  null,
  "a bitrate must not span a change of RTP stream",
);
assert.equal(
  packetWindow(
    withSource(sample(1000, 0, 100, 0), "a"),
    withSource(sample(2000, 0, 200, 5), "b"),
  ),
  null,
  "a window must not span a change of RTP stream",
);

// The summarizers have to actually populate the key, or the guard above is
// dead code that silently never fires.
const senderSourceA = summarizeSenderReport(senderEntries(1000, 0, 0, 0), new Map(), "k");
assert.ok(senderSourceA, "sender summary still produced");
const senderCacheB = new Map();
summarizeSenderReport(
  senderEntries(1000, 0, 0, 0).map((entry) =>
    entry.type === "outbound-rtp" ? { ...entry, ssrc: 111 } : entry,
  ),
  senderCacheB,
  "k",
);
const afterRenegotiation = summarizeSenderReport(
  senderEntries(2000, 125_000, 5_000, 4_000).map((entry) =>
    entry.type === "outbound-rtp" ? { ...entry, ssrc: 222 } : entry,
  ),
  senderCacheB,
  "k",
);
assert.equal(
  afterRenegotiation.packetLossPct,
  null,
  "a new SSRC must not be diffed against the old one's counters",
);
assert.equal(afterRenegotiation.bitrateBps, null, "and neither must the bitrate");

// --- the bandwidth estimate placeholder -------------------------------------
//
// Chromium parks availableOutgoingBitrate at exactly 1e9 while it has nothing
// to probe with, which for an audio-only send is the whole call. Reported
// verbatim it produced session summaries claiming ~1 Gbps of available uplink.
assert.equal(readAvailableOutgoingBitrate(BWE_PLACEHOLDER_BPS), null, "1e9 is not an estimate");
assert.equal(readAvailableOutgoingBitrate(null), null, "absent stays absent");
assert.equal(readAvailableOutgoingBitrate(8_000_000), 8_000_000, "a real estimate survives");
assert.equal(first.availableOutgoingBitrateBps, 8_000_000, "and reaches the summary");

// --- concealment excludes DTX silence ---------------------------------------
//
// Chromium counts the comfort noise it generates for an Opus DTX gap as
// concealment. We publish with dtx: true, so somebody in the room is always
// silent, and "Ses kesintili geldi" fired on healthy calls: the field logs put
// the flagged-sample mean at 78% whenever the sender was under 2 kbps and under
// 0.25% in every bucket carrying real speech.
const audioSampleFull = (timestampMs, concealed, silent, total) => ({
  timestampMs,
  bytes: 0,
  packets: 0,
  packetsLost: 0,
  frames: 0,
  concealedSamples: concealed,
  silentConcealedSamples: silent,
  totalSamplesReceived: total,
});

assert.equal(
  computeConcealmentPct(
    audioSampleFull(1000, 0, 0, 0),
    audioSampleFull(2000, 48_000, 48_000, 48_000),
  ),
  0,
  "a window that was entirely DTX silence is not a dropout",
);
assert.equal(
  computeConcealmentPct(
    audioSampleFull(1000, 0, 0, 0),
    audioSampleFull(2000, 960, 480, 48_000),
  ),
  1,
  "only the audible half of the concealment counts",
);
assert.equal(
  computeConcealmentPct(
    audioSampleFull(1000, 0, 0, 0),
    audioSampleFull(2000, 4_800, 0, 48_000),
  ),
  10,
  "a real dropout still reads at full size",
);
// The two counters update independently, so a window can straddle one and not
// the other. That must clamp, not go negative.
assert.equal(
  computeConcealmentPct(
    audioSampleFull(1000, 0, 0, 0),
    audioSampleFull(2000, 480, 960, 48_000),
  ),
  0,
  "more silent than concealed clamps to zero",
);
// A browser that does not report the field at all must keep the old answer
// rather than silently reporting no concealment ever.
assert.equal(
  computeConcealmentPct(audioSample(1000, 0, 0), audioSample(2000, 4_800, 48_000)),
  10,
  "without silentConcealedSamples the old number stands",
);

console.log("media-stats self-check passed");
