import {
  type StartScreenCaptureOptions,
  type StartScreenCaptureResult,
  type ScreenShareResolution
} from "./types";
import { type DesktopResult } from "@shared/desktop-api-types";
import { startSystemLoopbackAudioTrack } from "./loopback-audio";
import { logLiveKitDebug } from "@/services/debug-log";

// Chromium's desktop-capture constraints. They are not in lib.dom because they
// are not standard — getUserMedia is being asked for a desktopCapturer source id
// rather than a camera — so the shape is declared once here instead of being
// waved through with `as any` at each of the two call sites.
interface DesktopCaptureConstraints {
  audio: false;
  video: {
    mandatory: {
      chromeMediaSource: "desktop";
      chromeMediaSourceId: string;
      maxFrameRate?: number;
      maxWidth?: number;
      maxHeight?: number;
    };
  };
}

// getUserMedia's parameter type does not admit the above, and widening through
// unknown is the narrowest way to say so: it keeps the object literal fully
// checked against DesktopCaptureConstraints and only loosens the final handoff.
const asMediaStreamConstraints = (
  constraints: DesktopCaptureConstraints,
): MediaStreamConstraints => constraints as unknown as MediaStreamConstraints;


const desktopBridgeOutdatedError = {
  ok: false,
  error: {
    code: "DESKTOP_BRIDGE_OUTDATED",
    message:
      "Masaustu API guncel degil. Uygulamayi tamamen kapatip yeniden baslatin.",
    statusCode: 409,
  },
} satisfies DesktopResult<never>;

export const listScreenCaptureSources = () => {
  if (typeof window.desktopApi.listScreenCaptureSources !== "function") {
    return Promise.resolve(
      desktopBridgeOutdatedError as DesktopResult<{
        sources: {
          id: string;
          name: string;
          kind: "screen" | "window";
          displayId: string | null;
          previewDataUrl: string | null;
        }[];
      }>,
    );
  }

  return window.desktopApi.listScreenCaptureSources();
};

const isRetryableAudioConstraintError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedName = error.name.toLowerCase();
  const normalizedMessage = error.message.toLowerCase();

  return (
    normalizedName.includes("notsupported") ||
    normalizedName.includes("overconstrained") ||
    normalizedName.includes("constraint") ||
    normalizedName.includes("typeerror") ||
    normalizedMessage.includes("not supported") ||
    normalizedMessage.includes("constraint") ||
    normalizedMessage.includes("audio")
  );
};

const getResolutionDimensions = (
  resolution?: ScreenShareResolution,
): { width: number; height: number } | null => {
  if (resolution === "720p") {
    return { width: 1280, height: 720 };
  }

  if (resolution === "1080p") {
    return { width: 1920, height: 1080 };
  }

  if (resolution === "1440p") {
    return { width: 2560, height: 1440 };
  }

  if (resolution === "2160p") {
    return { width: 3840, height: 2160 };
  }

  return null;
};

const isDisplayMediaNotSupportedError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedName = error.name.toLowerCase();
  const normalizedMessage = error.message.toLowerCase();

  return (
    normalizedName.includes("notsupported") ||
    normalizedName.includes("typeerror") ||
    normalizedMessage.includes("getdisplaymedia") ||
    normalizedMessage.includes("not supported")
  );
};

const startBrowserDisplayCapture = async (
  options: StartScreenCaptureOptions,
): Promise<StartScreenCaptureResult> => {
  const dimensions = getResolutionDimensions(options.resolution);
  
  logLiveKitDebug("screen-capture", "startBrowserDisplayCapture started", { 
    captureSystemAudio: options.captureSystemAudio,
    resolution: options.resolution 
  });

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: options.captureSystemAudio ? {
        autoGainControl: false,
        echoCancellation: true,
        noiseSuppression: false,
      } : false,
      video: {
        width: dimensions
          ? {
              ideal: dimensions.width,
            }
          : undefined,
        height: dimensions
          ? {
              ideal: dimensions.height,
            }
          : undefined,
        frameRate: {
          ideal: options.frameRate,
          max: options.frameRate,
        },
      },
    });

    logLiveKitDebug("screen-capture", "getDisplayMedia success", {
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    });

    return {
      stream,
    };
  } catch (error) {
    logLiveKitDebug("screen-capture", "getDisplayMedia failed", { error });
    
    if (options.captureSystemAudio && isRetryableAudioConstraintError(error)) {
      logLiveKitDebug("screen-capture", "Retrying getDisplayMedia without audio...");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {
          width: dimensions
            ? {
                ideal: dimensions.width,
              }
            : undefined,
          height: dimensions
            ? {
                ideal: dimensions.height,
              }
            : undefined,
          frameRate: {
            ideal: options.frameRate,
            max: options.frameRate,
          },
        },
      });

      return {
        stream,
        warning:
          "Sistem sesi bu cihazda desteklenmedi. Yayın görüntü olarak başlatıldı.",
      };
    }

    throw error;
  }
};

const startElectronDesktopCapture = async (
  options: StartScreenCaptureOptions,
): Promise<StartScreenCaptureResult> => {
  logLiveKitDebug("screen-capture", "startElectronDesktopCapture started", {
    sourceId: options.sourceId,
    captureSystemAudio: options.captureSystemAudio
  });

  const sourcesResult = await listScreenCaptureSources();
  if (!sourcesResult.ok || !sourcesResult.data) {
    throw new Error(
      sourcesResult.error?.message ??
        "Yakalanabilir ekran kaynakları alınamadı",
    );
  }

  const requestedSource = options.sourceId
    ? sourcesResult.data.sources.find(
        (source) => source.id === options.sourceId,
      )
    : undefined;

  // An explicitly requested source that is gone is an error, never a reason to
  // pick another one. Source lists go stale by design — "Ekran Değiştir" shows
  // what existed when the menu opened — and the old fallback answered a closed
  // window by capturing the entire primary monitor, so a user sharing one
  // window silently started broadcasting their whole desktop to the lobby and
  // was told the swap succeeded.
  if (options.sourceId && !requestedSource) {
    throw new Error(
      "Seçilen kaynak artık kullanılamıyor. Kaynak listesini yenileyip tekrar dene.",
    );
  }

  const preferredSource =
    requestedSource ??
    sourcesResult.data.sources.find((source) => source.kind === "screen") ??
    sourcesResult.data.sources[0];

  if (!preferredSource) {
    throw new Error("Ekran kaynağı bulunamadı");
  }

  const dimensions = getResolutionDimensions(options.resolution);

  logLiveKitDebug("screen-capture", "Using getUserMedia for Electron", {
    sourceName: preferredSource.name,
    sourceId: preferredSource.id
  });

  try {
    // Video only. System audio is captured separately via the process-exclude
    // loopback (below) so Connect's own output (remote voices) is never in the
    // mix — capturing audio here via chromeMediaSource:'desktop' would grab the
    // full loopback and echo participants back to themselves.
    //
    // Ceilings only, no min*: pinning min == max made capture fail outright on
    // sources that cannot hit the target, and forced Chromium to duplicate
    // frames to keep a static screen at the requested rate — wasted encoding
    // that Windows Graphics Capture's zero-Hz mode exists to avoid.
    const constraints: DesktopCaptureConstraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: preferredSource.id,
          maxFrameRate: options.frameRate,
          maxWidth: dimensions?.width,
          maxHeight: dimensions?.height,
        },
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(
      asMediaStreamConstraints(constraints),
    );

    logLiveKitDebug("screen-capture", "getUserMedia success", {
      videoTracks: stream.getVideoTracks().length,
    });

    let warning: string | undefined;
    if (options.captureSystemAudio) {
      const loopbackTrack = await startSystemLoopbackAudioTrack();
      if (loopbackTrack) {
        stream.addTrack(loopbackTrack);
      } else {
        warning =
          "Sistem sesi bu cihazda yakalanamadı (yankısız ses modülü yüklenemedi). Yayın görüntü olarak başlatıldı.";
      }
    }

    return {
      stream,
      sourceName: preferredSource.name,
      warning,
    };
  } catch (error) {
    logLiveKitDebug("screen-capture", "getUserMedia failed", { error });
    
    if (options.captureSystemAudio) {
      logLiveKitDebug("screen-capture", "Retrying getUserMedia without audio...");
      const stream = await navigator.mediaDevices.getUserMedia(
        asMediaStreamConstraints({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: preferredSource.id,
              maxFrameRate: options.frameRate,
              maxWidth: dimensions?.width,
              maxHeight: dimensions?.height,
            },
          },
        }),
      );

      return {
        stream,
        sourceName: preferredSource.name,
        warning: "Sistem sesi bu modda desteklenmedi. Yayın görüntü olarak başlatıldı.",
      };
    }
    
    throw error;
  }
};

export const startScreenCapture = async (
  options: StartScreenCaptureOptions,
): Promise<StartScreenCaptureResult> => {
  logLiveKitDebug("screen-capture", "startScreenCapture called", { ...options });
  
  const isElectron = typeof window !== "undefined" && !!window.desktopApi;
  if (isElectron && options.sourceId) {
    logLiveKitDebug("screen-capture", "Electron detected with sourceId, using direct capture", { sourceId: options.sourceId });
    return startElectronDesktopCapture(options);
  }

  try {
    // Try getDisplayMedia first (Modern & cleaner)
    return await startBrowserDisplayCapture(options);
  } catch (error) {
    logLiveKitDebug("screen-capture", "startBrowserDisplayCapture failed, trying startElectronDesktopCapture", { error });
    if (!isDisplayMediaNotSupportedError(error)) {
      // If it's a real error (not "not supported"), we might still want to try the fallback
    }
  }

  return startElectronDesktopCapture(options);
};
