import { 
  type StartScreenCaptureOptions, 
  type StartScreenCaptureResult,
  type ScreenShareResolution
} from "./types";
import { type DesktopResult } from "../../../../shared/desktop-api-types";

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

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: options.captureSystemAudio,
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
    };
  } catch (error) {
    if (options.captureSystemAudio && isRetryableAudioConstraintError(error)) {
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
    } as MediaTrackConstraints,
  } as MediaStreamConstraints);

  return {
    stream,
    sourceName: preferredSource.name,
    warning: options.captureSystemAudio
      ? "Sistem sesi bu modda desteklenmedi. Yayın görüntü olarak başlatıldı."
      : undefined,
  };
};

export const startScreenCapture = async (
  options: StartScreenCaptureOptions,
): Promise<StartScreenCaptureResult> => {
  try {
    return await startBrowserDisplayCapture(options);
  } catch (error) {
    if (!isDisplayMediaNotSupportedError(error)) {
      throw error;
    }
  }

  return startElectronDesktopCapture(options);
};
