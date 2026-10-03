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
  screenShareLiveEncodings,
  SCREEN_SHARE_MAX_ENCODINGS,
  CAMERA_MAX_ENCODINGS,
  CAMERA_MAX_ENCODINGS_WHILE_SHARING,
} = mod;

assert.equal(SCREEN_SHARE_MAX_ENCODINGS, 3);
assert.equal(CAMERA_MAX_ENCODINGS, 3);
assert.equal(CAMERA_MAX_ENCODINGS_WHILE_SHARING, 2);

const target1440p60 = {
  width: 2560,
  height: 1440,
  maxBitrateBps: 9_000_000,
  maxFramerate: 60,
};

// --- 1440p60 CAMERA --------------------------------------------------------
// One extra layer, not two: a camera frame this large is rare, and a third
// encoding costs a hardware encoder session for a layer the half one covers.
const sharp = buildSimulcastLayerSpecs(target1440p60);

assert.equal(sharp.length, 1, "1440p camera gets one extra layer");
assert.deepEqual(
  sharp.map((layer) => [layer.width, layer.height]),
  [[1280, 720]],
  "the surviving layer is the half one",
);
assert.equal(sharp[0].maxFramerate, 30, "half layer is capped at 30fps");

// --- 1440p60 SCREEN SHARE --------------------------------------------------
// The low rung (360 on the short side, 15 fps) for tiles and weak downlinks,
// and at 2560 wide and above a half rung for a viewer between the two.
const sharpScreen = buildSimulcastLayerSpecs(
  target1440p60,
  SCREEN_SHARE_MAX_ENCODINGS,
  true,
);
assert.equal(sharpScreen.length, 2, "1440p screen share gets three encodings");
assert.deepEqual(
  sharpScreen.map((layer) => [layer.width, layer.height, layer.maxFramerate]),
  [
    [640, 360, 15],
    [1280, 720, 30],
  ],
  "a 360p rung at 15 fps, then the half rung, lowest first",
);
assert.equal(sharpScreen[0].maxBitrateBps, 400_000, "the low rung is LiveKit's h360fps15");

// --- 2160p screen share ----------------------------------------------------
const uhdScreen = buildSimulcastLayerSpecs(
  { width: 3840, height: 2160, maxBitrateBps: 14_000_000, maxFramerate: 30 },
  SCREEN_SHARE_MAX_ENCODINGS,
  true,
);
assert.equal(uhdScreen.length, 2, "2160p screen share gets three encodings");
assert.deepEqual(
  uhdScreen.map((layer) => [layer.width, layer.height]),
  [
    [640, 360],
    [1920, 1080],
  ],
  "the low rung of a 4K share is 360p too, and its half rung is 1080p",
);

// --- the low rung is 360 on the SHORT side, whatever the aspect ------------
// Chromium encodes anything under 360 tall in software. The half-resolution
// rung this replaced was 640x270 on an ultrawide 720p share, and production
// showed it on OpenH264 next to a hardware top layer.
const lowRung = (width, height, maxBitrateBps = 4_000_000) =>
  buildSimulcastLayerSpecs(
    { width, height, maxBitrateBps, maxFramerate: 30 },
    SCREEN_SHARE_MAX_ENCODINGS,
    true,
  )[0];
assert.deepEqual(
  [lowRung(1280, 540).width, lowRung(1280, 540).height],
  [854, 360],
  "21:9 720p keeps a 360-tall low rung",
);
assert.deepEqual(
  [lowRung(1920, 810).width, lowRung(1920, 810).height],
  [960, 406],
  "21:9 1080p: scale 2, not 810 / 360 = 2.25, which WebRTC turns into 7/3 (342 tall)",
);
assert.deepEqual(
  [lowRung(960, 1020).width, lowRung(960, 1020).height],
  [480, 510],
  "a portrait window scales by its short side, the width",
);
assert.ok(
  lowRung(1280, 540).maxBitrateBps > 400_000 && lowRung(1280, 540).maxBitrateBps < 520_000,
  `a wider 360p rung gets a little more than 400 kbps, got ${lowRung(1280, 540).maxBitrateBps}`,
);
assert.equal(
  lowRung(1920, 1080, 600_000).maxBitrateBps,
  300_000,
  "the low rung never takes more than half of the primary",
);
assert.equal(
  buildSimulcastLayerSpecs(
    { width: 960, height: 500, maxBitrateBps: 2_000_000, maxFramerate: 30 },
    SCREEN_SHARE_MAX_ENCODINGS,
    true,
  ).length,
  0,
  "a share under 540 on its short side publishes one encoding",
);
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

// A 1080p share gets the low rung only: no half rung under 2560 wide.
const highScreen = buildSimulcastLayerSpecs(
  target1080p60,
  SCREEN_SHARE_MAX_ENCODINGS,
  true,
);
assert.equal(highScreen.length, 1, "1080p screen share gets two encodings");

// --- the camera gives up a layer while a share is live ---------------------
// Three camera layers plus three screen layers is six concurrent encoder
// sessions, which is past what consumer hardware takes before falling back to
// software and degrading both streams.
const cameraWhileSharing = buildSimulcastLayerSpecs(
  target1080p60,
  CAMERA_MAX_ENCODINGS_WHILE_SHARING,
);
assert.equal(
  cameraWhileSharing.length,
  1,
  "the camera drops to two encodings while a screen share is live",
);
assert.deepEqual(
  [cameraWhileSharing[0].width, cameraWhileSharing[0].height],
  [960, 540],
  "and keeps the half layer, not the quarter one",
);
assert.deepEqual(
  [highScreen[0].width, highScreen[0].height, highScreen[0].maxFramerate],
  [640, 360, 15],
  "the 1080p share's extra layer is the 360p rung at 15 fps",
);

// --- ladder cost is the sum, not the headline bitrate ----------------------
const cameraCost = estimateLadderBitrateBps(
  target1080p60,
  CAMERA_MAX_ENCODINGS,
);
const screenCost = estimateLadderBitrateBps(
  target1080p60,
  SCREEN_SHARE_MAX_ENCODINGS,
  true,
);
assert.ok(
  cameraCost > 5_000_000,
  "the ladder always costs more than the primary encoding alone",
);
assert.ok(
  screenCost < cameraCost,
  "the screen ladder carries less than the camera's",
);
assert.equal(
  screenCost,
  5_400_000,
  "a 1080p share costs its primary plus the 400 kbps rung",
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

// --- a live quality change keeps the low rung at 360 -----------------------
// The sender keeps the encodings it was published with. The low rung's scale
// was set for the capture at publish time; on a new capture it has to follow,
// or a 1440p publish (scale 4) re-captured at 1080p sends a 270-tall rung.
const fullHd30 = { width: 1920, height: 1080, maxBitrateBps: 4_000_000, maxFramerate: 30 };
assert.deepEqual(
  screenShareLiveEncodings(fullHd30, 1),
  [{ scaleResolutionDownBy: 1, maxBitrate: 4_000_000, maxFramerate: 30 }],
  "a single encoding (SVC, or a small share) is the primary alone",
);
const liveTwo = screenShareLiveEncodings(fullHd30, 2);
assert.deepEqual(
  liveTwo,
  [
    { scaleResolutionDownBy: 3, maxBitrate: 400_000, maxFramerate: 15 },
    { scaleResolutionDownBy: 1, maxBitrate: 4_000_000, maxFramerate: 30 },
  ],
  "two encodings: the 360p rung (1080 / 3) and the primary",
);
const liveThree = screenShareLiveEncodings(fullHd30, 3);
assert.deepEqual(
  liveThree.map((spec) => spec.scaleResolutionDownBy),
  [3, 2, 1],
  "a 1440p publish re-captured at 1080p: the low rung follows to scale 3, not 4",
);
assert.equal(
  1080 / liveThree[0].scaleResolutionDownBy,
  360,
  "and stays 360 tall, on the hardware encoder",
);
assert.equal(
  screenShareLiveEncodings({ width: 1280, height: 540, maxBitrateBps: 2_000_000, maxFramerate: 30 }, 2)[0]
    .scaleResolutionDownBy,
  1.5,
  "ultrawide: 540 / 1.5 = 360",
);
assert.equal(
  screenShareLiveEncodings({ width: 640, height: 300, maxBitrateBps: 1_000_000, maxFramerate: 30 }, 2)[0]
    .scaleResolutionDownBy,
  1,
  "a capture already under 360 is never scaled up",
);

// --- every low-rung scale survives WebRTC's simulcast alignment -------------
// WebRTC's AlignmentAdjuster (video/alignment_adjuster.cc), with simulcast and
// apply_alignment_to_all_simulcast_layers: every layer's scale is rounded to
// the nearest alignment / i, i a multiple of the encoder's requested alignment
// (2 for H.264), the alignment (at most 16) picked to change the scales least.
// A scale the app sets has to come through it unchanged, or the rung moves.
const webrtcAligned = (scales, requested = 2, maxAlignment = 16) => {
  const roundTo = (alignment) =>
    scales.map((scale) => {
      let best = 1;
      let distance = Infinity;
      for (let i = requested; i <= alignment; i += requested) {
        if (Math.abs(scale - alignment / i) <= distance) {
          distance = Math.abs(scale - alignment / i);
          best = alignment / i;
        }
      }
      return best;
    });
  let alignment = requested;
  let least = Infinity;
  for (let candidate = requested; candidate <= maxAlignment; candidate += 1) {
    const change = roundTo(candidate).reduce((sum, value, k) => sum + Math.abs(value - scales[k]), 0);
    if (change < least) {
      least = change;
      alignment = candidate;
    }
  }
  return roundTo(alignment);
};
assert.deepEqual(
  webrtcAligned([2.25, 1]).map((scale) => Math.round(scale * 1000) / 1000),
  [2.333, 1],
  "the model reproduces production: 2.25 came out as 7/3, a 342-tall rung on a 1920x810 capture",
);
// What screens and windows really deliver under the presets: 16:9, 16:10,
// 21:9 and 32:9 monitors at 720p, 1080p, 1440p and 2160p, and common laptops.
for (const [width, height] of [
  [1280, 720], [1920, 1080], [2560, 1440], [3840, 2160],
  [1152, 720], [1728, 1080], [2304, 1440], [1920, 1200],
  [1280, 540], [1920, 810], [2560, 1080], [2560, 1072], [3840, 1607],
  [1920, 540], [2560, 720], [1600, 900], [1366, 768],
]) {
  const target = { width, height, maxBitrateBps: 4_000_000, maxFramerate: 30 };
  for (const count of [2, 3]) {
    const scales = screenShareLiveEncodings(target, count).map((spec) => spec.scaleResolutionDownBy);
    assert.deepEqual(webrtcAligned(scales), scales, `${width}x${height}, ${count} encodings: WebRTC keeps ${scales}`);
    assert.ok(
      Math.min(width, height) / scales[0] >= 360,
      `${width}x${height}: the low rung stays 360 or more on its short side`,
    );
    assert.ok(
      scales.every((scale, k) => k === 0 || scale < scales[k - 1]),
      `${width}x${height}, ${count} encodings: every rung is a different size (${scales})`,
    );
  }
}
assert.deepEqual(
  screenShareLiveEncodings({ width: 2560, height: 1072, maxBitrateBps: 9_000_000, maxFramerate: 60 }, 3).map(
    (spec) => spec.scaleResolutionDownBy,
  ),
  [2, 1.5, 1],
  "21:9 1440p: the low rung is already half, so the middle one sits at 1.5",
);

console.log("video-layers self-check passed");
