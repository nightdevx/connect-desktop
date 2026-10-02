#!/usr/bin/env node
// Self-check for the always-on half of the media path in
// src/renderer/src/features/livekit/services/stream/stream-manager.ts.
//
// Four decisions live there that are invisible when they regress: nothing
// throws, nothing logs, the call still works — it just sounds worse, costs more
// uplink, or eats the first syllable of every sentence. Each one was a real
// report before it was a rule:
//
//   * muting must not stop the capture track. Push-to-talk drives that path on
//     every key press, and stopping the track meant re-running getUserMedia, the
//     AudioContext graph, two audioWorklet loads and the RNNoise compile per
//     utterance;
//   * the local level meter reads the PUBLISHED track, which already carries the
//     processor's gain — a second gain node in front of the analyser made the
//     meter and the speaking gate read gain squared, so at 50% mic volume your
//     own ring stayed dark while everyone else saw you talking;
//   * voice and screen audio are never silent, so their bitrate is a constant
//     tax on the same uplink the video ladder is trying to fit into;
//   * the stream manager must never capture on its own. Falling back to
//     setCameraEnabled(true) / setScreenShareEnabled(true) publishes with
//     LiveKit's defaults (h1080fps15 for screen — the exact profile
//     video-profiles.ts was written to replace) and pops an OS source picker
//     mid-call.
//
// Source-level assertions on purpose: these are configuration choices, not
// behaviour a bundle can be asked about.
//
//   node scripts/check-audio-publish.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const streamManagerPath = path.join(
  projectRoot,
  "src/renderer/src/features/livekit/services/stream/stream-manager.ts",
);
const source = fs.readFileSync(streamManagerPath, "utf8");

// --- muting keeps the capture chain alive ----------------------------------
assert.ok(
  source.includes("stopMicTrackOnMute: false"),
  "stopMicTrackOnMute must stay false: true rebuilds the whole capture chain on every push-to-talk release",
);

// --- one gain stage, not two ----------------------------------------------
assert.ok(
  !source.includes("micGainNode"),
  "the local meter must read the published track directly — a gain node in front of the analyser double-applies microphone volume",
);

// --- the always-on bitrates ------------------------------------------------
assert.ok(
  source.includes("const MICROPHONE_BITRATE_BPS = 64_000;"),
  "the microphone publishes at 64 kbps: 96 (musicHighQuality) is wasteful and 48 (music) overshot the correction downward",
);
assert.ok(
  source.includes('audioPreset: { maxBitrate: MICROPHONE_BITRATE_BPS, priority: "high" }'),
  "the microphone bitrate must come from the named constant, so it cannot drift from the number this check asserts, and the voice is published at high priority",
);

assert.ok(
  !source.includes("AudioPresets."),
  "screen audio publishes from SCREEN_AUDIO_PUBLISH_OPTIONS, not a LiveKit preset: musicStereo is 64 kbps and musicHighQualityStereo is 128, and neither can carry the red:false decision this file asserts below",
);
assert.ok(
  /const SCREEN_AUDIO_PUBLISH_OPTIONS: TrackPublishOptions = \{/.test(source),
  "the two screen-audio publish paths (initial publish and late add) share one options object so they cannot drift apart",
);
assert.equal(
  source.split("SCREEN_AUDIO_PUBLISH_OPTIONS").length - 1,
  3,
  "one declaration and exactly two uses: an inline options literal at either publish site is how the two drifted before",
);

const screenAudioOptions = source.slice(
  source.indexOf("const SCREEN_AUDIO_PUBLISH_OPTIONS"),
  source.indexOf("const SOFTWARE_SVC_TICKS"),
);
assert.ok(
  screenAudioOptions.includes('audioPreset: { maxBitrate: 96_000, priority: "medium" }'),
  "96 kbps stereo, the same budget the music bot encodes at (64 is audibly thin for game and music audio, 128 buys very little on top of 96), and below the microphone: livekit-client defaults every audio track to high, so a shared game competed with the voice on equal terms",
);
assert.ok(
  screenAudioOptions.includes("red: false"),
  "RED doubles a never-silent stereo stream (96 -> ~192 kbps) for redundancy Opus already provides in-band; it stays off for screen audio",
);
assert.ok(
  screenAudioOptions.includes("dtx: false"),
  "DTX must stay off: a quiet passage in music is not silence, and cutting it is audible",
);
assert.ok(
  screenAudioOptions.includes("forceStereo: true"),
  "game and music audio is stereo; the voice default would fold it to mono",
);

// --- capture is owned by the controls, never by the manager ----------------
assert.ok(
  !source.includes("participant.setCameraEnabled(true)"),
  "the stream manager must not capture a camera itself: that publishes with publishDefaults and ignores the layer ladder",
);
assert.ok(
  !source.includes("participant.setScreenShareEnabled(true)"),
  "the stream manager must not capture a screen itself: setScreenShareEnabled calls getDisplayMedia and pops an OS picker mid-call",
);

// --- leaving a room is never held up by the microphone queue ---------------
assert.ok(
  source.includes("DISCONNECT_MIC_MUTE_BUDGET_MS"),
  "the pre-disconnect mute must be bounded: it queues behind every other microphone operation, and an unbounded wait keeps the user audible and on the roster",
);

// --- the processor attach is bounded too -----------------------------------
const controllerPath = path.join(
  projectRoot,
  "src/renderer/src/features/livekit/services/mic/controller.ts",
);
const controller = fs.readFileSync(controllerPath, "utf8");

assert.ok(
  controller.includes("const PROCESSOR_ATTACH_TIMEOUT_MS = 2_000;"),
  "one bounded attempt at the processor attach; the old three-attempts-at-5s ladder could hold the serialised microphone queue for 15s",
);
assert.ok(
  !/for \(let attempt = 0; attempt < 3; attempt\+\+\)/.test(controller),
  "the retry loop must stay gone — every microphone operation is serialised behind it",
);

// --- muting is a mute, not a teardown --------------------------------------
// The disable branch used to stop the processor, stop the track AND destroy the
// processor, with stopMicTrackOnMute doing the same underneath it — so
// push-to-talk rebuilt the whole capture chain on every key release.
const disableBranch = controller.slice(
  controller.indexOf("apply-disable-start"),
  controller.indexOf("apply-disable-finished"),
);
assert.ok(
  disableBranch.length > 0,
  "the disable branch must still be findable by its debug markers",
);
assert.ok(
  !disableBranch.includes("track.stop()"),
  "muting must not stop the capture track: unmuting would re-run getUserMedia, both worklets and the WASM compile",
);
assert.ok(
  !disableBranch.includes("stopProcessor()"),
  "muting must not tear the processor off the track",
);
assert.ok(
  !disableBranch.includes("destroyActiveProcessor()"),
  "muting must not destroy the processor — releaseForRoomChange and dispose own that",
);

// --- the processor is in the chain before anything is sent ----------------
// setMicrophoneEnabled publishes as it captures, and the processor used to be
// attached after that: the raw microphone went out first (with the browser's
// suppressor off whenever RNNoise was meant to run) and the sender's track was
// swapped under it. A first publish now creates, attaches, then publishes.
// controller.ts is CRLF or LF depending on the checkout.
const controllerLf = controller.replace(/\r\n/g, "\n");
const enable = controllerLf.slice(
  controllerLf.indexOf("private async enableMicrophone("),
  controllerLf.indexOf("private async followSelectedInputDevice("),
);
assert.ok(enable.length > 0, "enableMicrophone must still be findable");
const created = enable.indexOf("participant.createTracks(");
const attached = enable.indexOf(
  "this.attachProcessorToMicrophoneTrack(",
  created,
);
const published = enable.indexOf("participant.publishTrack(track, publishOptions)");
assert.ok(
  created !== -1 && attached > created && published > attached,
  "a first publish must capture, attach the processor, and only then publish",
);
assert.ok(
  !/processor: desiredProcessor|processor: processor/.test(controllerLf),
  "AudioCaptureOptions.processor must not be used: LiveKit initialises it before the track has an AudioContext, and setProcessor throws without one",
);

// An unmute is an unmute. Attaching the processor again put the raw track back
// on the sender and rebuilt the chain on every push-to-talk press.
assert.ok(
  /publishedTrack\.getProcessor\(\) === processor \|\|/.test(enable),
  "unmuting must keep the processor LiveKit already holds",
);
// A device picked or lost while muted is applied on the way back.
assert.ok(
  /await this\.followSelectedInputDevice\(publishedTrack, options\.deviceId\);\s*const publication = await participant\.setMicrophoneEnabled\(/.test(
    enable,
  ),
  "the device is followed before the unmute that re-acquires it",
);

// LiveKit hands a bare deviceId to getUserMedia as an ideal, and Chromium
// answers an ideal deviceId with the default device: the track is re-acquired
// on the device it was already on. Every switch has to be exact.
assert.ok(
  /track\.setDeviceId\(\{ exact: target \}\)/.test(controllerLf) &&
    !/\.setDeviceId\((?!\{ exact)/.test(controllerLf),
  "devices are switched with an exact constraint, never a bare id",
);
// A preference change rebuilt the chain and then lost track of it: the
// processor it had just been handed was destroyed as "the active one" and
// attached anyway, so the volume slider stopped reaching it.
const refresh = controllerLf.slice(
  controllerLf.indexOf("public refreshMicrophoneProcessing("),
  controllerLf.indexOf("public dispose("),
);
const detachOld = refresh.indexOf(
  "await track.stopProcessor();\n      await this.processorManager.destroyActiveProcessor();",
);
assert.ok(
  detachOld !== -1 && detachOld < refresh.indexOf("this.resolveDesiredProcessor("),
  "the refresh must take off and destroy the old processor before resolving the new one",
);
assert.ok(
  /await this\.followSelectedInputDevice\(track, preferredInputDeviceId\);/.test(
    refresh,
  ),
  "a live switch follows the same rule as a switch at unmute",
);

// LiveKit restarts the processor itself whenever it re-acquires the track (an
// unplugged device, a device change at unmute) and passes no AudioContext. The
// chain has to come back processed, not as a passthrough.
const processorSource = fs.readFileSync(
  path.join(projectRoot, "src/renderer/src/features/rnnoise/processor.ts"),
  "utf8",
);
assert.ok(
  processorSource.includes("const context = opts.audioContext ?? chainContext;"),
  "a restart without a context must rebuild on the context the chain was built on",
);

// --- the session warms the chain before there is a room --------------------
assert.ok(
  /public warmUp\(/.test(controller),
  "the controller exposes a room-independent warm-up",
);
assert.ok(
  controller.includes("public releaseForRoomChange("),
  "per-room teardown must not close the AudioContext: the worklet registration cache is keyed on it, so every room switch would reload two worklets and recompile the WASM",
);
assert.ok(
  source.includes("this.microphoneController.releaseForRoomChange()"),
  "disconnect() uses the per-room teardown, not dispose()",
);

const sessionHookPath = path.join(
  projectRoot,
  "src/renderer/src/features/livekit/hooks/use-livekit-session.ts",
);
assert.ok(
  fs.readFileSync(sessionHookPath, "utf8").includes("warmUpMicrophoneChain()"),
  "the session warms the microphone chain when it is created, so the first join does not pay for it on the path where nobody can hear you yet",
);

// --- the room is heard as soon as the transport is up -----------------------
// The subscribe round trip runs alongside ICE/DTLS only if it starts at the
// join response. Started after connect() it added ~150ms (production) to the
// first remote audio; and a track it got before "connected" has no
// TrackSubscribed from livekit-client, so it must be adopted or it stays silent.
{
  const connectAt = source.indexOf("await room.connect(url, token");
  const early = source.indexOf("room.once(RoomEvent.SignalConnected");
  const adopt = source.indexOf("this.roomEventManager?.adoptSubscribedTracks();");
  const timer = source.indexOf("this.timeFirstRemoteAudio(room, lobbyId");
  assert.ok(connectAt > 0, "room.connect call not found");
  assert.ok(
    early > 0 && early < connectAt,
    "the first subscribe pass must be armed on SignalConnected, before room.connect()",
  );
  assert.ok(
    adopt > connectAt && adopt < timer,
    "tracks subscribed while connecting must be adopted right after room.connect(), before the first-audio timer looks for them",
  );
  const handler = fs.readFileSync(
    path.join(projectRoot, "src/renderer/src/features/livekit/services/stream/remote-media-handler.ts"),
    "utf8",
  );
  const attach = handler.slice(handler.indexOf("private attachAudioTrack("));
  const sameTrack = attach.indexOf(
    "existing.sourceNode.mediaStream.getAudioTracks()[0] === track.mediaStreamTrack",
  );
  assert.ok(
    sameTrack > 0 && sameTrack < attach.indexOf("this.detachAudioTrack(participant.identity, kind);"),
    "attaching the same track twice (adopted and announced) must be a no-op, not a rebuild of its chain",
  );
}

console.log(
  "audio-publish self-check passed (mute keeps capture, one gain stage, bounded queues, no self-capture, early subscribe + adopt)",
);
