import {
  type StartScreenCaptureOptions,
  type StartScreenCaptureResult,
  type ScreenShareResolution
} from "./types";
import { type DesktopResult } from "../../../../shared/desktop-api-types";
import { startSystemLoopbackAudioTrack } from "./loopback-audio";

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
  
  console.log("[ScreenCapture] startBrowserDisplayCapture started", { 
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

    console.log("[ScreenCapture] getDisplayMedia success", {
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    });

    return {
      stream,
    };
  } catch (error) {
    console.error("[ScreenCapture] getDisplayMedia failed", error);
    
    if (options.captureSystemAudio && isRetryableAudioConstraintError(error)) {
      console.warn("[ScreenCapture] Retrying getDisplayMedia without audio...");
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
  console.log("[ScreenCapture] startElectronDesktopCapture started", {
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

  const preferredSource =
    (options.sourceId
      ? sourcesResult.data.sources.find(
          (source: any) => source.id === options.sourceId,
        )
      : undefined) ??
    sourcesResult.data.sources.find((source: any) => source.kind === "screen") ??
    sourcesResult.data.sources[0];

  if (!preferredSource) {
    throw new Error("Ekran kaynağı bulunamadı");
  }

  const dimensions = getResolutionDimensions(options.resolution);

  console.log("[ScreenCapture] Using getUserMedia for Electron", {
    sourceName: preferredSource.name,
    sourceId: preferredSource.id
  });

  try {
    // Video only. System audio is captured separately via the process-exclude
    // loopback (below) so Connect's own output (remote voices) is never in the
    // mix — capturing audio here via chromeMediaSource:'desktop' would grab the
    // full loopback and echo participants back to themselves.
    const constraints: any = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: preferredSource.id,
          minFrameRate: options.frameRate,
          maxFrameRate: options.frameRate,
          minWidth: dimensions?.width,
          maxWidth: dimensions?.width,
          minHeight: dimensions?.height,
          maxHeight: dimensions?.height,
        },
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    console.log("[ScreenCapture] getUserMedia success", {
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
    console.error("[ScreenCapture] getUserMedia failed", error);
    
    if (options.captureSystemAudio) {
      console.warn("[ScreenCapture] Retrying getUserMedia without audio...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: preferredSource.id,
            minFrameRate: options.frameRate,
            maxFrameRate: options.frameRate,
            minWidth: dimensions?.width,
            maxWidth: dimensions?.width,
            minHeight: dimensions?.height,
            maxHeight: dimensions?.height,
          },
        },
      } as any);

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
  console.log("[ScreenCapture] startScreenCapture called", options);
  
  const isElectron = typeof window !== "undefined" && !!window.desktopApi;
  if (isElectron && options.sourceId) {
    console.log("[ScreenCapture] Electron detected with sourceId, using direct capture", options.sourceId);
    return startElectronDesktopCapture(options);
  }

  try {
    // Try getDisplayMedia first (Modern & cleaner)
    return await startBrowserDisplayCapture(options);
  } catch (error) {
    console.log("[ScreenCapture] startBrowserDisplayCapture failed, trying startElectronDesktopCapture", error);
    if (!isDisplayMediaNotSupportedError(error)) {
      // If it's a real error (not "not supported"), we might still want to try the fallback
    }
  }

  return startElectronDesktopCapture(options);
};
