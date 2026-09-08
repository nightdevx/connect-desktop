#!/usr/bin/env node
// Channel layout, end to end, for a human voice.
//
// A voice is mono from the microphone to the speaker and there is nothing in
// the product that wants it otherwise, but WebAudio has two places where a
// stereo layout appears by default and neither of them announces itself:
//
//   PUBLISH    MediaStreamAudioDestinationNode defaults to channelCount 2, so
//              a mono processing chain still published a two-channel track.
//
//   PLAYBACK   Blink builds a MediaStreamAudioSourceNode against the track's
//              format, and a track that has been subscribed but has not yet
//              carried a packet has no format to build against — it defaults to
//              stereo. That is the ordinary case for somebody joining a room
//              that is already running: everyone in it subscribes before the
//              newcomer's first RTP packet arrives. A mono voice in a stereo
//              node fills channel 0 and leaves channel 1 silent, which is heard
//              as the newcomer speaking into one ear, by everyone who was
//              already there, until a re-subscribe rebuilds the node.
//
// Both fail silently: no throw, no log, the call works and one person is in one
// ear. The fix is structural — an explicit mono publish and a splitter/merger
// fold that copies channel 0 to both sides — so the check is structural too.
//
//   node scripts/check-audio-channels.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const handler = read(
  "src/renderer/src/features/livekit/services/stream/remote-media-handler.ts",
);
const processor = read("src/renderer/src/features/rnnoise/processor.ts");

// --- publish: one channel leaves this machine ------------------------------

assert.ok(
  /destinationNode\.channelCount = 1;/.test(processor),
  "the microphone processor must publish an explicitly mono track: " +
    "MediaStreamAudioDestinationNode defaults to 2 channels, and a stereo voice " +
    "track is a layout the receiver has to guess at",
);
assert.ok(
  /maxChannels: 1/.test(processor),
  "the RNNoise/gate worklets are mono; if that changes the mono publish above is wrong too",
);

// --- playback: channel 0 reaches both ears ---------------------------------

assert.ok(
  /createChannelSplitter\(2\)/.test(handler) &&
    /createChannelMerger\(2\)/.test(handler),
  "the remote voice path must fold channel 0 onto both outputs; without it a " +
    "source node that came up stereo plays a mono voice in the left ear only",
);

const foldEdges = [
  ...handler.matchAll(/splitterNode\.connect\(mergerNode,\s*(\d+),\s*(\d+)\)/g),
].map((match) => [Number(match[1]), Number(match[2])]);

assert.deepEqual(
  foldEdges,
  [
    [0, 0],
    [0, 1],
  ],
  "the fold must read splitter output 0 twice, once into each merger input: " +
    "reading output 1 for the right side reproduces the exact bug, and a " +
    "downmix in its place would cost 6 dB whenever the source really is mono",
);

// The fold is level-preserving precisely because it copies rather than sums.
// A "speakers" downmix of [signal, silence] would deliver half the amplitude,
// and of [signal, signal] the whole of it — the same voice at two loudnesses
// depending on a layout nobody controls.
const COPY_GAIN = 1;
const DOWNMIX_GAIN = 0.5;
assert.ok(
  20 * Math.log10(COPY_GAIN / DOWNMIX_GAIN) > 5.9,
  "a downmix instead of a copy is a 6 dB swing on a layout that varies per join",
);

// --- the fold is on the path, not merely constructed -----------------------

assert.ok(
  /head\.connect\(compressorNode\)/.test(handler) &&
    /head\.connect\(gainNode\)/.test(handler),
  "both branches of the voice chain must start from the fold's output",
);
assert.ok(
  !/sourceNode\.connect\(compressorNode\)/.test(handler) &&
    !/sourceNode\.connect\(gainNode\)/.test(handler),
  "the source must not reach the bus directly: that edge bypasses the fold",
);
assert.ok(
  /head\.connect\(analyserNode\)/.test(handler),
  "the speaking meter reads the folded signal too, or a one-eared voice is " +
    "measured at half its level and the ring lights late",
);

// --- stereo inputs are left alone ------------------------------------------

assert.ok(
  /const isVoiceInput = \(identity: string, kind: InputKind\): boolean => \{\s*return kind === "mic" && !isMusicBotIdentity\(identity\);/.test(
    handler,
  ),
  "the fold and the compressor share one predicate, and it must exclude screen " +
    "audio and the music bot: both are genuinely stereo and folding them to " +
    "mono would be an audible regression",
);
assert.ok(
  /if \(isVoice\) \{[\s\S]*?createChannelSplitter/.test(handler),
  "the fold must be guarded by that predicate, not applied to every input",
);

// --- the extra nodes are torn down -----------------------------------------

assert.ok(
  /for \(const node of input\.monoFoldNodes\) \{\s*node\.disconnect\(\);/.test(
    handler,
  ),
  "detach must disconnect the fold nodes; a leaked splitter keeps the source " +
    "node alive and the bus grows one dead branch per join",
);

console.log(
  "audio-channels self-check passed (mono publish, channel 0 copied to both ears at unity, stereo inputs untouched)",
);
