#!/usr/bin/env node
// Acceptance check for a microphone that ends under a running call (plan F2.4).
//
// livekit-client 2.22.4 already brings an ended microphone back by itself
// (LocalParticipant.handleTrackEnded: restartTrack({ deviceId: "default" })
// when unmuted; LocalAudioTrack.unmute restarts an ended track when muted).
// But that restart passes ONLY the device id, so every capture setting this
// app chose is dropped: the browser's own noise suppression comes back on top
// of RNNoise (two suppressors, the voice gets thin), automatic gain and echo
// cancellation fall back to defaults, and the channel count is no longer 1.
// Nobody would notice why the voice changed after a headset was unplugged.
// What must hold:
//
//   DETECT   a pure rule says whether a track lost any of the capture
//            settings that matter (echoCancellation, noiseSuppression,
//            autoGainControl, channelCount); the device id alone never counts.
//   REAPPLY  the controller watches the published microphone for livekit's
//            Restarted event and, when the rule says settings were lost,
//            restarts it once more with the app's own capture options.
//   NO LOOP  a restart that already carries the app's settings does nothing.
//   SEEN     every restart is recorded in the diagnostics.
//
//   node scripts/check-mic-restart-constraints.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");
const micDir = path.join(projectRoot, "src/renderer/src/features/livekit/services/mic");
const entry = path.join(micDir, "capture-constraints.ts");

const main = async () => {
  assert.ok(fs.existsSync(entry), "mic/capture-constraints.ts (the pure rule) is missing");
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-mic-constraints-"));
  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: { entry, formats: ["es"], fileName: () => "capture-constraints.mjs" },
      rollupOptions: { external: ["livekit-client"] },
    },
  });
  const built = fs.readdirSync(outDir).find((f) => f.endsWith(".mjs"));
  const { lostCaptureConstraints } = await import(pathToFileURL(path.join(outDir, built)).href);
  assert.equal(typeof lostCaptureConstraints, "function", "lostCaptureConstraints is not exported");

  const desired = { deviceId: "abc", echoCancellation: true, noiseSuppression: false, autoGainControl: true, channelCount: 1 };

  // DETECT
  assert.equal(lostCaptureConstraints({ deviceId: "default" }, desired), true,
    "DETECT: livekit's bare restart ({ deviceId }) lost every setting");
  assert.equal(lostCaptureConstraints({ ...desired, noiseSuppression: true }, desired), true,
    "DETECT: browser noise suppression back on is a lost setting");
  assert.equal(lostCaptureConstraints({ ...desired, channelCount: undefined }, desired), true,
    "DETECT: a missing channel count is a lost setting");
  assert.equal(lostCaptureConstraints({ ...desired, autoGainControl: false }, desired), true);
  // Constraints can come back in their object form ({ ideal } / { exact }).
  assert.equal(lostCaptureConstraints({ ...desired, echoCancellation: { ideal: true }, channelCount: { exact: 1 } }, desired), false,
    "DETECT: { ideal } / { exact } wrappers of the same value are not a loss");
  assert.equal(lostCaptureConstraints({ ...desired, noiseSuppression: { exact: true } }, desired), true);

  // NO LOOP: the device id alone never triggers, and identical settings never do.
  assert.equal(lostCaptureConstraints({ ...desired, deviceId: "default" }, desired), false,
    "NO LOOP: a different device id alone is not a lost setting (livekit falls back to default on purpose)");
  assert.equal(lostCaptureConstraints(desired, desired), false, "NO LOOP: identical settings");
  assert.equal(lostCaptureConstraints({ ...desired, sampleRate: 48000 }, desired), false,
    "settings this app does not choose are ignored");
  // A desired setting the app leaves unset cannot be lost.
  assert.equal(lostCaptureConstraints({ deviceId: "x", channelCount: 1 }, { channelCount: 1 }), false);

  // REAPPLY + SEEN: wiring in the controller.
  const controller = fs.readFileSync(path.join(micDir, "controller.ts"), "utf8");
  assert.match(controller, /TrackEvent\.Restarted/, "REAPPLY: the controller must listen to the microphone's Restarted event");
  assert.match(controller, /lostCaptureConstraints\(/, "REAPPLY: the controller must decide through lostCaptureConstraints");
  assert.match(controller, /restartTrack\(/, "REAPPLY: the controller must restart the track with its own options");
  assert.match(controller, /logLiveKitDebug\(\s*"mic-controller",\s*"mic-track-restarted"/, "SEEN: a restart must be logged as mic-controller / mic-track-restarted");
  assert.match(controller, /\.off\(\s*TrackEvent\.Restarted|removeListener\(\s*TrackEvent\.Restarted/, "the Restarted listener must be removed when the track is released");

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("mic-restart-constraints check passed (lost capture settings detected, ideal/exact forms understood, device id alone ignored; controller re-applies its options on Restarted and logs it)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
