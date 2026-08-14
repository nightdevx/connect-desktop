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

const { buildSimulcastLayerSpecs, scaleBitrateToResolution } = mod;

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

// --- 1080p60 screen share: still three encodings ---------------------------
const high = buildSimulcastLayerSpecs({
  width: 1920,
  height: 1080,
  maxBitrateBps: 5_000_000,
  maxFramerate: 60,
});
assert.equal(high.length, 2, "1080p keeps the full ladder");
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

console.log("video-layers self-check passed");
