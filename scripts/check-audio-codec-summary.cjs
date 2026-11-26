#!/usr/bin/env node
// Acceptance check for recording what the microphone actually negotiated
// (plan F2.6).
//
// The app asks for Opus 64 kbps mono with DTX and RED, and the whole bandwidth
// and loss analysis rests on that being true on the wire: in-band FEC on, DTX
// on, RED wrapping Opus, one channel. Nothing records it, so a change in
// livekit-client, Chromium or the SFU's codec list would go unnoticed.
// What must hold:
//
//   SUMMARY  a pure function turns the sender's codec list
//            (RTCRtpSender.getParameters().codecs) into
//            { codec, red, fec, dtx, stereo, maxAverageBitrate }.
//   LOGGED   after the microphone is published, the summary is written to the
//            diagnostics once per publish as stream-manager / mic-codec.
//
//   node scripts/check-audio-codec-summary.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");
const streamDir = path.join(projectRoot, "src/renderer/src/features/livekit/services/stream");
const entry = path.join(streamDir, "audio-codec-summary.ts");

const main = async () => {
  assert.ok(fs.existsSync(entry), "stream/audio-codec-summary.ts is missing");
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-audio-codec-"));
  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: { entry, formats: ["es"], fileName: () => "audio-codec-summary.mjs" },
    },
  });
  const built = fs.readdirSync(outDir).find((f) => f.endsWith(".mjs"));
  const { summarizeAudioCodecs } = await import(pathToFileURL(path.join(outDir, built)).href);
  assert.equal(typeof summarizeAudioCodecs, "function", "summarizeAudioCodecs is not exported");

  // What Chromium reports for RED over Opus with FEC and DTX (payload 63 wraps 111).
  assert.deepEqual(
    summarizeAudioCodecs([
      { payloadType: 63, mimeType: "audio/red", clockRate: 48000, channels: 2, sdpFmtpLine: "111/111" },
      { payloadType: 111, mimeType: "audio/opus", clockRate: 48000, channels: 2, sdpFmtpLine: "minptime=10;useinbandfec=1;usedtx=1" },
    ]),
    { codec: "opus", red: true, fec: true, dtx: true, stereo: false, maxAverageBitrate: null },
    "RED + Opus with FEC and DTX; 'channels: 2' is SDP's fixed Opus value, not stereo",
  );
  assert.deepEqual(
    summarizeAudioCodecs([{ payloadType: 111, mimeType: "audio/opus", clockRate: 48000, channels: 2, sdpFmtpLine: "minptime=10;useinbandfec=1" }]),
    { codec: "opus", red: false, fec: true, dtx: false, stereo: false, maxAverageBitrate: null },
  );
  assert.deepEqual(
    summarizeAudioCodecs([{ payloadType: 111, mimeType: "audio/opus", clockRate: 48000, channels: 2, sdpFmtpLine: "stereo=1;sprop-stereo=1;maxaveragebitrate=96000;useinbandfec=0" }]),
    { codec: "opus", red: false, fec: false, dtx: false, stereo: true, maxAverageBitrate: 96000 },
  );
  // Case and spacing as SDP allows.
  assert.deepEqual(
    summarizeAudioCodecs([{ payloadType: 111, mimeType: "audio/OPUS", clockRate: 48000, sdpFmtpLine: "useinbandfec=1; usedtx=1" }]),
    { codec: "opus", red: false, fec: true, dtx: true, stereo: false, maxAverageBitrate: null },
  );
  assert.equal(summarizeAudioCodecs([]), null, "no codecs: null");
  assert.equal(summarizeAudioCodecs(undefined), null, "no parameters yet: null");
  assert.deepEqual(
    summarizeAudioCodecs([{ payloadType: 0, mimeType: "audio/PCMU", clockRate: 8000 }]),
    { codec: "pcmu", red: false, fec: false, dtx: false, stereo: false, maxAverageBitrate: null },
    "another codec is named, not hidden",
  );

  const manager = fs.readFileSync(path.join(streamDir, "stream-manager.ts"), "utf8");
  assert.match(manager, /summarizeAudioCodecs\(/, "LOGGED: stream-manager must summarise the microphone sender's codecs");
  assert.match(manager, /logLiveKitDebug\(\s*"stream-manager",\s*"mic-codec"/, "LOGGED: the summary must be logged as stream-manager / mic-codec");
  assert.match(manager, /getParameters\(\)/, "LOGGED: the codecs must come from the sender's getParameters()");

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("audio-codec-summary check passed (RED/Opus/FEC/DTX/stereo/maxaveragebitrate read from the sender; logged once per microphone publish)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
