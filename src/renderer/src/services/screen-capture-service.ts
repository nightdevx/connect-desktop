import workspaceService from "./workspace-service";

export interface StartScreenCaptureOptions {
  frameRate: 15 | 30 | 60;
  captureSystemAudio: boolean;
  sourceId?: string;
  resolution?: "720p" | "1080p" | "1440p";
}

export interface StartScreenCaptureResult {
  stream: MediaStream;
  warning?: string;
  sourceName?: string;
}

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
  const sourcesResult = await workspaceService.listScreenCaptureSources();
  if (!sourcesResult.ok || !sourcesResult.data) {
    throw new Error(
      sourcesResult.error?.message ??
        "Yakalanabilir ekran kaynakları alınamadı",
    );
  }

  const preferredSource =
    (options.sourceId
      ? sourcesResult.data.sources.find(
          (source) => source.id === options.sourceId,
        )
      : undefined) ??
    sourcesResult.data.sources.find((source) => source.kind === "screen") ??
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

const getResolutionDimensions = (
  resolution?: StartScreenCaptureOptions["resolution"],
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
