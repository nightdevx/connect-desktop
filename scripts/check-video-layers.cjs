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

const { buildSimulcastLayerSpecs } = mod;

// --- 1440p60 screen share --------------------------------------------------
const sharp = buildSimulcastLayerSpecs({
  width: 2560,
  height: 1440,
  maxBitrateBps: 9_000_000,
  maxFramerate: 60,
});

assert.equal(sharp.length, 2, "1440p gets two extra layers");
assert.deepEqual(
  sharp.map((layer) => [layer.width, layer.height]),
  [
    [640, 360],
    [1280, 720],
  ],
  "layers are ordered lowest quality first",
);
assert.ok(
  sharp[0].maxBitrateBps < sharp[1].maxBitrateBps,
  "lower layer gets less bitrate",
);
assert.ok(
  sharp[1].maxBitrateBps < 9_000_000,
  "no layer exceeds the primary bitrate",
);
assert.equal(sharp[0].maxFramerate, 15, "quarter layer is capped at 15fps");
assert.equal(sharp[1].maxFramerate, 30, "half layer is capped at 30fps");
// Sanity against LiveKit's own ladder: 1440p @ 9M -> 720p should land near 2-3M.
assert.ok(
  sharp[1].maxBitrateBps > 2_000_000 && sharp[1].maxBitrateBps < 4_000_000,
  `720p layer bitrate out of range: ${sharp[1].maxBitrateBps}`,
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

console.log("video-layers self-check passed");
