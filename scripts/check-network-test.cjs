#!/usr/bin/env node
// Self-check for the network test in
// src/renderer/src/features/livekit/services/network-test.ts.
//
// Two of livekit-client's ConnectionCheck checks are not used, and this keeps
// them out. Both leak something into the app for as long as it runs:
//
//   checkConnectionProtocol  publishes a 2 Mbps canvas for twenty seconds and
//                            never stops the requestAnimationFrame loop that
//                            paints it; every run left two loops painting in
//                            the background until the app restarted.
//   checkPublishAudio        calls the microphone broken when one 43 ms, 8-bit
//                            snapshot reads as silence (a quiet room under the
//                            browser's noise suppression does), and on that
//                            path never stops the capture it opened.
//
// The replacements publish a tone, and the tone has to be stopped whatever
// happens. The run also has to look like a call -- one PeerConnection, the
// call's ICE servers -- or it tests a connection the app never makes.
//
// Structural on purpose: the failures are leaks in a live renderer, which no
// bundle can be asked about.
//
//   node scripts/check-network-test.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs
  .readFileSync(
    path.join(__dirname, "..", "src/renderer/src/features/livekit/services/network-test.ts"),
    "utf8",
  )
  .replace(/\r\n/g, "\n");

assert.ok(
  !/\.checkConnectionProtocol\(/.test(source),
  "checkConnectionProtocol leaves its canvas animation loop running forever",
);
assert.ok(
  !/\.checkPublishAudio\(/.test(source),
  "checkPublishAudio fails quiet rooms and leaves the microphone open when it does",
);

const toneStarts = source.match(/const tone = startTone\(\);/g) ?? [];
const toneStops = source.match(/\} finally \{\n\s*tone\.stop\(\);/g) ?? [];
assert.ok(toneStarts.length >= 1, "the custom checks publish a tone");
assert.equal(
  toneStops.length,
  toneStarts.length,
  "every tone a check starts is stopped in a finally block, whatever the check ends in",
);
assert.ok(
  /oscillator\.stop\(\);\s*void context\.close\(\);/.test(source),
  "stopping a tone stops the oscillator and closes its AudioContext",
);

assert.ok(
  /new Set<NetworkTestStepId>\(\["websocket", "webrtc"\]\)/.test(source),
  "a failed signal socket or media connection ends the run: every later check would fail for the same reason",
);
assert.ok(
  /roomOptions: \{ singlePeerConnection: true \}/.test(source) &&
    /rtcConfig: \{ iceServers: target\.iceServers \}/.test(source),
  "the test connects the way a call does: one PeerConnection, the call's ICE servers",
);

console.log(
  "network-test self-check passed (no leaking library checks, tones stopped, run stops on a dead connection, connects like a call)",
);
