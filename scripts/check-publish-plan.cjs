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
  const {
    buildVideoPublishPlan,
    resolveScreenContentMode,
    preferH264High,
    installH264HighPreference,
  } = await import(pathToFileURL(bundle).href);

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
  assert.equal(screen.screenShareSimulcastLayers[0].width, 640);
  assert.equal(screen.screenShareSimulcastLayers[0].height, 360);
  assert.equal(
    screen.screenShareSimulcastLayers[0].encoding.maxFramerate,
    15,
    "the low rung is 360p at 15 fps: tiles and weak downlinks, on the hardware encoder",
  );
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

  // "auto" protects smoothness whatever the frame rate (Discord's "Smoother
  // Video"); it used to mean "detail" for every 30 fps preset, so the default
  // 1080p30 share dropped frames under load.
  assert.equal(resolveScreenContentMode("auto"), "motion");
  assert.equal(resolveScreenContentMode("detail"), "detail");
  assert.equal(resolveScreenContentMode("motion"), "motion");

  // --- H.264 High profile -------------------------------------------------
  // The SFU answers with the first H.264 profile it registers, in the order the
  // publisher offers them, and Chromium offers Baseline first.
  const h264 = (profileLevelId, packetizationMode = 1) => ({
    mimeType: "video/H264",
    clockRate: 90000,
    sdpFmtpLine: `level-asymmetry-allowed=1;packetization-mode=${packetizationMode};profile-level-id=${profileLevelId}`,
  });
  const codec = (mimeType, sdpFmtpLine) => ({
    mimeType,
    clockRate: 90000,
    ...(sdpFmtpLine ? { sdpFmtpLine } : {}),
  });
  const label = (entry) => {
    const fmtp = entry.sdpFmtpLine ?? "";
    const profile = /profile-level-id=(\w+)/.exec(fmtp)?.[1] ?? "-";
    const mode = /packetization-mode=(\d)/.exec(fmtp)?.[1] ?? "0";
    return entry.mimeType === "video/H264"
      ? `H264:${profile}/${mode}`
      : entry.mimeType.slice("video/".length);
  };
  // Chromium 142's send list with webrtc-hw-encoding off: OpenH264 alone. Main
  // is there too; libwebrtc lists it for OpenH264, which sends Constrained
  // Baseline under it.
  const softwareOnly = [
    codec("video/VP8"),
    codec("video/rtx"),
    h264("42001f"),
    h264("42001f", 0),
    h264("42e01f"),
    h264("42e01f", 0),
    h264("4d001f"),
    h264("4d001f", 0),
    codec("video/AV1", "level-idx=5;profile=0;tier=0"),
    codec("video/VP9", "profile-id=0"),
    codec("video/VP9", "profile-id=2"),
    codec("video/red"),
    codec("video/ulpfec"),
  ];
  // The same with a hardware encoder (Intel Quick Sync, on the bench): it adds
  // High, last.
  const withHardware = [
    ...softwareOnly.slice(0, 11),
    h264("640020"),
    ...softwareOnly.slice(11),
  ];
  const original = [...withHardware];
  assert.deepEqual(
    preferH264High(withHardware).map(label),
    [
      "VP8",
      "rtx",
      "H264:640020/1",
      "H264:42001f/1",
      "H264:42001f/0",
      "H264:42e01f/1",
      "H264:42e01f/0",
      "H264:4d001f/1",
      "AV1",
      "VP9",
      "VP9",
      "H264:4d001f/0",
      "red",
      "ulpfec",
    ],
    "High first among the H.264 entries; every other codec keeps its slot",
  );
  assert.deepEqual(withHardware, original, "the caller's list is not touched");
  assert.deepEqual(
    preferH264High(softwareOnly),
    softwareOnly,
    "no High, no change: Main first would take a Baseline-only hardware encoder off the hardware",
  );

  // The publish hook: sending video only, installed once, never fatal. Node has
  // no RTCPeerConnection, so the browser classes are stood in for.
  let capabilities = withHardware;
  let preferenceCalls = 0;
  class FakeTransceiver {
    constructor() {
      this.preferences = null;
    }
    setCodecPreferences(codecs) {
      preferenceCalls += 1;
      this.preferences = codecs;
    }
  }
  class FakePeerConnection {
    addTransceiver() {
      return new FakeTransceiver();
    }
  }
  globalThis.RTCPeerConnection = FakePeerConnection;
  globalThis.RTCRtpTransceiver = FakeTransceiver;
  globalThis.RTCRtpSender = {
    getCapabilities: (kind) =>
      kind === "video" ? { codecs: capabilities } : null,
  };
  installH264HighPreference();
  installH264HighPreference();
  const pc = new FakePeerConnection();
  const published = pc.addTransceiver(
    { kind: "video" },
    { direction: "sendonly", sendEncodings: [{ rid: "q" }, { rid: "f" }] },
  );
  assert.equal(preferenceCalls, 1, "installing twice hooks addTransceiver once");
  assert.deepEqual(
    published.preferences.map(label),
    preferH264High(withHardware).map(label),
  );
  assert.ok(pc.addTransceiver("video").preferences, "the default direction sends");
  assert.equal(
    pc.addTransceiver("video", { direction: "recvonly" }).preferences,
    null,
    "a receive section keeps every profile this machine decodes",
  );
  assert.equal(
    pc.addTransceiver({ kind: "audio" }, { direction: "sendonly" }).preferences,
    null,
  );
  capabilities = softwareOnly;
  assert.equal(
    pc.addTransceiver({ kind: "video" }, { direction: "sendonly" }).preferences,
    null,
    "without High the transceiver is not touched at all",
  );
  capabilities = withHardware;
  FakeTransceiver.prototype.setCodecPreferences = () => {
    throw new Error("InvalidModificationError");
  };
  assert.ok(
    pc.addTransceiver({ kind: "video" }, { direction: "sendonly" }),
    "a browser that rejects the list still publishes, in its own order",
  );
  delete globalThis.RTCPeerConnection;
  delete globalThis.RTCRtpTransceiver;
  delete globalThis.RTCRtpSender;

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("publish-plan self-check passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
