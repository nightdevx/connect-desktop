#!/usr/bin/env node
// Self-check for the remote subscription rule in
// src/renderer/src/features/livekit/services/stream/constants.ts.
//
// This is what decides which remote tracks a client pulls, and the failure it
// guards is the one users reported: hearing a screen share's audio without
// ever pressing "Yayını İzle". The rule used to be written out separately in
// three places, and the deafen toggle's copy did not know screen shares are
// opt-in — so un-deafening (which the audio controls re-assert on every
// microphone toggle) subscribed every screen share's audio in the room, with
// no video to explain where the sound came from.
//
// The module is pure — it reads the Track enum and nothing else — so it bundles
// with no DOM, no WebAudio and no room. Output goes under node_modules/.cache
// for the same reason check-speaking-state.cjs does: bare specifiers cannot
// resolve from a system temp directory.
//
//   node scripts/check-screen-subscription.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-subscription-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Not vite.config.ts: it carries the Sentry plugin, which would upload a
    // source map for this throwaway bundle on every check run.
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/livekit/services/stream/constants.ts",
        ),
        formats: ["es"],
        fileName: () => "constants.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const bundle = path.join(outDir, "constants.mjs");
  const { isScreenSource, shouldSubscribePublication } = await import(
    pathToFileURL(bundle).href
  );
  const { Track } = await import("livekit-client");

  const MIC = Track.Source.Microphone;
  const CAMERA = Track.Source.Camera;
  const SCREEN = Track.Source.ScreenShare;
  const SCREEN_AUDIO = Track.Source.ScreenShareAudio;

  assert.ok(isScreenSource(SCREEN) && isScreenSource(SCREEN_AUDIO));
  assert.ok(!isScreenSource(MIC) && !isScreenSource(CAMERA));

  const wants = (kind, source, deafened, watchingScreen) =>
    shouldSubscribePublication({ kind, source, deafened, watchingScreen });

  const AUDIO = Track.Kind.Audio;
  const VIDEO = Track.Kind.Video;

  // --- the reported bug -----------------------------------------------------
  // Not watching means not hearing, and it must hold whatever the deafen flag
  // is doing. Un-deafening walks every audio publication in the room; if this
  // says true for an unwatched share, that walk is what plays a stream the
  // user never opened.
  for (const deafened of [true, false]) {
    assert.equal(
      wants(AUDIO, SCREEN_AUDIO, deafened, false),
      false,
      `unwatched screen audio must never be subscribed (deafened=${deafened})`,
    );
    assert.equal(
      wants(VIDEO, SCREEN, deafened, false),
      false,
      `unwatched screen video must never be subscribed (deafened=${deafened})`,
    );
  }

  // --- watching means both halves of the share ------------------------------
  assert.equal(wants(VIDEO, SCREEN, false, true), true);
  assert.equal(wants(AUDIO, SCREEN_AUDIO, false, true), true);

  // --- deafen silences audio without blanking the picture -------------------
  // A deafened viewer watching a share still sees it; only the sound stops.
  assert.equal(
    wants(VIDEO, SCREEN, true, true),
    true,
    "deafen must not unsubscribe screen VIDEO of a share being watched",
  );
  assert.equal(
    wants(AUDIO, SCREEN_AUDIO, true, true),
    false,
    "deafen must silence the screen audio of a share being watched",
  );

  // --- voice and camera are unaffected by the watch flag --------------------
  for (const watching of [true, false]) {
    assert.equal(wants(AUDIO, MIC, false, watching), true, "voice is not opt-in");
    assert.equal(
      wants(AUDIO, MIC, true, watching),
      false,
      "deafen must unsubscribe voice",
    );
    assert.equal(
      wants(VIDEO, CAMERA, true, watching),
      true,
      "deafen must not touch video",
    );
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    "screen-subscription self-check passed (unwatched shares stay silent through deafen toggles)",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
