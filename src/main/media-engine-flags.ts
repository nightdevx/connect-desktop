import { app } from "electron";

const GPU_REPORT_DEADLINE_MS = 8000;

// GPU / WebRTC command-line switches. MUST be applied before app.whenReady().
//
// These were previously applied unconditionally on every platform, including
// the switches that turn WebRTC hardware encode/decode off. That forced
// software VP9/VP8 encode: on Windows a 1440p60 screen share pinned the CPU,
// dropped frames and starved whatever game was being captured. The dmabuf and
// gpu-memory-buffer switches are Linux/Wayland workarounds, so they now only
// apply there.

// Chromium replaced the --disable-webrtc-hw-encoding/-decoding switches with
// features of the same name (content_features.cc). Electron 39's binary no
// longer contains the switches, so appending them did nothing: with hardware
// acceleration switched off, WebRTC still encoded on the GPU. Disabling the
// features is what works now (checked: H.264 drops to OpenH264).
const WEBRTC_HW_ENCODING = "webrtc-hw-encoding";
const WEBRTC_HW_DECODING = "webrtc-hw-decoding";

export interface MediaEngineFlags {
  /** Plain switches, each with an optional value. */
  switches: Array<[string] | [string, string]>;
  enableFeatures: string[];
  disableFeatures: string[];
}

/**
 * The switches and features for one platform and setting, without applying
 * them. Pure, so scripts/check-media-engine-flags.cjs can assert on it.
 */
export const resolveMediaEngineFlags = (
  platform: NodeJS.Platform,
  hardwareAcceleration: boolean,
): MediaEngineFlags => {
  const flags: MediaEngineFlags = {
    switches: [],
    enableFeatures: [],
    disableFeatures: [],
  };

  // The historical all-software path. Kept as the escape hatch for machines
  // with broken GPU drivers, where hardware encode produces a black or torn
  // stream.
  const softwareEncode = (): void => {
    flags.disableFeatures.push(WEBRTC_HW_ENCODING);
    flags.switches.push(
      ["disable-gpu-memory-buffer-video-frames"],
      ["disable-gpu-memory-buffer-compositor-resources"],
    );
  };

  if (platform === "linux") {
    // Wayland/PipeWire capture path; dmabuf import is unreliable under
    // Electron, so the software path stays forced here regardless of the
    // setting. disable-gpu-memory-buffers exists only in Linux builds.
    flags.enableFeatures.push("WebRTCPipeWireCapturer");
    flags.disableFeatures.push("WebRtcUseDmabuf", WEBRTC_HW_DECODING);
    flags.switches.push(["ozone-platform-hint", "auto"], ["disable-gpu-memory-buffers"]);
    softwareEncode();
  }

  if (platform === "win32") {
    // Screens are captured through DXGI by default before Windows 11 24H2;
    // this turns Windows Graphics Capture on for them everywhere. Windows are
    // always captured with WGC, and zero-Hz (no repeated frames while the
    // source is static) is on for them unconditionally. The window and zero-Hz
    // flags this list used to carry (AllowWgcWindowCapturer, AllowWgcZeroHz)
    // do not exist in Chromium 142. Screen zero-Hz, AllowWgcScreenZeroHz, stays
    // off until it is measured (docs/screen-share-quality-plan.md, K1).
    flags.enableFeatures.push("AllowWgcScreenCapturer");

    if (!hardwareAcceleration) {
      softwareEncode();
    }
  }

  return flags;
};

export const applyMediaEngineSwitches = (
  hardwareAcceleration: boolean,
): void => {
  if (process.platform === "linux") {
    process.env.WEBKIT_DISABLE_DMABUF_RENDERER = "1";
  }

  const flags = resolveMediaEngineFlags(process.platform, hardwareAcceleration);

  for (const [name, value] of flags.switches) {
    app.commandLine.appendSwitch(name, value);
  }

  // One value per switch: Chromium reads a single --enable-features and a
  // single --disable-features, so everything has to travel in one list.
  if (flags.enableFeatures.length > 0) {
    app.commandLine.appendSwitch("enable-features", flags.enableFeatures.join(","));
  }

  if (flags.disableFeatures.length > 0) {
    app.commandLine.appendSwitch(
      "disable-features",
      flags.disableFeatures.join(","),
    );
  }
};

/**
 * What Chromium actually decided about the GPU, logged once after ready.
 *
 * The switches above only say what this app ASKED for. Whether a hardware video
 * encoder exists is Chromium's call, made from the driver allowlist and what
 * MediaFoundation offers, and until now nothing recorded that answer anywhere —
 * so a stats panel reporting a software encoder with hardware acceleration
 * switched on had no next question to ask.
 *
 * `video_encode` is the field that matters. "enabled" means Chromium has a
 * hardware encoder and a software encoder in the stats is a WebRTC-level
 * fallback (an unsupported profile, a simulcast layer count the encoder will not
 * take). Anything else means there was never a hardware encoder to pick.
 *
 * Read on "gpu-info-update", never straight after "ready". The GPU process has
 * not reported yet at ready and every field answers "disabled_software" — this
 * machine says that at 44ms and "enabled" at 311ms — so logging at ready
 * accused a working NVENC of not existing.
 */
export const logMediaEngineStatus = (hardwareAcceleration: boolean): void => {
  let reported = false;

  const report = (): void => {
    if (reported) {
      return;
    }
    reported = true;

    let status: Record<string, string> = {};
    try {
      status = app.getGPUFeatureStatus() as unknown as Record<string, string>;
    } catch {
      console.info("[Media] GPU feature status unavailable");
      return;
    }

    console.info(
      `[Media] hardwareAcceleration=${hardwareAcceleration} video_encode=${status.video_encode ?? "unknown"} video_decode=${status.video_decode ?? "unknown"} gpu_compositing=${status.gpu_compositing ?? "unknown"}`,
    );

    if (
      hardwareAcceleration &&
      status.video_encode &&
      status.video_encode !== "enabled"
    ) {
      console.info(
        "[Media] Hardware video encode is unavailable, so WebRTC will fall back to a software encoder (OpenH264 for H.264, libvpx for VP8/VP9) no matter what the setting says.",
      );
    }
  };

  app.once("gpu-info-update", report);
  setTimeout(report, GPU_REPORT_DEADLINE_MS).unref?.();
};
