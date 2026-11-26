#!/usr/bin/env node
// Acceptance check for a screen share that survives (or cleanly ends at) a
// room switch (plan F2.5).
//
// Field, 2026-11-25: two users switched rooms while sharing. The new room got
// the old share's stream republished, but its tracks had already stopped
// (screen audio reported readyState "ended", video sourceFps 0 and no
// resolution): viewers saw a share with no picture for 49 minutes, the sharer
// saw nothing wrong, and LiveKit logged "publish time out". What must hold:
//
//   NEVER DEAD   a stream whose video track is not "live" is never published;
//                ended audio tracks are left out of a share whose video lives.
//   ENDS CLEANLY a share whose video is dead at republish time ends the share
//                (desired state cleared, the app told the share ended), it is
//                not left "on" with nothing behind it.
//   ROOT CAUSE   leaving a room for another must not stop the share's tracks
//                behind the app's back (livekit stops unpublished tracks
//                unless told not to), or else the app ends the share on
//                purpose before switching. Either way: no republish of a
//                stream this app did not mean to keep.
//
//   node scripts/check-screen-republish.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");
const streamDir = path.join(projectRoot, "src/renderer/src/features/livekit/services/stream");
const entry = path.join(streamDir, "screen-stream-guard.ts");

const track = (kind, readyState, id = `${kind}-${readyState}`) => ({ kind, readyState, id });
const stream = (...tracks) => ({
  getTracks: () => tracks,
  getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
  getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
});

const main = async () => {
  assert.ok(fs.existsSync(entry), "stream/screen-stream-guard.ts is missing");
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-screen-guard-"));
  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: { outDir, emptyOutDir: true, ssr: true, lib: { entry, formats: ["es"], fileName: () => "screen-stream-guard.mjs" } },
  });
  const built = fs.readdirSync(outDir).find((f) => f.endsWith(".mjs"));
  const { usableScreenTracks } = await import(pathToFileURL(path.join(outDir, built)).href);
  assert.equal(typeof usableScreenTracks, "function", "usableScreenTracks is not exported");

  // usableScreenTracks(stream) -> { video, audio: [] } | null
  const live = usableScreenTracks(stream(track("video", "live"), track("audio", "live")));
  assert.equal(live?.video?.id, "video-live");
  assert.deepEqual(live.audio.map((t) => t.id), ["audio-live"]);

  assert.equal(usableScreenTracks(stream(track("video", "ended"), track("audio", "live"))), null,
    "NEVER DEAD: a share whose video ended is not usable");
  assert.equal(usableScreenTracks(stream(track("audio", "live"))), null, "a share needs a video track");
  assert.equal(usableScreenTracks(null), null);

  const audioDead = usableScreenTracks(stream(track("video", "live"), track("audio", "ended")));
  assert.equal(audioDead?.video?.id, "video-live", "a live video with dead audio is still a share");
  assert.deepEqual(audioDead.audio, [], "NEVER DEAD: the ended audio track is left out");

  // Wiring.
  const manager = fs.readFileSync(path.join(streamDir, "stream-manager.ts"), "utf8");
  const applyScreen = manager.slice(manager.indexOf("private async applyScreenStateInternal"), manager.indexOf("\n  private ", manager.indexOf("private async applyScreenStateInternal") + 10));
  assert.ok(applyScreen.length > 100, "applyScreenStateInternal not found");
  assert.match(applyScreen, /usableScreenTracks\(/, "NEVER DEAD: applyScreenStateInternal must check the stream before publishing");
  assert.match(applyScreen, /desiredScreenEnabled\s*=\s*false/, "ENDS CLEANLY: a dead share must clear the desired state");
  assert.match(applyScreen, /logLiveKitDebug\(\s*"stream-manager",\s*"screen-share-dead"/, "ENDS CLEANLY: log stream-manager / screen-share-dead");

  // ROOT CAUSE: either livekit is told not to stop unpublished tracks during a
  // room switch, or the app ends the share deliberately before switching.
  const keepsTracks = /stopLocalTrackOnUnpublish\s*:\s*false/.test(manager) || /unpublishTrack\([^)]*,\s*false\s*\)/.test(manager);
  const endsShareOnSwitch = /room-switch-ends-share/.test(manager);
  assert.ok(keepsTracks || endsShareOnSwitch,
    "ROOT CAUSE: a room switch must either keep the share's tracks alive (stopLocalTrackOnUnpublish: false / unpublishTrack(track, false)) or end the share on purpose (log 'room-switch-ends-share')");

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("screen-republish check passed (ended video never published, ended audio left out, a dead share ends cleanly, room switch no longer kills the share behind the app's back)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
