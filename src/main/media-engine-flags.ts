import { app } from "electron";

// GPU / WebRTC command-line switches. MUST be applied before app.whenReady().
//
// These were previously applied unconditionally on every platform, including
// `disable-webrtc-hw-encoding` / `disable-webrtc-hw-decoding`. That forced
// software VP9/VP8 encode: on Windows a 1440p60 screen share pinned the CPU,
// dropped frames and starved whatever game was being captured. The dmabuf and
// gpu-memory-buffer switches are Linux/Wayland workarounds, so they now only
// apply there.

// The historical all-software path. Kept as the escape hatch for machines with
// broken GPU drivers, where hardware encode produces a black or torn stream.
const applySoftwareMediaSwitches = (): void => {
  app.commandLine.appendSwitch("disable-webrtc-hw-encoding");
  app.commandLine.appendSwitch("disable-webrtc-hw-decoding");
  app.commandLine.appendSwitch("disable-gpu-memory-buffer-video-frames");
  app.commandLine.appendSwitch("disable-gpu-memory-buffer-compositor-resources");
  app.commandLine.appendSwitch("disable-gpu-memory-buffers");
};

export const applyMediaEngineSwitches = (
  hardwareAcceleration: boolean,
): void => {
  const enableFeatures: string[] = [];
  const disableFeatures: string[] = [];

  if (process.platform === "linux") {
    // Wayland/PipeWire capture path; dmabuf import is unreliable under Electron,
    // so the software buffer path stays forced here regardless of the setting.
    process.env.WEBKIT_DISABLE_DMABUF_RENDERER = "1";
    enableFeatures.push("WebRTCPipeWireCapturer");
    disableFeatures.push("WebRtcUseDmabuf");
    app.commandLine.appendSwitch("ozone-platform-hint", "auto");
    applySoftwareMediaSwitches();
  }

  if (process.platform === "win32") {
    // Windows Graphics Capture: the DXGI-backed capture path for screens and
    // windows. Much cheaper than the legacy GDI/BitBlt path at 1080p60+, and
    // the only path that captures hardware-composited (fullscreen game)
    // surfaces cleanly. ZeroHz stops re-delivering identical frames while the
    // source is static, which is what keeps an idle share near 0% CPU.
    enableFeatures.push(
      "AllowWgcScreenCapturer",
      "AllowWgcWindowCapturer",
      "AllowWgcZeroHz",
    );

    if (!hardwareAcceleration) {
      applySoftwareMediaSwitches();
    }
  }

  if (enableFeatures.length > 0) {
    app.commandLine.appendSwitch("enable-features", enableFeatures.join(","));
  }

  if (disableFeatures.length > 0) {
    app.commandLine.appendSwitch("disable-features", disableFeatures.join(","));
  }
};
