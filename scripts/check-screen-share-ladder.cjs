#!/usr/bin/env node
// Self-check for the screen-share quality ladder.
//
// The ladder is ordered for the MENU, and menu order is not cost order: "Akıcı"
// (720p60) sits below "Dengeli" (1080p30) but runs at twice the framerate. The
// step-down used to be plain index arithmetic, so an overloaded CPU was
// answered by asking the encoder for more frames per second. The field logs
// caught it: 1080p30 -> 720p60 under a CPU limit bought 0.9 FPS (27.0 -> 27.9)
// in exchange for half the resolution, and there was no way back up afterwards.
//
// Run after `pnpm build:main`:
//   node scripts/check-screen-share-ladder.cjs

const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

// tsc emits the "@shared/..." specifier verbatim and Node has never heard of
// it. The compiled tree keeps the same shape as the source, so the alias is a
// two-line resolve hook rather than a bundler pass.
const distRoot = path.join(__dirname, "..", "dist");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (specifier, ...rest) {
  if (specifier.startsWith("@shared/")) {
    return resolveFilename.call(
      this,
      path.join(distRoot, "shared", specifier.slice("@shared/".length)),
      ...rest,
    );
  }
  return resolveFilename.call(this, specifier, ...rest);
};

const modulePath = path.join(
  __dirname,
  "..",
  "dist",
  "renderer",
  "src",
  "features",
  "screen-share",
  "constants.js",
);
let ladder;
try {
  ladder = require(modulePath);
} catch (error) {
  console.error(
    `Could not load ${modulePath}. Run "pnpm build:main" first.\n${error.message}`,
  );
  process.exit(1);
}

const {
  SCREEN_SHARE_QUALITY_OPTIONS,
  getLowerScreenShareQuality,
  getHigherScreenShareQuality,
  getScreenShareQualityOption,
  DEFAULT_SCREEN_SHARE_QUALITY,
} = ladder;

const dimensions = {
  "720p": 1280 * 720,
  "1080p": 1920 * 1080,
  "1440p": 2560 * 1440,
  "2160p": 3840 * 2160,
};
const byId = new Map(SCREEN_SHARE_QUALITY_OPTIONS.map((o) => [o.id, o]));
const pixelRate = (id) => dimensions[byId.get(id).resolution] * byId.get(id).frameRate;

// --- the ladder still describes itself honestly -----------------------------
for (const option of SCREEN_SHARE_QUALITY_OPTIONS) {
  assert.ok(dimensions[option.resolution], `${option.id} has an unknown resolution`);
  assert.ok(option.maxBitrateBps > 0, `${option.id} has no bitrate ceiling`);
}
// Bitrate is the one axis the menu order IS monotonic in, and the bandwidth
// step-down leans on it.
for (let i = 1; i < SCREEN_SHARE_QUALITY_OPTIONS.length; i += 1) {
  assert.ok(
    SCREEN_SHARE_QUALITY_OPTIONS[i].maxBitrateBps >
      SCREEN_SHARE_QUALITY_OPTIONS[i - 1].maxBitrateBps,
    `the ladder is not ordered by bitrate at ${SCREEN_SHARE_QUALITY_OPTIONS[i].id}`,
  );
}

// --- a CPU step never asks for more frames ----------------------------------
// The regression, stated directly. Every preset that can step down for CPU must
// land somewhere cheaper on BOTH axes.
for (const option of SCREEN_SHARE_QUALITY_OPTIONS) {
  const lower = getLowerScreenShareQuality(option.id, "cpu");
  if (!lower) {
    continue;
  }
  assert.ok(
    byId.get(lower).frameRate <= option.frameRate,
    `stepping down from ${option.id} for CPU raises the framerate to ${byId.get(lower).frameRate}`,
  );
  assert.ok(
    pixelRate(lower) < pixelRate(option.id),
    `stepping down from ${option.id} for CPU does not lower the pixel rate`,
  );
}

// The exact pair from the logs.
assert.equal(
  getLowerScreenShareQuality("balanced", "cpu"),
  "light",
  "1080p30 under a CPU limit must not step to 720p60",
);
assert.equal(getLowerScreenShareQuality("high", "cpu"), "balanced");
// 1440p60 and 2160p30 must both skip past anything that would raise the rate.
assert.equal(getLowerScreenShareQuality("ultra", "cpu"), "balanced");

// --- a bandwidth step only has to cost fewer bits ---------------------------
for (const option of SCREEN_SHARE_QUALITY_OPTIONS) {
  const lower = getLowerScreenShareQuality(option.id, "bandwidth");
  if (!lower) {
    continue;
  }
  assert.ok(
    byId.get(lower).maxBitrateBps < option.maxBitrateBps,
    `stepping down from ${option.id} for bandwidth does not lower the ceiling`,
  );
}
assert.equal(getLowerScreenShareQuality("balanced", "bandwidth"), "smooth");

// --- the floor is a floor ---------------------------------------------------
const floor = SCREEN_SHARE_QUALITY_OPTIONS[0].id;
assert.equal(getLowerScreenShareQuality(floor, "cpu"), null, "the floor has nowhere to go");
assert.equal(getLowerScreenShareQuality(floor, "bandwidth"), null);

// --- the way back up --------------------------------------------------------
// Stepping down is cheap to trigger and used to be permanent: a thirty-second
// background job cost the share its resolution for the rest of the session.
assert.equal(getHigherScreenShareQuality("light", "high"), "smooth", "one rung at a time");
assert.equal(
  getHigherScreenShareQuality("high", "high"),
  null,
  "recovery stops at what the user asked for",
);
assert.equal(
  getHigherScreenShareQuality("sharp", "balanced"),
  null,
  "recovery never climbs past the ceiling, even from above it",
);

// Down then up returns to where it started, which is the whole point.
const start = "high";
const stepped = getLowerScreenShareQuality(start, "cpu");
assert.equal(getHigherScreenShareQuality(stepped, start), start, "a CPU dip is recoverable");

// --- the fallback is by id, not by position ---------------------------------
// The list gained a rung at the bottom; a positional fallback silently became
// a different preset.
assert.equal(
  getScreenShareQualityOption("nonexistent-preset").id,
  DEFAULT_SCREEN_SHARE_QUALITY,
  "an unknown preset must fall back to the declared default",
);
assert.equal(getScreenShareQualityOption("ultra").id, "ultra", "a known preset resolves to itself");

console.log(
  `screen-share ladder self-check passed (${SCREEN_SHARE_QUALITY_OPTIONS.length} presets, floor "${floor}")`,
);
