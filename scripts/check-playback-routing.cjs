#!/usr/bin/env node
// Self-check for where remote audio goes on its way out:
//
//   DEVICE   pickPlaybackDevice in
//            src/renderer/src/features/livekit/services/audio-devices.ts.
//            With no output picked, Windows' "communications" endpoint is
//            preferred. The exception is a Bluetooth headset's Hands-Free
//            endpoint while the microphone is somewhere else. Playing there
//            puts the headset into call mode for nothing, so everything it
//            plays turns to narrowband mono. With the headset's own microphone
//            open that mode is unavoidable and the call endpoint is kept.
//
//   LIMITER  needsMasterLimiter in .../stream/constants.ts. The master
//            limiter's 6 ms look-ahead is paid on every word, so it is on the
//            path only when something can push the mix past full scale: a
//            volume above 100%, or an unlevelled stereo input (screen share,
//            music bot). Getting this wrong one way clips; the other way
//            delays every voice for nothing.
//
//   CLOCKS   remote-media-handler.ts keeps the pump elements, which feed the
//            WebAudio bus, on the bus's own output device. Structural: the
//            failure is two hardware clocks drifting apart, which no bundle
//            can be asked about.
//
// Both modules are pure apart from the Track enum, so they bundle with no DOM.
// Output goes under node_modules/.cache for the same reason
// check-screen-subscription.cjs does: bare specifiers cannot resolve from a
// system temp directory.
//
//   node scripts/check-playback-routing.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");
const servicesDir = path.join(
  projectRoot,
  "src/renderer/src/features/livekit/services",
);

// Bundled under the entry's own name: an SSR library build names its output
// after the entry and ignores lib.fileName.
const bundleModule = async (build, cacheRoot, entry, name) => {
  const outDir = fs.mkdtempSync(path.join(cacheRoot, `ct-${name}-`));
  const fileName = `${path.basename(entry, ".ts")}.mjs`;
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
        entry,
        formats: ["es"],
        fileName: () => fileName,
      },
      rollupOptions: { external: ["electron"] },
    },
  });
  const module = await import(
    pathToFileURL(path.join(outDir, fileName)).href
  );
  return { module, outDir };
};

const main = async () => {
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });

  const devices = await bundleModule(
    build,
    cacheRoot,
    path.join(servicesDir, "audio-devices.ts"),
    "audio-devices",
  );
  const constants = await bundleModule(
    build,
    cacheRoot,
    path.join(servicesDir, "stream/constants.ts"),
    "stream-constants",
  );
  const { pickPlaybackDevice } = devices.module;
  const { needsMasterLimiter } = constants.module;

  // --- DEVICE ---------------------------------------------------------------
  // A Windows machine with a Bluetooth headset connected, labelled the way
  // Chromium lists them: the virtual entries carry the name of the device
  // they stand for.
  const out = (deviceId, label) => ({ kind: "audiooutput", deviceId, label });
  const inp = (deviceId, label) => ({ kind: "audioinput", deviceId, label });
  const STEREO = "Headphones (WH-1000XM4 Stereo)";
  const CALL_OUT = "Headset (WH-1000XM4 Hands-Free AG Audio)";
  const CALL_IN = "Headset (WH-1000XM4 Hands-Free AG Audio)";
  const DESK_MIC = "Microphone (Blue Yeti)";
  const headsetMachine = (micOnHeadset) => [
    out("default", `Default - ${STEREO}`),
    out("communications", `Communications - ${CALL_OUT}`),
    out("stereo-id", STEREO),
    out("call-id", CALL_OUT),
    inp("default", `Default - ${micOnHeadset ? CALL_IN : DESK_MIC}`),
    inp("communications", `Communications - ${micOnHeadset ? CALL_IN : DESK_MIC}`),
    inp("call-in-id", CALL_IN),
    inp("yeti-id", DESK_MIC),
  ];

  // The reported case: headphones for listening, a separate microphone.
  // Playing to the call endpoint switched the headset into call mode.
  assert.deepEqual(
    pickPlaybackDevice(headsetMachine(false), null, "yeti-id"),
    { deviceId: "", label: `Default - ${STEREO}`, handsFree: false },
    "a desk microphone with Bluetooth headphones must play on the stereo endpoint, not the Hands-Free one",
  );
  assert.equal(
    pickPlaybackDevice(headsetMachine(false), null, null).deviceId,
    "",
    "with no microphone picked, the one in use is the communications input; a desk microphone there still means stereo playback",
  );

  // The headset's own microphone is open: call mode is unavoidable, and the
  // stereo endpoint can go silent while it is.
  const callMode = pickPlaybackDevice(headsetMachine(true), null, null);
  assert.equal(
    callMode.deviceId,
    "communications",
    "with the headset microphone in use, playback stays on the call endpoint",
  );
  assert.equal(callMode.handsFree, true, "and the user is told the audio is narrowband");
  assert.equal(
    pickPlaybackDevice(headsetMachine(true), null, "call-in-id").deviceId,
    "communications",
    "the headset microphone picked by id is still the headset microphone",
  );

  // A picked microphone that is gone is not the one in use: the capture path
  // falls back to the communications input (mic/device-resolver.ts).
  assert.equal(
    pickPlaybackDevice(headsetMachine(true), null, "unplugged-id").deviceId,
    "communications",
    "a missing picked microphone falls back the way the capture path does",
  );

  // A picked output is the user's decision, Hands-Free or not.
  assert.deepEqual(
    pickPlaybackDevice(headsetMachine(false), "call-id", "yeti-id"),
    { deviceId: "call-id", label: CALL_OUT, handsFree: true },
    "a picked output is used as it is, and a Hands-Free one is still reported",
  );

  // Without a headset nothing changes from before: calls go to the device set
  // aside for calls.
  const wired = [
    out("default", "Default - Speakers (Realtek(R) Audio)"),
    out("communications", "Communications - Headset Earphone (HyperX Cloud)"),
    inp("default", "Default - Microphone (Realtek(R) Audio)"),
    inp("communications", "Communications - Headset Microphone (HyperX Cloud)"),
  ];
  assert.deepEqual(
    pickPlaybackDevice(wired, null, null),
    {
      deviceId: "communications",
      label: "Communications - Headset Earphone (HyperX Cloud)",
      handsFree: false,
    },
    "a wired headset set aside for calls keeps getting the call audio",
  );

  // Before microphone permission the labels are blank; nothing can be told
  // apart, so the old choice stands.
  const blank = wired.map((device) => ({ ...device, label: "" }));
  assert.equal(pickPlaybackDevice(blank, null, null).deviceId, "communications");

  // No communications endpoint (not Windows, or none configured).
  assert.equal(
    pickPlaybackDevice([out("default", "Default - Speakers")], null, null).deviceId,
    "",
  );

  // The default endpoint is itself a call endpoint: nothing better exists,
  // but the user is still told.
  const callDefault = pickPlaybackDevice(
    [
      out("default", `Default - ${CALL_OUT}`),
      out("communications", `Communications - ${CALL_OUT}`),
      inp("default", `Default - ${DESK_MIC}`),
    ],
    null,
    null,
  );
  assert.deepEqual(
    [callDefault.deviceId, callDefault.handsFree],
    ["", true],
    "a Hands-Free default is still reported",
  );

  // Windows has spelled it "Hands-Free", "Hands Free" and "HandsFree".
  for (const spelling of ["Hands-Free", "Hands Free", "HandsFree", "hands-free"]) {
    assert.equal(
      pickPlaybackDevice(
        [out("default", `Default - X ${spelling}`)],
        "default",
        null,
      ).handsFree,
      true,
      `"${spelling}" is a Hands-Free endpoint`,
    );
  }

  // --- LIMITER --------------------------------------------------------------
  const voice = (gain) => ({ voice: true, gain });
  const stereo = (gain) => ({ voice: false, gain });

  assert.equal(
    needsMasterLimiter(1, [voice(1), voice(1), voice(0.4)]),
    false,
    "voices at or below 100% arrive held below full scale by their senders: no look-ahead for them",
  );
  assert.equal(needsMasterLimiter(1, []), false);
  assert.equal(needsMasterLimiter(1.01, []), true, "a master above 100% can clip");
  assert.equal(
    needsMasterLimiter(1, [voice(1), voice(1.5)]),
    true,
    "one person turned above 100% can clip",
  );
  assert.equal(
    needsMasterLimiter(0.5, [voice(1), stereo(1)]),
    true,
    "a screen share or the music bot can be mastered to 0 dBFS, and talking over it clips",
  );
  assert.equal(
    needsMasterLimiter(1, [voice(1), stereo(0)]),
    true,
    "a muted stereo input still has the limiter waiting: unmuting must not have to re-route mid-peak",
  );

  // --- CLOCKS and the routing that uses the two rules ------------------------
  // CRLF or LF, whichever the checkout has.
  const read = (file) =>
    fs.readFileSync(path.join(servicesDir, file), "utf8").replace(/\r\n/g, "\n");
  const handler = read("stream/remote-media-handler.ts");
  const applyOutput = handler.slice(
    handler.indexOf("private async applyOutputDevice("),
    handler.indexOf("public async setAudioOutputDevice("),
  );
  assert.ok(
    applyOutput.includes("input.pumpElement") && applyOutput.includes("this.audioContext"),
    "an output change moves the pump elements together with the bus",
  );
  const attach = handler.slice(
    handler.indexOf("private attachAudioTrack("),
    handler.indexOf("private detachAudioTrack("),
  );
  assert.ok(
    /this\.setSinkLogged\(pumpElement, this\.currentOutputDeviceId\)/.test(attach),
    "a pump element created after the output was chosen starts on that device too",
  );
  assert.ok(
    /needsMasterLimiter\(/.test(handler) && /this\.updateLimiterRoute\(\);/.test(attach),
    "the limiter route is re-decided whenever an input comes or goes",
  );
  assert.ok(
    !handler.includes("masterGain.connect(limiter);"),
    "the master gain must not be wired to the limiter unconditionally",
  );

  const stream = read("stream/stream-manager.ts");
  assert.ok(
    stream.includes('addEventListener(\n      "devicechange",') &&
      stream.split('removeEventListener(\n      "devicechange",').length - 1 === 2,
    "the device watch is added with each room and removed on both teardown paths",
  );
  assert.ok(
    !/selectedAudioOutputDeviceId\) \{\s*void this\.remoteMediaHandler\.setAudioOutputDevice/.test(stream),
    "a new room resolves its output whether or not a device was picked",
  );

  fs.rmSync(devices.outDir, { recursive: true, force: true });
  fs.rmSync(constants.outDir, { recursive: true, force: true });

  console.log(
    "playback-routing self-check passed (Hands-Free only when the microphone needs it, limiter only when the mix can clip, pumps on the bus device)",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
