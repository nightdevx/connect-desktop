#!/usr/bin/env node
// Self-check for simulcast layer derivation in src/shared/video-layers.ts.
// Run after `pnpm build:main`:
//   node scripts/check-video-layers.cjs

const assert = require("node:assert/strict");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "dist", "shared", "video-layers.js");
let mod;
try {
  mod = require(modulePath);
} catch (error) {
  console.error(
    `Could not load ${modulePath}. Run "pnpm build:main" first.\n${error.message}`,
  );
  process.exit(1);
}

const {
  buildSimulcastLayerSpecs,
  describeEncodingMismatch,
  estimateLadderBitrateBps,
  scaleBitrateToResolution,
  SCREEN_SHARE_MAX_ENCODINGS,
  CAMERA_MAX_ENCODINGS,
} = mod;

assert.equal(SCREEN_SHARE_MAX_ENCODINGS, 2);
assert.equal(CAMERA_MAX_ENCODINGS, 3);

// --- 1440p60 screen share --------------------------------------------------
// One extra layer, not two: at 1440p and up a third encoding costs a hardware
// encoder session for a 640x360 layer the 1280x720 one already covers.
const sharp = buildSimulcastLayerSpecs({
  width: 2560,
  height: 1440,
  maxBitrateBps: 9_000_000,
  maxFramerate: 60,
});

assert.equal(sharp.length, 1, "1440p gets one extra layer, so two encodings");
assert.deepEqual(
  sharp.map((layer) => [layer.width, layer.height]),
  [[1280, 720]],
  "the surviving layer is the half one",
);
assert.equal(sharp[0].maxFramerate, 30, "half layer is capped at 30fps");
// Sanity against LiveKit's own ladder: 1440p @ 9M -> 720p should land near 2-3M.
assert.ok(
  sharp[0].maxBitrateBps > 2_000_000 && sharp[0].maxBitrateBps < 4_000_000,
  `720p layer bitrate out of range: ${sharp[0].maxBitrateBps}`,
);
assert.ok(
  sharp[0].maxBitrateBps < 9_000_000,
  "no layer exceeds the primary bitrate",
);

// --- 1080p60: three encodings for camera, two for screen share -------------
const target1080p60 = {
  width: 1920,
  height: 1080,
  maxBitrateBps: 5_000_000,
  maxFramerate: 60,
};

const high = buildSimulcastLayerSpecs(target1080p60, CAMERA_MAX_ENCODINGS);
assert.equal(high.length, 2, "1080p camera keeps the full ladder");
assert.deepEqual(
  high.map((layer) => [layer.width, layer.height]),
  [
    [480, 270],
    [960, 540],
  ],
  "layers are ordered lowest quality first",
);
assert.ok(
  high[0].maxBitrateBps < high[1].maxBitrateBps,
  "lower layer gets less bitrate",
);
assert.equal(high[0].maxFramerate, 15, "quarter layer is capped at 15fps");

// Screen share drops the quarter layer: a 480x270 desktop is unreadable, and
// the uplink is spent on the sum of the ladder, not on the top layer alone.
const highScreen = buildSimulcastLayerSpecs(
  target1080p60,
  SCREEN_SHARE_MAX_ENCODINGS,
);
assert.equal(highScreen.length, 1, "1080p screen share gets two encodings");
assert.deepEqual(
  [highScreen[0].width, highScreen[0].height],
  [960, 540],
  "the surviving screen layer is the half one",
);

// --- ladder cost is the sum, not the headline bitrate ----------------------
const cameraCost = estimateLadderBitrateBps(
  target1080p60,
  CAMERA_MAX_ENCODINGS,
);
const screenCost = estimateLadderBitrateBps(
  target1080p60,
  SCREEN_SHARE_MAX_ENCODINGS,
);
assert.ok(
  cameraCost > 5_000_000,
  "the ladder always costs more than the primary encoding alone",
);
assert.ok(
  screenCost < cameraCost,
  "dropping the quarter layer lowers what the uplink has to carry",
);
// The uplink this was tuned against reported ~6.8 Mbps of headroom, and the
// three-encoding ladder did not fit it.
assert.ok(
  cameraCost > 6_800_000 && screenCost < 6_800_000,
  `1080p60 should fit a 6.8 Mbps uplink at two encodings but not three: camera=${cameraCost} screen=${screenCost}`,
);

// A single encoding costs exactly the primary bitrate.
assert.equal(
  estimateLadderBitrateBps(target1080p60, 1),
  5_000_000,
  "one encoding means no extra layers",
);

// --- 720p30 camera ---------------------------------------------------------
const camera = buildSimulcastLayerSpecs({
  width: 1280,
  height: 720,
  maxBitrateBps: 1_700_000,
  maxFramerate: 30,
});
assert.equal(camera.length, 2, "720p gets two extra layers");
assert.deepEqual(
  camera.map((layer) => [layer.width, layer.height]),
  [
    [320, 180],
    [640, 360],
  ],
);
assert.ok(
  camera.every((layer) => layer.maxFramerate <= 30),
  "layers never exceed the primary framerate",
);

// --- already small ---------------------------------------------------------
const small = buildSimulcastLayerSpecs({
  width: 640,
  height: 360,
  maxBitrateBps: 500_000,
  maxFramerate: 30,
});
assert.equal(small.length, 1, "640x360 only gets the half layer");
assert.deepEqual([small[0].width, small[0].height], [320, 180]);

const tiny = buildSimulcastLayerSpecs({
  width: 320,
  height: 180,
  maxBitrateBps: 150_000,
  maxFramerate: 15,
});
assert.equal(tiny.length, 0, "no extra layers below 640 wide");

// --- odd dimensions --------------------------------------------------------
const odd = buildSimulcastLayerSpecs({
  width: 1366,
  height: 769,
  maxBitrateBps: 2_000_000,
  maxFramerate: 30,
});
assert.ok(
  odd.every((layer) => layer.width % 2 === 0 && layer.height % 2 === 0),
  "derived dimensions are always even",
);

// --- bitrate floor ---------------------------------------------------------
const starved = buildSimulcastLayerSpecs({
  width: 1280,
  height: 720,
  maxBitrateBps: 100_000,
  maxFramerate: 30,
});
assert.ok(
  starved.every((layer) => layer.maxBitrateBps >= 80_000),
  "layers never drop below the usable bitrate floor",
);

// --- bitrate follows the resolution actually captured ----------------------
// The quality presets are (resolution, bitrate) pairs and the capture
// constraints are ceilings, so the real track is often smaller than the preset.
const ultraPreset = {
  presetBitrateBps: 14_000_000,
  presetWidth: 3840,
  presetHeight: 2160,
};

const sameSize = scaleBitrateToResolution({
  ...ultraPreset,
  actualWidth: 3840,
  actualHeight: 2160,
});
assert.equal(sameSize, 14_000_000, "an exact match keeps the preset bitrate");

// 2160p preset on a 1080p monitor: a quarter of the pixels.
const onFullHd = scaleBitrateToResolution({
  ...ultraPreset,
  actualWidth: 1920,
  actualHeight: 1080,
});
assert.ok(
  onFullHd > 4_000_000 && onFullHd < 6_500_000,
  `1080p under the 2160p preset should land near 5 Mbps, got ${onFullHd}`,
);
assert.ok(onFullHd < 14_000_000, "and must not keep the 2160p ceiling");

// 2160p preset on a small window.
const onWindow = scaleBitrateToResolution({
  ...ultraPreset,
  actualWidth: 800,
  actualHeight: 600,
});
// 480k pixels against 8.3M is ~6% of the frame, so ~12% of the bitrate on the
// 0.75 curve: a little over 1.5 Mbps. Generous for 800x600, but an order of
// magnitude away from the 14 Mbps it used to be handed.
assert.ok(
  onWindow < 2_500_000,
  `an 800x600 window must not be handed most of a 2160p budget, got ${onWindow}`,
);
assert.ok(onWindow >= 80_000, "but never below the usable floor");

// Never scale up: the preset is the ceiling the user picked.
const bigger = scaleBitrateToResolution({
  presetBitrateBps: 2_500_000,
  presetWidth: 1280,
  presetHeight: 720,
  actualWidth: 1920,
  actualHeight: 1080,
});
assert.equal(bigger, 2_500_000, "a larger capture never raises the ceiling");

// Degenerate input must not produce NaN or 0.
assert.equal(
  scaleBitrateToResolution({
    presetBitrateBps: 3_000_000,
    presetWidth: 0,
    presetHeight: 0,
    actualWidth: 1920,
    actualHeight: 1080,
  }),
  3_000_000,
  "zero preset dimensions fall back to the preset bitrate",
);

// --- the publish actually reached the encoder ------------------------------
// This is the check that was missing while every screen share published at
// 15fps: the arithmetic above was right, LiveKit just never read it.
const screenTarget = {
  width: 1920,
  height: 1080,
  maxBitrateBps: 5_000_000,
  maxFramerate: 60,
};

assert.equal(
  describeEncodingMismatch(screenTarget, [
    { maxBitrate: 1_767_767, maxFramerate: 30 },
    { maxBitrate: 5_000_000, maxFramerate: 60 },
  ]),
  null,
  "a publish that honoured the target reports no mismatch",
);

// The exact shape of the bug: LiveKit's screen-share default, h1080fps15.
const regression = describeEncodingMismatch(screenTarget, [
  { maxBitrate: 625_000, maxFramerate: 15 },
  { maxBitrate: 2_500_000, maxFramerate: 15 },
]);
assert.ok(regression, "the h1080fps15 fallback must be reported as a mismatch");
assert.match(regression, /maxFramerate 15 < requested 60/);
assert.match(regression, /maxBitrate 2500000/);

assert.equal(
  describeEncodingMismatch(screenTarget, []),
  "encoder reported no encodings",
);

// SVC codecs get their bitrate trimmed on purpose (0.7 for AV1); that is not a
// fault and must not fire the warning.
assert.equal(
  describeEncodingMismatch(screenTarget, [
    { maxBitrate: 3_500_000, maxFramerate: 60 },
  ]),
  null,
  "a deliberate SVC bitrate trim is not a mismatch",
);

// A browser that reports nothing must not be read as a failure.
assert.equal(describeEncodingMismatch(screenTarget, [{}]), null);

console.log("video-layers self-check passed");
