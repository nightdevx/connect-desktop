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
// The module is bundled with Vite, as check-access-token.cjs does: tsc no
// longer compiles renderer code.
//
//   node scripts/check-screen-share-ladder.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const loadLadder = async () => {
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-share-ladder-"));
  try {
    await build({
      root: projectRoot,
      logLevel: "error",
      configFile: false,
      publicDir: false,
      resolve: { alias: { "@shared": path.join(projectRoot, "src/shared") } },
      build: {
        outDir,
        emptyOutDir: true,
        ssr: true,
        lib: {
          entry: path.join(projectRoot, "src/renderer/src/features/screen-share/constants.ts"),
          formats: ["es"],
          fileName: () => "constants.mjs",
        },
      },
    });
    return await import(pathToFileURL(path.join(outDir, "constants.mjs")).href);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
};

loadLadder()
  .then((ladder) => {
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
    // Bitrate is the one axis the menu order IS monotonic in, and the uplink
    // estimate shown beside each preset reads that way.
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
      const lower = getLowerScreenShareQuality(option.id);
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
      getLowerScreenShareQuality("balanced"),
      "light",
      "1080p30 under a CPU limit must not step to 720p60",
    );
    assert.equal(getLowerScreenShareQuality("high"), "balanced");
    // 1440p60 and 2160p30 must both skip past anything that would raise the rate.
    assert.equal(getLowerScreenShareQuality("ultra"), "balanced");

    // There is no bandwidth step any more: the encoder adapts to the uplink by
    // itself, and the old step (1080p30 -> 720p60, from a re-capture that almost
    // never came back) was the most common step in production. The function takes
    // no reason, so a caller cannot ask for one.
    assert.equal(getLowerScreenShareQuality.length, 1, "getLowerScreenShareQuality takes the preset only");

    // --- the floor is a floor ---------------------------------------------------
    const floor = SCREEN_SHARE_QUALITY_OPTIONS[0].id;
    assert.equal(getLowerScreenShareQuality(floor), null, "the floor has nowhere to go");

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
    const stepped = getLowerScreenShareQuality(start);
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
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
