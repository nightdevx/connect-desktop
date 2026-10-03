#!/usr/bin/env node
// Self-check for src/main/media-engine-flags.ts. Run after `pnpm build:main`
// (reads the compiled CommonJS output):
//   node scripts/check-media-engine-flags.cjs
//
// Chromium renames and drops switches and features between versions, and an
// unknown one is ignored without a word. That is how "hardware acceleration
// off" stopped turning WebRTC hardware encoding off on Electron 39: the
// --disable-webrtc-hw-encoding switch had become a feature. So besides the
// shape of the lists, every name is looked up in the installed Electron binary.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "dist", "main", "media-engine-flags.js");
let resolveMediaEngineFlags;
try {
  ({ resolveMediaEngineFlags } = require(modulePath));
} catch (error) {
  console.error(`Could not load ${modulePath}. Run "pnpm build:main" first.\n${error.message}`);
  process.exit(1);
}

const switchNames = (flags) => flags.switches.map(([name]) => name);
const allNames = (flags) => [...switchNames(flags), ...flags.enableFeatures, ...flags.disableFeatures];

// Windows, hardware acceleration on: WGC for screens, its zero-Hz mode off (a
// still screen repeats its frame instead of going silent).
const winOn = resolveMediaEngineFlags("win32", true);
assert.deepEqual(winOn.enableFeatures, ["AllowWgcScreenCapturer"]);
assert.deepEqual(winOn.disableFeatures, ["AllowWgcScreenZeroHz"]);
assert.deepEqual(winOn.switches, []);

// Windows, hardware acceleration off: encoding off through the feature,
// decoding left on the GPU (the setting exists for broken encoders).
const winOff = resolveMediaEngineFlags("win32", false);
assert.ok(winOff.disableFeatures.includes("webrtc-hw-encoding"), "HW off must disable webrtc-hw-encoding");
assert.ok(!winOff.disableFeatures.includes("webrtc-hw-decoding"), "HW off must keep hardware decode on Windows");
assert.ok(switchNames(winOff).includes("disable-gpu-memory-buffer-video-frames"));

// Linux: the software path is forced, with the Wayland workarounds.
const linux = resolveMediaEngineFlags("linux", true);
for (const name of ["webrtc-hw-encoding", "webrtc-hw-decoding", "WebRtcUseDmabuf"]) {
  assert.ok(linux.disableFeatures.includes(name), `linux must disable ${name}`);
}
assert.ok(linux.enableFeatures.includes("WebRTCPipeWireCapturer"));
assert.deepEqual(linux.switches.find(([name]) => name === "ozone-platform-hint"), ["ozone-platform-hint", "auto"]);

// Names Chromium 142 no longer has. Passing them is a silent no-op.
const dead = ["disable-webrtc-hw-encoding", "disable-webrtc-hw-decoding", "AllowWgcWindowCapturer", "AllowWgcZeroHz"];
for (const flags of [winOn, winOff, linux]) {
  for (const name of allNames(flags)) {
    assert.ok(!dead.includes(name), `${name} does not exist in this Chromium`);
  }
}

// Every name this platform would pass must exist in the installed Electron.
let binaryPath = null;
try {
  binaryPath = require("electron");
} catch {
  binaryPath = null;
}
if (typeof binaryPath === "string" && fs.existsSync(binaryPath)) {
  const binary = fs.readFileSync(binaryPath);
  const names = new Set([
    ...allNames(resolveMediaEngineFlags(process.platform, true)),
    ...allNames(resolveMediaEngineFlags(process.platform, false)),
  ]);
  for (const name of names) {
    assert.ok(binary.includes(name), `${name} is not in ${path.basename(binaryPath)}: Chromium renamed or removed it`);
  }
  console.log(`check-media-engine-flags: ok (${names.size} names found in ${path.basename(binaryPath)})`);
} else {
  console.log("check-media-engine-flags: ok (Electron binary not installed, name lookup skipped)");
}
