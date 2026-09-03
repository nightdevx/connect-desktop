#!/usr/bin/env node
// Self-check for buildVideoPublishPlan in
// src/renderer/src/features/livekit/services/stream/video-profiles.ts.
//
// This one exists because of a bug that shipped: LiveKit reads
// `screenShareEncoding`/`screenShareSimulcastLayers` for a ScreenShare track and
// `videoEncoding`/`videoSimulcastLayers` for everything else. A screen share
// published with only the video-keyed options had them silently dropped and got
// the library default instead — 1920x1080 at 2.5 Mbps and 15 fps — so every
// quality preset published at 15 fps no matter what the user picked.
//
// The layer arithmetic lives in src/shared and is checked with plain node. This
// module cannot be: it imports livekit-client for VideoPreset. So it is bundled
// with vite (already a dependency) and then imported.
//
//   node scripts/check-publish-plan.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  // Inside the project, not os.tmpdir(). livekit-client is left external below,
  // so Node resolves that bare specifier from wherever the bundle sits — and
  // from a system temp directory there is no node_modules to walk up to. It
  // passes on a machine that happens to have one above the temp path and fails
  // on CI, which is exactly how it was found.
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-publish-plan-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Do NOT pick up vite.config.ts. It carries the Sentry plugin, which would
    // upload a source map for this throwaway bundle to the real project on
    // every check run.
    configFile: false,
    resolve: {
      alias: {
        "@shared": path.join(projectRoot, "src", "shared"),
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/livekit/services/stream/video-profiles.ts",
        ),
        formats: ["es"],
        fileName: () => "video-profiles.mjs",
      },
      // Keep the SDK out of the bundle: the point is to exercise our module
      // against the real livekit-client, not to re-bundle it.
      rollupOptions: { external: ["livekit-client"] },
    },
  });

  const bundle = path.join(outDir, "video-profiles.mjs");
  const { buildVideoPublishPlan } = await import(pathToFileURL(bundle).href);

  const target = {
    width: 1920,
    height: 1080,
    maxBitrateBps: 5_000_000,
    maxFramerate: 60,
  };

  // --- screen share: the source LiveKit keys differently -------------------
  const screen = buildVideoPublishPlan({
    target,
    codec: "h264",
    contentMode: "motion",
    isScreenShare: true,
  });

  assert.equal(
    screen.screenShareEncoding?.maxFramerate,
    60,
    "screenShareEncoding is the key LiveKit reads for a ScreenShare track",
  );
  assert.equal(screen.screenShareEncoding?.maxBitrate, 5_000_000);
  assert.ok(
    Array.isArray(screen.screenShareSimulcastLayers),
    "the ladder has to arrive under screenShareSimulcastLayers too",
  );
  assert.equal(
    screen.screenShareSimulcastLayers.length,
    1,
    "screen share publishes two encodings: one extra layer plus the primary",
  );
  assert.equal(screen.screenShareSimulcastLayers[0].width, 960);
  assert.equal(screen.simulcast, true);
  assert.equal(
    screen.degradationPreference,
    "maintain-framerate",
    "motion content protects smoothness, which is the whole point of 60fps",
  );

  // --- camera: three encodings, and the video-keyed options ----------------
  const camera = buildVideoPublishPlan({
    target: {
      width: 1280,
      height: 720,
      maxBitrateBps: 1_700_000,
      maxFramerate: 30,
    },
    codec: "h264",
    contentMode: "motion",
    isScreenShare: false,
  });

  assert.equal(camera.videoEncoding?.maxFramerate, 30);
  assert.equal(
    camera.videoSimulcastLayers.length,
    2,
    "camera keeps the full three-encoding ladder",
  );

  // --- text/slides keeps sharpness instead ---------------------------------
  const slides = buildVideoPublishPlan({
    target,
    codec: "h264",
    contentMode: "detail",
    isScreenShare: true,
  });
  assert.equal(slides.degradationPreference, "maintain-resolution");

  // --- SVC codecs: no simulcast array, ladder comes from scalabilityMode ---
  const svc = buildVideoPublishPlan({
    target,
    codec: "av1",
    contentMode: "motion",
    isScreenShare: true,
  });
  assert.equal(svc.simulcast, false);
  assert.equal(
    svc.scalabilityMode,
    "L1T3",
    "temporal only: Chromium's MediaFoundation encoders have no spatial SVC, and asking for one drops the publish to a software encoder without saying so",
  );
  assert.equal(
    svc.screenShareEncoding?.maxFramerate,
    60,
    "SVC reads the same source-keyed encoding — it is picked before the branch",
  );
  assert.equal(
    svc.screenShareEncoding?.maxBitrate,
    3_500_000,
    "AV1 carries the same picture in ~30% fewer bits, and LiveKit only applies that factor when no explicit encoding is supplied — which this app always supplies",
  );
  assert.equal(
    svc.screenShareSimulcastLayers,
    undefined,
    "an SVC plan must not carry a simulcast ladder",
  );

  const svcVp9 = buildVideoPublishPlan({
    target,
    codec: "vp9",
    contentMode: "motion",
    isScreenShare: true,
  });
  assert.equal(svcVp9.screenShareEncoding?.maxBitrate, 4_250_000);

  assert.equal(
    screen.screenShareEncoding?.maxBitrate,
    5_000_000,
    "only SVC codecs get the reduction; H.264 has to keep the ceiling the preset promised",
  );

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("publish-plan self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
